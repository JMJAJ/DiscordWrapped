"use client"
import { WrappedSlides } from "@/components/wrapped-slides"
import { UploadScreen } from "@/components/upload-screen"
import { YearSelector } from "@/components/year-selector"
import { useEffect, useState } from "react"
import { processAndAnalyze } from "@/lib/client-db"

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
  year?: number
  availableYears?: number[]
}

export default function DiscordWrapped() {
  const [data, setData] = useState<DiscordData | null>(null)
  const [mode, setMode] = useState<'checking' | 'upload' | 'select-year' | 'loading' | 'ready' | 'error'>('checking')
  const [error, setError] = useState<string | null>(null)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [loadingProgress, setLoadingProgress] = useState<{ stage: string; percent: number }>({ stage: '', percent: 0 })

  const deriveAvailableYears = (stats: DiscordData) => {
    const candidates: number[] = []
    if (Array.isArray(stats.availableYears)) {
      for (const year of stats.availableYears) {
        if (Number.isFinite(year)) candidates.push(Number(year))
      }
    }
    if (typeof stats.year === 'number' && Number.isFinite(stats.year)) {
      candidates.push(stats.year)
    }
    if (candidates.length === 0) return []
    return Array.from(new Set(candidates)).sort((a, b) => b - a)
  }

  // Check if server has pre-loaded data (for local development)
  useEffect(() => {
    async function checkServerData() {
      try {
        const response = await fetch('/api/wrapped')
        const result = await response.json()
        
        if (result.success && result.data) {
          setData(result.data)
          if (typeof result.data.year === 'number') {
            setSelectedYear(result.data.year)
          }
          const derived = deriveAvailableYears(result.data)
          if (derived.length) {
            setAvailableYears(derived)
            if (!result.data.year) {
              setSelectedYear(derived[0])
            }
          }
          setMode('ready')
        } else {
          // No server data, prompt for upload
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
  const handleDataReady = (stats: DiscordData, file: File) => {
    setUploadedFile(file)
    const years = deriveAvailableYears(stats)
    setAvailableYears(years)
    const defaultYear = stats.year ?? years[0] ?? null
    setSelectedYear(defaultYear)
    setData(stats)
    setMode('select-year')
  }

  const handleYearContinue = () => {
    if (selectedYear === null) return
    if (data && data.year === selectedYear) {
      setMode('ready')
      return
    }
    if (!uploadedFile) {
      setError('Please upload your Discord export to generate Wrapped insights.')
      setMode('error')
      return
    }

    setMode('loading')
    setLoadingProgress({ stage: 'Preparing analysis...', percent: 5 })

    processAndAnalyze(uploadedFile, (stage, percent) => {
      setLoadingProgress({ stage, percent })
    }, { year: selectedYear })
      .then((stats) => {
        setData(stats)
        const years = deriveAvailableYears(stats)
        if (years.length) {
          setAvailableYears(years)
        }
        setSelectedYear(stats.year ?? selectedYear)
        setLoadingProgress({ stage: '', percent: 0 })
        setMode('ready')
      })
      .catch((err: any) => {
        console.error(err)
        setError(err?.message || 'Failed to generate Wrapped for that year.')
        setMode('error')
      })
  }

  const handleYearSelect = (year: number) => {
    setSelectedYear(year)
  }

  const handleReupload = () => {
    setUploadedFile(null)
    setData(null)
    setAvailableYears([])
    setSelectedYear(null)
    setLoadingProgress({ stage: '', percent: 0 })
    setMode('upload')
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

  if (mode === 'select-year') {
    return (
      <YearSelector
        years={availableYears}
        selectedYear={selectedYear}
        onSelect={handleYearSelect}
        onContinue={handleYearContinue}
        onReupload={handleReupload}
      />
    )
  }

  // Show upload screen for client-side processing
  if (mode === 'upload') {
    return (
      <UploadScreen
        onDataReady={handleDataReady}
      />
    )
  }

  if (mode === 'loading') {
    return (
      <div className="relative min-h-screen overflow-hidden bg-black">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-red-950/20 to-black" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-24 left-16 w-72 h-72 bg-red-600/15 rounded-full blur-3xl" />
          <div className="absolute bottom-24 right-16 w-96 h-96 bg-red-800/15 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
          <div className="text-center space-y-6">
            <div className="relative">
              <div className="animate-spin rounded-full h-20 w-20 border-4 border-red-900 border-t-red-500 mx-auto"></div>
            </div>
            <h1 className="text-4xl font-black text-white">Generating Wrapped...</h1>
            <div className="mx-auto w-64">
              <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-red-600 transition-all"
                  style={{ width: `${Math.max(5, loadingProgress.percent)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-gray-400">{loadingProgress.stage}</p>
            </div>
          </div>
        </div>
      </div>
    )
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
            onClick={handleReupload}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  )
}
