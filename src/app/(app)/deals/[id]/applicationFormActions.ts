'use server'

import { createClient } from '@/lib/supabase/server'
import { generateDocument } from '@/services/document-generation'
import { createEnvelope, cancelEnvelope } from '@/services/documenso/client'

// ── Preview ────────────────────────────────────────────────────────────────────

export interface PreviewApplicationFormResult {
  pdfBase64: string
  bankDetailsOk: boolean
  companyName: string
  investorEmail: string | null
  kycStatus: string | null
}

export async function previewApplicationForm(
  dealInvestorId: string,
): Promise<PreviewApplicationFormResult | { error: string }> {
  try {
    const supabase = await createClient()
    const result = await generateDocument(
      supabase,
      'applicationForm',
      { dealInvestorId },
      { previewOnly: true },
    )
    return {
      pdfBase64: Buffer.from(result.pdfBuffer).toString('base64'),
      bankDetailsOk: result.context.bankDetails.account_name !== null,
      companyName: result.context.deal.company_name,
      investorEmail: result.context.investor.email,
      kycStatus: result.context.investor.kyc_status,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Preview generation failed' }
  }
}

// ── Send / Re-issue ────────────────────────────────────────────────────────────

export async function sendApplicationFormAction({
  dealInvestorId,
  recipientEmail,
  ccEmails,
  isReissue = false,
}: {
  dealInvestorId: string
  recipientEmail: string
  ccEmails: string[]
  isReissue?: boolean
}): Promise<{ success: boolean; error?: string; documentId?: string }> {
  let documentId: string | undefined
  let storageUrl: string | undefined
  let documensoNumericId: number | undefined

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Re-issue: supersede existing documents and cancel pending Documenso envelopes
    if (isReissue) {
      const { data: existingDocs } = await supabase
        .from('documents')
        .select('id, documenso_envelope_id, signing_status')
        .eq('deal_investor_id', dealInvestorId)
        .eq('type', 'application_form')
        .eq('superseded', false)

      if (existingDocs?.length) {
        for (const doc of existingDocs) {
          if (doc.documenso_envelope_id && doc.signing_status === 'pending') {
            try {
              await cancelEnvelope(parseInt(doc.documenso_envelope_id, 10))
              await supabase.from('documents')
                .update({ signing_status: 'cancelled' })
                .eq('id', doc.id)
            } catch { /* best-effort — envelope may have already expired */ }
          }
        }
        await supabase
          .from('documents')
          .update({ superseded: true, superseded_at: new Date().toISOString() })
          .in('id', existingDocs.map(d => d.id))
      }
    }

    // 1. Generate PDF (real: uploads to Storage, inserts documents row)
    const genResult = await generateDocument(supabase, 'applicationForm', { dealInvestorId })
    documentId = genResult.documentId
    storageUrl = genResult.storageUrl

    const investorDisplayName = genResult.context.investor.investing_vehicle_name
      ?? genResult.context.investor.full_name
    const dealId = genResult.context.deal.id

    // 2. Set signing-pending state and recipient details on the document row
    await supabase.from('documents').update({
      signing_status: 'pending',
      recipient_email: recipientEmail,
      cc_emails: ccEmails,
    }).eq('id', documentId)

    // 3. Create Documenso envelope (sends to recipient via email immediately)
    const envelope = await createEnvelope({
      title: `${genResult.context.deal.company_name} Application Form — ${investorDisplayName}`,
      pdfBuffer: genResult.pdfBuffer,
      recipient: { name: investorDisplayName, email: recipientEmail },
      ccs: ccEmails.map(e => ({ name: e, email: e })),
      externalId: documentId,  // enables webhook handler to look up our row by UUID
    })
    documensoNumericId = envelope.documensoId

    // 4. Store Documenso numeric ID (used for cancel/download API calls)
    await supabase.from('documents').update({
      documenso_envelope_id: envelope.documensoId.toString(),
    }).eq('id', documentId)

    // 5. Get current lifecycle status for audit log
    const { data: diRow } = await supabase
      .from('deal_investors')
      .select('lifecycle_status')
      .eq('id', dealInvestorId)
      .single()
    const fromStatus = diRow?.lifecycle_status ?? 'confirmed'

    // 6. Advance lifecycle
    const now = new Date().toISOString()
    await supabase.from('deal_investors').update({
      lifecycle_status: 'app_form_sent',
      fee_locked_at: now,
      updated_at: now,
      updated_by: user.id,
    }).eq('id', dealInvestorId)

    // 7. Audit log
    await supabase.from('deal_action_logs').insert({
      deal_id: dealId,
      deal_investor_id: dealInvestorId,
      document_id: documentId,
      action_type: isReissue ? 're_issue_app_form' : 'send_application_form',
      is_mock: false,
      from_status: fromStatus,
      to_status: 'app_form_sent',
      actioned_by: user.id,
      metadata: {
        recipient_email: recipientEmail,
        cc_emails: ccEmails,
        documenso_id: envelope.documensoId,
        envelope_id: envelope.envelopeId,
      },
    })

    return { success: true, documentId }

  } catch (error) {
    // ROLLBACK: best-effort cleanup in reverse order
    if (documensoNumericId !== undefined) {
      try { await cancelEnvelope(documensoNumericId) } catch { /* best-effort */ }
    }
    if (storageUrl || documentId) {
      try {
        const supabase = await createClient()
        if (storageUrl) {
          await supabase.storage.from('documents').remove([storageUrl])
        }
        if (documentId) {
          await supabase.from('documents').delete().eq('id', documentId)
        }
      } catch { /* best-effort */ }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
