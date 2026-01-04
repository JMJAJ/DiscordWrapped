import { NextResponse } from "next/server"
import { loadDiscordData, getWrappedStats } from "@/lib/db"

let dataLoaded = false

export async function GET() {
  try {
    // Load data on first request
    if (!dataLoaded) {
      console.log("[v0] Loading Discord data for the first time...")
      const loaded = await loadDiscordData()
      if (!loaded) {
        return NextResponse.json(
          { error: "Failed to load Discord data. Make sure Messages/index.json exists." },
          { status: 500 },
        )
      }
      dataLoaded = true
    }

    // Get stats (this is fast - only summary data)
    const stats = await getWrappedStats()

    return NextResponse.json(stats)
  } catch (error: any) {
    console.error("[v0] Error in /wrapped route:", error)
    return NextResponse.json({ error: "Failed to process Discord data", details: error.message }, { status: 500 })
  }
}
