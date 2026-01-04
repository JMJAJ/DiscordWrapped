"use client"
import { WrappedSlides } from "@/components/wrapped-slides"
import { useEffect, useState } from "react"

interface DiscordData {
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
  topEmojis: Array<{ name: string; id: string; count: number }>
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
}

export default function DiscordWrapped() {
  const [data, setData] = useState<DiscordData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/api/wrapped')
        const result = await response.json()
        
        if (result.success) {
          setData(result.data)
        } else {
          setError(result.error)
        }
      } catch (err: any) {
        console.error("[v0] Failed to load Discord data:", err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-black">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-red-950/20 to-black" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-10 w-72 h-72 bg-red-600/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-red-800/10 rounded-full blur-3xl animate-pulse" />
        </div>
        <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
          <div className="text-center space-y-6">
            <div className="relative">
              <div className="animate-spin rounded-full h-20 w-20 border-4 border-red-900 border-t-red-500 mx-auto"></div>
            </div>
            <h1 className="text-4xl font-black text-white">Loading your 2025 Wrapped...</h1>
            <p className="text-gray-400">Crunching the numbers</p>
            <div className="flex justify-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-black">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-red-950/20 to-black" />
        <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
          <div className="text-center space-y-4 max-w-2xl">
            <h1 className="text-5xl font-black text-white">Unable to load Discord data</h1>
            <p className="text-xl text-gray-400">
              Make sure your Discord data is in the <code className="text-red-500">Messages/</code> directory
            </p>
            <p className="text-sm text-gray-500">Error: {error || "Unknown error"}</p>
          </div>
        </div>
      </div>
    )
  }

  return <WrappedSlides data={data} />
}
