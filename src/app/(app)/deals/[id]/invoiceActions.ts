import { createClient } from '@/lib/supabase/client'

type Supabase = ReturnType<typeof createClient>
export interface ActionResult { error: string | null }

function randomXeroSuffix(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export async function sendToXero(
  supabase: Supabase,
  invoiceId: string,
  dealId: string,
  dealInvestorId: string | null,
  userId: string,
): Promise<ActionResult> {
  const xeroNumber = `XERO-MOCK-${randomXeroSuffix()}`

  const { error } = await supabase
    .from('invoices')
    .update({ status: 'sent', issued_at: new Date().toISOString(), xero_invoice_number: xeroNumber })
    .eq('id', invoiceId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId, deal_investor_id: dealInvestorId,
    action_type: 'send_invoice_to_xero', is_mock: true, actioned_by: userId,
    metadata: { invoice_id: invoiceId, xero_invoice_number: xeroNumber },
  })

  return { error: null }
}

export async function markInvoicePaid(
  supabase: Supabase,
  invoiceId: string,
  dealId: string,
  dealInvestorId: string | null,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', invoiceId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId, deal_investor_id: dealInvestorId,
    action_type: 'mark_invoice_paid', is_mock: true, actioned_by: userId,
    metadata: { invoice_id: invoiceId },
  })

  return { error: null }
}

export async function markInvoiceUnsent(
  supabase: Supabase,
  invoiceId: string,
  dealId: string,
  dealInvestorId: string | null,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'draft', xero_invoice_number: null, issued_at: null })
    .eq('id', invoiceId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId, deal_investor_id: dealInvestorId,
    action_type: 'unsend_invoice', is_mock: false, actioned_by: userId,
    metadata: { invoice_id: invoiceId },
  })

  return { error: null }
}

export async function markInvoiceUnpaid(
  supabase: Supabase,
  invoiceId: string,
  dealId: string,
  dealInvestorId: string | null,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'sent' })
    .eq('id', invoiceId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId, deal_investor_id: dealInvestorId,
    action_type: 'unpay_invoice', is_mock: false, actioned_by: userId,
    metadata: { invoice_id: invoiceId },
  })

  return { error: null }
}

export async function editInvoiceDueDate(
  supabase: Supabase,
  invoiceId: string,
  dealId: string,
  dealInvestorId: string | null,
  oldDate: string | null,
  newDate: string,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('invoices')
    .update({ due_date: newDate })
    .eq('id', invoiceId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId, deal_investor_id: dealInvestorId,
    action_type: 'edit_invoice', is_mock: false, actioned_by: userId,
    metadata: { invoice_id: invoiceId, old_due_date: oldDate, new_due_date: newDate },
  })

  return { error: null }
}

export async function deleteInvoice(
  supabase: Supabase,
  invoiceId: string,
  dealId: string,
  dealInvestorId: string | null,
  userId: string,
): Promise<ActionResult> {
  await supabase.from('deal_action_logs').insert({
    deal_id: dealId, deal_investor_id: dealInvestorId,
    action_type: 'delete_invoice', is_mock: false, actioned_by: userId,
    metadata: { invoice_id: invoiceId },
  })

  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId)
  if (error) return { error: error.message }

  return { error: null }
}
