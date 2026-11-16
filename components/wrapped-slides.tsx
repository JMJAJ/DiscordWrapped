"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, ChevronLeft, MessageSquare, Calendar, Clock, Zap, Heart, Smile, Target, Moon, Sun, Coffee, Link, AtSign, Megaphone, Sparkles, Ghost, MessageCircle, BarChart3, Award, Flame } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface DiscordData {
  year?: number | 'all' | null
  totalMessages: number
  totalWords: number
  totalCharacters: number
  daysActive: number
  longestStreak: number
  firstMessageDate: string | null
  lastMessageDate: string | null
  totalDaysSpan: number
  avgMessageLength: number
  avgWordsPerMessage: number
  topChannels: Array<{ name: string; count: number }>
  topWords: Array<{ word: string; count: number }>
  topEmojis: Array<{ name: string; id: string; count: number; isAnimated?: boolean }>
  screamingCount: number
  questionCount: number
  replyCount: number
  totalEmojis: number
  burstSequences: number
  sentimentPositive: number
  sentimentNegative: number
  peakHour: number
  peakHourCount: number
  peakDay: string
  peakDayCount: number
  hourlyDistribution: { [key: string]: number }
  dayOfWeekDistribution: { [key: string]: number }
  monthlyDistribution: { [key: string]: number }
  yearlyDistribution: { [key: string]: number }
  nightOwlCount: number
  earlyBirdCount: number
  weekendCount: number
  longestMessageLength: number
  avgResponseTimeSeconds: number
  mostActiveMonth: string | null
  mostActiveMonthCount: number
  busiestDay: string | null
  busiestDayCount: number
  linksShared: number
  mentionsGiven: number
  editsCount: number
  voiceOfReasonCount: number
  hypePersonCount: number
  emojiOnlyCount: number
  conversationStarters: number
  ghostingDays: number
  availableYears?: number[]
  // Added stats (optional so older payloads still render)
  topServers?: Array<{ name: string; count: number; channels?: number }>
  topDMs?: Array<{ name: string; count: number; isGroup?: boolean }>
  topUnicodeEmojis?: Array<{ name: string; count: number }>
  topDomains?: Array<{ name: string; count: number }>
  topMentions?: Array<{ name: string; count: number }>
  dailyCounts?: Array<{ date: string; count: number }>
  dmMessages?: number
  groupMessages?: number
  serverMessages?: number
  serverCount?: number
  dmChannelCount?: number
  attachmentsCount?: number
  messagesWithAttachments?: number
  gifCount?: number
  previousYearMessages?: number
  timeZone?: string
}

type Bar = { label: string; tip: string; value: number }

// Minimal animated bar chart (no chart library needed for 7-24 bars)
function BarChart({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <div className="flex items-stretch gap-1 md:gap-1.5 h-56">
      {bars.map((bar, index) => {
        const isPeak = bar.value === max
        return (
          <div
            key={index}
            className="flex-1 min-w-0 flex flex-col"
            title={`${bar.tip}: ${bar.value.toLocaleString()}`}
          >
            <div className="flex-1 flex items-end">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(1, (bar.value / max) * 100)}%` }}
                transition={{ delay: 0.15 + index * 0.02, duration: 0.5, ease: "easeOut" }}
                className={`w-full rounded-t ${isPeak
                  ? "bg-gradient-to-t from-red-500 to-orange-400"
                  : "bg-red-900/60"}`}
              />
            </div>
            <span className={`h-5 pt-1 text-center text-[10px] md:text-xs truncate ${isPeak ? "text-red-400 font-bold" : "text-gray-500"}`}>
              {bar.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// GitHub-style calendar: one square per day of the year, darker = quieter
function YearHeatmap({ year, days }: { year: number; days: Array<{ date: string; count: number }> }) {
  const DAY_MS = 86_400_000
  const CELL = 14
  const counts = new Map(days.map((d) => [d.date, d.count]))
  const max = Math.max(1, ...days.map((d) => d.count))
  const start = Date.UTC(year, 0, 1)
  const startDow = new Date(start).getUTCDay()

  const cells: Array<{ x: number; y: number; date: string; count: number }> = []
  const monthLabels: Array<{ x: number; label: string }> = []
  for (let i = 0; i < 366; i++) {
    const day = new Date(start + i * DAY_MS)
    if (day.getUTCFullYear() !== year) break
    const slot = i + startDow
    const col = Math.floor(slot / 7)
    const date = day.toISOString().slice(0, 10)
    if (day.getUTCDate() === 1) monthLabels.push({ x: col * CELL, label: MONTH_SHORT[day.getUTCMonth()] })
    cells.push({ x: col * CELL, y: (slot % 7) * CELL + 16, date, count: counts.get(date) ?? 0 })
  }

  return (
    <svg viewBox={`0 0 ${54 * CELL} ${7 * CELL + 16}`} className="w-full h-auto" role="img" aria-label={`Messages per day in ${year}`}>
      {monthLabels.map((m) => (
        <text key={m.label} x={m.x} y={10} fontSize={10} fill="#6b7280">{m.label}</text>
      ))}
      {cells.map((cell) => (
        <rect
          key={cell.date}
          x={cell.x}
          y={cell.y}
          width={CELL - 2}
          height={CELL - 2}
          rx={2}
          fill={cell.count === 0 ? "#27272a" : "#ef4444"}
          fillOpacity={cell.count === 0 ? 1 : 0.25 + 0.75 * Math.sqrt(cell.count / max)}
        >
          <title>{`${cell.date}: ${cell.count.toLocaleString()} messages`}</title>
        </rect>
      ))}
    </svg>
  )
}

// Smart number formatter - scales text size based on number length
function formatStat(num: number): { value: string; size: string } {
  const formatted = num.toLocaleString()
  const len = formatted.length

  if (len <= 5) return { value: formatted, size: "text-7xl md:text-9xl" }
  if (len <= 7) return { value: formatted, size: "text-6xl md:text-8xl" }
  if (len <= 9) return { value: formatted, size: "text-5xl md:text-7xl" }
  return { value: formatted, size: "text-4xl md:text-6xl" }
}

// Compact number formatter for descriptions
function compactNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString()
}

// Helper component to render Discord custom emojis
function DiscordEmoji({ name, id, isAnimated, size = 24 }: { name: string; id: string; isAnimated?: boolean; size?: number }) {
  // If no ID, it's a standard emoji or invalid - just show the name
  if (!id) {
    return <span>:{name}:</span>
  }

  const extension = isAnimated ? 'gif' : 'webp'
  const cdnUrl = `https://cdn.discordapp.com/emojis/${id}.${extension}?size=${size >= 48 ? 96 : 48}&quality=lossless`

  return (
    <img
      src={cdnUrl}
      alt={`:${name}:`}
      title={`:${name}:`}
      width={size}
      height={size}
      className="inline-block object-contain"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  )
}

function createSlides(data: DiscordData) {
  const slides: any[] = []
  const isAllTime = data.year === 'all'
  const fallbackYear = data.availableYears?.[0] ?? new Date().getFullYear()
  const numericYear = typeof data.year === 'number' ? data.year : fallbackYear
  const yearLabel = isAllTime ? 'All-Time' : `${numericYear}`

  // Intro with year
  slides.push({
    id: "intro",
    type: "intro",
    title: "Your Discord",
    subtitle: isAllTime ? "All-Time Wrapped" : `${yearLabel} Wrapped`,
    description: isAllTime ? "Let's relive your entire Discord story..." : "Let's dive into your year...",
  })

  // Total messages - with dynamic sizing
  const msgStat = formatStat(data.totalMessages)
  slides.push({
    id: "total-messages",
    type: "stat",
    icon: MessageSquare,
    stat: msgStat.value,
    statSize: msgStat.size,
    label: "Messages Sent",
    description: `That's ${compactNumber(Math.round(data.totalMessages / data.daysActive))} messages per active day!`,
    funFact: data.totalMessages > 100000 ? "You're in the top 1% of chatters!" : null,
  })

  // Year over year
  const previousYearMessages = data.previousYearMessages ?? 0
  if (!isAllTime && previousYearMessages > 0) {
    const change = Math.round(((data.totalMessages - previousYearMessages) / previousYearMessages) * 100)
    slides.push({
      id: "year-over-year",
      type: "stat",
      icon: BarChart3,
      stat: `${change >= 0 ? "+" : ""}${change.toLocaleString()}%`,
      statSize: "text-6xl md:text-8xl",
      label: `vs ${numericYear - 1}`,
      description: `${compactNumber(previousYearMessages)} messages in ${numericYear - 1} → ${compactNumber(data.totalMessages)} in ${numericYear}`,
      funFact: change >= 50 ? "Chattier than ever!" : change <= -50 ? "A quieter year." : null,
    })
  }

  // All-time: messages per year
  const yearEntries = Object.entries(data.yearlyDistribution ?? {})
  if (isAllTime && yearEntries.length > 1) {
    slides.push({
      id: "yearly-chart",
      type: "chart",
      icon: BarChart3,
      title: "Your Discord Through the Years",
      bars: yearEntries.map(([year, count]) => ({ label: `'${year.slice(2)}`, tip: year, value: count })),
      description: `${yearEntries.length} years of messages`,
    })
  }

  // Total words with dynamic sizing
  if (data.totalWords > 0) {
    const wordStat = formatStat(data.totalWords)
    const novels = Math.round(data.totalWords / 50000)
    slides.push({
      id: "total-words",
      type: "stat",
      icon: MessageCircle,
      stat: wordStat.value,
      statSize: wordStat.size,
      label: "Words Typed",
      description: novels > 0
        ? `That's ${novels} novel${novels > 1 ? 's' : ''} worth of text!`
        : `Avg ${Math.round(data.avgWordsPerMessage)} words per message`,
      funFact: data.totalWords > 500000 ? "Your fingers must be tired!" : null,
    })
  }

  // Days active with progress visualization
  const activePercent = Math.round((data.daysActive / data.totalDaysSpan) * 100)
  slides.push({
    id: "days-active",
    type: "progress",
    icon: Calendar,
    stat: data.daysActive.toString(),
    statSize: "text-7xl md:text-9xl",
    label: "Days Active",
    progress: activePercent,
    description: isAllTime
      ? `${activePercent}% attendance rate across your Discord history`
      : `${activePercent}% attendance rate in ${yearLabel}`,
    subtext: `${data.totalDaysSpan} days tracked`,
  })

  // Longest streak with fire emoji
  if (data.longestStreak > 1) {
    slides.push({
      id: "longest-streak",
      type: "stat",
      icon: Flame,
      stat: `${data.longestStreak}`,
      statSize: "text-6xl md:text-8xl",
      label: "Day Streak",
      description: "Consecutive days chatting without a break!",
      funFact: data.longestStreak > 30 ? "Unstoppable!" : null,
    })
  }

  // Peak hour with visual clock
  const getTimeEmoji = (hour: number) => {
    if (hour >= 5 && hour < 12) return "☀️"
    if (hour >= 12 && hour < 17) return "🌤️"
    if (hour >= 17 && hour < 21) return "🌆"
    return "🌙"
  }

  const formatHour = (hour: number) => {
    if (hour === 0) return "12 AM"
    if (hour < 12) return `${hour} AM`
    if (hour === 12) return "12 PM"
    return `${hour - 12} PM`
  }

  slides.push({
    id: "peak-hour",
    type: "stat",
    icon: Clock,
    stat: `${getTimeEmoji(data.peakHour)} ${formatHour(data.peakHour)}`,
    statSize: "text-5xl md:text-7xl",
    label: "Peak Activity Hour",
    description: `${compactNumber(data.peakHourCount)} messages sent at this time`,
    funFact: data.peakHour >= 0 && data.peakHour < 5 ? "Night owl detected! 🦉" : null,
  })

  // Hour-by-hour chart
  const hourValues = Array.from({ length: 24 }, (_, hour) => data.hourlyDistribution?.[String(hour)] ?? 0)
  if (hourValues.some((value) => value > 0)) {
    slides.push({
      id: "hourly-chart",
      type: "chart",
      icon: Clock,
      title: "Your Day on Discord",
      bars: hourValues.map((value, hour) => ({
        label: hour % 3 === 0 ? formatHour(hour).replace(/ ([AP])M/, (_, half) => half.toLowerCase()) : "",
        tip: formatHour(hour),
        value,
      })),
      description: data.timeZone ? `Messages by hour, in your time zone (${data.timeZone})` : "Messages by hour of the day",
    })
  }

  // Night owl vs Early bird
  const nightOwlPercent = Math.round((data.nightOwlCount / data.totalMessages) * 100)
  const earlyBirdPercent = Math.round((data.earlyBirdCount / data.totalMessages) * 100)

  if (nightOwlPercent > earlyBirdPercent && nightOwlPercent > 3) {
    slides.push({
      id: "night-owl",
      type: "stat",
      icon: Moon,
      stat: `🦉 ${nightOwlPercent}%`,
      statSize: "text-6xl md:text-8xl",
      label: "Night Owl",
      description: `${compactNumber(data.nightOwlCount)} messages between midnight and 5 AM`,
      funFact: "Sleep is overrated anyway!",
    })
  } else if (earlyBirdPercent > 3) {
    slides.push({
      id: "early-bird",
      type: "stat",
      icon: Sun,
      stat: `🐦 ${earlyBirdPercent}%`,
      statSize: "text-6xl md:text-8xl",
      label: "Early Bird",
      description: `${compactNumber(data.earlyBirdCount)} messages between 5-9 AM`,
      funFact: "Rise and grind!",
    })
  }

  // Weekend warrior
  const weekendPercent = Math.round((data.weekendCount / data.totalMessages) * 100)
  if (weekendPercent > 25) {
    slides.push({
      id: "weekend-warrior",
      type: "stat",
      icon: Coffee,
      stat: `${weekendPercent}%`,
      statSize: "text-7xl md:text-9xl",
      label: "Weekend Warrior",
      description: `${compactNumber(data.weekendCount)} messages on Sat & Sun`,
    })
  }

  // Day-of-week chart (Monday first)
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const weekdayValues = weekdayOrder.map((day) => data.dayOfWeekDistribution?.[String(day)] ?? 0)
  if (weekdayValues.some((value) => value > 0)) {
    slides.push({
      id: "weekday-chart",
      type: "chart",
      icon: Calendar,
      title: "Your Week on Discord",
      bars: weekdayOrder.map((day, index) => ({
        label: weekdayNames[day].slice(0, 3),
        tip: weekdayNames[day],
        value: weekdayValues[index],
      })),
      description: `${data.peakDay}s are your day: ${compactNumber(data.peakDayCount)} messages`,
    })
  }

  // Top channels
  if (data.topChannels.length > 0) {
    slides.push({
      id: "top-channels",
      type: "list",
      title: "Your Hangout Spots",
      icon: Target,
      data: data.topChannels.slice(0, 5),
      description: `${data.topChannels[0].name} is your home`,
    })
  }

  // Top servers
  const topServers = data.topServers ?? []
  if (topServers.length > 1) {
    slides.push({
      id: "top-servers",
      type: "list",
      title: "Your Top Servers",
      icon: Award,
      data: topServers.slice(0, 5),
      description: data.serverCount
        ? `You chatted in ${data.serverCount} server${data.serverCount === 1 ? "" : "s"}`
        : `${topServers[0].name} is where you live`,
    })
  }

  // Top DMs
  const topDMs = data.topDMs ?? []
  if (topDMs.length > 0) {
    slides.push({
      id: "top-dms",
      type: "list",
      title: "Your Inner Circle",
      icon: Heart,
      data: topDMs.slice(0, 5),
      description: data.dmChannelCount
        ? `You DMed ${data.dmChannelCount} different ${data.dmChannelCount === 1 ? "person" : "people"}`
        : `${topDMs[0].name} hears from you the most`,
    })
  }

  // DMs vs servers
  const privateMessages = (data.dmMessages ?? 0) + (data.groupMessages ?? 0)
  const serverMessages = data.serverMessages ?? 0
  if (privateMessages > 0 && serverMessages > 0) {
    const privatePercent = Math.round((privateMessages / (privateMessages + serverMessages)) * 100)
    slides.push({
      id: "dm-vs-server",
      type: "progress",
      icon: MessageCircle,
      stat: `${privatePercent}%`,
      statSize: "text-7xl md:text-9xl",
      label: "Sent in DMs",
      progress: privatePercent,
      description: `${compactNumber(privateMessages)} in DMs & group chats vs ${compactNumber(serverMessages)} in servers`,
      funFact: privatePercent >= 60 ? "You keep it personal." : privatePercent <= 25 ? "A true server regular." : null,
    })
  }

  const safeFormatDate = (dateInput: string | null) => {
    if (!dateInput) return "Unknown Date"

    if (/^\d+$/.test(dateInput)) {
      const date = new Date(parseInt(dateInput))
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }

    // "YYYY-MM-DD" parses as UTC midnight, so format in UTC to keep the same day
    const date = new Date(dateInput)
    return isNaN(date.getTime())
      ? dateInput
      : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  }

  // Busiest day
  if (data.busiestDay) {
    const busyStat = formatStat(data.busiestDayCount)
    slides.push({
      id: "busiest-day",
      type: "stat",
      icon: Zap,
      stat: busyStat.value,
      statSize: busyStat.size,
      label: "Messages on Your Wildest Day",
      description: `${safeFormatDate(data.busiestDay)} was absolutely insane!`,
      funFact: data.busiestDayCount > 500 ? "Did you even sleep?" : null,
    })
  }

  // Calendar heatmap (single year only)
  const dailyCounts = data.dailyCounts ?? []
  if (!isAllTime && dailyCounts.length > 0) {
    slides.push({
      id: "calendar-heatmap",
      type: "heatmap",
      icon: Calendar,
      title: `Your ${yearLabel}, Day by Day`,
      year: numericYear,
      days: dailyCounts,
      description: `${data.daysActive} active days • longest streak ${data.longestStreak} day${data.longestStreak === 1 ? "" : "s"}`,
    })
  }

  // Month-by-month chart (single year only)
  const monthValues = Array.from({ length: 12 }, (_, month) => data.monthlyDistribution?.[String(month + 1)] ?? 0)
  if (!isAllTime && monthValues.some((value) => value > 0)) {
    slides.push({
      id: "monthly-chart",
      type: "chart",
      icon: BarChart3,
      title: `Your ${yearLabel}, Month by Month`,
      bars: monthValues.map((value, month) => ({ label: MONTH_SHORT[month], tip: MONTH_SHORT[month], value })),
      description: "Messages sent each month",
    })
  }

  // Most active month
  if (data.mostActiveMonth) {
    const parsedMonth = new Date(data.mostActiveMonth + "-01")
    const monthValid = !Number.isNaN(parsedMonth.getTime())
    const monthName = monthValid
      ? parsedMonth.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
      : data.mostActiveMonth
    const monthYear = monthValid ? parsedMonth.getUTCFullYear() : null
    const monthLabel = monthValid
      ? parsedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : data.mostActiveMonth
    slides.push({
      id: "most-active-month",
      type: "stat",
      icon: BarChart3,
      stat: monthName,
      statSize: "text-5xl md:text-7xl",
      label: "Your Month",
      description: isAllTime
        ? `${compactNumber(data.mostActiveMonthCount)} messages in ${monthLabel}`
        : `${compactNumber(data.mostActiveMonthCount)} messages in ${monthName} ${monthYear ?? numericYear}`,
    })
  }

  // Burst sequences
  if (data.burstSequences > 100) {
    const burstStat = formatStat(data.burstSequences)
    slides.push({
      id: "burst-mode",
      type: "stat",
      icon: Zap,
      stat: `${burstStat.value}`,
      statSize: burstStat.size,
      label: "Rapid Fire",
      description: "Back-to-back messages within 30 seconds",
      funFact: "Speed demon!",
    })
  }

  // Conversation starter
  if (data.conversationStarters > 50) {
    slides.push({
      id: "conversation-starter",
      type: "stat",
      icon: Sparkles,
      stat: data.conversationStarters.toLocaleString(),
      statSize: "text-6xl md:text-8xl",
      label: "Ice Breaker",
      description: "Times you started the conversation",
      funFact: "Social butterfly!",
    })
  }

  // Hype person
  const hypePercent = Math.round((data.hypePersonCount / data.totalMessages) * 100)
  if (hypePercent > 15) {
    slides.push({
      id: "hype-person",
      type: "stat",
      icon: Megaphone,
      stat: `${hypePercent}%!`,
      statSize: "text-7xl md:text-9xl",
      label: "Hype Energy",
      description: `${compactNumber(data.hypePersonCount)} messages with exclamation marks!`,
      funFact: "You bring the energy!",
    })
  }

  // Screaming
  const screamPercent = Math.round((data.screamingCount / data.totalMessages) * 100)
  if (screamPercent > 3) {
    slides.push({
      id: "screaming",
      type: "stat",
      icon: Megaphone,
      stat: `${screamPercent}%`,
      statSize: "text-7xl md:text-9xl",
      label: "ALL CAPS MODE",
      description: `${compactNumber(data.screamingCount)} MESSAGES LIKE THIS`,
      funFact: "WE HEAR YOU!",
    })
  }

  // Questions asked
  if (data.questionCount > 100) {
    const qStat = formatStat(data.questionCount)
    slides.push({
      id: "curious-mind",
      type: "stat",
      icon: MessageCircle,
      stat: `${qStat.value}?`,
      statSize: qStat.size,
      label: "Questions Asked",
      description: "Curiosity is your superpower",
    })
  }

  // Voice of reason
  if (data.voiceOfReasonCount > 50) {
    slides.push({
      id: "voice-of-reason",
      type: "stat",
      icon: Award,
      stat: data.voiceOfReasonCount.toLocaleString(),
      statSize: "text-6xl md:text-8xl",
      label: '"Actually..." Count',
      description: 'Times you said "actually" or "technically"',
      funFact: "The voice of reason!",
    })
  }

  // Links shared
  if (data.linksShared > 100) {
    const linkStat = formatStat(data.linksShared)
    slides.push({
      id: "link-sharer",
      type: "stat",
      icon: Link,
      stat: `${linkStat.value}`,
      statSize: linkStat.size,
      label: "Links Shared",
      description: "The internet curator",
    })
  }

  // Favourite sites
  const topDomains = data.topDomains ?? []
  if (topDomains.length > 2) {
    slides.push({
      id: "top-domains",
      type: "list",
      title: "Sites You Share Most",
      icon: Link,
      data: topDomains.slice(0, 5),
      description: `${topDomains[0].name} is your go-to source`,
    })
  }

  // Attachments
  const attachmentsCount = data.attachmentsCount ?? 0
  if (attachmentsCount > 20) {
    const fileStat = formatStat(attachmentsCount)
    slides.push({
      id: "attachments",
      type: "stat",
      icon: Sparkles,
      stat: fileStat.value,
      statSize: fileStat.size,
      label: "Files Shared",
      description: `Images, videos and files across ${compactNumber(data.messagesWithAttachments ?? 0)} messages`,
      funFact: attachmentsCount > 2000 ? "A walking camera roll!" : null,
    })
  }

  // GIFs
  const gifCount = data.gifCount ?? 0
  if (gifCount > 20) {
    const gifStat = formatStat(gifCount)
    slides.push({
      id: "gifs",
      type: "stat",
      icon: Zap,
      stat: gifStat.value,
      statSize: gifStat.size,
      label: "GIFs Sent",
      description: "Why type when a GIF says it better?",
    })
  }

  // Mentions
  if (data.mentionsGiven > 100) {
    const mentionStat = formatStat(data.mentionsGiven)
    slides.push({
      id: "mentions",
      type: "stat",
      icon: AtSign,
      stat: mentionStat.value,
      statSize: mentionStat.size,
      label: "@ Mentions",
      description: "You love bringing people in!",
    })
  }

  // Most pinged people
  const topMentions = data.topMentions ?? []
  if (topMentions.length > 1) {
    slides.push({
      id: "top-mentions",
      type: "list",
      title: "Who You Ping Most",
      icon: AtSign,
      data: topMentions.slice(0, 5),
      description: `${topMentions[0].name} can't escape your pings`,
    })
  }

  // Top emojis
  if (data.topEmojis.length > 0) {
    slides.push({
      id: "top-emojis",
      type: "list",
      title: "Your Favorite Emotes",
      icon: Smile,
      data: data.topEmojis.slice(0, 5),
      description: `:${data.topEmojis[0].name}: is your signature`,
    })
  }

  // Top standard emojis
  const topUnicodeEmojis = data.topUnicodeEmojis ?? []
  if (topUnicodeEmojis.length > 0) {
    slides.push({
      id: "top-unicode-emojis",
      type: "list",
      title: "Your Favorite Emojis",
      icon: Smile,
      data: topUnicodeEmojis.slice(0, 5),
      description: `${compactNumber(data.totalEmojis)} emojis and emotes sent in total`,
    })
  }

  // Emoji only messages
  if (data.emojiOnlyCount > 50) {
    slides.push({
      id: "emoji-only",
      type: "stat",
      icon: Smile,
      stat: data.emojiOnlyCount.toLocaleString(),
      statSize: "text-6xl md:text-8xl",
      label: "Pure Emoji Messages",
      description: "Sometimes emojis say it all",
    })
  }

  // Top words
  if (data.topWords.length > 0) {
    slides.push({
      id: "top-words",
      type: "list",
      title: "Your Vocabulary",
      icon: MessageSquare,
      data: data.topWords.slice(0, 5),
      description: `"${data.topWords[0].word}" is your catchphrase`,
    })
  }

  // Sentiment
  const totalSentiment = data.sentimentPositive + data.sentimentNegative
  if (totalSentiment > 0) {
    const positivePercent = Math.round((data.sentimentPositive / totalSentiment) * 100)
    slides.push({
      id: "sentiment",
      type: "progress",
      icon: Heart,
      stat: `${positivePercent}%`,
      statSize: "text-7xl md:text-9xl",
      label: "Positive Vibes",
      progress: positivePercent,
      description: `${compactNumber(data.sentimentPositive)} positive vs ${compactNumber(data.sentimentNegative)} negative`,
      funFact: positivePercent > 70 ? "You spread good energy!" : null,
    })
  }

  // Longest message
  if (data.longestMessageLength > 500) {
    const longStat = formatStat(data.longestMessageLength)
    slides.push({
      id: "longest-message",
      type: "stat",
      icon: MessageSquare,
      stat: longStat.value,
      statSize: longStat.size,
      label: "Longest Message",
      description: "Characters in your longest message",
      funFact: data.longestMessageLength > 2000 ? "That's an essay!" : null,
    })
  }

  // Ghosting days
  if (data.ghostingDays > 10) {
    slides.push({
      id: "ghosting",
      type: "stat",
      icon: Ghost,
      stat: `${data.ghostingDays}`,
      statSize: "text-6xl md:text-8xl",
      label: "Days Offline",
      description: "Taking breaks is healthy!",
    })
  }

  // Summary card - Spotify style
  const totalSentimentCalc = data.sentimentPositive + data.sentimentNegative
  const positivePercentCalc = totalSentimentCalc > 0 ? Math.round((data.sentimentPositive / totalSentimentCalc) * 100) : 50

  // Format busiest day nicely
  const formatBusiestDay = (dateStr: string | null) => {
    if (!dateStr) return null
    if (/^\d+$/.test(dateStr)) {
      const date = new Date(parseInt(dateStr))
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  }

  slides.push({
    id: "summary",
    type: "summary",
    title: isAllTime ? "Your All-Time Wrapped" : `Your ${yearLabel} Wrapped`,
    stats: {
      messages: data.totalMessages,
      words: data.totalWords,
      daysActive: data.daysActive,
      topChannel: data.topChannels[0]?.name || "Unknown",
      topEmoji: data.topEmojis[0]?.name || null,
      topEmojiId: data.topEmojis[0]?.id || null,
      topEmojiAnimated: data.topEmojis[0]?.isAnimated || false,
      topWord: data.topWords[0]?.word || null,
      peakHour: data.peakHour,
      longestStreak: data.longestStreak,
      positiveVibes: positivePercentCalc,
      busiestDay: formatBusiestDay(data.busiestDay),
      busiestDayCount: data.busiestDayCount,
    }
  })

  // Final outro
  slides.push({
    id: "outro",
    type: "outro",
    title: "That's a Wrap!",
    subtitle: yearLabel,
    description: isAllTime ? "Thanks for being part of Discord through it all." : "Thanks for being part of Discord this year",
    funFact: isAllTime ? "Your story keeps growing. 🎉" : `See you in ${numericYear + 1}! 🎉`,
  })

  return slides
}


export function WrappedSlides({ data }: { data: DiscordData }) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [direction, setDirection] = useState(0)
  const slides = useMemo(() => createSlides(data), [data])
  const slideCountRef = useRef(slides.length)
  const currentSlideRef = useRef(currentSlide)

  useEffect(() => {
    slideCountRef.current = slides.length
  }, [slides.length])

  useEffect(() => {
    currentSlideRef.current = currentSlide
  }, [currentSlide])

  // Keyboard navigation with stable listener to avoid re-subscribing on each slide change
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const total = slideCountRef.current
      const active = currentSlideRef.current

      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        if (active < total - 1) {
          setDirection(1)
          setCurrentSlide(prev => prev + 1)
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (active > 0) {
          setDirection(-1)
          setCurrentSlide(prev => prev - 1)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setDirection(1)
      setCurrentSlide(prev => prev + 1)
    }
  }

  const prevSlide = () => {
    if (currentSlide > 0) {
      setDirection(-1)
      setCurrentSlide(prev => prev - 1)
    }
  }

  const slide = slides[currentSlide]

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.9,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0,
      scale: 0.9,
    }),
  }

  // Random gradient colors for variety
  const gradients = [
    "from-red-600/20 via-red-900/10 to-black",
    "from-orange-600/20 via-red-900/10 to-black",
    "from-pink-600/20 via-red-900/10 to-black",
    "from-rose-600/20 via-red-900/10 to-black",
  ]
  const gradient = gradients[currentSlide % gradients.length]

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      {/* Animated background */}
      <motion.div
        key={currentSlide}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`absolute inset-0 bg-gradient-to-br ${gradient}`}
      />

      {/* Floating orbs - Reduced blur for performance */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-red-600/10 rounded-full blur-2xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-red-800/10 rounded-full blur-2xl animate-pulse" />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentSlide}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
              scale: { duration: 0.3 },
            }}
            className="w-full max-w-3xl"
          >
            {/* Intro/Outro slides */}
            {(slide.type === "intro" || slide.type === "outro") && (
              <div className="text-center space-y-8 px-4">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.6, type: "spring" }}
                >
                  <h1 className="text-6xl md:text-8xl font-black text-white mb-4 tracking-tight">
                    {slide.title}
                  </h1>
                  <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-5xl md:text-7xl font-black bg-gradient-to-r from-red-400 via-red-500 to-orange-500 bg-clip-text text-transparent"
                  >
                    {slide.subtitle}
                  </motion.h2>
                </motion.div>
                <motion.p
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-xl md:text-2xl text-gray-300"
                >
                  {slide.description}
                </motion.p>
                {slide.funFact && (
                  <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    className="text-lg text-red-400"
                  >
                    {slide.funFact}
                  </motion.p>
                )}
              </div>
            )}

            {/* List slides (top channels, emojis, words) */}
            {slide.type === "list" && (
              <Card className="bg-zinc-900/80 border-red-900/30 p-6 md:p-10 backdrop-blur-md">
                <div className="space-y-6">
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="flex items-center gap-4"
                  >
                    {slide.icon && <slide.icon className="w-10 h-10 text-red-500" />}
                    <h2 className="text-3xl md:text-4xl font-bold text-white">{slide.title}</h2>
                  </motion.div>
                  <div className="space-y-3">
                    {slide.data?.map((item: any, index: number) => {
                      // Check if this is an emoji item (has id property)
                      const isEmojiItem = 'id' in item && 'name' in item && !('word' in item)

                      return (
                        <motion.div
                          key={index}
                          initial={{ x: -30, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: index * 0.1 + 0.2 }}
                          className="flex items-center justify-between p-4 rounded-xl bg-black/40 border border-red-900/20 hover:border-red-500/40 transition-colors"
                        >
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <span className="text-2xl font-black text-red-500 w-8">#{index + 1}</span>
                            {isEmojiItem && item.id ? (
                              <div className="flex items-center gap-3">
                                <DiscordEmoji
                                  name={item.name}
                                  id={item.id}
                                  isAnimated={item.isAnimated}
                                  size={32}
                                />
                                <span className="text-lg font-medium text-gray-400">:{item.name}:</span>
                              </div>
                            ) : (
                              <span className="text-xl font-medium text-white leading-tight break-words whitespace-normal">
                                {item.name || item.word}
                              </span>
                            )}
                          </div>
                          <span className="text-lg font-bold text-red-400 whitespace-nowrap">{compactNumber(item.count)}</span>
                        </motion.div>
                      )
                    })}
                  </div>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="text-base text-gray-400 text-center pt-2"
                  >
                    {slide.description}
                  </motion.p>
                </div>
              </Card>
            )}

            {/* Chart slides (bar charts and the calendar heatmap) */}
            {(slide.type === "chart" || slide.type === "heatmap") && (
              <Card className="bg-zinc-900/80 border-red-900/30 p-6 md:p-10 backdrop-blur-md">
                <div className="space-y-6">
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="flex items-center gap-4"
                  >
                    {slide.icon && <slide.icon className="w-10 h-10 text-red-500" />}
                    <h2 className="text-3xl md:text-4xl font-bold text-white">{slide.title}</h2>
                  </motion.div>
                  {slide.type === "chart" ? (
                    <BarChart bars={slide.bars} />
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2, duration: 0.6 }}
                    >
                      <YearHeatmap year={slide.year} days={slide.days} />
                    </motion.div>
                  )}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-base text-gray-400 text-center pt-2"
                  >
                    {slide.description}
                  </motion.p>
                </div>
              </Card>
            )}

            {/* Stat slides */}
            {(slide.type === "stat" || slide.type === "progress") && (
              <Card className="bg-zinc-900/80 border-red-900/30 p-8 md:p-12 backdrop-blur-md">
                <div className="text-center space-y-6">
                  {slide.icon && (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", duration: 0.6 }}
                      className="flex justify-center"
                    >
                      <slide.icon className="w-16 h-16 text-red-500" />
                    </motion.div>
                  )}
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
                  >
                    <h2 className={`${slide.statSize || "text-7xl md:text-9xl"} font-black bg-gradient-to-br from-red-400 via-red-500 to-orange-500 bg-clip-text text-transparent mb-3 leading-tight`}>
                      {slide.stat}
                    </h2>
                    <p className="text-2xl md:text-3xl font-bold text-white">{slide.label}</p>
                  </motion.div>

                  {/* Progress bar for progress type */}
                  {slide.type === "progress" && slide.progress !== undefined && (
                    <motion.div
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ delay: 0.4, duration: 0.5 }}
                      className="w-full max-w-md mx-auto"
                    >
                      <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${slide.progress}%` }}
                          transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full"
                        />
                      </div>
                      {slide.subtext && (
                        <p className="text-sm text-gray-500 mt-2">{slide.subtext}</p>
                      )}
                    </motion.div>
                  )}

                  <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-lg md:text-xl text-gray-300"
                  >
                    {slide.description}
                  </motion.p>

                  {slide.funFact && (
                    <motion.p
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-base text-red-400 font-medium"
                    >
                      {slide.funFact}
                    </motion.p>
                  )}
                </div>
              </Card>
            )}

            {/* Summary slide - Spotify style recap */}
            {slide.type === "summary" && (
              <Card className="bg-zinc-900/80 border-red-900/30 p-6 md:p-8 backdrop-blur-md">
                <div className="space-y-6">
                  <motion.h2
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-3xl md:text-4xl font-black text-center bg-gradient-to-r from-red-400 via-red-500 to-orange-500 bg-clip-text text-transparent"
                  >
                    {slide.title}
                  </motion.h2>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    {/* Messages */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="bg-black/40 rounded-xl p-4 border border-red-900/20 text-center"
                    >
                      <p className="text-2xl md:text-3xl font-black text-red-400">{compactNumber(slide.stats.messages)}</p>
                      <p className="text-xs md:text-sm text-gray-400">Messages</p>
                    </motion.div>

                    {/* Words */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className="bg-black/40 rounded-xl p-4 border border-red-900/20 text-center"
                    >
                      <p className="text-2xl md:text-3xl font-black text-orange-400">{compactNumber(slide.stats.words)}</p>
                      <p className="text-xs md:text-sm text-gray-400">Words</p>
                    </motion.div>

                    {/* Days Active */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="bg-black/40 rounded-xl p-4 border border-red-900/20 text-center"
                    >
                      <p className="text-2xl md:text-3xl font-black text-pink-400">{slide.stats.daysActive}</p>
                      <p className="text-xs md:text-sm text-gray-400">Days Active</p>
                    </motion.div>

                    {/* Longest Streak */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.25 }}
                      className="bg-black/40 rounded-xl p-4 border border-red-900/20 text-center"
                    >
                      <p className="text-2xl md:text-3xl font-black text-yellow-400">{slide.stats.longestStreak}</p>
                      <p className="text-xs md:text-sm text-gray-400">Day Streak</p>
                    </motion.div>

                    {/* Peak Hour */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="bg-black/40 rounded-xl p-4 border border-red-900/20 text-center"
                    >
                      <p className="text-2xl md:text-3xl font-black text-blue-400">
                        {slide.stats.peakHour >= 12 ? `${slide.stats.peakHour === 12 ? 12 : slide.stats.peakHour - 12}PM` : `${slide.stats.peakHour === 0 ? 12 : slide.stats.peakHour}AM`}
                      </p>
                      <p className="text-xs md:text-sm text-gray-400">Peak Hour</p>
                    </motion.div>

                    {/* Positive Vibes */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.35 }}
                      className="bg-black/40 rounded-xl p-4 border border-red-900/20 text-center"
                    >
                      <p className="text-2xl md:text-3xl font-black text-green-400">{slide.stats.positiveVibes}%</p>
                      <p className="text-xs md:text-sm text-gray-400">Positive</p>
                    </motion.div>
                  </div>

                  {/* Highlights row */}
                  <div className="space-y-3">
                    {/* Top Channel */}
                    <motion.div
                      initial={{ x: -30, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="bg-black/40 rounded-xl p-4 border border-red-900/20 flex flex-col gap-1"
                    >
                      <span className="text-gray-400 text-xs">Favorite Channel</span>
                      <span className="text-white font-bold text-sm break-words">#{slide.stats.topChannel}</span>
                    </motion.div>

                    {/* Top Emoji */}
                    {slide.stats.topEmoji && (
                      <motion.div
                        initial={{ x: -30, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.45 }}
                        className="bg-black/40 rounded-xl p-4 border border-red-900/20 flex flex-col gap-1"
                      >
                        <span className="text-gray-400 text-xs">Signature Emote</span>
                        <div className="flex items-center gap-2">
                          {slide.stats.topEmojiId ? (
                            <DiscordEmoji
                              name={slide.stats.topEmoji}
                              id={slide.stats.topEmojiId}
                              isAnimated={slide.stats.topEmojiAnimated}
                              size={24}
                            />
                          ) : null}
                          <span className="text-white font-bold text-sm">:{slide.stats.topEmoji}:</span>
                        </div>
                      </motion.div>
                    )}

                    {/* Top Word */}
                    {slide.stats.topWord && (
                      <motion.div
                        initial={{ x: -30, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="bg-black/40 rounded-xl p-4 border border-red-900/20 flex flex-col gap-1"
                      >
                        <span className="text-gray-400 text-xs">Catchphrase</span>
                        <span className="text-white font-bold text-sm">"{slide.stats.topWord}"</span>
                      </motion.div>
                    )}

                    {/* Busiest Day */}
                    {slide.stats.busiestDay && (
                      <motion.div
                        initial={{ x: -30, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.55 }}
                        className="bg-black/40 rounded-xl p-4 border border-red-900/20 flex flex-col gap-1"
                      >
                        <span className="text-gray-400 text-xs">Wildest Day</span>
                        <span className="text-white font-bold text-sm">{slide.stats.busiestDay} • {compactNumber(slide.stats.busiestDayCount)} msgs</span>
                      </motion.div>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="fixed bottom-6 left-0 right-0 z-20">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center justify-between bg-zinc-900/60 backdrop-blur-md rounded-full p-2 border border-red-900/20">
            <Button
              onClick={prevSlide}
              variant="ghost"
              size="sm"
              disabled={currentSlide === 0}
              className="text-white hover:bg-red-900/30 disabled:opacity-20 rounded-full"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <div className="flex gap-1.5 items-center">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setDirection(index > currentSlide ? 1 : -1)
                    setCurrentSlide(index)
                  }}
                  className={`rounded-full transition-all duration-300 ${index === currentSlide
                    ? "w-6 h-2 bg-red-500"
                    : "w-2 h-2 bg-gray-600 hover:bg-gray-500"
                    }`}
                />
              ))}
            </div>

            <Button
              onClick={nextSlide}
              disabled={currentSlide === slides.length - 1}
              size="sm"
              className="bg-red-600 hover:bg-red-500 text-white disabled:opacity-20 rounded-full"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Slide counter */}
          <p className="text-center text-xs text-gray-500 mt-2">
            {currentSlide + 1} / {slides.length} • Use arrow keys to navigate
          </p>
        </div>
      </div>
    </div>
  )
}
