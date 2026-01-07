"use client"

interface ProcessOptions {
  year?: number | 'all'
}

export async function processAndAnalyze(
  file: File,
  onProgress: (stage: string, percent: number) => void,
  options: ProcessOptions = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    // Create the worker
    const worker = new Worker(new URL('./worker.ts', import.meta.url))

    worker.onmessage = (e) => {
      const { type, stage, percent, stats, error } = e.data

      if (type === 'progress') {
        onProgress(stage, percent)
      } else if (type === 'done') {
        worker.terminate()
        resolve(stats)
      } else if (type === 'error') {
        worker.terminate()
        reject(new Error(error))
      }
    }

    worker.onerror = (err) => {
      worker.terminate()
      reject(err)
    }

    // Send the file to processing
    worker.postMessage({ file, targetYear: options.year })
  })
}

// Kept for compatibility if imported elsewhere, but should not be used
export async function processDiscordZip(file: File, cb: any) { throw new Error("Use processAndAnalyze") }
export async function calculateStats(messages: any[], cb: any) { throw new Error("Use processAndAnalyze") }
