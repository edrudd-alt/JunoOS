import { NextRequest, NextResponse } from 'next/server'
import { startOutlookConnect } from '@/app/(app)/settings/outlookActions'

export async function GET(_req: NextRequest) {
  try {
    const { authorizeUrl } = await startOutlookConnect()
    return NextResponse.redirect(authorizeUrl)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
