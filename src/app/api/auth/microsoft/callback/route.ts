import { NextRequest, NextResponse } from 'next/server'
import { handleOutlookCallback } from '@/app/(app)/settings/outlookActions'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL('/settings/integrations?outlook_error=denied', req.url),
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/integrations?outlook_error=invalid', req.url),
    )
  }

  const result = await handleOutlookCallback({ code, state })

  if ('error' in result) {
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?outlook_error=${encodeURIComponent(result.error)}`,
        req.url,
      ),
    )
  }

  return NextResponse.redirect(new URL('/settings/integrations?connected=outlook', req.url))
}
