"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy, Download, X } from "lucide-react"
import {
  canvasToBlob,
  renderShareCard,
  shareCardFileName,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  type ShareCardData,
} from "@/lib/share-card"

interface ShareCardDialogProps {
  data: ShareCardData
  onClose: () => void
}

export function ShareCardDialog({ data, onClose }: ShareCardDialogProps) {
  const [hideNames, setHideNames] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<{ text: string; ok: boolean }>({ text: "", ok: true })
  const [error, setError] = useState<string | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const hasServerName = Boolean(data.topServers?.[0]?.name)
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard && typeof ClipboardItem !== "undefined"

  // Draw the card whenever an option changes
  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    setError(null)
    renderShareCard(data, { hideNames })
      .then(canvasToBlob)
      .then((blob) => {
        if (cancelled) return
        blobRef.current = blob
        url = URL.createObjectURL(blob)
        setPreview(url)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not create the image")
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [data, hideNames])

  // Escape closes; focus starts on the close button
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const save = () => {
    const blob = blobRef.current
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = shareCardFileName(data.year)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setStatus({ text: "Saved to your downloads", ok: true })
  }

  const copy = async () => {
    const blob = blobRef.current
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      setStatus({ text: "Copied. Paste it anywhere", ok: true })
    } catch {
      setStatus({ text: "Your browser blocked the copy. Use Save image instead", ok: false })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-card-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 md:flex-row md:p-6"
      >
        <div className="flex flex-none items-center justify-center md:w-[46%]">
          {preview ? (
            <img
              src={preview}
              alt="Preview of your Discord Wrapped share image"
              width={SHARE_CARD_WIDTH}
              height={SHARE_CARD_HEIGHT}
              className="h-auto max-h-[60vh] w-auto max-w-full rounded-xl border border-zinc-700"
            />
          ) : (
            <div
              className="flex w-full items-center justify-center rounded-xl border border-zinc-700 bg-black text-sm text-zinc-400"
              style={{ aspectRatio: `${SHARE_CARD_WIDTH} / ${SHARE_CARD_HEIGHT}` }}
            >
              {error ?? "Drawing your card..."}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 id="share-card-title" className="font-mono text-2xl font-bold text-white">Share your Wrapped</h2>
              <p className="text-sm leading-relaxed text-zinc-400">
                A {SHARE_CARD_WIDTH} × {SHARE_CARD_HEIGHT} image, drawn in your browser. It only contains the numbers
                you see in the preview.
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-zinc-800 text-white transition hover:bg-zinc-700"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {hasServerName && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                className="h-5 w-5 flex-none accent-red-600"
                checked={hideNames}
                onChange={(event) => setHideNames(event.target.checked)}
              />
              Leave my top server off the image
            </label>
          )}

          <div className="mt-auto flex flex-wrap gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!preview}
              className="flex min-h-12 items-center gap-2 rounded-full bg-red-600 px-6 text-[15px] font-bold text-white transition hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-400"
            >
              <Download className="h-[18px] w-[18px]" aria-hidden="true" />
              Save image
            </button>
            {canCopy && (
              <button
                type="button"
                onClick={copy}
                disabled={!preview}
                className="flex min-h-12 items-center gap-2 rounded-full border border-zinc-600 px-5 text-[15px] font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:text-zinc-500"
              >
                <Copy className="h-[18px] w-[18px]" aria-hidden="true" />
                Copy image
              </button>
            )}
          </div>

          <p className="flex min-h-5 items-center gap-2 text-sm text-zinc-300" aria-live="polite">
            {status.text && status.ok && <Check className="h-4 w-4 flex-none text-green-400" aria-hidden="true" />}
            {status.text}
          </p>
        </div>
      </div>
    </div>
  )
}
