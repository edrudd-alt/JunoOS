import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CompanyPage from './CompanyPage'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ action?: string }>
}

export default async function PortfolioCompanyPage({ params, searchParams }: Props) {
  const { id } = await params
  const { action } = await searchParams
  const supabase = await createClient()

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()

  if (!company) notFound()

  // All valuations for this company
  const { data: valuations } = await supabase
    .from('valuations')
    .select('id, share_price, valuation_date, notes')
    .eq('company_id', id)
    .order('valuation_date', { ascending: false })

  // Investments — fetch WITHOUT the clients join to avoid PostgREST silent failures
  const { data: rawInvestments } = await supabase
    .from('investments')
    .select(`
      id, share_class, investment_date, original_share_price,
      shares_purchased, sum_subscribed, eis_status,
      holding_entity, holding_location, status, client_id
    `)
    .eq('company_id', id)
    .order('investment_date', { ascending: false })

  // Fetch client details separately and merge
  const clientIds = [...new Set((rawInvestments ?? []).map(i => i.client_id))]
  const { data: clientsData } = clientIds.length > 0
    ? await supabase
        .from('clients')
        .select('id, full_name, lead_investor_id')
        .in('id', clientIds)
    : { data: [] as { id: string; full_name: string; lead_investor_id: string | null }[] }

  const clientMap = new Map((clientsData ?? []).map(c => [c.id, c]))
  const investments = (rawInvestments ?? []).map(i => ({
    ...i,
    clients: clientMap.get(i.client_id) ?? null,
  }))

  // KPIs for this company
  const { data: kpiData } = await supabase
    .from('kpi_data')
    .select('id, kpi_name, period, period_date, value, unit, auto_extracted, manually_verified')
    .eq('company_id', id)
    .order('period_date', { ascending: false })

  // Internal updates feed
  const { data: internalUpdates } = await supabase
    .from('internal_updates')
    .select('id, update_type, description, created_at')
    .eq('company_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Company news
  const { data: news } = await supabase
    .from('company_news')
    .select('id, headline, source, url, published_at, is_significant, significance_reason')
    .eq('company_id', id)
    .order('published_at', { ascending: false })
    .limit(10)

  // Current valuation
  const currentValuation = valuations?.[0] ?? null

  return (
    <CompanyPage
      company={company}
      valuations={valuations ?? []}
      currentValuation={currentValuation}
      investments={investments as Record<string, unknown>[]}
      kpiData={kpiData ?? []}
      internalUpdates={(internalUpdates ?? []) as Record<string, unknown>[]}
      news={(news ?? []) as Record<string, unknown>[]}
      initialAction={action ?? null}
    />
  )
}
