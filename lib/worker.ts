import * as duckdb from '@duckdb/duckdb-wasm'
import JSZip from 'jszip'

// Helper for type safety in worker
const ctx: Worker = self as any

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null

async function initDuckDB() {
  if (db) return db

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
  )

  const worker = new Worker(worker_url)
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING)
  db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  URL.revokeObjectURL(worker_url)

  conn = await db.connect()
  return db
}

function postProgress(stage: string, percent: number) {
  ctx.postMessage({ type: 'progress', stage, percent })
}

function extractFriendlyChannelName(raw?: string | null): string {
  if (!raw) return ''
  const directMatch = raw.match(/Direct Message with (.+)/i)
  if (directMatch) return directMatch[1].trim().replace(/#0$/, '')
  const groupMatch = raw.match(/Group Message with (.+)/i)
  if (groupMatch) return groupMatch[1].trim()
  const trimmed = raw.trim()
  if (/#0$/i.test(trimmed)) {
    return trimmed.replace(/#0$/i, '')
  }
  return trimmed
}

function composeGuildChannelLabel(guildName: string, channelName: string): string {
  const guild = guildName.trim()
  const channel = channelName.trim()
  if (!channel) return guild
  return `${guild} • ${channel}`
}

function parseTimestamp(raw: unknown): Date | null {
  if (!raw) return null

  if (raw instanceof Date) {
    return Number.isFinite(raw.getTime()) ? raw : null
  }

  if (typeof raw === 'number') {
    const fromNumber = new Date(raw)
    return Number.isFinite(fromNumber.getTime()) ? fromNumber : null
  }

  if (typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  let candidate = trimmed

  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    candidate = `${candidate}T00:00:00`
  }

  if (!candidate.includes('T') && candidate.includes(' ')) {
    const firstSpace = candidate.indexOf(' ')
    candidate = `${candidate.slice(0, firstSpace)}T${candidate.slice(firstSpace + 1)}`
  }

  candidate = candidate.replace(/(\.\d{3})\d+/, '$1')

  // Discord exports timestamps in UTC without a zone suffix
  if (!/(Z|z|[+-]\d{2}:?\d{2})$/.test(candidate)) {
    candidate = `${candidate}Z`
  }

  const parsed = new Date(candidate)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)

// Wall-clock time in the viewer's own time zone (DST aware), so "peak hour",
// "night owl" and day boundaries match what the user actually lived.
function toLocalSqlTimestamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function escapeLiteral(value: string) {
  return value.replace(/'/g, "''").replace(/\u0000/g, '')
}

type ChannelKind = 'dm' | 'group' | 'guild'

type MessageRow = {
  id: string
  ts: string
  contents: string
  attachments: number
  channelId: string
  channelName: string
  kind: ChannelKind
  guildName: string
}

async function insertBatch(conn: duckdb.AsyncDuckDBConnection, rows: MessageRow[]) {
  if (!rows.length) return

  const values = rows.map((r) =>
    `('${escapeLiteral(r.id)}','${r.ts}','${escapeLiteral(r.contents)}',${r.attachments},'${escapeLiteral(r.channelId)}','${escapeLiteral(r.channelName)}','${r.kind}','${escapeLiteral(r.guildName)}')`
  ).join(',')

  await conn.query(`INSERT INTO all_messages VALUES ${values}`)
}

const UNKNOWN_NAME = /^(unknown( channel| participant| user)?|none|null|deleted user.*)$/i

function isKnownName(name?: unknown): name is string {
  return typeof name === 'string' && !!name.trim() && !UNKNOWN_NAME.test(name.trim())
}

const NUMERIC_CHANNEL_TYPES: Record<number, string> = {
  0: 'GUILD_TEXT',
  1: 'DM',
  2: 'GUILD_VOICE',
  3: 'GROUP_DM',
  5: 'GUILD_ANNOUNCEMENT',
  10: 'ANNOUNCEMENT_THREAD',
  11: 'PUBLIC_THREAD',
  12: 'PRIVATE_THREAD',
}

interface WorkerRequest {
  file: File
  targetYear?: number | 'all' | null
}

// State kept between requests so switching years does not re-read the ZIP
interface LoadedArchive {
  key: string
  yearCounts: Record<number, number>
  userNames: Record<string, string>
}
let loaded: LoadedArchive | null = null

ctx.onmessage = async (e: MessageEvent<File | WorkerRequest>) => {
  try {
    const payload = e.data as any
    const file: File = payload?.file ?? payload
    const explicitYear =
      typeof payload?.targetYear === 'number' || payload?.targetYear === 'all'
        ? payload.targetYear
        : undefined

    if (!(file instanceof File)) {
      throw new Error('Invalid file provided to worker')
    }

    const stats = await processAndAnalyze(file, explicitYear)
    ctx.postMessage({ type: 'done', stats })
  } catch (err: any) {
    console.error('Worker error:', err)
    ctx.postMessage({
      type: 'error',
      error: err?.message || 'Unknown processing error'
    })
  }
}

async function ingestArchive(
  conn: duckdb.AsyncDuckDBConnection,
  file: File
): Promise<Omit<LoadedArchive, 'key'>> {
  await conn.query(`DROP TABLE IF EXISTS messages`)
  await conn.query(`DROP TABLE IF EXISTS all_messages`)
  await conn.query(`
      CREATE TABLE all_messages (
        ID VARCHAR,
        Timestamp TIMESTAMP,
        Contents VARCHAR,
        AttachmentCount INTEGER,
        ChannelId VARCHAR,
        ChannelName VARCHAR,
        Kind VARCHAR,
        GuildName VARCHAR
      )
    `)

  postProgress('Reading ZIP file...', 10)
  let zip = new JSZip()
  let contents = await zip.loadAsync(file)

  postProgress('Finding message files...', 12)
  const messageFiles: string[] = []
  contents.forEach((path, zipEntry) => {
    if (/(^|\/)messages\/[^/]+\/messages\.json$/i.test(path) && !zipEntry.dir) {
      messageFiles.push(path)
    }
  })

  // Who am I, and what are my friends called? (DM recipients are bare IDs)
  let selfId = ''
  const userNames: Record<string, string> = {}
  try {
    const userFiles = contents.file(/(^|\/)account\/user\.json$/i) as JSZip.JSZipObject[]
    if (userFiles.length > 0) {
      const user = JSON.parse(await userFiles[0].async('string'))
      if (user?.id) selfId = String(user.id)
      if (Array.isArray(user?.relationships)) {
        for (const rel of user.relationships) {
          const id = rel?.id ?? rel?.user?.id
          const name = rel?.nickname || rel?.user?.global_name || rel?.user?.username || rel?.display_name
          if (id && typeof name === 'string' && name.trim()) {
            userNames[String(id)] = name.trim()
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to parse account/user.json', err)
  }

  // messages/index.json: channel id -> "name", "name in Server", "Direct Message with x"
  const channelIndex: Record<string, string> = {}
  try {
    const indexFiles = contents.file(/(^|\/)messages\/index\.json$/i) as JSZip.JSZipObject[]
    for (const indexFile of indexFiles) {
      const parsed = JSON.parse(await indexFile.async('string'))
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
          if (typeof value === 'string') {
            channelIndex[key] = value
          } else if (value && typeof value === 'object' && typeof (value as any).name === 'string') {
            channelIndex[key] = (value as any).name
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to parse index.json for channel names', err)
  }

  // Server names: servers/index.json (older exports used guilds/index.json)
  const guildNames: Record<string, string> = {}
  const registerGuildName = (id?: string | null, name?: unknown) => {
    if (id && typeof name === 'string' && name.trim()) guildNames[id] = name.trim()
  }
  try {
    const guildIndexFiles = contents.file(/(^|\/)(servers|guilds)\/index\.json$/i) as JSZip.JSZipObject[]
    for (const guildIndexFile of guildIndexFiles) {
      const parsed = JSON.parse(await guildIndexFile.async('string'))
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (!entry) continue
          registerGuildName(
            typeof entry.id === 'string' ? entry.id : undefined,
            entry.name ?? entry.label ?? entry.value
          )
        }
      } else if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
          if (typeof value === 'string') registerGuildName(key, value)
          else if (value && typeof value === 'object') registerGuildName(key, value.name ?? value.label ?? value.value)
        }
      }
    }
  } catch (err) {
    console.warn('Failed to parse server index for server names', err)
  }

  if (messageFiles.length === 0) {
    throw new Error('No message files found in ZIP. Make sure this is a Discord data export.')
  }

  postProgress(`Found ${messageFiles.length} channels...`, 15)

  let processedFiles = 0
  let totalMessagesInserted = 0
  const yearCounts: Record<number, number> = {}
  let rowBuffer: MessageRow[] = []
  let rowBufferCharEstimate = 0
  const BATCH_SIZE = 8000
  const MAX_BUFFER_CHARS = 8_000_000 // guard against huge SQL strings in wasm

  for (const filePath of messageFiles) {
    try {
      const content = await contents.file(filePath)?.async('string')
      if (!content) continue

      const data = JSON.parse(content)
      const messages = Array.isArray(data) ? data : data?.messages || []
      if (!Array.isArray(messages) || messages.length === 0) continue

      const folderParts = filePath.split('/')
      const folderName = folderParts.length > 1 ? folderParts[folderParts.length - 2] : ''
      const channelId = folderName.startsWith('c') ? folderName.slice(1) : folderName

      let cData: any = null
      try {
        const cContent = await contents.file(filePath.replace(/messages\.json$/i, 'channel.json'))?.async('string')
        if (cContent) cData = JSON.parse(cContent)
      } catch (err) {
        console.warn(`Failed to read channel metadata for ${filePath}`, err)
      }

      const indexLabel = channelIndex[channelId] || ''
      const rawType = cData?.type
      const typeName: string = typeof rawType === 'number'
        ? (NUMERIC_CHANNEL_TYPES[rawType] ?? '')
        : typeof rawType === 'string' ? rawType : ''
      const hasRecipients = Array.isArray(cData?.recipients)

      let kind: ChannelKind = 'guild'
      if (typeName === 'GROUP_DM' || /^Group Message with /i.test(indexLabel)) kind = 'group'
      else if (typeName === 'DM' || /^Direct Message with /i.test(indexLabel)) kind = 'dm'
      else if (!typeName && hasRecipients) kind = cData.recipients.length > 2 ? 'group' : 'dm'

      let channelName = ''
      let guildName = ''

      if (kind === 'guild') {
        // index label looks like "channel in Server" (or "Unknown channel in Server")
        let indexChannel = indexLabel
        let indexGuild = ''
        const inMatch = indexLabel.match(/^(.*?) in (.+)$/)
        if (inMatch) {
          indexChannel = inMatch[1]
          indexGuild = inMatch[2]
        }

        if (isKnownName(cData?.name)) channelName = cData.name.trim()
        else if (isKnownName(indexChannel)) channelName = indexChannel.trim()

        const guildId = typeof cData?.guild_id === 'string' ? cData.guild_id
          : typeof cData?.guild?.id === 'string' ? cData.guild.id : ''
        if (isKnownName(cData?.guild)) guildName = cData.guild.trim()
        else if (isKnownName(cData?.guild?.name)) guildName = cData.guild.name.trim()
        else if (guildId && guildNames[guildId]) guildName = guildNames[guildId]
        else if (isKnownName(indexGuild)) guildName = indexGuild.trim()
      } else {
        const others: string[] = []
        let allResolved = hasRecipients && cData.recipients.length > 0
        if (hasRecipients) {
          for (const recipient of cData.recipients) {
            const isObject = typeof recipient === 'object' && recipient
            const rid = isObject ? String(recipient.id ?? '') : String(recipient ?? '')
            if (rid && rid === selfId) continue
            const fromObject = isObject ? (recipient.global_name || recipient.username) : null
            const resolved = userNames[rid] || fromObject
            if (isKnownName(resolved)) others.push(resolved.trim())
            else allResolved = false
          }
        }

        const indexName = extractFriendlyChannelName(indexLabel)
        if (kind === 'group' && isKnownName(cData?.name)) channelName = cData.name.trim()
        else if (allResolved && others.length > 0) channelName = others.join(', ')
        else if (isKnownName(indexName)) channelName = indexName
        else if (others.length > 0) channelName = others.join(', ')
      }

      const label = kind === 'guild' && guildName && channelName
        ? composeGuildChannelLabel(guildName, channelName)
        : channelName

      let insertedFromFile = 0
      for (const m of messages) {
        const rawTimestamp =
          m.Timestamp ??
          m.timestamp ??
          m.Date ??
          m.date ??
          m.PulledTimestamp ??
          m.pulledTimestamp ??
          (m as any)['Pulled Timestamp'] ??
          (m as any)['pulled timestamp'] ??
          m.PulledDate ??
          m.pulledDate ??
          (m as any)['Pulled Date'] ??
          (m as any)['pulled date'] ??
          m.pulled_at ??
          m.pulledAt
        const date = parseTimestamp(rawTimestamp)
        if (!date) continue

        const year = date.getFullYear()
        yearCounts[year] = (yearCounts[year] ?? 0) + 1

        const rawAttachments = m.Attachments ?? m.attachments ?? ''
        const attachments = Array.isArray(rawAttachments)
          ? rawAttachments.length
          : String(rawAttachments).trim().split(/\s+/).filter(Boolean).length

        const row: MessageRow = {
          id: String(m.ID ?? m.id ?? ''),
          ts: toLocalSqlTimestamp(date),
          contents: String(m.Contents ?? m.contents ?? ''),
          attachments,
          channelId,
          channelName: label,
          kind,
          guildName,
        }

        rowBuffer.push(row)
        rowBufferCharEstimate += row.contents.length + label.length + guildName.length + 80
        insertedFromFile++

        if (rowBuffer.length >= BATCH_SIZE || rowBufferCharEstimate >= MAX_BUFFER_CHARS) {
          await insertBatch(conn, rowBuffer)
          rowBuffer = []
          rowBufferCharEstimate = 0
        }
      }

      totalMessagesInserted += insertedFromFile
    } catch (e) {
      console.warn(`Failed to process ${filePath}`, e)
    }

    processedFiles++
    if (processedFiles % 20 === 0) {
      const percent = 15 + Math.round((processedFiles / messageFiles.length) * 70)
      postProgress(`Processing... (${processedFiles}/${messageFiles.length})`, percent)
    }
  }

  if (rowBuffer.length > 0) {
    await insertBatch(conn, rowBuffer)
    rowBuffer = []
  }

  // Let the ZIP buffer be collected
  ; (contents as any) = null
  ; (zip as any) = null

  if (totalMessagesInserted === 0) {
    throw new Error("No messages found in your Discord data.")
  }

  return { yearCounts, userNames }
}

async function processAndAnalyze(file: File, explicitYear?: number | 'all'): Promise<any> {
  postProgress('Initializing database...', 5)
  await initDuckDB()
  if (!conn) throw new Error('Database connection failed')

  const key = `${file.name}:${file.size}:${file.lastModified}`
  if (!loaded || loaded.key !== key) {
    loaded = null
    const result = await ingestArchive(conn, file)
    loaded = { key, ...result }
  } else {
    postProgress('Reusing loaded archive...', 85)
  }
  const { yearCounts, userNames } = loaded

  postProgress('Identifying active year...', 88)

  const isAllTimeRequest = explicitYear === 'all'
  const availableYears = Object.keys(yearCounts)
    .map(Number)
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a)

  if (!availableYears.length) {
    throw new Error('No messages found in your Discord data.')
  }

  let targetYear: number | null = null

  if (!isAllTimeRequest) {
    if (typeof explicitYear === 'number') {
      if (availableYears.includes(explicitYear)) {
        targetYear = explicitYear
      } else {
        throw new Error(`No messages found for year ${explicitYear}. Available years: ${availableYears.join(', ')}`)
      }
    } else {
      // Default: the latest year in the archive; in Jan/Feb prefer the year that just ended
      targetYear = availableYears[0]
      const now = new Date()
      if (targetYear === now.getFullYear() && now.getMonth() < 2 && availableYears.includes(targetYear - 1)) {
        targetYear = targetYear - 1
      }
    }
  }

  if (targetYear !== null) {
    postProgress(`Filtering for ${targetYear}...`, 90)
    await conn.query(`
      CREATE OR REPLACE TABLE messages AS
      SELECT * FROM all_messages
      WHERE Timestamp >= TIMESTAMP '${targetYear}-01-01 00:00:00'
        AND Timestamp < TIMESTAMP '${targetYear + 1}-01-01 00:00:00'
    `)
  } else {
    postProgress('Preparing all-time view...', 90)
    await conn.query(`CREATE OR REPLACE TABLE messages AS SELECT * FROM all_messages`)
  }

  const countStats = await conn.query(`SELECT COUNT(*) as c FROM messages`)
  const countRow = countStats.toArray()[0]
  const count = countRow ? Number(countRow.c) : 0
  if (count === 0) {
    const suffix = targetYear !== null ? ` for year ${targetYear}` : ''
    throw new Error(`No messages found${suffix}`)
  }

  const analysisLabel = targetYear !== null
    ? `from ${targetYear}`
    : 'across all time'

  postProgress(`Analyzing ${count.toLocaleString()} messages ${analysisLabel}...`, 92)

  const stats = await runStatsQueries(conn, postProgress, {
    userNames,
    singleYear: targetYear !== null,
  })
  stats.year = targetYear !== null ? targetYear : 'all'
  stats.availableYears = availableYears
  stats.yearlyDistribution = Object.fromEntries(
    availableYears.slice().reverse().map((year) => [String(year), yearCounts[year] ?? 0])
  )
  stats.previousYearMessages = targetYear !== null ? (yearCounts[targetYear - 1] ?? 0) : 0

  await conn.query(`DROP TABLE IF EXISTS messages`)

  postProgress('Done!', 100)

  return stats
}

// NOTE: these strings end up inside SQL literals and are parsed by RE2.
// Backslashes must be doubled here because they live in JS string literals.
const RE_CUSTOM_EMOJI = '<a?:[^:>]+:[0-9]+>'
const RE_UNICODE_EMOJI = '[\\x{1F300}-\\x{1F3FA}\\x{1F400}-\\x{1FAFF}\\x{2600}-\\x{27BF}\\x{2B50}\\x{2B55}]'
const RE_EMOJI_GLUE = '[\\x{FE0F}\\x{200D}\\x{1F3FB}-\\x{1F3FF}]'
const RE_STRIP_FOR_WORDS = 'https?://\\S+|<[^>\\s]+>'

// Words that say nothing about you (English + Spanish), 4+ letters only
const STOP_WORDS = [
  // English
  'that', 'this', 'with', 'have', 'from', 'your', 'they', 'will', 'what', 'when', 'just', 'like',
  'about', 'would', 'there', 'their', 'could', 'been', 'were', 'make', 'time', 'them', 'then',
  'than', 'some', 'into', 'only', 'also', 'here', 'more', 'does', 'dont', 'cant', 'didn', 'doesn',
  'https', 'http', 'because', 'which', 'these', 'those', 'being', 'where', 'while', 'should',
  'really', 'know', 'think', 'want', 'need', 'still', 'even', 'much', 'very', 'well', 'yeah',
  'thats', 'youre', 'isnt', 'wasn', 'going', 'gonna', 'something', 'other', 'after', 'before',
  // Spanish
  'para', 'pero', 'como', 'cómo', 'esto', 'esta', 'este', 'está', 'están', 'estoy', 'estas',
  'estás', 'estos', 'porque', 'cuando', 'donde', 'dónde', 'tiene', 'tienes', 'tengo', 'tienen',
  'hacer', 'hace', 'haces', 'hago', 'puede', 'puedo', 'puedes', 'pueden', 'bien', 'todo', 'toda',
  'todos', 'todas', 'algo', 'nada', 'solo', 'sólo', 'también', 'tambien', 'ahora', 'aquí', 'aqui',
  'entonces', 'pues', 'desde', 'hasta', 'sobre', 'entre', 'sino', 'cada', 'mismo', 'misma', 'otra',
  'otro', 'otros', 'otras', 'unas', 'unos', 'ellos', 'ellas', 'ella', 'nosotros', 'usted', 'sido',
  'será', 'sera', 'tenía', 'tenia', 'había', 'habia', 'haber', 'creo', 'igual', 'luego', 'antes',
  'después', 'despues', 'mucho', 'mucha', 'muchos', 'muchas', 'poco', 'casi', 'aunque',
  'mientras', 'quien', 'quién', 'cual', 'cuál', 'tener', 'estar', 'estaba', 'decir', 'dice',
  'digo', 'dijo', 'sabes', 'sabe', 'quiero', 'quieres', 'quiere', 'vamos', 'eres', 'somos',
  'fueron', 'eran', 'menos', 'cosa', 'cosas', 'veces', 'alguien', 'nadie', 'siempre', 'nunca',
  'tampoco', 'todavía', 'todavia', 'algún', 'algun', 'alguna', 'ningún', 'ninguna', 'tanto',
  'tiene', 'tuve', 'tuvo', 'hizo', 'hice', 'hecho', 'debe', 'debo', 'sería', 'seria', 'puedo',
  'esos', 'esas', 'aquel', 'ellos', 'conmigo', 'contigo', 'según', 'ademas', 'además', 'hacia',
  'cuanto', 'cuánto', 'tengo', 'tenemos', 'estamos', 'vaya', 'haya', 'sean', 'seas', 'vale',
]

const IGNORED_LINK_DOMAINS = [
  'tenor.com', 'media.tenor.com', 'c.tenor.com', 'giphy.com', 'media.giphy.com', 'klipy.com', 'static.klipy.com',
  'cdn.discordapp.com', 'media.discordapp.net', 'images-ext-1.discordapp.net',
  'images-ext-2.discordapp.net',
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface StatsContext {
  userNames: Record<string, string>
  singleYear: boolean
}

async function runStatsQueries(
  conn: duckdb.AsyncDuckDBConnection,
  onProgress: (stage: string, percent: number) => void,
  context: StatsContext
): Promise<Record<string, any>> {
  const sqlList = (items: string[]) => items.map((item) => `'${escapeLiteral(item)}'`).join(', ')

  // Total messages
  const totalMessages = await conn.query(`SELECT COUNT(*) as count FROM messages`)

  // Text stats
  const textStats = await conn.query(`
      SELECT
        SUM(LENGTH(Contents) - LENGTH(REPLACE(Contents, ' ', '')) + 1) as total_words,
        SUM(LENGTH(Contents)) as total_chars,
        AVG(LENGTH(Contents)) as avg_length,
        AVG(LENGTH(Contents) - LENGTH(REPLACE(Contents, ' ', '')) + 1) as avg_words
      FROM messages
      WHERE Contents IS NOT NULL AND Contents != ''
    `)

  // Date stats
  const dateStats = await conn.query(`
      SELECT
        COUNT(DISTINCT DATE(Timestamp)) as days_active,
        STRFTIME(MIN(Timestamp), '%Y-%m-%d') as first_message,
        STRFTIME(MAX(Timestamp), '%Y-%m-%d') as last_message,
        DATEDIFF('day', MIN(Timestamp), MAX(Timestamp)) + 1 as total_days_span
      FROM messages
    `)

  // Top channels (one row per real channel; unnamed/deleted channels are skipped)
  const topChannels = await conn.query(`
      SELECT ANY_VALUE(ChannelName) as name, COUNT(*) as count
      FROM messages
      WHERE ChannelName != ''
      GROUP BY ChannelId
      ORDER BY count DESC
      LIMIT 10
    `)

  // Top servers
  const topServers = await conn.query(`
      SELECT GuildName as name, COUNT(*) as count, COUNT(DISTINCT ChannelId) as channels
      FROM messages
      WHERE Kind = 'guild' AND GuildName != ''
      GROUP BY GuildName
      ORDER BY count DESC
      LIMIT 10
    `)

  // Top DMs / group chats
  const topDMs = await conn.query(`
      SELECT ANY_VALUE(ChannelName) as name, COUNT(*) as count, ANY_VALUE(Kind) as kind
      FROM messages
      WHERE Kind IN ('dm', 'group') AND ChannelName != ''
      GROUP BY ChannelId
      ORDER BY count DESC
      LIMIT 10
    `)

  // Where the messages went
  const placeStats = await conn.query(`
      SELECT
        COUNT(*) FILTER (WHERE Kind = 'dm') as dm_messages,
        COUNT(*) FILTER (WHERE Kind = 'group') as group_messages,
        COUNT(*) FILTER (WHERE Kind = 'guild') as server_messages,
        COUNT(DISTINCT ChannelId) as channels,
        COUNT(DISTINCT ChannelId) FILTER (WHERE Kind = 'dm') as dm_channels,
        COUNT(DISTINCT GuildName) FILTER (WHERE Kind = 'guild' AND GuildName != '') as servers
      FROM messages
    `)

  // Distributions (already in local time)
  const hourly = await conn.query(`
      SELECT EXTRACT(HOUR FROM Timestamp) as k, COUNT(*) as count
      FROM messages GROUP BY k ORDER BY k
    `)
  const weekdays = await conn.query(`
      SELECT DAYOFWEEK(Timestamp) as k, COUNT(*) as count
      FROM messages GROUP BY k ORDER BY k
    `)
  const monthly = await conn.query(`
      SELECT EXTRACT(MONTH FROM Timestamp) as k, COUNT(*) as count
      FROM messages GROUP BY k ORDER BY k
    `)
  const daily = await conn.query(`
      SELECT STRFTIME(Timestamp, '%Y-%m-%d') as date, COUNT(*) as count
      FROM messages GROUP BY date ORDER BY date
    `)

  onProgress('Analyzing patterns...', 95)

  // Top custom emojis
  const topEmojis = await conn.query(`
    WITH extracted AS (
      SELECT UNNEST(regexp_extract_all(Contents, '${RE_CUSTOM_EMOJI}')) as full_emoji
      FROM messages
    )
    SELECT full_emoji, COUNT(*) as count
    FROM extracted
    GROUP BY full_emoji
    ORDER BY count DESC
    LIMIT 10
  `)

  // Top standard (Unicode) emojis
  const topUnicodeEmojis = await conn.query(`
    WITH extracted AS (
      SELECT UNNEST(regexp_extract_all(Contents, '${RE_UNICODE_EMOJI}')) as emoji
      FROM messages
    )
    SELECT emoji, COUNT(*) as count
    FROM extracted
    GROUP BY emoji
    ORDER BY count DESC
    LIMIT 10
  `)

  const emojiTotals = await conn.query(`
    SELECT
      SUM(LEN(regexp_extract_all(Contents, '${RE_CUSTOM_EMOJI}'))) as custom_total,
      SUM(LEN(regexp_extract_all(Contents, '${RE_UNICODE_EMOJI}'))) as unicode_total,
      COUNT(*) FILTER (
        WHERE regexp_full_match(Contents, '(?:\\s|${RE_CUSTOM_EMOJI}|${RE_UNICODE_EMOJI}|${RE_EMOJI_GLUE})+')
          AND regexp_matches(Contents, '${RE_CUSTOM_EMOJI}|${RE_UNICODE_EMOJI}')
      ) as emoji_only
    FROM messages
    WHERE Contents != ''
  `)

  // Top words (URLs, mentions and custom emoji stripped first)
  const topWords = await conn.query(`
    WITH cleaned AS (
      SELECT regexp_replace(LOWER(Contents), '${RE_STRIP_FOR_WORDS}', ' ', 'g') as text
      FROM messages
      WHERE Contents IS NOT NULL AND Contents != ''
    ),
    words AS (
      SELECT UNNEST(regexp_extract_all(text, '\\p{L}{4,}')) as word
      FROM cleaned
    )
    SELECT word, COUNT(*) as count
    FROM words
    WHERE word NOT IN (${sqlList(STOP_WORDS)})
    GROUP BY word
    ORDER BY count DESC
    LIMIT 20
  `)

  // Screaming
  const screamingCount = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE Contents = UPPER(Contents) AND Contents != LOWER(Contents) AND LENGTH(Contents) > 3
      AND NOT regexp_matches(Contents, 'https?://')
  `)

  // Questions
  const questionCount = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE regexp_matches(regexp_replace(Contents, 'https?://\\S+', ' ', 'g'), '[?¿]')
  `)

  // Sentiment (English + Spanish cue words)
  const positiveWords = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE regexp_matches(LOWER(Contents), 'lol|lmao|haha|jaja|jeje|nice|awesome|love|great|thanks|happy|gracias|genial|perfecto|me encanta|buen[ií]simo|incre[ií]ble|te quiero')
  `)

  const negativeWords = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE regexp_matches(LOWER(Contents), 'hate|terrible|awful|stupid|worst|angry|odio|horrible|asco|mierda|fatal|est[uú]pid|peor')
  `)

  onProgress('Calculating streaks...', 97)

  // Streak + busiest day straight from the daily counts
  const dailyRows: Array<{ date: string; count: number }> = daily.toArray().map((row: any) => ({
    date: String(row.date),
    count: Number(row.count),
  }))

  let longestStreak = 0
  let currentStreak = 0
  let prevDay: number | null = null
  let busiest: { date: string; count: number } | null = null
  for (const row of dailyRows) {
    const day = Math.round(Date.parse(`${row.date}T00:00:00Z`) / 86_400_000)
    currentStreak = prevDay !== null && day - prevDay === 1 ? currentStreak + 1 : 1
    longestStreak = Math.max(longestStreak, currentStreak)
    prevDay = day
    if (!busiest || row.count > busiest.count) busiest = row
  }

  // Most active month
  const mostActiveMonth = await conn.query(`
    SELECT STRFTIME(Timestamp, '%Y-%m') as month, COUNT(*) as count
    FROM messages GROUP BY month ORDER BY count DESC LIMIT 1
  `)

  // Burst sequences: back-to-back messages in the same channel
  const burstCount = await conn.query(`
    SELECT COUNT(*) as count FROM (
      SELECT Timestamp, LAG(Timestamp) OVER (PARTITION BY ChannelId ORDER BY Timestamp) as prev_timestamp
      FROM messages
    ) WHERE EPOCH(Timestamp) - EPOCH(prev_timestamp) <= 30
  `)

  // Links shared + favourite sites
  const linksShared = await conn.query(`
    SELECT COUNT(*) as count FROM messages WHERE regexp_matches(Contents, 'https?://')
  `)

  const topDomains = await conn.query(`
    WITH extracted AS (
      SELECT UNNEST(regexp_extract_all(LOWER(Contents), 'https?://(?:www\\.)?([a-z0-9.-]+)', 1)) as domain
      FROM messages
      WHERE Contents LIKE '%http%'
    )
    SELECT domain, COUNT(*) as count
    FROM extracted
    WHERE domain NOT IN (${sqlList(IGNORED_LINK_DOMAINS)})
    GROUP BY domain
    ORDER BY count DESC
    LIMIT 10
  `)

  // Attachments + GIFs
  const mediaStats = await conn.query(`
    SELECT
      SUM(AttachmentCount) as attachments,
      COUNT(*) FILTER (WHERE AttachmentCount > 0) as with_attachments,
      COUNT(*) FILTER (WHERE regexp_matches(LOWER(Contents), 'tenor\\.com|giphy\\.com|klipy\\.com|\\.gif(\\?|$|\\s)')) as gifs
    FROM messages
  `)

  // Mentions: real <@id> pings, plus who gets pinged the most
  const mentionsGiven = await conn.query(`
    SELECT SUM(LEN(regexp_extract_all(Contents, '<@[!&]?[0-9]+>|@everyone|@here'))) as count
    FROM messages
    WHERE Contents LIKE '%@%'
  `)

  const topMentionIds = await conn.query(`
    WITH extracted AS (
      SELECT UNNEST(regexp_extract_all(Contents, '<@!?([0-9]+)>', 1)) as uid
      FROM messages
      WHERE Contents LIKE '%<@%'
    )
    SELECT uid, COUNT(*) as count
    FROM extracted
    GROUP BY uid
    ORDER BY count DESC
    LIMIT 40
  `)

  // Hype person
  const hypePersonCount = await conn.query(`SELECT COUNT(*) as count FROM messages WHERE Contents LIKE '%!%'`)

  // Voice of reason
  const voiceOfReasonCount = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE regexp_matches(LOWER(Contents), 'actually|technically|en realidad|t[eé]cnicamente')
  `)

  // Longest message
  const longestMessage = await conn.query(`
    SELECT LENGTH(Contents) as length FROM messages WHERE Contents IS NOT NULL ORDER BY length DESC LIMIT 1
  `)

  // Conversation starters: first message of the day in a channel
  const conversationStarters = await conn.query(`
    SELECT COUNT(*) as count FROM (
      SELECT ROW_NUMBER() OVER (PARTITION BY DATE(Timestamp), ChannelId ORDER BY Timestamp) as rn
      FROM messages
    ) WHERE rn = 1
  `)

  onProgress('Finalizing...', 99)

  // Helper to safely get values
  const getVal = (result: any, field: string, defaultVal: any = 0) => {
    try {
      const arr = result.toArray()
      if (arr.length > 0 && arr[0][field] !== null && arr[0][field] !== undefined) {
        return Number(arr[0][field]) || defaultVal
      }
    } catch { }
    return defaultVal
  }

  const getStr = (result: any, field: string, defaultVal: string = '') => {
    try {
      const arr = result.toArray()
      if (arr.length > 0 && arr[0][field]) {
        return String(arr[0][field])
      }
    } catch { }
    return defaultVal
  }

  const getArray = (result: any, mapFn: (row: any) => any) => {
    try {
      return result.toArray().map(mapFn)
    } catch {
      return []
    }
  }

  const toDistribution = (result: any, size: number, offset = 0) => {
    const out: Record<string, number> = {}
    for (let i = 0; i < size; i++) out[String(i + offset)] = 0
    for (const row of getArray(result, (r: any) => r)) {
      out[String(Number(row.k))] = Number(row.count)
    }
    return out
  }

  const hourlyDistribution = toDistribution(hourly, 24)
  const dayOfWeekDistribution = toDistribution(weekdays, 7)
  const monthlyDistribution = toDistribution(monthly, 12, 1)

  const maxKey = (dist: Record<string, number>) =>
    Object.entries(dist).reduce((best, entry) => (entry[1] > best[1] ? entry : best), ['0', -1] as [string, number])

  const [peakHourKey, peakHourCount] = maxKey(hourlyDistribution)
  const [peakDayKey, peakDayCount] = maxKey(dayOfWeekDistribution)
  const sumHours = (from: number, to: number) => {
    let total = 0
    for (let h = from; h < to; h++) total += hourlyDistribution[String(h)] ?? 0
    return total
  }

  const totalDaysSpan = getVal(dateStats, 'total_days_span', 1)
  const daysActive = getVal(dateStats, 'days_active', 0)

  const topMentions = getArray(topMentionIds, (m: any) => ({
    name: context.userNames[String(m.uid)] ?? '',
    count: Number(m.count),
  })).filter((m: { name: string }) => m.name).slice(0, 10)

  const customEmojiTotal = getVal(emojiTotals, 'custom_total')
  const unicodeEmojiTotal = getVal(emojiTotals, 'unicode_total')

  return {
    year: 0, // Will be set by caller
    availableYears: [] as number[],
    totalMessages: getVal(totalMessages, 'count'),
    totalWords: getVal(textStats, 'total_words'),
    totalCharacters: getVal(textStats, 'total_chars'),
    avgMessageLength: getVal(textStats, 'avg_length'),
    avgWordsPerMessage: getVal(textStats, 'avg_words'),
    daysActive,
    firstMessageDate: getStr(dateStats, 'first_message') || null,
    lastMessageDate: getStr(dateStats, 'last_message') || null,
    totalDaysSpan,
    longestStreak,
    topChannels: getArray(topChannels, (c: any) => ({ name: c.name, count: Number(c.count) })),
    topServers: getArray(topServers, (c: any) => ({ name: c.name, count: Number(c.count), channels: Number(c.channels) })),
    topDMs: getArray(topDMs, (c: any) => ({ name: c.name, count: Number(c.count), isGroup: c.kind === 'group' })),
    dmMessages: getVal(placeStats, 'dm_messages'),
    groupMessages: getVal(placeStats, 'group_messages'),
    serverMessages: getVal(placeStats, 'server_messages'),
    channelCount: getVal(placeStats, 'channels'),
    dmChannelCount: getVal(placeStats, 'dm_channels'),
    serverCount: getVal(placeStats, 'servers'),
    peakHour: Number(peakHourKey),
    peakHourCount: Math.max(0, peakHourCount),
    peakDay: DAY_NAMES[Number(peakDayKey)] ?? 'Unknown',
    peakDayCount: Math.max(0, peakDayCount),
    hourlyDistribution,
    dayOfWeekDistribution,
    monthlyDistribution,
    yearlyDistribution: {} as Record<string, number>, // set by caller
    dailyCounts: context.singleYear ? dailyRows : [],
    previousYearMessages: 0, // set by caller
    topEmojis: getArray(topEmojis, (e: any) => {
      // Parse full emoji tag: <a:name:id> or <:name:id>
      const match = String(e.full_emoji).match(/<(a?):([^:]+):([0-9]+)>/)
      if (match) {
        return {
          name: match[2],
          id: match[3],
          isAnimated: match[1] === 'a',
          count: Number(e.count)
        }
      }
      return { name: String(e.full_emoji), id: '', count: Number(e.count) }
    }),
    topUnicodeEmojis: getArray(topUnicodeEmojis, (e: any) => ({ name: String(e.emoji), count: Number(e.count) })),
    topWords: getArray(topWords, (w: any) => ({ word: w.word, count: Number(w.count) })),
    topDomains: getArray(topDomains, (d: any) => ({ name: String(d.domain), count: Number(d.count) })),
    topMentions,
    screamingCount: getVal(screamingCount, 'count'),
    questionCount: getVal(questionCount, 'count'),
    replyCount: 0, // not present in the export
    totalEmojis: customEmojiTotal + unicodeEmojiTotal,
    customEmojiCount: customEmojiTotal,
    unicodeEmojiCount: unicodeEmojiTotal,
    burstSequences: getVal(burstCount, 'count'),
    sentimentPositive: getVal(positiveWords, 'count'),
    sentimentNegative: getVal(negativeWords, 'count'),
    nightOwlCount: sumHours(0, 5),
    earlyBirdCount: sumHours(5, 9),
    weekendCount: (dayOfWeekDistribution['0'] ?? 0) + (dayOfWeekDistribution['6'] ?? 0),
    longestMessageLength: getVal(longestMessage, 'length'),
    avgResponseTimeSeconds: 0, // not derivable: the export only has your own messages
    mostActiveMonth: getStr(mostActiveMonth, 'month') || null,
    mostActiveMonthCount: getVal(mostActiveMonth, 'count'),
    busiestDay: busiest?.date ?? null,
    busiestDayCount: busiest?.count ?? 0,
    linksShared: getVal(linksShared, 'count'),
    mentionsGiven: getVal(mentionsGiven, 'count'),
    attachmentsCount: getVal(mediaStats, 'attachments'),
    messagesWithAttachments: getVal(mediaStats, 'with_attachments'),
    gifCount: getVal(mediaStats, 'gifs'),
    editsCount: 0, // lives in the Activity logs, not in Messages
    voiceOfReasonCount: getVal(voiceOfReasonCount, 'count'),
    hypePersonCount: getVal(hypePersonCount, 'count'),
    emojiOnlyCount: getVal(emojiTotals, 'emoji_only'),
    conversationStarters: getVal(conversationStarters, 'count'),
    ghostingDays: Math.max(0, totalDaysSpan - daysActive),
    timeZone: (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return '' }
    })(),
  }
}
