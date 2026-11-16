"use client"

import { useState } from "react"
import { ArrowRight, Check, CreditCard, Gamepad2, MessageSquare, Mic, type LucideIcon } from "lucide-react"
import type { ArchiveScan, ImportSources } from "@/lib/client-db"

interface SourceSelectorProps {
  scan: ArchiveScan
  initial: ImportSources
  onContinue: (sources: ImportSources) => void
  onReupload: () => void
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`

interface SourceCard {
  key: "messages" | keyof ImportSources
  icon: LucideIcon
  title: string
  tag: string
  tagTone?: "warn"
  found: string
  blurb: string
  unlocks: string[]
  available: boolean
  locked?: boolean
}

export function SourceSelector({ scan, initial, onContinue, onReupload }: SourceSelectorProps) {
  const hasActivity = scan.activity.files > 0
  const hasGames = scan.games.count > 0
  const hasMoney = scan.money.payments + scan.money.orbMoves + scan.money.quests > 0

  const [sources, setSources] = useState<ImportSources>({
    activity: initial.activity && hasActivity,
    games: initial.games && hasGames,
    money: initial.money && hasMoney,
  })

  // Reading the activity logs is the slow part: roughly 30 s per zipped GB on a desktop
  const activitySeconds = Math.max(2, Math.round((scan.activity.zippedBytes / 1e9) * 30))
  const readsActivityLog = hasActivity && (sources.activity || sources.games)
  const seconds = Math.round(8 + scan.messages.bytes / 6e6) + (readsActivityLog ? activitySeconds : 0)

  const cards: SourceCard[] = [
    {
      key: "messages",
      icon: MessageSquare,
      title: "Messages",
      tag: "Always on",
      found: `${plural(scan.messages.channels, "channel")} · ${formatBytes(scan.messages.bytes)}`,
      blurb: "The core of your Wrapped: everything you typed, where and when.",
      unlocks: ["Totals and streaks", "Hour, week and month charts", "Top servers and DMs", "Words and emojis", "Links, files and GIFs"],
      available: true,
      locked: true,
    },
    {
      key: "activity",
      icon: Mic,
      title: "Voice and activity",
      tag: hasActivity ? `Adds about ${activitySeconds} s` : "Not in this export",
      found: hasActivity
        ? `${plural(scan.activity.files, "log file")} · ${formatBytes(scan.activity.zippedBytes)} zipped`
        : "No activity logs found",
      blurb: "What you did besides typing. Large, so it is read as a stream.",
      unlocks: ["Voice hours", "Voice hangouts", "Streams watched", "Reactions", "Edits and deletions", "Slash commands", "App opens"],
      available: hasActivity,
    },
    {
      key: "games",
      icon: Gamepad2,
      title: "Games",
      tag: hasGames ? "All-time totals" : "Not in this export",
      found: hasGames ? `${plural(scan.games.count, "game")} with play time` : "No play time found",
      blurb: hasActivity
        ? "Play time as Discord saw it. One total per game, not per year. Game names come from the activity logs, so those still get read."
        : "Play time as Discord saw it. One total per game, not per year.",
      unlocks: ["Most played games", "Total hours"],
      available: hasGames,
    },
    {
      key: "money",
      icon: CreditCard,
      title: "Purchases, Orbs and Quests",
      tag: hasMoney ? "Shows money" : "Not in this export",
      tagTone: hasMoney ? "warn" : undefined,
      found: hasMoney
        ? `${plural(scan.money.payments, "payment")} · ${plural(scan.money.orbMoves, "Orb move")} · ${plural(scan.money.quests, "quest")}`
        : "No billing data found",
      blurb: "Off by default: these slides put amounts on screen, so think twice before screen sharing.",
      unlocks: ["Money spent", "What you bought", "Orbs earned and spent", "Quests completed"],
      available: hasMoney,
    },
  ]

  const isOn = (card: SourceCard) => card.key === "messages" || (card.available && sources[card.key])
  const selectedCount = cards.filter(isOn).length

  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 h-72 w-72 rounded-full bg-red-600/10 blur-3xl" />
        <div className="absolute bottom-20 right-10 h-96 w-96 rounded-full bg-red-800/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:px-6">
        <ol className="flex flex-wrap items-center gap-3 font-mono text-[13px]">
          <li className="flex items-center gap-2 text-zinc-400">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800">
              <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" strokeWidth={3} />
            </span>
            Upload
          </li>
          <li aria-hidden="true" className="h-px w-8 bg-zinc-700" />
          <li className="flex items-center gap-2 font-bold text-white" aria-current="step">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs">2</span>
            Choose
          </li>
          <li aria-hidden="true" className="h-px w-8 bg-zinc-700" />
          <li className="flex items-center gap-2 text-zinc-400">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-600 text-xs">3</span>
            Pick a year
          </li>
        </ol>

        <header className="space-y-3">
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight md:text-5xl">What do you want to see?</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-zinc-400">
            We looked inside <span className="font-mono text-base text-white">{scan.fileName}</span>. Pick what goes
            into your Wrapped. Nothing leaves this browser.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => {
            const on = isOn(card)
            const disabled = card.locked || !card.available
            const Icon = card.icon
            return (
              <label
                key={card.key}
                className={`flex flex-col gap-4 rounded-2xl border-2 p-6 transition-colors ${on
                  ? "border-red-600 bg-red-950/30"
                  : "border-zinc-700 bg-zinc-950"} ${disabled ? "cursor-default" : "cursor-pointer hover:border-red-500"} ${card.available ? "" : "opacity-60"}`}
              >
                <div className="flex items-start gap-4">
                  <span
                    className={`flex h-12 w-12 flex-none items-center justify-center rounded-xl ${on ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xl font-bold">{card.title}</span>
                      <span
                        className={`rounded-md px-2 py-1 font-mono text-xs leading-none ${card.tagTone === "warn"
                          ? "bg-orange-950 text-orange-300"
                          : "bg-zinc-800 text-zinc-300"}`}
                      >
                        {card.tag}
                      </span>
                    </div>
                    <p className="font-mono text-[13px] text-zinc-400">{card.found}</p>
                  </div>
                  <input
                    type="checkbox"
                    className="mt-1 h-6 w-6 flex-none accent-red-600"
                    checked={on}
                    disabled={disabled}
                    onChange={() => {
                      if (card.key === "messages") return
                      const key = card.key
                      setSources((previous) => ({ ...previous, [key]: !previous[key] }))
                    }}
                  />
                </div>
                <p className="text-[15px] leading-relaxed text-zinc-300">{card.blurb}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {card.unlocks.map((unlock) => (
                    <li key={unlock} className="rounded-full bg-zinc-800 px-2.5 py-1.5 text-[13px] leading-none text-zinc-200">
                      {unlock}
                    </li>
                  ))}
                </ul>
              </label>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-700 bg-zinc-900 px-6 py-5">
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-lg font-bold" aria-live="polite">
              {selectedCount} of {cards.length} selected · about {seconds} seconds
            </p>
            <p className="text-sm text-zinc-400">You can come back and change this without uploading again.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onReupload}
              className="min-h-12 rounded-full border border-zinc-600 px-5 text-[15px] font-medium text-zinc-200 transition hover:bg-zinc-800"
            >
              Upload a different ZIP
            </button>
            <button
              type="button"
              onClick={() => onContinue(sources)}
              className="flex min-h-12 items-center gap-2 rounded-full bg-red-600 px-7 text-[15px] font-bold text-white transition hover:bg-red-500"
            >
              Import and continue
              <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
