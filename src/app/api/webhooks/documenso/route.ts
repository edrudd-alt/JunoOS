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
