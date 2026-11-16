"use client"

import { Kawarp, useKawarp } from "@kawarp/react"
import { useEffect } from "react"

export const KAWARP_PALETTES = [
  ["#050505", "#260707", "#991b1b", "#dc2626", "#f97316", "#260707", "#050505"],
  ["#050505", "#2b0c05", "#9a3412", "#ea580c", "#f97316", "#3b0b06", "#050505"],
  ["#050505", "#250817", "#831843", "#db2777", "#ec4899", "#2b0914", "#050505"],
  ["#050505", "#250812", "#881337", "#e11d48", "#fb7185", "#2b0911", "#050505"],
]

export const DEFAULT_KAWARP_COLORS = KAWARP_PALETTES[0]

interface KawarpBackgroundProps {
  colors?: readonly string[]
}

export function KawarpBackground({ colors = DEFAULT_KAWARP_COLORS }: KawarpBackgroundProps) {
  const { ref, loadGradient } = useKawarp()

  useEffect(() => {
    loadGradient([...colors], 135)
  }, [colors, loadGradient])

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black">
      <Kawarp
        ref={ref}
        autoPlay
        warpIntensity={0.85}
        blurPasses={8}
        animationSpeed={0.65}
        saturation={1}
        tintColor={[0.08, 0.015, 0.01]}
        tintIntensity={0.1}
        dithering={0.004}
        className="h-full w-full"
      />
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/50" />
    </div>
  )
}
