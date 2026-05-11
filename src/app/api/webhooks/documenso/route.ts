import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret } from '@/services/documenso/verifyWebhook'
import {
  handleCompletedEvent,
  handleRejectedEvent,
  handleCancelledEvent,
} from '@/services/documenso/webhookHandlers'

export async function POST(request: NextRequest) {
  const body = await request.text()

  // Documenso sends the raw webhook secret in X-Documenso-Secret (not HMAC).
  const secret = request.headers.get('x-documenso-secret') ?? ''

  // [WEBHOOK_DEBUG] temporary diagnostics — remove once mismatch identified
  {
    const _env = process.env.DOCUMENSO_WEBHOOK_SECRET
    const _mask = (s: string | null | undefined): string => {
      if (s == null) return 'null/undefined'
      if (s.length === 0) return '(empty)'
      if (s.length <= 8) return s.slice(0, 2) + '****' + s.slice(-2)
      return s.slice(0, 4) + '****' + s.slice(-4)
    }
    const _hex = (s: string | null | undefined): string => {
      if (!s || s.length === 0) return '(none)'
      const h = (c: string) => c.charCodeAt(0).toString(16).padStart(2, '0')
      return `first2=[${Array.from(s.slice(0, 2)).map(h).join(' ')}] last2=[${Array.from(s.slice(-2)).map(h).join(' ')}]`
    }
    console.warn('[WEBHOOK_DEBUG] incoming length:', secret.length)
    console.warn('[WEBHOOK_DEBUG] env length:', _env != null ? _env.length : 'undefined')
    console.warn('[WEBHOOK_DEBUG] incoming:', _mask(secret))
    console.warn('[WEBHOOK_DEBUG] env:', _mask(_env))
    console.warn('[WEBHOOK_DEBUG] strict equality:', secret === _env)
    console.warn('[WEBHOOK_DEBUG] incoming hex:', _hex(secret))
    console.warn('[WEBHOOK_DEBUG] env hex:', _hex(_env))
  }

  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 })
  }

  let event: { event: string; payload: unknown }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  // Documenso webhook event names use UPPER_SNAKE_CASE with DOCUMENT_ prefix.
  switch (event.event) {
    case 'DOCUMENT_COMPLETED':
      await handleCompletedEvent(event.payload)
      break
    case 'DOCUMENT_REJECTED':
      await handleRejectedEvent(event.payload)
      break
    case 'DOCUMENT_CANCELLED':
      await handleCancelledEvent(event.payload)
      break
    default:
      console.log('[documenso-webhook] unhandled event type:', event.event)
  }

  return NextResponse.json({ received: true })
}
