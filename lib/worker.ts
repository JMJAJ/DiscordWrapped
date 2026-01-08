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
  const logger = new duckdb.ConsoleLogger()
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
  if (directMatch) return directMatch[1].trim()
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

function normalizeTimestamp(raw: unknown): string | null {
  if (!raw) return null

  if (raw instanceof Date) {
    return raw.toISOString()
  }

  if (typeof raw === 'number') {
    const fromNumber = new Date(raw)
    return Number.isFinite(fromNumber.getTime()) ? fromNumber.toISOString() : null
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

  if (!/(Z|z|[+-]\d{2}:?\d{2})$/.test(candidate)) {
    candidate = `${candidate}Z`
  }

  const parsed = new Date(candidate)
  if (!Number.isFinite(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function escapeLiteral(value: string) {
  return value.replace(/'/g, "''")
}

async function insertBatch(
  conn: duckdb.AsyncDuckDBConnection,
  rows: Array<[string, string, string, string, string]>
) {
  if (!rows.length) return

  const values = rows.map(([id, ts, contents, attachments, channel]) =>
    `('${escapeLiteral(id)}','${escapeLiteral(ts)}','${escapeLiteral(contents)}','${escapeLiteral(attachments)}','${escapeLiteral(channel)}')`
  ).join(',')

  await conn.query(`INSERT INTO messages VALUES ${values}`)
}

interface WorkerRequest {
  file: File
  targetYear?: number | 'all' | null
}

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

async function processAndAnalyze(file: File, explicitYear?: number | 'all'): Promise<any> {
  // 1. Initialize DB
  postProgress('Initializing database...', 5)
  await initDuckDB()
  if (!conn) throw new Error('Database connection failed')

  // 2. Prepare Table
  await conn.query(`DROP TABLE IF EXISTS messages`)
  await conn.query(`
      CREATE TABLE messages (
        ID VARCHAR,
        Timestamp TIMESTAMP,
        Contents VARCHAR,
        Attachments VARCHAR,
        ChannelName VARCHAR
      )
    `)
  // Use a couple threads in wasm build for better parallelism within limits
  // Do not set threads in this build; wasm bundle may be single-threaded

  // 3. Load ZIP
  postProgress('Reading ZIP file...', 10)
  let zip = new JSZip()
  let contents = await zip.loadAsync(file)

  // 4. Find Files
  postProgress('Finding message files...', 12)
  const messageFiles: string[] = []
  contents.forEach((path, zipEntry) => {
    if (path.includes('messages') && path.endsWith('messages.json') && !zipEntry.dir) {
      messageFiles.push(path)
    }
  })

  const channelNameOverrides: Record<string, string> = {}
  const guildNameOverrides: Record<string, string> = {}
  const registerGuildName = (id?: string | null, name?: unknown) => {
    if (!id) return
    if (typeof name === 'string' && name.trim()) {
      const friendly = extractFriendlyChannelName(name)
      if (friendly) guildNameOverrides[id] = friendly
    }
  }
  try {
    const indexFiles = contents.file(/index\.json$/i) as JSZip.JSZipObject[]
    for (const indexFile of indexFiles) {
      if (indexFile.dir) continue
      if (!/\/?messages\/index\.json$/i.test(indexFile.name)) continue
      const text = await indexFile.async('string')
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
          if (typeof value === 'string') {
            const friendly = extractFriendlyChannelName(value)
            if (friendly) channelNameOverrides[key] = friendly
          } else if (value && typeof value === 'object' && 'name' in value) {
            const friendly = extractFriendlyChannelName(String((value as any).name))
            if (friendly) channelNameOverrides[key] = friendly
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to parse index.json for channel names', err)
  }

  try {
    const guildIndexFiles = contents.file(/guilds\/index\.json$/i) as JSZip.JSZipObject[]
    for (const guildIndexFile of guildIndexFiles) {
      if (guildIndexFile.dir) continue
      const text = await guildIndexFile.async('string')
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (!entry) continue
          const id = typeof entry.id === 'string' ? entry.id : undefined
          const name = (entry as any).name ?? (entry as any).label ?? (entry as any).value
          registerGuildName(id, name)
        }
      } else if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
          if (typeof value === 'string') {
            registerGuildName(key, value)
          } else if (value && typeof value === 'object') {
            const name = value.name ?? value.label ?? value.value
            registerGuildName(key, name)
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to parse guild index for server names', err)
  }

  try {
    const guildDetailFiles = contents.file(/guilds\/[\w-]+\/guild\.json$/i) as JSZip.JSZipObject[]
    for (const guildDetailFile of guildDetailFiles) {
      if (guildDetailFile.dir) continue
      try {
        const text = await guildDetailFile.async('string')
        const parsed = JSON.parse(text)
        const pathMatch = guildDetailFile.name.match(/guilds\/(.+)\/guild\.json$/i)
        const idFromPath = pathMatch ? pathMatch[1] : undefined
        const id = typeof parsed?.id === 'string' ? parsed.id : idFromPath
        const name = parsed?.name ?? parsed?.label
        registerGuildName(id, name)
      } catch (detailErr) {
        console.warn(`Failed to parse ${guildDetailFile.name}`, detailErr)
      }
    }
  } catch (err) {
    console.warn('Failed to parse guild detail files', err)
  }

  if (messageFiles.length === 0) {
    throw new Error('No message files found in ZIP. Make sure this is a Discord data export.')
  }

  postProgress(`Found ${messageFiles.length} channels...`, 15)

  // 5. Stream Process Files
  let processedFiles = 0
  let totalMessagesInserted = 0
  const yearCounts: Record<number, number> = {}
  let rowBuffer: Array<[string, string, string, string, string]> = []
  let rowBufferCharEstimate = 0
  const BATCH_SIZE = 8000 // slightly larger batches to reduce round trips
  const MAX_BUFFER_CHARS = 8_000_000 // guard against huge SQL strings in wasm
  const alreadyFilteredByYear = typeof explicitYear === 'number'

  for (const filePath of messageFiles) {
    try {
      const content = await contents.file(filePath)?.async('string')
      if (!content) continue

      const data = JSON.parse(content)
      const messages = Array.isArray(data) ? data : data?.messages || []
      if (!Array.isArray(messages) || messages.length === 0) continue

      const channelPath = filePath.replace('messages.json', 'channel.json')
      const folderParts = filePath.split('/')
      const folderName = folderParts.length > 1 ? folderParts[folderParts.length - 2] : ''
      const channelId = folderName.startsWith('c') ? folderName.slice(1) : folderName
      let channelName = channelNameOverrides[channelId] || ''
      let guildName = ''
      let isDirectMessage = false

      try {
        const cContent = await contents.file(channelPath)?.async('string')
        if (cContent) {
          const cData = JSON.parse(cContent)
          const candidates: string[] = []
          if (typeof cData.name === 'string') {
            candidates.push(cData.name)
          }
          if (Array.isArray(cData.recipients)) {
            isDirectMessage = true
            const recipientNames = cData.recipients
              .map((recipient: any) => {
                const username = recipient?.username
                if (!username) return null
                const discriminator = recipient?.discriminator
                if (discriminator !== undefined && discriminator !== null) {
                  return `${username}#${discriminator}`
                }
                return username
              })
              .filter(Boolean) as string[]
            if (recipientNames.length > 0) {
              candidates.push(recipientNames.join(', '))
            }
          }
          if (channelNameOverrides[channelId]) {
            candidates.push(channelNameOverrides[channelId])
          }
          if (typeof cData.id === 'string') {
            candidates.push(cData.id)
          }

          const resolved = candidates
            .map(name => extractFriendlyChannelName(name))
            .find(Boolean)
          if (resolved) {
            channelName = resolved
          }

          if (typeof cData.guild_id === 'string') {
            guildName = guildNameOverrides[cData.guild_id] || guildName
          }
          if (!guildName && cData.guild) {
            if (typeof cData.guild === 'string') {
              guildName = cData.guild
            } else if (typeof cData.guild.name === 'string') {
              guildName = cData.guild.name
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to read channel metadata for ${filePath}`, err)
      }

      if (channelName) {
        channelName = extractFriendlyChannelName(channelName)
      }
      if (!channelName && channelNameOverrides[channelId]) {
        channelName = extractFriendlyChannelName(channelNameOverrides[channelId])
      }
      if (!channelName) {
        channelName = 'Unknown'
      }
      if (guildName) {
        guildName = extractFriendlyChannelName(guildName)
      }
      if (guildName && !isDirectMessage) {
        channelName = channelName === 'Unknown'
          ? guildName
          : composeGuildChannelLabel(guildName, channelName)
      }
      const safeChannelName = channelName.replace(/'/g, "''")

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
        const ts = normalizeTimestamp(rawTimestamp)
        if (!ts) continue

        const year = Number(ts.slice(0, 4))
        if (Number.isFinite(year)) {
          yearCounts[year] = (yearCounts[year] ?? 0) + 1
        }

        if (typeof explicitYear === 'number' && year !== explicitYear) {
          continue
        }

        const id = String(m.ID ?? m.id ?? '')
        const contents = String(m.Contents ?? m.contents ?? '')
        // Attachments are unused in downstream stats; drop to shrink inserts
        const attachments = ''
        const cName = safeChannelName

        rowBuffer.push([id, ts, contents, attachments, cName])
        rowBufferCharEstimate += id.length + ts.length + contents.length + attachments.length + cName.length + 10 // small overhead
        insertedFromFile++
      }

      totalMessagesInserted += insertedFromFile
    } catch (e) {
      console.warn(`Failed to process ${filePath}`, e)
    }

    if (rowBuffer.length >= BATCH_SIZE || rowBufferCharEstimate >= MAX_BUFFER_CHARS) {
      await insertBatch(conn, rowBuffer)
      rowBuffer = []
      rowBufferCharEstimate = 0
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
    rowBufferCharEstimate = 0
  }

  if (totalMessagesInserted === 0) {
    throw new Error("No messages found in your Discord data.")
  }

  if (alreadyFilteredByYear && typeof explicitYear === 'number') {
    postProgress(`Filtered for ${explicitYear} during ingest...`, 87)
  }

  postProgress('Identifying active year...', 88)

  const isAllTimeRequest = explicitYear === 'all'
  const availableYears = Object.keys(yearCounts)
    .map(Number)
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a)

  if (!availableYears.length) {
    throw new Error('No messages found in your Discord data.')
  }

  const sortedYearCounts = availableYears
    .map((year) => ({ year, count: yearCounts[year] ?? 0 }))
    .sort((a, b) => b.year - a.year)

  let targetYear: number | null = null

  if (!isAllTimeRequest) {
    if (typeof explicitYear === 'number') {
      if (availableYears.includes(explicitYear)) {
        targetYear = explicitYear
      } else {
        const list = availableYears.length ? ` Available years: ${availableYears.join(', ')}` : ''
        throw new Error(`No messages found for year ${explicitYear}.${list}`)
      }
    } else if (sortedYearCounts.length > 0) {
      const preferredYear = 2025
      targetYear = availableYears.includes(preferredYear) ? preferredYear : sortedYearCounts[0].year

      try {
        const now = new Date()
        const targetYearNumber = targetYear
        if (typeof targetYearNumber === 'number' && targetYearNumber === now.getFullYear() && now.getMonth() < 2 && sortedYearCounts.length > 1) {
          const prev = sortedYearCounts.find((entry) => entry.year === targetYearNumber - 1)
          if (prev) {
            targetYear = prev.year
          }
        }
      } catch (e) {
        console.warn('Smart year fallback failed', e)
      }
    }
  }

  const needsPostFilter =
    targetYear !== null &&
    !isAllTimeRequest &&
    !alreadyFilteredByYear &&
    availableYears.length > 1

  if (needsPostFilter) {
    postProgress(`Filtering for ${targetYear}...`, 90)
    await conn.query(`DELETE FROM messages WHERE EXTRACT(YEAR FROM Timestamp) != ${targetYear}`)
  } else {
    postProgress('Preparing all-time view...', 90)
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

  const stats = await runStatsQueries(conn, postProgress)
  stats.year = targetYear !== null ? targetYear : 'all'
  stats.availableYears = availableYears

  postProgress('Done!', 100)

    // Explicit cleanup
    ; (contents as any) = null
    ; (zip as any) = null
  rowBuffer = []

  return stats
}

async function runStatsQueries(
  conn: duckdb.AsyncDuckDBConnection,
  onProgress: (stage: string, percent: number) => void
): Promise<Record<string, any>> {
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
        MIN(Timestamp) as first_message,
        MAX(Timestamp) as last_message,
        DATEDIFF('day', MIN(Timestamp), MAX(Timestamp)) as total_days_span
      FROM messages
    `)

  // Top channels
  const topChannels = await conn.query(`
      SELECT 
        COALESCE(ChannelName, 'Unknown Channel') as name,
        COUNT(*) as count
      FROM messages
      GROUP BY ChannelName
      ORDER BY count DESC
      LIMIT 10
    `)

  // Peak hour
  const peakHour = await conn.query(`
      SELECT 
        EXTRACT(HOUR FROM Timestamp) as hour,
        COUNT(*) as count
      FROM messages
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `)

  // Peak day
  const peakDay = await conn.query(`
      SELECT 
        DAYNAME(Timestamp) as day,
        COUNT(*) as count
      FROM messages
      GROUP BY day
      ORDER BY count DESC
      LIMIT 1
    `)

  onProgress('Analyzing patterns...', 96)

  // Top emojis
  const topEmojis = await conn.query(`
    WITH extracted AS (
      SELECT UNNEST(regexp_extract_all(Contents, '<a?:[^:]+:[0-9]+>')) as full_emoji
      FROM messages
    )
    SELECT full_emoji, COUNT(*) as count
    FROM extracted
    GROUP BY full_emoji
    ORDER BY count DESC
    LIMIT 10
  `)

  // Top words
  const topWords = await conn.query(`
    WITH words AS (
      SELECT UNNEST(STRING_SPLIT(LOWER(Contents), ' ')) as word
      FROM messages
      WHERE Contents IS NOT NULL
    )
    SELECT word, COUNT(*) as count
    FROM words
    WHERE LENGTH(word) > 4
      AND word NOT IN ('https', 'http', 'the', 'and', 'for', 'are', 'with', 'that', 'this', 'from', 'have', 'been', 'were', 'their', 'would', 'there', 'could', 'about', 'just', 'like', 'what', 'when', 'make', 'time')
      AND word NOT LIKE 'http%'
      AND NOT REGEXP_MATCHES(word, '^<a?:.+:[0-9]+>$')
    GROUP BY word
    ORDER BY count DESC
    LIMIT 20
  `)

  // Screaming
  const screamingCount = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE Contents = UPPER(Contents) AND Contents != LOWER(Contents) AND LENGTH(Contents) > 3
  `)

  // Questions
  const questionCount = await conn.query(`
    SELECT COUNT(*) as count FROM messages WHERE Contents LIKE '%?%'
  `)

  // Sentiment
  const positiveWords = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE LOWER(Contents) LIKE '%lol%' OR LOWER(Contents) LIKE '%lmao%' OR LOWER(Contents) LIKE '%haha%'
      OR LOWER(Contents) LIKE '%nice%' OR LOWER(Contents) LIKE '%awesome%' OR LOWER(Contents) LIKE '%love%'
      OR LOWER(Contents) LIKE '%great%' OR LOWER(Contents) LIKE '%thanks%' OR LOWER(Contents) LIKE '%happy%'
  `)

  const negativeWords = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE LOWER(Contents) LIKE '%hate%' OR LOWER(Contents) LIKE '%terrible%' OR LOWER(Contents) LIKE '%awful%'
      OR LOWER(Contents) LIKE '%stupid%' OR LOWER(Contents) LIKE '%worst%' OR LOWER(Contents) LIKE '%angry%'
  `)

  onProgress('Calculating streaks...', 97)

  // Daily activity for streak calculation
  const dailyActivity = await conn.query(`
    SELECT DATE(Timestamp) as date FROM messages GROUP BY date ORDER BY date
  `)

  // Calculate streak
  let longestStreak = 0
  let currentStreak = 0
  let prevDate: Date | null = null
  const dates = dailyActivity.toArray()

  for (const row of dates) {
    const currentDate = new Date(row.date)
    if (prevDate) {
      const dayDiff = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
      if (dayDiff === 1) {
        currentStreak++
      } else {
        longestStreak = Math.max(longestStreak, currentStreak)
        currentStreak = 1
      }
    } else {
      currentStreak = 1
    }
    prevDate = currentDate
  }
  longestStreak = Math.max(longestStreak, currentStreak)

  // Night owl / Early bird
  const nightOwlCount = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE EXTRACT(HOUR FROM Timestamp) >= 0 AND EXTRACT(HOUR FROM Timestamp) < 5
  `)

  const earlyBirdCount = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE EXTRACT(HOUR FROM Timestamp) >= 5 AND EXTRACT(HOUR FROM Timestamp) < 9
  `)

  // Weekend
  const weekendCount = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE DAYNAME(Timestamp) IN ('Saturday', 'Sunday')
  `)

  // Busiest day
  const busiestDay = await conn.query(`
    SELECT DATE(Timestamp) as date, COUNT(*) as count
    FROM messages GROUP BY date ORDER BY count DESC LIMIT 1
  `)

  // Most active month
  const mostActiveMonth = await conn.query(`
    SELECT STRFTIME(Timestamp, '%Y-%m') as month, COUNT(*) as count
    FROM messages GROUP BY month ORDER BY count DESC LIMIT 1
  `)

  // Burst sequences
  const burstCount = await conn.query(`
    SELECT COUNT(*) as count FROM (
      SELECT Timestamp, LAG(Timestamp) OVER (ORDER BY Timestamp) as prev_timestamp
      FROM messages
    ) WHERE EPOCH(Timestamp) - EPOCH(prev_timestamp) <= 30
  `)

  // Links shared
  const linksShared = await conn.query(`SELECT COUNT(*) as count FROM messages WHERE Contents LIKE '%http%'`)

  // Mentions
  const mentionsGiven = await conn.query(`SELECT COUNT(*) as count FROM messages WHERE Contents LIKE '%@%'`)

  // Hype person
  const hypePersonCount = await conn.query(`SELECT COUNT(*) as count FROM messages WHERE Contents LIKE '%!%'`)

  // Voice of reason
  const voiceOfReasonCount = await conn.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE LOWER(Contents) LIKE '%actually%' OR LOWER(Contents) LIKE '%technically%'
  `)

  // Longest message
  const longestMessage = await conn.query(`
    SELECT LENGTH(Contents) as length FROM messages WHERE Contents IS NOT NULL ORDER BY length DESC LIMIT 1
  `)

  // Conversation starters
  const conversationStarters = await conn.query(`
    SELECT COUNT(*) as count FROM (
      SELECT DATE(Timestamp) as date, ChannelName,
        ROW_NUMBER() OVER (PARTITION BY DATE(Timestamp), ChannelName ORDER BY Timestamp) as rn
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

  const totalDaysSpan = getVal(dateStats, 'total_days_span', 1)
  const daysActive = getVal(dateStats, 'days_active', 0)

  return {
    year: 0, // Will be set by caller
    availableYears: [] as number[],
    totalMessages: getVal(totalMessages, 'count'),
    totalWords: getVal(textStats, 'total_words'),
    totalCharacters: getVal(textStats, 'total_chars'),
    avgMessageLength: getVal(textStats, 'avg_length'),
    avgWordsPerMessage: getVal(textStats, 'avg_words'),
    daysActive,
    firstMessageDate: getStr(dateStats, 'first_message')?.split(' ')[0] || null,
    lastMessageDate: getStr(dateStats, 'last_message')?.split(' ')[0] || null,
    totalDaysSpan,
    longestStreak,
    topChannels: getArray(topChannels, (c: any) => ({ name: c.name, count: Number(c.count) })),
    peakHour: getVal(peakHour, 'hour'),
    peakHourCount: getVal(peakHour, 'count'),
    peakDay: getStr(peakDay, 'day') || 'Unknown',
    peakDayCount: getVal(peakDay, 'count'),
    hourlyDistribution: {},
    dayOfWeekDistribution: {},
    monthlyDistribution: {},
    yearlyDistribution: {},
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
    topWords: getArray(topWords, (w: any) => ({ word: w.word, count: Number(w.count) })),
    screamingCount: getVal(screamingCount, 'count'),
    questionCount: getVal(questionCount, 'count'),
    replyCount: 0,
    totalEmojis: 0,
    burstSequences: getVal(burstCount, 'count'),
    sentimentPositive: getVal(positiveWords, 'count'),
    sentimentNegative: getVal(negativeWords, 'count'),
    nightOwlCount: getVal(nightOwlCount, 'count'),
    earlyBirdCount: getVal(earlyBirdCount, 'count'),
    weekendCount: getVal(weekendCount, 'count'),
    longestMessageLength: getVal(longestMessage, 'length'),
    avgResponseTimeSeconds: 0,
    mostActiveMonth: getStr(mostActiveMonth, 'month') || null,
    mostActiveMonthCount: getVal(mostActiveMonth, 'count'),
    busiestDay: getStr(busiestDay, 'date') || null,
    busiestDayCount: getVal(busiestDay, 'count'),
    linksShared: getVal(linksShared, 'count'),
    mentionsGiven: getVal(mentionsGiven, 'count'),
    editsCount: 0,
    voiceOfReasonCount: getVal(voiceOfReasonCount, 'count'),
    hypePersonCount: getVal(hypePersonCount, 'count'),
    emojiOnlyCount: 0,
    conversationStarters: getVal(conversationStarters, 'count'),
    ghostingDays: Math.max(0, totalDaysSpan - daysActive),
  }
}
