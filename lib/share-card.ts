// Draws the shareable summary image on a canvas. Everything is drawn by hand
// (no DOM screenshot), so the result is identical on every device and nothing
// external has to load: no avatars, no CDN emotes, only text and shapes.

export interface ShareCardData {
  year?: number | "all" | null
  totalMessages: number
  totalWords: number
  daysActive: number
  longestStreak: number
  peakHour: number
  totalEmojis: number
  sentimentPositive: number
  sentimentNegative: number
  busiestDay: string | null
  busiestDayCount: number
  topWords: Array<{ word: string; count: number }>
  topServers?: Array<{ name: string; count: number }>
  topUnicodeEmojis?: Array<{ name: string; count: number }>
  topGames?: Array<{ name: string; seconds: number }>
  serverCount?: number
  voiceSeconds?: number
}

export interface ShareCardOptions {
  // Leave server names off the image
  hideNames?: boolean
}

export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1350

const PADDING = 72
const INNER = SHARE_CARD_WIDTH - PADDING * 2

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}K`
  return Math.round(value).toLocaleString("en-US")
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM"
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return "12 PM"
  return `${hour - 12} PM`
}

function formatDay(day: string): string {
  const date = new Date(day)
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

// The app's fonts come from next/font, which exposes them as CSS variables
function fontFamilies(): { mono: string; sans: string } {
  const read = (name: string, fallback: string) => {
    try {
      const value = getComputedStyle(document.body).getPropertyValue(name).trim()
      return value ? `${value}, ${fallback}` : fallback
    } catch {
      return fallback
    }
  }
  return {
    mono: read("--font-geist-mono", "ui-monospace, Menlo, Consolas, monospace"),
    sans: read("--font-geist-sans", "system-ui, -apple-system, Segoe UI, sans-serif"),
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Largest font size (between min and max) at which the text fits the width
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  font: (size: number) => string
): number {
  let size = maxSize
  while (size > minSize) {
    ctx.font = font(size)
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 2
  }
  ctx.font = font(size)
  return size
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let trimmed = text
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return `${trimmed.trimEnd()}…`
}

export async function renderShareCard(data: ShareCardData, options: ShareCardOptions = {}): Promise<HTMLCanvasElement> {
  const { mono, sans } = fontFamilies()
  const monoFont = (weight: number) => (size: number) => `${weight} ${size}px ${mono}`
  const sansFont = (weight: number) => (size: number) => `${weight} ${size}px ${sans}`

  // Make sure the web fonts are ready before measuring text
  try {
    await Promise.all([
      document.fonts.load(monoFont(800)(100)),
      document.fonts.load(monoFont(700)(40)),
      document.fonts.load(sansFont(500)(30)),
    ])
  } catch { }

  const canvas = document.createElement("canvas")
  canvas.width = SHARE_CARD_WIDTH
  canvas.height = SHARE_CARD_HEIGHT
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is not available in this browser")

  // Background: near-black with two soft red glows
  ctx.fillStyle = "#050505"
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT)
  const glow = (x: number, y: number, radius: number, color: string) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT)
  }
  glow(140, 120, 720, "rgba(220,38,38,0.34)")
  glow(980, 1250, 760, "rgba(249,115,22,0.20)")

  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "left"

  // Header
  ctx.fillStyle = "#f87171"
  ctx.font = monoFont(700)(28)
  try { (ctx as any).letterSpacing = "8px" } catch { }
  ctx.fillText("DISCORD WRAPPED", PADDING, 124)
  try { (ctx as any).letterSpacing = "0px" } catch { }

  const yearLabel = data.year === "all" || data.year == null ? "ALL TIME" : String(data.year)
  ctx.fillStyle = "#ffffff"
  fitSize(ctx, yearLabel, INNER, 150, 80, monoFont(800))
  ctx.fillText(yearLabel, PADDING - 4, 262)

  // Hero number
  const hero = Math.round(data.totalMessages).toLocaleString("en-US")
  const heroSize = fitSize(ctx, hero, INNER, 200, 90, monoFont(800))
  const heroGradient = ctx.createLinearGradient(PADDING, 0, PADDING + INNER, 0)
  heroGradient.addColorStop(0, "#f87171")
  heroGradient.addColorStop(0.55, "#ef4444")
  heroGradient.addColorStop(1, "#f97316")
  ctx.fillStyle = heroGradient
  ctx.fillText(hero, PADDING - 6, 318 + heroSize * 0.82)
  ctx.fillStyle = "#e4e4e7"
  ctx.font = sansFont(500)(40)
  ctx.fillText("messages sent", PADDING, 540)

  // Stat tiles: the first six that have something to say
  const sentimentTotal = data.sentimentPositive + data.sentimentNegative
  const tiles: Array<{ value: string; label: string }> = []
  const addTile = (show: boolean, value: string, label: string) => {
    if (show && tiles.length < 6) tiles.push({ value, label })
  }
  addTile(data.totalWords > 0, compact(data.totalWords), "words")
  addTile(data.daysActive > 0, data.daysActive.toLocaleString("en-US"), "days active")
  addTile(data.longestStreak > 1, data.longestStreak.toLocaleString("en-US"), "day streak")
  addTile(true, formatHour(data.peakHour), "peak hour")
  addTile((data.voiceSeconds ?? 0) >= 3600, `${compact((data.voiceSeconds ?? 0) / 3600)}h`, "in voice")
  addTile((data.serverCount ?? 0) > 0, String(data.serverCount), (data.serverCount ?? 0) === 1 ? "server" : "servers")
  addTile(data.totalEmojis > 0, compact(data.totalEmojis), "emojis")
  addTile(sentimentTotal > 0, `${Math.round((data.sentimentPositive / sentimentTotal) * 100)}%`, "positive")

  const GAP = 24
  const TILE_TOP = 596
  const TILE_HEIGHT = 168
  const tileWidth = (INNER - GAP * 2) / 3
  tiles.forEach((tile, index) => {
    const x = PADDING + (index % 3) * (tileWidth + GAP)
    const y = TILE_TOP + Math.floor(index / 3) * (TILE_HEIGHT + GAP)
    roundedRect(ctx, x, y, tileWidth, TILE_HEIGHT, 28)
    ctx.fillStyle = "rgba(24,24,27,0.88)"
    ctx.fill()
    ctx.strokeStyle = "rgba(127,29,29,0.7)"
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.textAlign = "center"
    ctx.fillStyle = "#ffffff"
    fitSize(ctx, tile.value, tileWidth - 40, 64, 34, monoFont(800))
    ctx.fillText(tile.value, x + tileWidth / 2, y + 88)
    ctx.fillStyle = "#a1a1aa"
    ctx.font = sansFont(500)(26)
    ctx.fillText(tile.label, x + tileWidth / 2, y + 132)
    ctx.textAlign = "left"
  })

  // Highlights: up to four labelled lines
  const highlights: Array<{ label: string; value: string }> = []
  const addHighlight = (label: string, value?: string | null) => {
    if (value && highlights.length < 4) highlights.push({ label, value })
  }
  if (!options.hideNames) addHighlight("Top server", data.topServers?.[0]?.name)
  addHighlight("Catchphrase", data.topWords[0] ? `"${data.topWords[0].word}"` : null)
  addHighlight("Top emoji", data.topUnicodeEmojis?.[0]?.name)
  addHighlight("Most played", data.topGames?.[0]?.name)
  addHighlight(
    "Wildest day",
    data.busiestDay ? `${formatDay(data.busiestDay)} · ${compact(data.busiestDayCount)} msgs` : null
  )

  const tileRows = Math.ceil(tiles.length / 3)
  const highlightTop = TILE_TOP + tileRows * (TILE_HEIGHT + GAP) + 16
  const HIGHLIGHT_HEIGHT = 104
  const highlightWidth = (INNER - GAP) / 2
  highlights.forEach((highlight, index) => {
    const x = PADDING + (index % 2) * (highlightWidth + GAP)
    const y = highlightTop + Math.floor(index / 2) * (HIGHLIGHT_HEIGHT + GAP)
    roundedRect(ctx, x, y, highlightWidth, HIGHLIGHT_HEIGHT, 24)
    ctx.fillStyle = "rgba(0,0,0,0.45)"
    ctx.fill()
    ctx.strokeStyle = "rgba(63,63,70,0.9)"
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.fillStyle = "#a1a1aa"
    ctx.font = sansFont(500)(22)
    ctx.fillText(highlight.label, x + 24, y + 38)
    ctx.fillStyle = "#ffffff"
    ctx.font = monoFont(700)(32)
    ctx.fillText(ellipsize(ctx, highlight.value, highlightWidth - 48), x + 24, y + 80)
  })

  // Footer
  ctx.fillStyle = "#a1a1aa"
  ctx.font = sansFont(500)(24)
  ctx.fillText("Made from my own Discord data export", PADDING, SHARE_CARD_HEIGHT - 60)

  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the image"))), "image/png")
  })
}

export function shareCardFileName(year?: number | "all" | null): string {
  return `discord-wrapped-${year === "all" || year == null ? "all-time" : year}.png`
}
