// ─── E-signature service abstraction (Documenso placeholder) ──────────────────
// Replace the stub functions below with real Documenso API calls when ready.

export interface SignatureRequest {
  dealId:        string
  investorEmail: string
  investorName:  string
  documentUrl:   string
}

export interface SignatureStatus {
  status:    'pending' | 'sent' | 'viewed' | 'signed' | 'declined'
  sentAt?:   string
  signedAt?: string
}

/** Send a document for signature. Returns the provider's envelope/request ID. */
export async function sendForSignature(
  _req: SignatureRequest,
): Promise<{ id: string }> {
  // TODO: integrate Documenso API
  // e.g. POST https://app.documenso.com/api/v1/documents
  throw new Error('Signature service not yet configured. Connect Documenso in signatureService.ts')
}

/** Poll the status of a previously sent signature request. */
export async function getSignatureStatus(
  _requestId: string,
): Promise<SignatureStatus> {
  // TODO: integrate Documenso API
  throw new Error('Signature service not yet configured. Connect Documenso in signatureService.ts')
}
