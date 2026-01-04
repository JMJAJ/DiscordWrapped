import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  // For Vercel deployment: no server-side data processing
  // Users upload their Discord data and it's processed client-side
  return NextResponse.json({ 
    success: false, 
    error: 'No server data. Please upload your Discord data package.',
    clientSideOnly: true 
  })
}
