import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CompanyPage from './CompanyPage'

interface Props {
  params: Promise<{ id: string }>
}

export default async function PortfolioCompanyPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()

  if (!company) notFound()

  // All parallel queries
  const [
    { data: valuations },
    { data: rawInvestments },
    { data: kpiData },
    { data: internalUpdates },
    { data: news },
    { data: openDealsRaw },
    { data: companyDocs },
    { data: rawShareClasses },
    { data: rankingHistory },
  ] = await Promise.all([
    // Valuations — include new methodology + source columns
    supabase
      .from('valuations')
      .select('id, share_price, valuation_date, notes, methodology, source')
      .eq('company_id', id)
      .order('valuation_date', { ascending: false }),

    // Investments — no join, includes fund_type for account filter
    supabase
      .from('investments')
      .select(`
        id, share_class, investment_date, original_share_price,
        shares_purchased, sum_subscribed, eis_status,
        holding_entity, holding_location, status, client_id, transaction_type, fund_type
      `)
      .eq('company_id', id)
      .order('investment_date', { ascending: false }),

    // KPIs
    supabase
      .from('kpi_data')
      .select('id, kpi_name, period, period_date, value, unit, auto_extracted, manually_verified')
      .eq('company_id', id)
      .order('period_date', { ascending: false }),

    // Internal updates
    supabase
      .from('internal_updates')
      .select('id, update_type, description, created_at')
      .eq('company_id', id)
      .order('created_at', { ascending: false })
      .limit(20),

    // Company news
    supabase
      .from('company_news')
      .select('id, headline, source, url, published_at, is_significant, significance_reason')
      .eq('company_id', id)
      .order('published_at', { ascending: false })
      .limit(10),

    // Open deals (not complete) for this company
    supabase
      .from('deals')
      .select('id, deal_type, status, created_at')
      .eq('company_id', id)
      .neq('status', 'complete'),

    // Company documents (for financials stat)
    supabase
      .from('documents')
      .select('id, type, filename, storage_url, document_date, period')
      .eq('company_id', id)
      .order('document_date', { ascending: false })
      .limit(30),

    // Share classes
    supabase
      .from('company_share_classes')
      .select('*')
      .eq('company_id', id)
      .order('name'),

    // Ranking history — newest first
    supabase
      .from('share_class_ranking_history')
      .select('*')
      .eq('company_id', id)
      .order('effective_from', { ascending: false }),
  ])

  // Fetch client details separately and merge
  const clientIds = [...new Set((rawInvestments ?? []).map(i => i.client_id))]
  const { data: clientsData } = clientIds.length > 0
    ? await supabase
        .from('clients')
        .select('id, full_name, lead_investor_id')
        .in('id', clientIds)
    : { data: [] as { id: string; full_name: string; lead_investor_id: string | null }[] }

  // Fetch deal investor counts
  const openDealIds = (openDealsRaw ?? []).map(d => d.id)
  const { data: dealInvestorRows } = openDealIds.length > 0
    ? await supabase
        .from('deal_investors')
        .select('deal_id')
        .in('deal_id', openDealIds)
    : { data: [] as { deal_id: string }[] }

  // Fetch deferred payments for all investments at this company
  const investmentIds = (rawInvestments ?? []).map(i => i.id)
  const { data: rawDeferredPayments } = investmentIds.length > 0
    ? await supabase
        .from('deferred_payments')
        .select('id, investment_id, expected_amount, actual_amount, expected_date, actual_date, contingency_description, status, tranche_number, is_final_tranche')
        .in('investment_id', investmentIds)
    : { data: [] as Record<string, unknown>[] }

  const clientMap = new Map((clientsData ?? []).map(c => [c.id, c]))
  const investments = (rawInvestments ?? []).map(i => ({
    ...i,
    clients: clientMap.get(i.client_id) ?? null,
  }))

  const investorCountByDeal: Record<string, number> = {}
  for (const di of dealInvestorRows ?? []) {
    const did = (di as Record<string, unknown>).deal_id as string
    investorCountByDeal[did] = (investorCountByDeal[did] ?? 0) + 1
  }

  const openDeals = (openDealsRaw ?? []).map(d => ({
    ...d,
    investor_count: investorCountByDeal[d.id] ?? 0,
  }))

  const currentValuation = valuations?.[0] ?? null

  // Merge current rank onto each share class.
  // The ranking history is ordered newest-first, so the first row per
  // share_class_id is the current rank.
  const currentRankMap = new Map<string, number | null>()
  for (const row of (rankingHistory ?? [])) {
    const r = row as Record<string, unknown>
    const scId = r.share_class_id as string
    if (!currentRankMap.has(scId)) {
      currentRankMap.set(scId, r.preference_rank as number | null)
    }
  }
  const shareClasses = (rawShareClasses ?? []).map(sc => ({
    ...(sc as Record<string, unknown>),
    current_rank: currentRankMap.get((sc as Record<string, unknown>).id as string) ?? null,
  }))

  return (
    <CompanyPage
      company={company}
      valuations={(valuations ?? []) as Record<string, unknown>[]}
      currentValuation={currentValuation as Record<string, unknown> | null}
      investments={investments as Record<string, unknown>[]}
      deferredPayments={(rawDeferredPayments ?? []) as Record<string, unknown>[]}
      kpiData={kpiData ?? []}
      internalUpdates={(internalUpdates ?? []) as Record<string, unknown>[]}
      news={(news ?? []) as Record<string, unknown>[]}
      openDeals={openDeals as Record<string, unknown>[]}
      companyDocs={(companyDocs ?? []) as Record<string, unknown>[]}
      shareClasses={shareClasses}
      rankingHistory={(rankingHistory ?? []) as Record<string, unknown>[]}
    />
  )
}
