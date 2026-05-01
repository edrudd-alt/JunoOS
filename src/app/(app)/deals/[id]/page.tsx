import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DealDetail from './DealDetail'
import BuyDealPage from './BuyDealPage'

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch deal without joins
  const { data: rawDeal, error: dealError } = await supabase
    .from('deals')
    .select('id, deal_type, status, created_at, investment_amount, share_price, share_class, share_class_id, investment_date, eis_qualifying, completion_checklist, company_id, deferred_consideration, total_proceeds_cap')
    .eq('id', id)
    .maybeSingle()

  if (dealError) {
    console.error('DealDetail query error:', JSON.stringify(dealError))
    return <div style={{ padding: 32, color: '#a32d2d', fontFamily: 'monospace', fontSize: 12 }}>
      <strong>Deal failed to load.</strong><br />
      {JSON.stringify(dealError)}
    </div>
  }
  if (!rawDeal) notFound()

  // ── Route buy deals to new page ───────────────────────────────────────────
  if (rawDeal.deal_type === 'new_investment' || rawDeal.deal_type === 'follow_on') {
    const [
      { data: buyCompany },
      { data: buyBookbuild },
      { data: buyShareClasses },
      { data: buyDealInvestors },
      { data: buyFundTypes },
      { data: buyDocuments },
      { data: buyInvoices },
    ] = await Promise.all([
      rawDeal.company_id
        ? supabase.from('companies').select('id, name, logo_url').eq('id', rawDeal.company_id).maybeSingle()
        : { data: null },
      supabase.from('bookbuilds').select('id, target_raise, status').eq('deal_id', id).maybeSingle(),
      rawDeal.company_id
        ? supabase.from('company_share_classes').select('id, name').eq('company_id', rawDeal.company_id)
        : { data: [] },
      supabase.from('deal_investors')
        .select('id, client_id, soft_circle_amount, confirmed_amount, lifecycle_status')
        .eq('deal_id', id),
      supabase.from('fund_types').select('id, name, exit_fee_default_pct'),
      supabase.from('documents').select('id').eq('deal_id', id),
      supabase.from('invoices').select('id').eq('deal_id', id),
    ])

    // Sequential: investor client records — needed to derive fund type
    const clientIds = [...new Set(
      (buyDealInvestors ?? []).map(di => di.client_id).filter((cid): cid is string => !!cid),
    )]
    let investorClients: { id: string; fund_type: string | null }[] = []
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from('clients').select('id, fund_type').in('id', clientIds)
      investorClients = (clients ?? []) as { id: string; fund_type: string | null }[]
    }

    return (
      <Suspense>
        <BuyDealPage
          deal={rawDeal as unknown as Parameters<typeof BuyDealPage>[0]['deal']}
          company={(buyCompany ?? null) as Parameters<typeof BuyDealPage>[0]['company']}
          bookbuild={(buyBookbuild ?? null) as Parameters<typeof BuyDealPage>[0]['bookbuild']}
          shareClasses={(buyShareClasses ?? []) as Parameters<typeof BuyDealPage>[0]['shareClasses']}
          dealInvestors={(buyDealInvestors ?? []) as Parameters<typeof BuyDealPage>[0]['dealInvestors']}
          investorClients={investorClients}
          fundTypes={(buyFundTypes ?? []) as Parameters<typeof BuyDealPage>[0]['fundTypes']}
          documentCount={(buyDocuments ?? []).length}
          invoiceCount={(buyInvoices ?? []).length}
        />
      </Suspense>
    )
  }

  // ── Sell deals and all other types — existing page, completely unchanged ──

  // Fetch related data in parallel
  const [
    { data: dealInvestors },
    { data: companyData },
    { data: documents },
    { data: rawInvoices },
    { data: rawBookbuildInitial },
    { data: allClientsData },
    { data: dealInvestmentsData },
    { data: companyInvestmentsData },
    { data: deferredPaymentsData },
    { data: rawDeferredNotes },
    { data: feeScheduleItemsData },
  ] = await Promise.all([
    supabase.from('deal_investors').select('id, amount, signing_status, poa_held, client_id').eq('deal_id', id),
    rawDeal.company_id
      ? supabase.from('companies').select('id, name').eq('id', rawDeal.company_id).maybeSingle()
      : { data: null },
    supabase.from('documents').select('id, filename, type, storage_url, document_date').eq('deal_id', id).order('document_date', { ascending: false }),
    supabase.from('invoices').select('id, client_id, amount, status, issued_at').eq('deal_id', id),
    supabase.from('bookbuilds').select('id, deal_id, company_id, target_raise, status').eq('deal_id', id).maybeSingle(),
    supabase.from('clients').select('id, full_name, email, default_fee_rate, fund_type, lead_investor_id, fee_schedule_id').order('full_name'),
    supabase.from('investments').select('id, client_id, sum_subscribed, shares_purchased, status, completion_date, eis_status, fee_rate, fee_amount').eq('deal_id', id),
    rawDeal.company_id
      ? supabase
          .from('investments')
          .select('id, client_id, investment_date, shares_purchased, sum_subscribed, cost_basis, share_class, status')
          .eq('company_id', rawDeal.company_id)
          .eq('status', 'active')
          .neq('transaction_type', 'sell')
          .neq('transaction_type', 'transfer_out')
          .order('investment_date', { ascending: true })
      : { data: [] },
    supabase.from('deferred_payments').select('*').eq('deal_id', id).order('tranche_number'),
    supabase.from('deal_deferred_notes').select('id, note, created_at, created_by').eq('deal_id', id).order('created_at', { ascending: false }),
    supabase.from('fee_schedule_items')
      .select('id, fee_schedule_id, fee_type, label, basis, rate, cap_rate, cap_years, display_order, active')
      .eq('active', true)
      .order('display_order'),
  ])

  // Resolve deferred note author names from team_members
  const authorIds = [...new Set(
    (rawDeferredNotes ?? [])
      .map(n => n.created_by as string | null)
      .filter((id): id is string => !!id),
  )]
  const authorMap = new Map<string, string>()
  if (authorIds.length > 0) {
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('id, full_name')
      .in('id', authorIds)
    for (const tm of teamMembers ?? []) {
      authorMap.set(tm.id, tm.full_name ?? '')
    }
  }
  const deferredNotes = (rawDeferredNotes ?? []).map(n => ({
    ...n,
    author_name: n.created_by ? (authorMap.get(n.created_by as string) ?? null) : null,
  }))

  // Build a map from allClientsData for all name lookups
  const allClientsMap = new Map(
    ((allClientsData ?? []) as { id: string; full_name: string; email: string | null }[]).map(c => [c.id, c]),
  )

  // Auto-populate bookbuild for follow-on deals with no bookbuild yet
  let rawBookbuild = rawBookbuildInitial
  if (rawDeal.deal_type === 'follow_on' && !rawBookbuild && rawDeal.company_id) {
    try {
      // Fetch active investments for this company to get existing investors
      const { data: existingInvs } = await supabase
        .from('investments')
        .select('client_id, sum_subscribed, investment_date')
        .eq('company_id', rawDeal.company_id)
        .eq('status', 'active')
        .order('investment_date', { ascending: false })

      // De-duplicate by client_id — keep most recent investment per client
      const byClient = new Map<string, { client_id: string; sum_subscribed: number }>()
      for (const inv of existingInvs ?? []) {
        if (!byClient.has(inv.client_id)) {
          byClient.set(inv.client_id, { client_id: inv.client_id, sum_subscribed: inv.sum_subscribed ?? 0 })
        }
      }

      // Create the bookbuild record
      const { data: newBookbuild } = await supabase
        .from('bookbuilds')
        .insert({ deal_id: id, company_id: rawDeal.company_id, status: 'open' })
        .select('id, deal_id, company_id, target_raise, status')
        .single()

      if (newBookbuild && byClient.size > 0) {
        await supabase.from('bookbuild_entries').insert(
          [...byClient.values()].map(inv => ({
            bookbuild_id:      newBookbuild.id,
            company_id:        rawDeal.company_id,
            client_id:         inv.client_id,
            indicative_amount: inv.sum_subscribed || null,
            status:            'interested',
          })),
        )
      }

      rawBookbuild = newBookbuild
    } catch (e) {
      console.error('Auto-populate bookbuild failed:', e)
    }
  }

  // Auto-populate bookbuild for sell deals with no bookbuild yet
  if (
    (rawDeal.deal_type === 'full_exit' || rawDeal.deal_type === 'partial_exit')
    && !rawBookbuild
    && rawDeal.company_id
  ) {
    try {
      // Parse share class names stored as comma-joined string at deal setup
      const selectedClasses = (rawDeal.share_class ?? '')
        .split(',').map((s: string) => s.trim()).filter(Boolean)

      // Fetch active buy investments for this company, filtered to selected share classes
      let invQuery = supabase
        .from('investments')
        .select('client_id, shares_purchased, share_class')
        .eq('company_id', rawDeal.company_id)
        .eq('status', 'active')
        .neq('transaction_type', 'sell')
        .neq('transaction_type', 'transfer_out')

      if (selectedClasses.length > 0) {
        invQuery = invQuery.in('share_class', selectedClasses)
      }

      const { data: existingInvs } = await invQuery

      // Aggregate total shares per client
      const byClient = new Map<string, number>()
      for (const inv of existingInvs ?? []) {
        const cid = (inv as Record<string, unknown>).client_id as string
        const shr = (inv as Record<string, unknown>).shares_purchased as number ?? 0
        byClient.set(cid, (byClient.get(cid) ?? 0) + shr)
      }

      // Create bookbuild record
      const { data: newBookbuild } = await supabase
        .from('bookbuilds')
        .insert({ deal_id: id, company_id: rawDeal.company_id, status: 'open' })
        .select('id, deal_id, company_id, target_raise, status')
        .single()

      if (newBookbuild && byClient.size > 0) {
        const salePrice = rawDeal.share_price ?? 0
        await supabase.from('bookbuild_entries').insert(
          [...byClient.entries()].map(([client_id, totalShares]) => ({
            bookbuild_id:      newBookbuild.id,
            company_id:        rawDeal.company_id,
            client_id,
            indicative_shares: totalShares || null,
            indicative_amount: salePrice > 0 ? (totalShares * salePrice) || null : null,
            status:            'undecided',
          })),
        )
      }

      rawBookbuild = newBookbuild
    } catch (e) {
      console.error('Auto-populate sell bookbuild failed:', e)
    }
  }

  // Bookbuild entries (sequential — needs bookbuild id)
  let rawEntries: Record<string, unknown>[] = []
  if (rawBookbuild) {
    const { data: entries } = await supabase
      .from('bookbuild_entries')
      .select('id, bookbuild_id, client_id, investing_vehicle_id, indicative_amount, indicative_shares, status, notes, updated_at')
      .eq('bookbuild_id', (rawBookbuild as Record<string, unknown>).id as string)
      .order('created_at')
    rawEntries = (entries ?? []) as Record<string, unknown>[]
  }

  const mergedEntries = rawEntries.map(e => ({
    ...e,
    client_name:            allClientsMap.get(e.client_id as string)?.full_name ?? 'Unknown',
    investing_vehicle_name: e.investing_vehicle_id
      ? (allClientsMap.get(e.investing_vehicle_id as string)?.full_name ?? null)
      : null,
  }))

  const bookbuild = rawBookbuild
    ? { ...(rawBookbuild as Record<string, unknown>), entries: mergedEntries }
    : null

  // Collect client IDs needed for deal_investors + invoices merges
  const diClientIds      = [...new Set((dealInvestors ?? []).map(di => di.client_id).filter(Boolean))]
  const invoiceClientIds = [...new Set((rawInvoices ?? []).map(inv => inv.client_id).filter(Boolean))]
  const allClientIds     = [...new Set([...diClientIds, ...invoiceClientIds])]

  // Re-use allClientsMap to avoid a second query
  const clientMap = new Map(
    allClientIds.map(cid => [cid, allClientsMap.get(cid)]).filter((pair): pair is [string, { id: string; full_name: string; email: string | null }] => !!pair[1]),
  )

  // Merge
  const mergedDealInvestors = (dealInvestors ?? []).map(di => ({
    ...di,
    clients: clientMap.get(di.client_id) ?? null,
  }))

  const mergedInvoices = (rawInvoices ?? []).map(inv => ({
    ...inv,
    clients: inv.client_id ? { full_name: clientMap.get(inv.client_id)?.full_name ?? null } : null,
  }))

  const deal = {
    ...rawDeal,
    companies:      companyData ?? null,
    deal_investors: mergedDealInvestors,
  }

  return (
    <Suspense>
      <DealDetail
        key={id}
        deal={deal as Record<string, unknown>}
        documents={(documents ?? []) as Record<string, unknown>[]}
        invoices={mergedInvoices as Record<string, unknown>[]}
        bookbuild={bookbuild}
        allClients={(allClientsData ?? []) as Record<string, unknown>[]}
        dealInvestments={(dealInvestmentsData ?? []) as Record<string, unknown>[]}
        companyInvestments={(companyInvestmentsData ?? []) as Record<string, unknown>[]}
        deferredPayments={(deferredPaymentsData ?? []) as Record<string, unknown>[]}
        deferredNotes={deferredNotes as Record<string, unknown>[]}
        feeScheduleItems={(feeScheduleItemsData ?? []) as Record<string, unknown>[]}
      />
    </Suspense>
  )
}
