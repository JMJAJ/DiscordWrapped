import { Database } from "duckdb-async"

let db: Database | null = null

export async function getDB() {
  if (!db) {
    db = await Database.create(":memory:")
    
    // Optimize DuckDB for large datasets
    await db.exec(`
      SET memory_limit='2GB';
      SET threads=4;
    `)
    
    console.log("[v0] DuckDB initialized")
  }
  return db
}

export async function loadDiscordData() {
  const database = await getDB()

  try {
    console.log("[v0] Starting to load Discord data...")
    
    // Check if Parquet file exists (created by process-discord-data.js)
    const fs = require('fs')
    const parquetPath = './Messages/all_messages.parquet'
    
    if (fs.existsSync(parquetPath)) {
      console.log("[v0] Loading from Parquet file...")
      // Filter to 2025 only for yearly wrapped
      await database.exec(`
        CREATE TABLE IF NOT EXISTS messages AS 
        SELECT * FROM read_parquet('${parquetPath}')
        WHERE Timestamp >= '2025-01-01' AND Timestamp < '2026-01-01';
      `)
    } else {
      console.log("[v0] Parquet file not found. Run: node scripts/process-discord-data.js")
      return false
    }

    const count = await database.all(`SELECT COUNT(*) as count FROM messages`)
    console.log(`[v0] Discord data loaded: ${count[0].count} messages (2025 only)`)
    return true
  } catch (error) {
    console.error("[v0] Failed to load Discord data:", error)
    return false
  }
}

export async function getWrappedStats() {
  const database = await getDB()

  try {
    // Total messages
    const totalMessages = await database.all(`SELECT COUNT(*) as count FROM messages`)

    // Total words and characters
    const textStats = await database.all(`
      SELECT 
        SUM(LENGTH(Contents) - LENGTH(REPLACE(Contents, ' ', '')) + 1) as total_words,
        SUM(LENGTH(Contents)) as total_chars,
        AVG(LENGTH(Contents)) as avg_length,
        AVG(LENGTH(Contents) - LENGTH(REPLACE(Contents, ' ', '')) + 1) as avg_words
      FROM messages 
      WHERE Contents IS NOT NULL AND Contents != ''
    `)

    // Days active and date range
    const dateStats = await database.all(`
      SELECT 
        COUNT(DISTINCT DATE(Timestamp)) as days_active,
        MIN(Timestamp) as first_message,
        MAX(Timestamp) as last_message,
        DATEDIFF('day', MIN(Timestamp), MAX(Timestamp)) as total_days_span
      FROM messages
    `)

    // Top channels
    const topChannels = await database.all(`
      SELECT 
        COALESCE(ChannelName, 'Unknown Channel') as name,
        COUNT(*) as count
      FROM messages
      GROUP BY ChannelName
      ORDER BY count DESC
      LIMIT 10
    `)

    // Peak hour
    const peakHour = await database.all(`
      SELECT 
        EXTRACT(HOUR FROM Timestamp) as hour,
        COUNT(*) as count
      FROM messages
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `)

    // Peak day of week
    const peakDay = await database.all(`
      SELECT 
        DAYNAME(Timestamp) as day,
        COUNT(*) as count
      FROM messages
      GROUP BY day
      ORDER BY count DESC
      LIMIT 1
    `)

    // Hourly distribution
    const hourlyDist = await database.all(`
      SELECT 
        EXTRACT(HOUR FROM Timestamp) as hour,
        COUNT(*) as count
      FROM messages
      GROUP BY hour
      ORDER BY hour
    `)

    // Day of week distribution
    const dayOfWeekDist = await database.all(`
      SELECT 
        DAYNAME(Timestamp) as day,
        COUNT(*) as count
      FROM messages
      GROUP BY day
      ORDER BY count DESC
    `)

    // Monthly distribution
    const monthlyDist = await database.all(`
      SELECT 
        STRFTIME(Timestamp, '%Y-%m') as month,
        COUNT(*) as count
      FROM messages
      GROUP BY month
      ORDER BY count DESC
      LIMIT 12
    `)

    // Yearly distribution
    const yearlyDist = await database.all(`
      SELECT 
        EXTRACT(YEAR FROM Timestamp) as year,
        COUNT(*) as count
      FROM messages
      GROUP BY year
      ORDER BY year
    `)

    // Emoji usage - supports both <:name:id> and <a:name:id> (animated, Vencord)
    const topEmojis = await database.all(`
      SELECT 
        COALESCE(
          REGEXP_EXTRACT(Contents, '<a?:([^:]+):[0-9]+>', 1),
          REGEXP_EXTRACT(Contents, '\\[([^\\]]+)\\]\\(https://cdn\\.discordapp\\.com/emojis/', 1)
        ) as name,
        COUNT(*) as count
      FROM messages
      WHERE Contents LIKE '%<:%' OR Contents LIKE '%<a:%' OR Contents LIKE '%](https://cdn.discordapp.com/emojis/%'
      GROUP BY name
      HAVING name IS NOT NULL AND name != ''
      ORDER BY count DESC
      LIMIT 10
    `)

    // Common words (excluding short words and common stopwords)
    const topWords = await database.all(`
      WITH words AS (
        SELECT UNNEST(STRING_SPLIT(LOWER(Contents), ' ')) as word
        FROM messages
        WHERE Contents IS NOT NULL
      )
      SELECT 
        word,
        COUNT(*) as count
      FROM words
      WHERE LENGTH(word) > 4
        AND word NOT IN ('https', 'http', 'the', 'and', 'for', 'are', 'with', 'that', 'this', 'from', 'have', 'been', 'were', 'their', 'would', 'there', 'could', 'about')
        AND word NOT LIKE 'http%'
      GROUP BY word
      ORDER BY count DESC
      LIMIT 20
    `)

    // ALL CAPS messages
    const screamingCount = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE Contents = UPPER(Contents) 
        AND Contents != LOWER(Contents)
        AND LENGTH(Contents) > 3
    `)

    // Questions
    const questionCount = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE Contents LIKE '%?%'
    `)

    // Replies - we don't have ReferencedMessage, so skip this
    const replyCount = [{ count: 0 }]

    // Positive sentiment words
    const positiveWords = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE LOWER(Contents) LIKE '%lol%' 
        OR LOWER(Contents) LIKE '%lmao%'
        OR LOWER(Contents) LIKE '%haha%'
        OR LOWER(Contents) LIKE '%nice%'
        OR LOWER(Contents) LIKE '%awesome%'
        OR LOWER(Contents) LIKE '%love%'
        OR LOWER(Contents) LIKE '%great%'
        OR LOWER(Contents) LIKE '%thanks%'
        OR LOWER(Contents) LIKE '%happy%'
        OR LOWER(Contents) LIKE '%yay%'
        OR LOWER(Contents) LIKE '%cool%'
    `)

    // Negative sentiment words
    const negativeWords = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE LOWER(Contents) LIKE '%hate%'
        OR LOWER(Contents) LIKE '%terrible%'
        OR LOWER(Contents) LIKE '%awful%'
        OR LOWER(Contents) LIKE '%stupid%'
        OR LOWER(Contents) LIKE '%worst%'
        OR LOWER(Contents) LIKE '%angry%'
        OR LOWER(Contents) LIKE '%ugh%'
        OR LOWER(Contents) LIKE '%wtf%'
    `)

    // Longest streak (simplified - days with messages)
    const dailyActivity = await database.all(`
      SELECT DATE(Timestamp) as date
      FROM messages
      GROUP BY date
      ORDER BY date
    `)

    // Calculate streak from daily activity
    let longestStreak = 0
    let currentStreak = 0
    let prevDate: Date | null = null

    for (const row of dailyActivity) {
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

    // Burst sequences (messages within 30 seconds)
    const burstCount = await database.all(`
      SELECT COUNT(*) as count
      FROM (
        SELECT 
          Timestamp,
          LAG(Timestamp) OVER (ORDER BY Timestamp) as prev_timestamp
        FROM messages
      )
      WHERE EPOCH(Timestamp) - EPOCH(prev_timestamp) <= 30
    `)

    // Night owl score (messages between midnight and 5am)
    const nightOwlCount = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE EXTRACT(HOUR FROM Timestamp) >= 0 AND EXTRACT(HOUR FROM Timestamp) < 5
    `)

    // Early bird score (messages between 5am and 9am)
    const earlyBirdCount = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE EXTRACT(HOUR FROM Timestamp) >= 5 AND EXTRACT(HOUR FROM Timestamp) < 9
    `)

    // Weekend warrior (messages on Saturday/Sunday)
    const weekendCount = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE DAYNAME(Timestamp) IN ('Saturday', 'Sunday')
    `)

    // Longest message
    const longestMessage = await database.all(`
      SELECT LENGTH(Contents) as length, Contents
      FROM messages
      WHERE Contents IS NOT NULL
      ORDER BY length DESC
      LIMIT 1
    `)

    // Average response time - skip since we don't have ReferencedMessage
    const avgResponseTime = [{ avg_seconds: 0 }]

    // Most active month
    const mostActiveMonth = await database.all(`
      SELECT 
        STRFTIME(Timestamp, '%Y-%m') as month,
        COUNT(*) as count
      FROM messages
      GROUP BY month
      ORDER BY count DESC
      LIMIT 1
    `)

    // Busiest day ever
    const busiestDay = await database.all(`
      SELECT 
        DATE(Timestamp) as date,
        COUNT(*) as count
      FROM messages
      GROUP BY date
      ORDER BY count DESC
      LIMIT 1
    `)

    // Links shared
    const linksShared = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE Contents LIKE '%http%'
    `)

    // Mentions given (messages with @)
    const mentionsGiven = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE Contents LIKE '%@%'
    `)

    // Edits made
    const editsCount = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE Attachments IS NOT NULL OR Contents LIKE '%edited%'
    `)

    // Voice of reason (messages with "actually", "technically", "well actually")
    const voiceOfReasonCount = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE LOWER(Contents) LIKE '%actually%'
        OR LOWER(Contents) LIKE '%technically%'
        OR LOWER(Contents) LIKE '%to be fair%'
        OR LOWER(Contents) LIKE '%in fact%'
    `)

    // Hype person (messages with exclamation marks)
    const hypePersonCount = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE Contents LIKE '%!%'
    `)

    // Emoji-only messages
    const emojiOnlyCount = await database.all(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE LENGTH(REGEXP_REPLACE(Contents, '[^a-zA-Z0-9]', '', 'g')) = 0
        AND LENGTH(Contents) > 0
        AND LENGTH(Contents) < 50
    `)

    // Top conversation starters (first message in a channel per day)
    const conversationStarters = await database.all(`
      SELECT COUNT(*) as count
      FROM (
        SELECT 
          DATE(Timestamp) as date,
          ChannelName,
          ROW_NUMBER() OVER (PARTITION BY DATE(Timestamp), ChannelName ORDER BY Timestamp) as rn
        FROM messages
      )
      WHERE rn = 1
    `)

    // Ghosting score (days with no messages)
    const totalDays = dateStats[0].total_days_span || 0
    const daysActive = dateStats[0].days_active || 0
    const ghostingDays = totalDays - daysActive

    // Build the response object
    const stats = {
      totalMessages: Number(totalMessages[0].count),
      totalWords: Number(textStats[0].total_words) || 0,
      totalCharacters: Number(textStats[0].total_chars) || 0,
      avgMessageLength: Number(textStats[0].avg_length) || 0,
      avgWordsPerMessage: Number(textStats[0].avg_words) || 0,
      daysActive: Number(dateStats[0].days_active),
      firstMessageDate: dateStats[0].first_message ? String(dateStats[0].first_message).split(" ")[0] : null,
      lastMessageDate: dateStats[0].last_message ? String(dateStats[0].last_message).split(" ")[0] : null,
      totalDaysSpan: Number(dateStats[0].total_days_span) || 0,
      longestStreak,
      topChannels: topChannels.map((c: any) => ({ name: c.name, count: Number(c.count) })),
      peakHour: Number(peakHour[0]?.hour) || 0,
      peakHourCount: Number(peakHour[0]?.count) || 0,
      peakDay: peakDay[0]?.day || "Unknown",
      peakDayCount: Number(peakDay[0]?.count) || 0,
      hourlyDistribution: Object.fromEntries(hourlyDist.map((h: any) => [h.hour, Number(h.count)])),
      dayOfWeekDistribution: Object.fromEntries(dayOfWeekDist.map((d: any) => [d.day, Number(d.count)])),
      monthlyDistribution: Object.fromEntries(monthlyDist.map((m: any) => [m.month, Number(m.count)])),
      yearlyDistribution: Object.fromEntries(yearlyDist.map((y: any) => [y.year, Number(y.count)])),
      topEmojis: topEmojis.map((e: any) => ({ name: e.name, id: "", count: Number(e.count) })),
      topWords: topWords.map((w: any) => ({ word: w.word, count: Number(w.count) })),
      screamingCount: Number(screamingCount[0].count),
      questionCount: Number(questionCount[0].count),
      replyCount: Number(replyCount[0].count),
      totalEmojis: topEmojis.reduce((sum: number, e: any) => sum + Number(e.count), 0),
      burstSequences: Number(burstCount[0].count),
      sentimentPositive: Number(positiveWords[0].count),
      sentimentNegative: Number(negativeWords[0].count),
      nightOwlCount: Number(nightOwlCount[0].count),
      earlyBirdCount: Number(earlyBirdCount[0].count),
      weekendCount: Number(weekendCount[0].count),
      longestMessageLength: Number(longestMessage[0]?.length) || 0,
      avgResponseTimeSeconds: Number(avgResponseTime[0]?.avg_seconds) || 0,
      mostActiveMonth: mostActiveMonth[0]?.month || null,
      mostActiveMonthCount: Number(mostActiveMonth[0]?.count) || 0,
      busiestDay: busiestDay[0]?.date ? String(busiestDay[0].date) : null,
      busiestDayCount: Number(busiestDay[0]?.count) || 0,
      linksShared: Number(linksShared[0].count),
      mentionsGiven: Number(mentionsGiven[0].count),
      editsCount: Number(editsCount[0].count),
      voiceOfReasonCount: Number(voiceOfReasonCount[0].count),
      hypePersonCount: Number(hypePersonCount[0].count),
      emojiOnlyCount: Number(emojiOnlyCount[0].count),
      conversationStarters: Number(conversationStarters[0].count),
      ghostingDays: Number(ghostingDays),
    }

    console.log("[v0] Stats calculated:", stats.totalMessages, "messages")
    return stats
  } catch (error) {
    console.error("[v0] Error calculating stats:", error)
    throw error
  }
}
