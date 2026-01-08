"use client"

import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { Upload, FileArchive, Loader2, AlertCircle, CheckCircle2, Github } from "lucide-react"
import { Card } from "@/components/ui/card"
import { processAndAnalyze } from "@/lib/client-db"

interface UploadScreenProps {
  onDataReady: (data: any, file: File) => void
}

export function UploadScreen({ onDataReady }: UploadScreenProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState({ stage: '', percent: 0 })
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setError('Please upload a ZIP file (your Discord data package)')
      return
    }

    setError(null)
    setIsProcessing(true)
    setProgress({ stage: 'Starting...', percent: 0 })

    try {
      // Process and analyze the ZIP file
      const stats = await processAndAnalyze(file, (stage, percent) => {
        setProgress({ stage, percent })
      })

      onDataReady(stats, file)
    } catch (err: any) {
      console.error('Processing error:', err)
      setError(err.message || 'Failed to process Discord data')
      setIsProcessing(false)
    }
  }, [onDataReady])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <Card className="bg-zinc-900/80 border-red-900/30 p-8 backdrop-blur-md">
            <div className="text-center space-y-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="w-16 h-16 text-red-500 mx-auto" />
              </motion.div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">{progress.stage}</h2>
                <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-red-500 to-orange-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-sm text-gray-400">{progress.percent}%</p>
              </div>

              <p className="text-xs text-gray-500">
                Processing happens entirely in your browser.<br />
                Your data never leaves your device.
              </p>
            </div>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-black flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-red-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-red-800/10 rounded-full blur-3xl" />
      </div>

      <div className="absolute top-6 right-6 z-20">
        <a
          href="https://github.com/JMJAJ/DiscordWrapped"
          target="_blank"
          rel="noreferrer noopener"
          title="View Source on GitHub"
          aria-label="View source on GitHub"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-red-500/50 bg-black/70 text-white shadow-lg transition hover:bg-red-600/80"
        >
          <Github className="h-5 w-5" />
        </a>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <motion.h1
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="text-5xl md:text-6xl font-black text-white mb-2"
          >
            Discord
          </motion.h1>
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl md:text-4xl font-black bg-gradient-to-r from-red-400 via-red-500 to-orange-500 bg-clip-text text-transparent"
          >
            Upload your data to begin
          </motion.h2>
          <p className="mt-4 text-sm text-gray-400">
            We will detect every year in your messages and let you choose which Wrapped to view.
          </p>
        </div>

        <Card
          className={`bg-zinc-900/80 border-2 border-dashed p-8 backdrop-blur-md transition-colors cursor-pointer ${isDragging ? 'border-red-500 bg-red-900/20' : 'border-red-900/30 hover:border-red-500/50'
            }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <label className="block cursor-pointer">
            <input
              type="file"
              accept=".zip"
              onChange={handleInputChange}
              className="hidden"
            />

            <div className="text-center space-y-4">
              <motion.div
                animate={isDragging ? { scale: 1.1 } : { scale: 1 }}
                className="flex justify-center"
              >
                {isDragging ? (
                  <FileArchive className="w-16 h-16 text-red-500" />
                ) : (
                  <Upload className="w-16 h-16 text-red-500" />
                )}
              </motion.div>

              <div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {isDragging ? 'Drop it here!' : 'Upload Your Discord Data'}
                </h3>
                <p className="text-gray-400 text-sm">
                  Drag & drop your Discord data package (ZIP file)<br />
                  or click to browse
                </p>
              </div>
              {/* 
              <Button className="bg-red-600 hover:bg-red-500 text-white">
                Select ZIP File
              </Button> */}
            </div>
          </label>
        </Card>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
          >
            <Card className="bg-red-900/30 border-red-500/50 p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            </Card>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 space-y-4"
        >
          <Card className="bg-zinc-900/50 border-zinc-800 p-4">
            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              How to get your Discord data:
            </h4>
            <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
              <li>Open Discord → Settings → Privacy & Safety</li>
              <li>Scroll down and click "Request all of my Data"</li>
              <li>Wait for Discord's email (14-30 days)</li>
              <li>Download the ZIP file and upload it here</li>
            </ol>
          </Card>

          <p className="text-xs text-gray-500 text-center">
            Your data is processed entirely in your browser.<br />
            Nothing is uploaded to any server.
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
