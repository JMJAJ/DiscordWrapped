// Simple in-memory cache for wrapped stats
let cachedStats: any = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export function getCachedStats() {
  if (cachedStats && Date.now() - cacheTimestamp < CACHE_DURATION) {
    console.log('[Cache] Returning cached stats')
    return cachedStats
  }
  return null
}

export function setCachedStats(stats: any) {
  cachedStats = stats
  cacheTimestamp = Date.now()
  console.log('[Cache] Stats cached')
}

export function clearCache() {
  cachedStats = null
  cacheTimestamp = 0
  console.log('[Cache] Cache cleared')
}
