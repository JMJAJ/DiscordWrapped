"use client"

interface ProcessOptions {
  year?: number | 'all'
}

// One long-lived worker: it keeps the parsed archive in DuckDB, so asking for
// another year of the same file only re-runs the stats queries.
let worker: Worker | null = null
let queue: Promise<unknown> = Promise.resolve()

function runInWorker(
  file: File,
  onProgress: (stage: string, percent: number) => void,
  options: ProcessOptions
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      worker = new Worker(new URL('./worker.ts', import.meta.url))
    }
    const active = worker

    const fail = (err: unknown) => {
      active.onmessage = null
      active.onerror = null
      active.terminate()
      if (worker === active) worker = null
      reject(err)
    }

    active.onmessage = (e) => {
      const { type, stage, percent, stats, error } = e.data

      if (type === 'progress') {
        onProgress(stage, percent)
      } else if (type === 'done') {
        active.onmessage = null
        active.onerror = null
        resolve(stats)
      } else if (type === 'error') {
        fail(new Error(error))
      }
    }

    active.onerror = (err) => fail(err)

    active.postMessage({ file, targetYear: options.year })
  })
}

export async function processAndAnalyze(
  file: File,
  onProgress: (stage: string, percent: number) => void,
  options: ProcessOptions = {}
): Promise<any> {
  // Requests share one worker, so run them one at a time
  const run = queue.then(() => runInWorker(file, onProgress, options))
  queue = run.catch(() => undefined)
  return run
}

// Kept for compatibility if imported elsewhere, but should not be used
export async function processDiscordZip(file: File, cb: any) { throw new Error("Use processAndAnalyze") }
export async function calculateStats(messages: any[], cb: any) { throw new Error("Use processAndAnalyze") }
