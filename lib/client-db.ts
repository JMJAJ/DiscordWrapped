"use client"

import * as duckdb from '@duckdb/duckdb-wasm'
import JSZip from 'jszip'

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null

export async function initDuckDB() {
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
  console.log('[DuckDB-WASM] Initialized')
  return db
}

export async function processDiscordZip(
  file: File, 
  onProgress: (stage: string, percent: number) => void
): Promise<any[]> {
  onProgress('Reading ZIP file...', 5)
  
  const zip = new JSZip()
  const contents = await zip.loadAsync(file)
  
  onProgress('Finding message files...', 10)
  
  // Find all messages.json files
  const messageFiles: string[] = []
  contents.forEach((path, zipEntry) => {
    if (path.includes('messages') && path.endsWith('messages.json') && !zipEntry.dir) {
      messageFiles.push(path)
    }
  })
  
  if (messageFiles.length === 0) {
    throw new Error('No message files found in ZIP. Make sure this is a Discord data export.')
  }
  
  onProgress(`Found ${messageFiles.length} channels...`, 15)
  
  // Read all messages
  const allMessages: any[] = []
  let processed = 0
  
  for (const filePath of messageFiles) {
    try {
      const content = await contents.file(filePath)?.async('string')
      if (content) {
        const data = JSON.parse(content)
        if (data.messages && Array.isArray(data.messages)) {
          // Get channel name from channel.json in same folder
          const channelPath = filePath.replace('messages.json', 'channel.json')
          let channelName = 'Unknown'
          try {
            const channelContent = await contents.file(channelPath)?.async('string')
            if (channelContent) {
              const channelData = JSON.parse(channelContent)
              channelName = channelData.name || channelData.id || 'Unknown'
            }
          } catch {}
          
          for (const msg of data.messages) {
            allMessages.push({
              ID: msg.ID,
              Timestamp: msg.Timestamp,
              Contents: msg.Contents || '',
              Attachments: msg.Attachments || '',
              ChannelName: channelName
            })
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to parse ${filePath}:`, e)
    }
    
    processed++
    const percent = 15 + Math.round((processed / messageFiles.length) * 60)
    onProgress(`Processing channels... (${processed}/${messageFiles.length})`, percent)
  }
  
  onProgress(`Loaded ${allMessages.length.toLocaleString()} messages`, 80)
  
  return allMessages
}

export async function calculateStats(
  messages: any[],
  onProgress: (stage: string, percent: number) => void
): Promise<any> {
  onProgress('Initializing database...', 82)
  
  await initDuckDB()
  if (!conn) throw new Error('Database connection failed')
  
  onProgress('Loading messages into database...', 85)
  
  // Filter to 2025 only
  const messages2025 = messages.filter(m => {
    const ts = m.Timestamp
    return ts && ts >= '2025-01-01' && ts < '2026-01-01'
  })
  
  if (messages2025.length === 0) {
    throw new Error('No messages found for 2025. Make sure your Discord data includes 2025 activity.')
  }
  
  onProgress(`Analyzing ${messages2025.length.toLocaleString()} messages from 2025...`, 88)
  
  // Create table and insert data
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
  
  // Insert in batches
  const batchSize = 5000
  for (let i = 0; i < messages2025.length; i += batchSize) {
    const batch = messages2025.slice(i, i + batchSize)
    const values = batch.map(m => {
      const contents = (m.Contents || '').replace(/'/g, "''")
      const attachments = (m.Attachments || '').replace(/'/g, "''")
      const channelName = (m.ChannelName || '').replace(/'/g, "''")
      const timestamp = m.Timestamp || '2025-01-01T00:00:00'
      return `('${m.ID}', '${timestamp}', '${contents}', '${attachments}', '${channelName}')`
    }).join(',')
    
    if (values) {
      await conn.query(`INSERT INTO messages VALUES ${values}`)
    }
    
    const percent = 88 + Math.round((i / messages2025.length) * 5)
    onProgress(`Loading data... (${Math.min(i + batchSize, messages2025.length).toLocaleString()}/${messages2025.length.toLocaleString()})`, percent)
  }
  
  onProgress('Calculating statistics...', 94)
  
  // Now run all the stats queries
  const stats = await runStatsQueries(conn, onProgress)
  
  onProgress('Done!', 100)
  
  return stats
}

async function runStatsQueries(conn: duckdb.AsyncDuckDBConnection, onProgress: (stage: string, percent: number) => void) {
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
    SELECT 
      REGEXP_EXTRACT(Contents, '<a?:([^:]+):[0-9]+>', 1) as name,
      COUNT(*) as count
    FROM messages
    WHERE Contents LIKE '%<:%' OR Contents LIKE '%<a:%'
    GROUP BY name
    HAVING name IS NOT NULL AND name != ''
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
      AND word NOT IN ('https', 'http', 'the', 'and', 'for', 'are', 'with', 'that', 'this', 'from', 'have', 'been', 'were', 'their', 'would', 'there', 'could', 'about')
      AND word NOT LIKE 'http%'
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
    } catch {}
    return defaultVal
  }

  const getStr = (result: any, field: string, defaultVal: string = '') => {
    try {
      const arr = result.toArray()
      if (arr.length > 0 && arr[0][field]) {
        return String(arr[0][field])
      }
    } catch {}
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
    topEmojis: getArray(topEmojis, (e: any) => ({ name: e.name, id: '', count: Number(e.count) })),
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
