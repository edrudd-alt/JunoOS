import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { downloadSignedPdf } from './client'

// Service-role client — webhook calls have no user session
function getServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Documenso webhook payload shape (relevant fields only)
interface DocumensoWebhookPayload {
  id?: number
  externalId?: string | null
  completedAt?: string | null
  [key: string]: unknown
}

async function findDocumentByExternalId(
  supabase: ReturnType<typeof getServiceClient>,
  externalId: string,
) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, deal_investor_id, deal_id, documenso_envelope_id')
    .eq('id', externalId)  // externalId = our Supabase document UUID
    .maybeSingle()
  if (error) throw new Error(`Document lookup failed: ${error.message}`)
  return data
}

/** Fires when all recipients have signed (DOCUMENT_COMPLETED). */
export async function handleCompletedEvent(payload: unknown): Promise<void> {
  const p = payload as DocumensoWebhookPayload
  const externalId = p.externalId

  if (!externalId) {
    console.warn('[documenso-webhook] DOCUMENT_COMPLETED missing externalId — cannot correlate')
    return
  }

  const supabase = getServiceClient()
  const doc = await findDocumentByExternalId(supabase, externalId)

  if (!doc) {
    console.warn('[documenso-webhook] DOCUMENT_COMPLETED: no document found for externalId', externalId)
    return
  }

  // Download signed PDF from Documenso
  const documensoId = doc.documenso_envelope_id ? parseInt(doc.documenso_envelope_id, 10) : null
  let signedStorageUrl: string | null = null

  if (documensoId && !isNaN(documensoId)) {
    try {
      const signedPdfBuffer = await downloadSignedPdf(documensoId)

      // Store signed PDF alongside original (new path, never overwrite)
      const signedPath = `deals/${doc.deal_id}/${doc.id}.signed.pdf`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(signedPath, signedPdfBuffer, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) {
        console.error('[documenso-webhook] signed PDF upload failed:', uploadError.message)
      } else {
        signedStorageUrl = signedPath
      }
    } catch (err) {
      console.error('[documenso-webhook] signed PDF download failed:', err)
    }
  }

  // Update document row
  await supabase.from('documents').update({
    signing_status: 'signed',
    ...(signedStorageUrl ? { signed_storage_url: signedStorageUrl } : {}),
  }).eq('id', doc.id)

  // Advance deal_investor lifecycle to 'signed'
  if (doc.deal_investor_id) {
    const now = new Date().toISOString()
    await supabase.from('deal_investors').update({
      lifecycle_status: 'signed',
      updated_at: now,
    }).eq('id', doc.deal_investor_id)

    // Audit log
    await supabase.from('deal_action_logs').insert({
      deal_id: doc.deal_id,
      deal_investor_id: doc.deal_investor_id,
      document_id: doc.id,
      action_type: 'document_signed_via_documenso',
      is_mock: false,
      from_status: 'app_form_sent',
      to_status: 'signed',
      metadata: {
        documenso_id: doc.documenso_envelope_id,
        completed_at: p.completedAt ?? new Date().toISOString(),
        signed_storage_url: signedStorageUrl,
      },
    })
  }
}

/** Fires when a recipient declines to sign (DOCUMENT_REJECTED). */
export async function handleRejectedEvent(payload: unknown): Promise<void> {
  const p = payload as DocumensoWebhookPayload
  const externalId = p.externalId

  if (!externalId) {
    console.warn('[documenso-webhook] DOCUMENT_REJECTED missing externalId')
    return
  }

  const supabase = getServiceClient()
  const doc = await findDocumentByExternalId(supabase, externalId)

  if (!doc) {
    console.warn('[documenso-webhook] DOCUMENT_REJECTED: no document found for externalId', externalId)
    return
  }

  await supabase.from('documents')
    .update({ signing_status: 'declined' })
    .eq('id', doc.id)

  // Lifecycle stays at app_form_sent — team follows up manually
  if (doc.deal_investor_id) {
    await supabase.from('deal_action_logs').insert({
      deal_id: doc.deal_id,
      deal_investor_id: doc.deal_investor_id,
      document_id: doc.id,
      action_type: 'document_declined_via_documenso',
      is_mock: false,
      from_status: 'app_form_sent',
      to_status: 'app_form_sent',
      metadata: { documenso_id: doc.documenso_envelope_id },
    })
  }
}

/** Fires when the envelope is cancelled (DOCUMENT_CANCELLED). */
export async function handleCancelledEvent(payload: unknown): Promise<void> {
  const p = payload as DocumensoWebhookPayload
  const externalId = p.externalId

  if (!externalId) {
    console.warn('[documenso-webhook] DOCUMENT_CANCELLED missing externalId')
    return
  }

  const supabase = getServiceClient()
  const doc = await findDocumentByExternalId(supabase, externalId)

  if (!doc) {
    console.warn('[documenso-webhook] DOCUMENT_CANCELLED: no document found for externalId', externalId)
    return
  }

  await supabase.from('documents')
    .update({ signing_status: 'cancelled' })
    .eq('id', doc.id)

  if (doc.deal_investor_id) {
    await supabase.from('deal_action_logs').insert({
      deal_id: doc.deal_id,
      deal_investor_id: doc.deal_investor_id,
      document_id: doc.id,
      action_type: 'document_cancelled_via_documenso',
      is_mock: false,
      from_status: 'app_form_sent',
      to_status: 'app_form_sent',
      metadata: { documenso_id: doc.documenso_envelope_id },
    })
  }
}
