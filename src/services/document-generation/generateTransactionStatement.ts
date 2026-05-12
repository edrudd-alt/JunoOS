import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { SupabaseClient } from '@supabase/supabase-js'
import { TransactionStatementTemplate, transactionStatementVersion } from './templates/transactionStatement'
import type { TransactionDocumentContext } from './types'

const TEMPLATE_VERSION = `transactionStatement@${transactionStatementVersion}`

export interface TransactionStatementResult {
  documentId: string
  storageUrl: string
  filename: string
  pdfBuffer: Buffer
}

export async function generateTransactionStatement(
  supabase: SupabaseClient,
  dealInvestorId: string,
): Promise<TransactionStatementResult> {
  // 1. Fetch deal_investor row
  const { data: di, error: diError } = await supabase
    .from('deal_investors')
    .select('id, deal_id, client_id, fee_pct, lifecycle_status')
    .eq('id', dealInvestorId)
    .single()
  if (diError || !di) throw new Error(`deal_investor not found: ${dealInvestorId}`)
  if (di.lifecycle_status !== 'complete') {
    throw new Error('Transaction statement can only be generated after the investor is marked complete')
  }

  // 2. Fetch investments row (most recent for this deal + client)
  const { data: inv, error: invError } = await supabase
    .from('investments')
    .select('investment_date, share_class, original_share_price, shares_purchased, sum_subscribed, eis_status')
    .eq('deal_id', di.deal_id)
    .eq('client_id', di.client_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (invError || !inv) throw new Error('No investment record found — ensure the investor is marked complete')
  if (inv.eis_status === 'tbc') throw new Error('Confirm EIS status before generating a transaction statement')

  // 3. Fetch client + deal (for company_id) in parallel
  const [clientResult, dealResult] = await Promise.all([
    supabase.from('clients').select('full_name').eq('id', di.client_id).single(),
    supabase.from('deals').select('company_id').eq('id', di.deal_id).single(),
  ])
  if (!clientResult.data) throw new Error('Client not found')
  if (!dealResult.data?.company_id) throw new Error('Deal has no company')

  // 4. Fetch company
  const { data: company } = await supabase
    .from('companies').select('name').eq('id', dealResult.data.company_id).single()
  if (!company) throw new Error('Company not found')

  // 5. Build context and render
  const ctx: TransactionDocumentContext = {
    investor: { full_name: clientResult.data.full_name },
    company:  { name: company.name },
    investment: {
      investment_date:      inv.investment_date,
      share_class:          inv.share_class ?? '',
      original_share_price: inv.original_share_price ?? 0,
      shares_purchased:     inv.shares_purchased ?? 0,
      sum_subscribed:       inv.sum_subscribed ?? 0,
      eis_status:           inv.eis_status ?? 'no',
      fee_pct:              di.fee_pct ?? null,
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(React.createElement(TransactionStatementTemplate, ctx) as any)

  // 6. Build filename + storage path
  const statementDate = new Date().toISOString().slice(0, 10)
  const safeName    = clientResult.data.full_name.replace(/[\\/:*?"<>|]/g, '').trim()
  const safeCompany = company.name.replace(/[\\/:*?"<>|]/g, '').trim()
  const filename    = `${statementDate} — ${safeName} — ${safeCompany} — Transaction Statement.pdf`
  const storagePath = `deals/${di.deal_id}/transaction-statements/${filename}`

  // 7. Find existing non-superseded transaction statements for this deal + client
  const { data: existing } = await supabase
    .from('documents')
    .select('id, storage_url, filename')
    .eq('deal_id', di.deal_id)
    .eq('client_id', di.client_id)
    .eq('type', 'transaction_statement')
    .eq('superseded', false)

  // 8. Upload new PDF
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  // 9. Insert new documents row
  const { data: docRow, error: insertError } = await supabase
    .from('documents')
    .insert({
      deal_id:          di.deal_id,
      client_id:        di.client_id,
      deal_investor_id: dealInvestorId,
      type:             'transaction_statement',
      filename,
      storage_url:      storagePath,
      template_version: TEMPLATE_VERSION,
      superseded:       false,
    })
    .select('id')
    .single()
  if (insertError) throw new Error(`Documents insert failed: ${insertError.message}`)

  // 10. Supersede old documents (best-effort: storage rename + DB update)
  if (existing && existing.length > 0) {
    const now = new Date()
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const suffix = `_superseded_${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`

    for (const old of existing) {
      const insertSuffix = (s: string) =>
        s.endsWith('.pdf') ? s.slice(0, -4) + suffix + '.pdf' : s + suffix

      const newStoragePath = insertSuffix(old.storage_url)
      const newFilename    = old.filename ? insertSuffix(old.filename) : null

      const { error: moveError } = await supabase.storage
        .from('documents')
        .move(old.storage_url, newStoragePath)

      if (moveError) {
        console.error('[generateTransactionStatement] storage move failed for document', old.id, moveError.message)
      }

      await supabase.from('documents').update({
        superseded:       true,
        superseded_at:    now.toISOString(),
        superseded_by_id: docRow.id,
        storage_url:      moveError ? old.storage_url : newStoragePath,
        ...(newFilename && { filename: newFilename }),
      }).eq('id', old.id)
    }
  }

  return { documentId: docRow.id, storageUrl: storagePath, filename, pdfBuffer }
}
