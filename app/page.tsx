"use client"
import { WrappedSlides } from "@/components/wrapped-slides"
import { UploadScreen } from "@/components/upload-screen"
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
  const [mode, setMode] = useState<'checking' | 'upload' | 'loading' | 'ready' | 'error'>('checking')
  const [error, setError] = useState<string | null>(null)

  // Check if server has pre-loaded data (for local development)
  useEffect(() => {
    async function checkServerData() {
      try {
        const response = await fetch('/api/wrapped')
        const result = await response.json()
        
        if (result.success && result.data) {
          setData(result.data)
          setMode('ready')
        } else {
          // No server data, show upload screen
          setMode('upload')
        }
      } catch (err) {
        // API not available or failed, show upload screen
        setMode('upload')
      }
    }

    checkServerData()
  }, [])

  // Handle data from client-side upload
  const handleDataReady = (stats: DiscordData) => {
    setData(stats)
    setMode('ready')
  }

  // Checking for server data
  if (mode === 'checking') {
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
            <h1 className="text-4xl font-black text-white">Discord Wrapped</h1>
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show upload screen for client-side processing
  if (mode === 'upload') {
    return <UploadScreen onDataReady={handleDataReady} />
  }

  // Show wrapped slides when data is ready
  if (mode === 'ready' && data) {
    return <WrappedSlides data={data} />
  }

  // Error state
  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      <div className="absolute inset-0 bg-gradient-to-br from-black via-red-950/20 to-black" />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-2xl">
          <h1 className="text-5xl font-black text-white">Something went wrong</h1>
          <p className="text-xl text-gray-400">{error || "Unknown error"}</p>
          <button 
            onClick={() => setMode('upload')}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  )
}
