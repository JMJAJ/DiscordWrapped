"use client"

import { useMemo } from "react"
import { Card } from "@/components/ui/card"

interface YearSelectorProps {
  years: number[]
  selectedYear: number | 'all' | null
  onSelect: (year: number | 'all') => void
  onContinue: () => void
  onReupload?: () => void
}

export function YearSelector({ years, selectedYear, onSelect, onContinue, onReupload }: YearSelectorProps) {
  const options = useMemo(() => {
    const unique = Array.from(new Set(years)).filter((year) => Number.isFinite(year))
    if (unique.length === 0) {
      unique.push(new Date().getFullYear())
    }
    return unique.sort((a, b) => b - a)
  }, [years])

  const handleContinue = () => {
    if (selectedYear === null) return
    onContinue()
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      <div className="absolute inset-0 bg-gradient-to-br from-black via-red-950/30 to-black" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-24 left-16 w-60 h-60 bg-red-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-24 right-16 w-72 h-72 bg-red-800/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-3xl space-y-10">
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-black text-white">Pick Your Wrapped Year</h1>
            <p className="text-sm md:text-base text-gray-400">
              We detected these years in your Discord export. Choose one to generate a personalized recap.
            </p>
          </div>

          <Card className="bg-zinc-900/70 border-zinc-800 p-6 space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-red-400">Available Years</p>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-zinc-800/60 bg-black/30 p-3">
              <div className="flex flex-wrap gap-2">
                {options.map((year) => {
                  const isActive = year === selectedYear
                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => onSelect(year)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition
                        ${isActive
                          ? 'bg-red-600 text-white shadow-[0_0_25px_rgba(239,68,68,0.45)]'
                          : 'bg-zinc-900/70 text-gray-200 hover:bg-red-900/30 hover:text-white'}
                      `}
                    >
                      {year}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => onSelect('all')}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition
                    ${selectedYear === 'all'
                      ? 'bg-red-600 text-white shadow-[0_0_25px_rgba(239,68,68,0.45)]'
                      : 'bg-zinc-900/70 text-gray-200 hover:bg-red-900/30 hover:text-white'}
                  `}
                >
                  All Time
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              For long histories, scroll to pick older years or jump straight into All Time. You can always come back to try another range.
            </p>
          </Card>

          <Card className="bg-zinc-900/60 border-zinc-800 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Ready to view your Wrapped?</h2>
                <p className="text-sm text-gray-400">
                  Generate the selected year now, or re-upload a different export any time.
                </p>
              </div>
              <button
                type="button"
                onClick={handleContinue}
                disabled={selectedYear === null}
                className={`rounded-full px-6 py-2 text-sm font-medium transition
                  ${selectedYear === null
                    ? 'cursor-not-allowed border border-zinc-700 text-gray-500'
                    : 'border border-red-500/70 bg-red-600/80 text-white hover:bg-red-500'}
                `}
              >
                Continue
              </button>
            </div>
            {onReupload && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={onReupload}
                  className="text-xs font-medium text-gray-400 underline-offset-4 hover:text-red-400 hover:underline transition"
                >
                  Upload a different ZIP
                </button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
