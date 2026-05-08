// Webhook handlers for Documenso envelope events.
// Stubs in Task 4 — full implementation in Task 9.

/** Fires when all recipients have signed (DOCUMENT_COMPLETED). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleCompletedEvent(payload: unknown): Promise<void> {
  // Task 9: look up document by envelopeId, update signing_status='signed',
  // download signed PDF, store at signed_storage_url, advance lifecycle to 'signed', audit log.
  console.log('[documenso-webhook] DOCUMENT_COMPLETED — handler not yet implemented')
}

/** Fires when a recipient declines to sign (DOCUMENT_REJECTED). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleRejectedEvent(payload: unknown): Promise<void> {
  // Task 9: update signing_status='declined', audit log.
  console.log('[documenso-webhook] DOCUMENT_REJECTED — handler not yet implemented')
}

/** Fires when the envelope is cancelled (DOCUMENT_CANCELLED). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleCancelledEvent(payload: unknown): Promise<void> {
  // Task 9: update signing_status='cancelled', audit log.
  console.log('[documenso-webhook] DOCUMENT_CANCELLED — handler not yet implemented')
}
