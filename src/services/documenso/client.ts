import { Documenso } from '@documenso/sdk-typescript'

function getClient() {
  return new Documenso({ apiKey: process.env.DOCUMENSO_API_KEY! })
}

export interface DocumensoRecipient {
  name: string
  email: string
}

export interface CreateEnvelopeOptions {
  title: string
  pdfBuffer: Buffer
  recipient: DocumensoRecipient
  ccs?: DocumensoRecipient[]
  /** Our Supabase document UUID — stored as externalId so the webhook handler
   *  can look up the document row without relying on the Documenso numeric ID. */
  externalId?: string
}

export interface DocumensoEnvelope {
  /** Numeric Documenso document ID — used for API calls (delete, download, get). */
  documensoId: number
  /** External UUID-style envelope ID — stored in documents.documenso_envelope_id. */
  envelopeId: string
}

export async function createEnvelope({
  title,
  pdfBuffer,
  recipient,
  ccs = [],
  externalId,
}: CreateEnvelopeOptions): Promise<DocumensoEnvelope> {
  const client = getClient()

  const result = await client.documents.create({
    file: {
      fileName: `${title.replace(/[^\w\s-]/g, '')}.pdf`,
      content: pdfBuffer,
    },
    payload: {
      title,
      externalId,
      meta: {
        distributionMethod: 'EMAIL',
      },
      recipients: [
        {
          email: recipient.email,
          name: recipient.name,
          role: 'SIGNER',
          fields: [
            {
              // Signature block on page 2 in the blank signing space.
              // pageX/Y/width/height are percentages (0-100) of page dimensions.
              // Verify exact placement during end-to-end testing (Task 11).
              type: 'SIGNATURE',
              pageNumber: 2,
              pageX: 10,
              pageY: 55,
              width: 38,
              height: 8,
            },
          ],
        },
        ...ccs.map(cc => ({
          email: cc.email,
          name: cc.name,
          role: 'CC' as const,
        })),
      ],
    },
  })

  return {
    documensoId: result.id,
    envelopeId: result.envelopeId,
  }
}

export async function distributeEnvelope(documensoId: number): Promise<void> {
  const client = getClient()
  await client.documents.distribute({ documentId: documensoId })
}

export async function cancelEnvelope(documensoId: number): Promise<void> {
  const client = getClient()
  await client.documents.delete({ documentId: documensoId })
}

export async function getEnvelopeStatus(documensoId: number) {
  const client = getClient()
  return client.documents.get({ documentId: documensoId })
}

/** Downloads the signed PDF. Returns raw bytes as a Buffer. */
export async function downloadSignedPdf(documensoId: number): Promise<Buffer> {
  const client = getClient()
  const response = await client.documents.download({ documentId: documensoId, version: 'signed' })

  // The SDK types result as `any` — the endpoint returns the PDF bytes.
  // In practice this is an ArrayBuffer, Buffer, or base64 string depending on the runtime.
  // Adjust extraction here if the actual shape differs during testing.
  const raw = response.result
  if (!raw) throw new Error('Documenso download returned empty result')
  if (Buffer.isBuffer(raw)) return raw
  if (raw instanceof ArrayBuffer) return Buffer.from(raw)
  if (typeof raw === 'string') return Buffer.from(raw, 'base64')
  if (raw?.data) return Buffer.isBuffer(raw.data) ? raw.data : Buffer.from(raw.data)
  throw new Error(`Unexpected Documenso download response shape: ${typeof raw}`)
}
