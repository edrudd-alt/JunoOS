import { timingSafeEqual } from 'crypto'

/**
 * Documenso sends the raw webhook secret in the X-Documenso-Secret header.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifyWebhookSecret(headerValue: string): boolean {
  const secret = process.env.DOCUMENSO_WEBHOOK_SECRET
  if (!secret || !headerValue) return false
  try {
    const a = Buffer.from(headerValue)
    const b = Buffer.from(secret)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
