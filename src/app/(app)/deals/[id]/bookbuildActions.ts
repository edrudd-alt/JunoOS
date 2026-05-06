// Centralised action helpers for Bookbuild tab — all real DB writes, no side effects beyond Supabase.
import { createClient } from '@/lib/supabase/client'
import type { ClientFull, DealInvestorFull } from './dealUtils'

type Supabase = ReturnType<typeof createClient>
export interface ActionResult { error: string | null }

// ── Fee resolution ─────────────────────────────────────────────────────────────

export async function getDefaultFeePct(
  supabase: Supabase,
  client: ClientFull,
): Promise<number> {
  if (client.fee_schedule_id) {
    const { data } = await supabase
      .from('fee_schedule_items')
      .select('rate')
      .eq('fee_schedule_id', client.fee_schedule_id)
      .eq('fee_type', 'buy')
      .eq('active', true)
      .maybeSingle()
    if (data?.rate != null) return Number(data.rate) / 100
  }
  if (client.default_fee_rate != null) return Number(client.default_fee_rate) / 100
  return 0.05
}

// ── Next-step actions ──────────────────────────────────────────────────────────

export async function confirmInvestment(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  confirmedAmount: number,
  feePct: number,
  sharePrice: number | null,
  userId: string,
): Promise<ActionResult> {
  const shares = sharePrice && sharePrice > 0
    ? parseFloat((confirmedAmount / sharePrice).toFixed(4))
    : null

  const { error } = await supabase
    .from('deal_investors')
    .update({
      lifecycle_status: 'confirmed',
      confirmed_amount: confirmedAmount,
      fee_pct: feePct,
      shares,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'confirm_investment',
    from_status: 'soft_circled',
    to_status: 'confirmed',
    is_mock: false,
    actioned_by: userId,
  })

  // Auto-create a draft invoice (skip if one already exists for this deal_investor)
  const { data: existingInvoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('deal_investor_id', dealInvestorId)
    .eq('status', 'draft')
    .maybeSingle()

  if (!existingInvoice) {
    const [{ data: diRow }, { data: dealRow }] = await Promise.all([
      supabase.from('deal_investors').select('client_id').eq('id', dealInvestorId).maybeSingle(),
      supabase.from('deals').select('company_id').eq('id', dealId).maybeSingle(),
    ])

    if (diRow?.client_id) {
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      await supabase.from('invoices').insert({
        deal_id: dealId,
        client_id: diRow.client_id,
        company_id: (dealRow as Record<string, unknown> | null)?.company_id ?? null,
        deal_investor_id: dealInvestorId,
        investment_amount: confirmedAmount,
        fee_percentage: feePct * 100,
        fee_amount: confirmedAmount * feePct,
        vat_amount: 0,
        due_date: dueDate,
        status: 'draft',
      })
      await supabase.from('deal_action_logs').insert({
        deal_id: dealId,
        deal_investor_id: dealInvestorId,
        action_type: 'create_draft_invoice',
        is_mock: false,
        actioned_by: userId,
      })
    }
  }

  return { error: null }
}

export async function sendApplicationForm(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  dealCompanyId: string | null,
  clientId: string,
  investorName: string,
  userId: string,
): Promise<ActionResult> {
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('deal_investors')
    .update({
      lifecycle_status: 'app_form_sent',
      fee_locked_at: now,
      signing_status: 'pending',
      updated_at: now,
      updated_by: userId,
    })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  const safeName = investorName.replace(/[^a-zA-Z0-9]/g, '_')
  await supabase.from('documents').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    company_id: dealCompanyId,
    client_id: clientId,
    type: 'app_form',
    version: 1,
    filename: `${safeName}_AppForm_v1_DRAFT.pdf`,
    storage_url: null,
    superseded: false,
    uploaded_by: userId,
  })

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'send_app_form',
    from_status: 'confirmed',
    to_status: 'app_form_sent',
    is_mock: true,
    actioned_by: userId,
  })

  return { error: null }
}

export async function reIssueApplicationForm(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  dealCompanyId: string | null,
  clientId: string,
  investorName: string,
  userId: string,
): Promise<ActionResult> {
  const now = new Date().toISOString()

  // Find and supersede existing non-superseded app form
  const { data: existingDocs } = await supabase
    .from('documents')
    .select('id, version')
    .eq('deal_investor_id', dealInvestorId)
    .eq('type', 'app_form')
    .eq('superseded', false)
    .order('version', { ascending: false })

  const latestVersion = existingDocs?.[0]?.version ?? 0
  const nextVersion = latestVersion + 1

  if (existingDocs && existingDocs.length > 0) {
    await supabase
      .from('documents')
      .update({ superseded: true, superseded_at: now })
      .in('id', existingDocs.map(d => d.id))
  }

  const safeName = investorName.replace(/[^a-zA-Z0-9]/g, '_')
  await supabase.from('documents').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    company_id: dealCompanyId,
    client_id: clientId,
    type: 'app_form',
    version: nextVersion,
    filename: `${safeName}_AppForm_v${nextVersion}_DRAFT.pdf`,
    storage_url: null,
    superseded: false,
    uploaded_by: userId,
  })

  await supabase
    .from('deal_investors')
    .update({ updated_at: now, updated_by: userId })
    .eq('id', dealInvestorId)

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 're_issue_document',
    is_mock: true,
    actioned_by: userId,
  })

  return { error: null }
}

export async function sendChaser(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('deal_investors')
    .update({ updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'send_chaser',
    is_mock: true,
    actioned_by: userId,
  })

  return { error: null }
}

// ── Fee actions ────────────────────────────────────────────────────────────────

export async function overrideFee(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  oldPct: number,
  newPct: number,
  reason: string | null,
  userId: string,
): Promise<ActionResult> {
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('deal_investors')
    .update({
      fee_pct: newPct,
      fee_overridden: true,
      fee_override_reason: reason || null,
      fee_override_by: userId,
      fee_override_at: now,
      updated_at: now,
      updated_by: userId,
    })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'fee_override',
    is_mock: false,
    metadata: { old_pct: oldPct, new_pct: newPct, reason },
    actioned_by: userId,
  })

  return { error: null }
}

export async function resetFee(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  defaultPct: number,
  oldPct: number,
  userId: string,
): Promise<ActionResult> {
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('deal_investors')
    .update({
      fee_pct: defaultPct,
      fee_overridden: false,
      fee_override_reason: null,
      fee_override_by: null,
      fee_override_at: null,
      updated_at: now,
      updated_by: userId,
    })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'fee_reset',
    is_mock: false,
    metadata: { old_pct: oldPct, reset_to: defaultPct },
    actioned_by: userId,
  })

  return { error: null }
}

// ── Status transitions ─────────────────────────────────────────────────────────

export async function moveBackwards(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  fromStatus: string,
  toStatus: string,
  userId: string,
  extraUpdates?: Record<string, unknown>,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('deal_investors')
    .update({
      lifecycle_status: toStatus,
      updated_at: new Date().toISOString(),
      updated_by: userId,
      ...extraUpdates,
    })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'move_backwards',
    from_status: fromStatus,
    to_status: toStatus,
    is_mock: false,
    actioned_by: userId,
  })

  return { error: null }
}

export async function declineInvestor(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  fromStatus: string,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('deal_investors')
    .update({
      lifecycle_status: 'declined',
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'move_backwards',
    from_status: fromStatus,
    to_status: 'declined',
    is_mock: false,
    actioned_by: userId,
  })

  return { error: null }
}

export async function removeFromDeal(
  supabase: Supabase,
  dealId: string,
  di: DealInvestorFull,
  userId: string,
): Promise<ActionResult> {
  // Log first so audit trail survives the delete
  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: di.id,
    action_type: 'remove_from_deal',
    is_mock: false,
    metadata: {
      deleted_row: {
        id: di.id, client_id: di.client_id,
        investing_vehicle_id: di.investing_vehicle_id,
        nominee_id: di.nominee_id,
        soft_circle_amount: di.soft_circle_amount,
        confirmed_amount: di.confirmed_amount,
        lifecycle_status: di.lifecycle_status,
        fee_pct: di.fee_pct,
      },
    },
    actioned_by: userId,
  })

  const { error } = await supabase
    .from('deal_investors')
    .delete()
    .eq('id', di.id)

  if (error) return { error: error.message }
  return { error: null }
}

// ── Deal investor edit ─────────────────────────────────────────────────────────

export async function editDealInvestor(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  updates: Record<string, unknown>,
  oldValues: Record<string, unknown>,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('deal_investors')
    .update({ ...updates, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'edit_deal_investor',
    is_mock: false,
    metadata: { old_values: oldValues, new_values: updates },
    actioned_by: userId,
  })

  return { error: null }
}

// ── Bulk actions ───────────────────────────────────────────────────────────────

export async function markPoaHeld(
  supabase: Supabase,
  dealId: string,
  dealInvestorIds: string[],
  userId: string,
): Promise<ActionResult> {
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('deal_investors')
    .update({ poa_held: true, updated_at: now, updated_by: userId })
    .in('id', dealInvestorIds)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert(
    dealInvestorIds.map(id => ({
      deal_id: dealId, deal_investor_id: id,
      action_type: 'mark_poa_held', is_mock: false, actioned_by: userId,
    })),
  )

  return { error: null }
}

export async function bulkDeclineInvestors(
  supabase: Supabase,
  dealId: string,
  rows: DealInvestorFull[],
  userId: string,
): Promise<ActionResult> {
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('deal_investors')
    .update({ lifecycle_status: 'declined', updated_at: now, updated_by: userId })
    .in('id', rows.map(r => r.id))

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert(
    rows.map(r => ({
      deal_id: dealId, deal_investor_id: r.id,
      action_type: 'move_backwards',
      from_status: r.lifecycle_status, to_status: 'declined',
      is_mock: false, actioned_by: userId,
    })),
  )

  return { error: null }
}

// ── Closing tab actions ────────────────────────────────────────────────────────

export async function markPaid(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('deal_investors')
    .update({ lifecycle_status: 'paid', updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', dealInvestorId)
  if (error) return { error: error.message }
  await supabase.from('deal_action_logs').insert({
    deal_id: dealId, deal_investor_id: dealInvestorId,
    action_type: 'mark_paid', from_status: 'signed', to_status: 'paid',
    is_mock: false, actioned_by: userId,
  })
  return { error: null }
}

export async function sendPaymentChaser(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('deal_investors')
    .update({ updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', dealInvestorId)
  if (error) return { error: error.message }
  await supabase.from('deal_action_logs').insert({
    deal_id: dealId, deal_investor_id: dealInvestorId,
    action_type: 'send_payment_chaser',
    is_mock: true, actioned_by: userId,
  })
  return { error: null }
}

export async function logLateAddition(
  supabase: Supabase,
  dealId: string,
  preAddCount: number,
  userId: string,
): Promise<void> {
  await supabase.from('deal_action_logs').insert({
    deal_id: dealId, action_type: 'late_addition',
    is_mock: false, metadata: { pre_add_investor_count: preAddCount },
    actioned_by: userId,
  })
}

// ── Signature upload ───────────────────────────────────────────────────────────

export async function uploadSignedForm(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  clientId: string,
  companyId: string | null,
  investorName: string,
  file: File,
  userId: string,
): Promise<ActionResult> {
  const safeName = investorName.replace(/[^a-zA-Z0-9]/g, '_')
  const filePath = `deals/${dealId}/signed_forms/${safeName}_${Date.now()}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file, { contentType: 'application/pdf' })

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` }

  const now = new Date().toISOString()

  const { data: existingDoc } = await supabase
    .from('documents')
    .select('id')
    .eq('deal_investor_id', dealInvestorId)
    .eq('type', 'app_form')
    .eq('superseded', false)
    .maybeSingle()

  if (existingDoc) {
    await supabase.from('documents').update({ storage_url: filePath }).eq('id', existingDoc.id)
  } else {
    await supabase.from('documents').insert({
      deal_id: dealId, deal_investor_id: dealInvestorId,
      company_id: companyId, client_id: clientId,
      type: 'app_form', version: 1,
      filename: `${safeName}_SignedAppForm.pdf`,
      storage_url: filePath, superseded: false, uploaded_by: userId,
    })
  }

  const { error } = await supabase
    .from('deal_investors')
    .update({
      lifecycle_status: 'signed', signing_status: 'signed',
      updated_at: now, updated_by: userId,
    })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId, deal_investor_id: dealInvestorId,
    action_type: 'manual_signature_upload',
    from_status: 'app_form_sent', to_status: 'signed',
    is_mock: false, actioned_by: userId,
  })

  return { error: null }
}
