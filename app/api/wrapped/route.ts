import { NextResponse } from 'next/server'
import { getWrappedStats, loadDiscordData } from '@/lib/db'
import { getCachedStats, setCachedStats } from '@/lib/cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60 seconds for processing

export async function GET() {
  try {
    // Check cache first
    const cached = getCachedStats()
    if (cached) {
      return NextResponse.json({ success: true, data: cached, cached: true })
    }

    console.log('[API] Loading Discord data...')
    await loadDiscordData()
    
    console.log('[API] Calculating stats...')
    const stats = await getWrappedStats()
    
    // Cache the results
    setCachedStats(stats)
    
    return NextResponse.json({ success: true, data: stats, cached: false })
  } catch (error: any) {
    console.error('[API] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
