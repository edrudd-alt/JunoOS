import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { downloadSignedPdf } from './client'

// TODO: replace with a dedicated service-account row in auth.users once one is created.
// actioned_by cannot be null (FK to auth.users) and webhook calls have no real user session,
// so the platform owner's ID is used as a temporary stand-in. Filter webhook-attributed
// audit rows via metadata.source = 'documenso_webhook'.
const WEBHOOK_ACTOR_ID = '71b8ef49-8d32-4d0b-baa8-8aa8f9a42fae'

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
    .select('id, deal_investor_id, deal_id, documenso_envelope_id, signing_status')
    .eq('id', externalId)  // externalId = our Supabase document UUID
    .maybeSingle()
  if (error) throw new Error(`Document lookup by externalId failed: ${error.message}`)
  return data
}

async function findDocumentByDocumensoId(
  supabase: ReturnType<typeof getServiceClient>,
  documensoId: string,
) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, deal_investor_id, deal_id, documenso_envelope_id, signing_status')
    .eq('documenso_envelope_id', documensoId)
    .maybeSingle()
  if (error) throw new Error(`Document lookup by documenso_envelope_id failed: ${error.message}`)
  return data
}

/**
 * Two-step document resolver with [WEBHOOK_DEBUG] logging.
 * 1. Primary: externalId → documents.id
 * 2. Fallback: payload.id → documents.documenso_envelope_id
 * Returns null (and logs) if neither path finds a row.
 */
async function resolveDocumentFromPayload(
  supabase: ReturnType<typeof getServiceClient>,
  externalId: string | null | undefined,
  documensoPayloadId: number | undefined,
): Promise<Awaited<ReturnType<typeof findDocumentByExternalId>>> {
  // Primary path: externalId → documents.id
  if (externalId) {
    try {
      const doc = await findDocumentByExternalId(supabase, externalId)
      if (doc) {
        console.warn('[WEBHOOK_DEBUG] document resolved via externalId', externalId, `→ found (id=${doc.id}, signing_status=${doc.signing_status})`)
        return doc
      }
      console.warn('[WEBHOOK_DEBUG] externalId lookup returned 0 rows; falling back to documenso_envelope_id')
    } catch (err) {
      console.warn('[WEBHOOK_DEBUG] externalId lookup threw:', err instanceof Error ? err.message : err)
      throw err
    }
  } else {
    console.warn('[WEBHOOK_DEBUG] externalId absent; skipping primary lookup — trying documenso_envelope_id fallback')
  }

  // Fallback path: payload.id → documents.documenso_envelope_id
  if (documensoPayloadId != null) {
    const idStr = String(documensoPayloadId)
    try {
      const doc = await findDocumentByDocumensoId(supabase, idStr)
      if (doc) {
        console.warn('[WEBHOOK_DEBUG] document resolved via documenso_envelope_id fallback', idStr, `→ found (id=${doc.id}, signing_status=${doc.signing_status})`)
        return doc
      }
      console.warn('[WEBHOOK_DEBUG] documenso_envelope_id fallback also returned 0 rows')
    } catch (err) {
      console.warn('[WEBHOOK_DEBUG] documenso_envelope_id fallback lookup threw:', err instanceof Error ? err.message : err)
      throw err
    }
  } else {
    console.warn('[WEBHOOK_DEBUG] documenso payload id also absent; cannot attempt fallback')
  }

  console.warn('[WEBHOOK_DEBUG] no matching document found via externalId or documenso_envelope_id')
  return null
}

/** Fires when all recipients have signed (DOCUMENT_COMPLETED). */
export async function handleCompletedEvent(payload: unknown): Promise<void> {
  const p = payload as DocumensoWebhookPayload
  const externalId = p.externalId

  console.warn('[WEBHOOK_DEBUG] handleCompletedEvent fired; externalId:', externalId ?? 'undefined', '| documenso document id:', p.id ?? 'undefined')

  const supabase = getServiceClient()
  const doc = await resolveDocumentFromPayload(supabase, externalId, p.id)
  if (!doc) return

  // Download signed PDF from Documenso
  const documensoId = doc.documenso_envelope_id ? parseInt(doc.documenso_envelope_id, 10) : null
  console.warn('[WEBHOOK_DEBUG] documenso_envelope_id on doc:', doc.documenso_envelope_id, '→ parsed int:', documensoId)

  let signedStorageUrl: string | null = null

  if (documensoId && !isNaN(documensoId)) {
    try {
      const signedPdfBuffer = await downloadSignedPdf(documensoId)
      console.warn('[WEBHOOK_DEBUG] PDF download success; byte size:', signedPdfBuffer.length)

      // Store signed PDF alongside original (new path, never overwrite)
      const signedPath = `deals/${doc.deal_id}/${doc.id}.signed.pdf`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(signedPath, signedPdfBuffer, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) {
        console.warn('[WEBHOOK_DEBUG] storage upload FAILED:', uploadError.message)
        console.error('[documenso-webhook] signed PDF upload failed:', uploadError.message)
      } else {
        console.warn('[WEBHOOK_DEBUG] storage upload success; path:', signedPath)
        signedStorageUrl = signedPath
      }
    } catch (err) {
      console.warn('[WEBHOOK_DEBUG] PDF download/upload threw:', err instanceof Error ? err.message : err)
      console.error('[documenso-webhook] signed PDF download failed:', err)
    }
  } else {
    console.warn('[WEBHOOK_DEBUG] skipping PDF download: documensoId is', documensoId, '(null or NaN)')
  }

  // Update document row
  const { data: docUpdateData, error: docUpdateError } = await supabase
    .from('documents')
    .update({
      signing_status: 'signed',
      ...(signedStorageUrl ? { signed_storage_url: signedStorageUrl } : {}),
    })
    .eq('id', doc.id)
    .select('id')
  console.warn('[WEBHOOK_DEBUG] documents UPDATE rows affected:', docUpdateData?.length ?? 0, '| error:', docUpdateError?.message ?? 'none')

  // Advance deal_investor lifecycle to 'signed'
  if (doc.deal_investor_id) {
    const now = new Date().toISOString()
    const { data: diUpdateData, error: diUpdateError } = await supabase
      .from('deal_investors')
      .update({
        lifecycle_status: 'signed',
        signing_status: 'signed',
        updated_at: now,
      })
      .eq('id', doc.deal_investor_id)
      .select('id')
    console.warn('[WEBHOOK_DEBUG] deal_investors UPDATE rows affected:', diUpdateData?.length ?? 0, '| error:', diUpdateError?.message ?? 'none')

    // Audit log
    const { error: logError } = await supabase.from('deal_action_logs').insert({
      deal_id: doc.deal_id,
      deal_investor_id: doc.deal_investor_id,
      document_id: doc.id,
      action_type: 'document_signed_via_documenso',
      is_mock: false,
      from_status: 'app_form_sent',
      to_status: 'signed',
      actioned_by: WEBHOOK_ACTOR_ID,
      metadata: {
        documenso_id: doc.documenso_envelope_id,
        completed_at: p.completedAt ?? new Date().toISOString(),
        signed_storage_url: signedStorageUrl,
        source: 'documenso_webhook',
        attributed_to_owner: true,
      },
    })
    console.warn('[WEBHOOK_DEBUG] deal_action_logs INSERT error:', logError?.message ?? 'none')
  } else {
    console.warn('[WEBHOOK_DEBUG] skipping deal_investors update: deal_investor_id is null')
  }
}

/** Fires when a recipient declines to sign (DOCUMENT_REJECTED). */
export async function handleRejectedEvent(payload: unknown): Promise<void> {
  const p = payload as DocumensoWebhookPayload
  const externalId = p.externalId

  console.warn('[WEBHOOK_DEBUG] handleRejectedEvent fired; externalId:', externalId ?? 'undefined', '| documenso document id:', p.id ?? 'undefined')

  const supabase = getServiceClient()
  const doc = await resolveDocumentFromPayload(supabase, externalId, p.id)
  if (!doc) return

  const { data: updateData, error: updateError } = await supabase
    .from('documents')
    .update({ signing_status: 'declined' })
    .eq('id', doc.id)
    .select('id')
  console.warn('[WEBHOOK_DEBUG] documents UPDATE rows affected:', updateData?.length ?? 0, '| error:', updateError?.message ?? 'none')

  // Lifecycle stays at app_form_sent — team follows up manually
  if (doc.deal_investor_id) {
    const { data: diUpdateData, error: diUpdateError } = await supabase
      .from('deal_investors')
      .update({ signing_status: 'declined' })
      .eq('id', doc.deal_investor_id)
      .select('id')
    console.warn('[WEBHOOK_DEBUG] deal_investors UPDATE rows affected:', diUpdateData?.length ?? 0, '| error:', diUpdateError?.message ?? 'none')

    const { error: logError } = await supabase.from('deal_action_logs').insert({
      deal_id: doc.deal_id,
      deal_investor_id: doc.deal_investor_id,
      document_id: doc.id,
      action_type: 'document_declined_via_documenso',
      is_mock: false,
      from_status: 'app_form_sent',
      to_status: 'app_form_sent',
      actioned_by: WEBHOOK_ACTOR_ID,
      metadata: { documenso_id: doc.documenso_envelope_id, source: 'documenso_webhook', attributed_to_owner: true },
    })
    console.warn('[WEBHOOK_DEBUG] deal_action_logs INSERT error:', logError?.message ?? 'none')
  }
}

/** Fires when the envelope is cancelled (DOCUMENT_CANCELLED). */
export async function handleCancelledEvent(payload: unknown): Promise<void> {
  const p = payload as DocumensoWebhookPayload
  const externalId = p.externalId

  console.warn('[WEBHOOK_DEBUG] handleCancelledEvent fired; externalId:', externalId ?? 'undefined', '| documenso document id:', p.id ?? 'undefined')

  const supabase = getServiceClient()
  const doc = await resolveDocumentFromPayload(supabase, externalId, p.id)
  if (!doc) return

  const { data: updateData, error: updateError } = await supabase
    .from('documents')
    .update({ signing_status: 'cancelled' })
    .eq('id', doc.id)
    .select('id')
  console.warn('[WEBHOOK_DEBUG] documents UPDATE rows affected:', updateData?.length ?? 0, '| error:', updateError?.message ?? 'none')

  if (doc.deal_investor_id) {
    const { data: diUpdateData, error: diUpdateError } = await supabase
      .from('deal_investors')
      .update({ signing_status: 'cancelled' })
      .eq('id', doc.deal_investor_id)
      .select('id')
    console.warn('[WEBHOOK_DEBUG] deal_investors UPDATE rows affected:', diUpdateData?.length ?? 0, '| error:', diUpdateError?.message ?? 'none')

    const { error: logError } = await supabase.from('deal_action_logs').insert({
      deal_id: doc.deal_id,
      deal_investor_id: doc.deal_investor_id,
      document_id: doc.id,
      action_type: 'document_cancelled_via_documenso',
      is_mock: false,
      from_status: 'app_form_sent',
      to_status: 'app_form_sent',
      actioned_by: WEBHOOK_ACTOR_ID,
      metadata: { documenso_id: doc.documenso_envelope_id, source: 'documenso_webhook', attributed_to_owner: true },
    })
    console.warn('[WEBHOOK_DEBUG] deal_action_logs INSERT error:', logError?.message ?? 'none')
  }
}
