// PORTFOLIO STATEMENT GENERATION
// This function generates statements visible only to the team (internal).
// When the investor portal is built, portal users will be able to view their
// own statements via a separate read-only query path (e.g. by document_id,
// scoped to their own client_id via RLS). The generation function is NOT
// reused by the portal — generation is always team-triggered. The portal
// reads existing PDFs via signed URLs the same way the internal team does.

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { SupabaseClient } from '@supabase/supabase-js'
import { PortfolioValuationStatementTemplate } from './templates/portfolioValuationStatement'
import { sanitiseStorageKey } from './storage'
import type { PortfolioStatementContext } from './types'

const TEMPLATE_VERSION = 'portfolioValuationStatement@1.0.0'

export interface PortfolioStatementResult {
  documentId:      string
  storageUrl:      string
  filename:        string
  pdfBuffer:       Buffer
  templateVersion: string
}

// ── Context fetcher ───────────────────────────────────────────────────────────
// Six queries, two-query-then-merge pattern throughout. No PostgREST joins.

async function fetchPortfolioStatementContext(
  supabase: SupabaseClient,
  params: { clientId: string; periodDate: string },
): Promise<PortfolioStatementContext> {
  // Query 1: Client
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, full_name, investor_reference')
    .eq('id', params.clientId)
    .single()
  if (clientErr || !client) throw new Error(`Client not found: ${params.clientId}`)

  // Query 2: Active investments for this client
  const { data: investments, error: invErr } = await supabase
    .from('investments')
    .select('id, company_id, share_class_id, investment_date, original_share_price, shares_purchased, sum_subscribed, eis_status')
    .eq('client_id', params.clientId)
    .eq('status', 'active')
    .order('investment_date', { ascending: true })
  if (invErr) throw new Error(`Failed to fetch investments: ${invErr.message}`)
  if (!investments || investments.length === 0) {
    throw new Error('No active investments found for this client')
  }

  const companyIds = [...new Set(investments.map(i => i.company_id as string).filter(Boolean))]
  const classIds   = [...new Set(investments.map(i => i.share_class_id as string | null).filter((id): id is string => Boolean(id)))]

  // Queries 3, 4, 5, 6 in parallel
  const [
    { data: companies },
    { data: shareClasses },
    { data: valuations },
    { data: dividendRows },
  ] = await Promise.all([
    // Query 3: Companies
    supabase.from('companies').select('id, name').in('id', companyIds),
    // Query 4: Share classes
    classIds.length > 0
      ? supabase.from('company_share_classes').select('id, name').in('id', classIds)
      : { data: [] as { id: string; name: string }[] },
    // Query 5: Current valuations (latest per company+class)
    supabase.from('company_current_valuations')
      .select('company_id, share_class_id, share_price')
      .in('company_id', companyIds),
    // Query 6: Dividends for this client across the relevant companies
    supabase.from('dividends')
      .select('company_id, share_class_id, total_amount')
      .eq('client_id', params.clientId)
      .in('company_id', companyIds),
  ])

  // Build lookup maps
  const companyMap   = new Map((companies ?? []).map(c => [c.id, c.name]))
  const classMap     = new Map((shareClasses ?? []).map(c => [c.id, c.name]))
  const valuationMap = new Map(
    (valuations ?? []).map(v => [`${v.company_id}:${(v as Record<string, unknown>).share_class_id ?? ''}`, Number((v as Record<string, unknown>).share_price)])
  )

  // Dividend allocation is a fiction at the lot level: dividends are paid
  // to the holder at a record date, not to a specific buy lot. We allocate
  // them pro-rata by the lot's share count over the client's total shares
  // in that company+class. The per-company summary uses the real total.
  // Both views sum to the same grand total. When real dividend data starts
  // arriving, this logic must be verified against an actual payment event
  // (Future Work item, see Section 10).
  const dividendByKey = new Map<string, number>()
  for (const d of dividendRows ?? []) {
    const key = `${(d as Record<string, unknown>).company_id}:${(d as Record<string, unknown>).share_class_id ?? ''}`
    dividendByKey.set(key, (dividendByKey.get(key) ?? 0) + Number((d as Record<string, unknown>).total_amount))
  }

  const totalDividends     = [...dividendByKey.values()].reduce((s, v) => s + v, 0)
  const showDividendColumn = totalDividends > 0

  // Total shares per (company_id, share_class_id) — used for dividend pro-rata
  const sharesByKey = new Map<string, number>()
  for (const inv of investments) {
    const key = `${inv.company_id}:${inv.share_class_id ?? ''}`
    sharesByKey.set(key, (sharesByKey.get(key) ?? 0) + Number(inv.shares_purchased))
  }

  // Sort: alphabetical by company name, then by investment date
  const sorted = [...investments].sort((a, b) => {
    const nameA = companyMap.get(a.company_id as string) ?? ''
    const nameB = companyMap.get(b.company_id as string) ?? ''
    if (nameA !== nameB) return nameA.localeCompare(nameB)
    return (a.investment_date as string).localeCompare(b.investment_date as string)
  })

  // Build lots
  const lots: PortfolioStatementContext['lots'] = sorted.map(inv => {
    const key          = `${inv.company_id}:${inv.share_class_id ?? ''}`
    const currentPrice = valuationMap.get(key) ?? Number(inv.original_share_price)
    const shares       = Number(inv.shares_purchased)
    const subscribed   = Number(inv.sum_subscribed)
    const currentVal   = shares * currentPrice
    const totalShares  = sharesByKey.get(key) ?? 0
    const divTotal     = dividendByKey.get(key) ?? 0
    const divAlloc     = totalShares > 0 ? (shares / totalShares) * divTotal : 0

    return {
      investment_id:        inv.id as string,
      company_name:         companyMap.get(inv.company_id as string) ?? (inv.company_id as string),
      share_class_name:     inv.share_class_id ? (classMap.get(inv.share_class_id as string) ?? '') : '',
      eis_status:           (inv.eis_status as 'yes' | 'no' | 'tbc' | null) ?? null,
      investment_date:      inv.investment_date as string,
      original_share_price: Number(inv.original_share_price),
      shares_purchased:     shares,
      sum_subscribed:       subscribed,
      current_share_price:  currentPrice,
      current_valuation:    currentVal,
      valuation_change:     currentVal - subscribed,
      dividend_allocation:  divAlloc,
    }
  })

  // Build company summary — one row per (company_id, share_class_id)
  const summaryMap = new Map<string, PortfolioStatementContext['companySummary'][number]>()
  for (const inv of sorted) {
    const key       = `${inv.company_id}:${inv.share_class_id ?? ''}`
    const compName  = companyMap.get(inv.company_id as string) ?? (inv.company_id as string)
    const className = inv.share_class_id ? (classMap.get(inv.share_class_id as string) ?? '') : ''
    const price     = valuationMap.get(key) ?? Number(inv.original_share_price)
    const shares    = Number(inv.shares_purchased)
    const subscribed = Number(inv.sum_subscribed)
    const currentVal = shares * price

    const row = summaryMap.get(key)
    if (row) {
      row.total_shares            += shares
      row.total_subscribed        += subscribed
      row.total_current_valuation += currentVal
      row.total_valuation_change  += currentVal - subscribed
    } else {
      summaryMap.set(key, {
        company_name:            compName,
        share_class_name:        className,
        total_shares:            shares,
        total_subscribed:        subscribed,
        total_current_valuation: currentVal,
        total_valuation_change:  currentVal - subscribed,
        total_dividends:         dividendByKey.get(key) ?? 0,
      })
    }
  }

  const companySummary = [...summaryMap.values()].sort((a, b) =>
    a.company_name.localeCompare(b.company_name)
  )

  // Grand totals
  const grandTotals = lots.reduce(
    (acc, lot) => ({
      subscribed:        acc.subscribed        + lot.sum_subscribed,
      current_valuation: acc.current_valuation + lot.current_valuation,
      valuation_change:  acc.valuation_change  + lot.valuation_change,
      dividends:         acc.dividends         + lot.dividend_allocation,
    }),
    { subscribed: 0, current_valuation: 0, valuation_change: 0, dividends: 0 },
  )

  return {
    client: {
      id:                 client.id,
      full_name:          client.full_name,
      investor_reference: (client.investor_reference as string | null) ?? null,
    },
    period: {
      date:        params.periodDate,
      generatedOn: new Date().toISOString().slice(0, 10),
    },
    lots,
    companySummary,
    grandTotals,
    showDividendColumn,
  }
}

// ── Generation function ───────────────────────────────────────────────────────

export async function generatePortfolioValuationStatement(
  supabase: SupabaseClient,
  params: {
    clientId:    string
    periodDate:  string  // YYYY-MM-DD
    triggeredBy: string  // user ID
  },
  options: { previewOnly?: boolean } = {},
): Promise<PortfolioStatementResult> {
  // 1. Build context (6 queries, all two-query-then-merge)
  const ctx = await fetchPortfolioStatementContext(supabase, params)

  // 2. Render PDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(React.createElement(PortfolioValuationStatementTemplate, ctx) as any)

  if (options.previewOnly) {
    return { documentId: '', storageUrl: '', filename: '', pdfBuffer, templateVersion: TEMPLATE_VERSION }
  }

  // 3. Build filename (human-facing) and storage path
  // filename  — human-facing display name stored in documents.filename (em dash preserved)
  // storageKey — sanitised base (no .pdf) used to build the storage object key
  const safeName    = ctx.client.full_name.replace(/[\\/:*?"<>|]/g, '').trim()
  const fileBase    = `${params.periodDate} — ${safeName} — Portfolio Valuation Statement`
  const filename    = `${fileBase}.pdf`
  const storageBase = sanitiseStorageKey(fileBase)
  const storagePath = `clients/${params.clientId}/portfolio-statements/${storageBase}-${Date.now()}.pdf`

  // 4. Find existing non-superseded statements for same (client, period)
  const { data: existing } = await supabase
    .from('documents')
    .select('id, storage_url, filename')
    .eq('client_id', params.clientId)
    .eq('type', 'portfolio_statement')
    .eq('period', params.periodDate)
    .eq('superseded', false)

  // 5. Upload new PDF
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  // 6. Determine next version number
  const { data: versionRows } = await supabase
    .from('documents')
    .select('version')
    .eq('client_id', params.clientId)
    .eq('type', 'portfolio_statement')
    .eq('period', params.periodDate)
    .order('version', { ascending: false })
    .limit(1)
  const newVersion = ((versionRows?.[0] as { version?: number } | undefined)?.version ?? 0) + 1

  // 7. Insert new document row
  const { data: docRow, error: insertError } = await supabase
    .from('documents')
    .insert({
      type:             'portfolio_statement',
      client_id:        params.clientId,
      filename,
      storage_url:      storagePath,
      period:           params.periodDate,
      document_date:    new Date().toISOString().slice(0, 10),
      template_version: TEMPLATE_VERSION,
      version:          newVersion,
      superseded:       false,
      uploaded_by:      params.triggeredBy,
    })
    .select('id')
    .single()
  if (insertError) throw new Error(`Documents insert failed: ${insertError.message}`)

  // 8. Supersede old documents (best-effort)
  if (existing && existing.length > 0) {
    const now = new Date().toISOString()
    for (const old of existing) {
      await supabase.from('documents').update({
        superseded:       true,
        superseded_at:    now,
        superseded_reason: 'Regenerated',
        superseded_by_id: docRow.id,
      }).eq('id', old.id)
    }
  }

  return {
    documentId:      docRow.id,
    storageUrl:      storagePath,
    filename,
    pdfBuffer,
    templateVersion: TEMPLATE_VERSION,
  }
}
