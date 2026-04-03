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
  const { data: valuations, error: valuationsError } = await supabase
    .from('valuations')
    .select('id, share_price, valuation_date, notes')
    .eq('company_id', id)
    .order('valuation_date', { ascending: false })
  if (valuationsError) console.error('Valuations query error:', valuationsError)

  // Investments with client info
  const { data: investments, error: investmentsError } = await supabase
    .from('investments')
    .select(`
      id, share_class, investment_date, original_share_price,
      shares_purchased, sum_subscribed, eis_status,
      holding_entity, holding_location, status,
      client_id,
      clients (id, full_name, lead_investor_id)
    `)
    .eq('company_id', id)
    .order('investment_date', { ascending: false })
  if (investmentsError) console.error('Investments query error:', investmentsError)

  // KPIs for this company
  const { data: kpiData, error: kpiError } = await supabase
    .from('kpi_data')
    .select('id, kpi_name, period, period_date, value, unit, auto_extracted, manually_verified')
    .eq('company_id', id)
    .order('period_date', { ascending: false })
  if (kpiError) console.error('KPI query error:', kpiError)

  // Internal updates feed
  const { data: internalUpdates, error: updatesError } = await supabase
    .from('internal_updates')
    .select('id, update_type, description, created_at, team_members(full_name)')
    .eq('company_id', id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (updatesError) console.error('Internal updates query error:', updatesError)

  // Company news
  const { data: news, error: newsError } = await supabase
    .from('company_news')
    .select('id, headline, source, url, published_at, is_significant, significance_reason')
    .eq('company_id', id)
    .order('published_at', { ascending: false })
    .limit(10)
  if (newsError) console.error('News query error:', newsError)

  // Fallback: if primary investments query returned empty, try without the join
  let investmentData = investments
  if (!investmentData || investmentData.length === 0) {
    console.log('Primary investments query returned empty, trying without join...')
    const { data: fallback, error: fallbackError } = await supabase
      .from('investments')
      .select('id, share_class, investment_date, original_share_price, shares_purchased, sum_subscribed, eis_status, holding_entity, holding_location, status, client_id')
      .eq('company_id', id)
    if (fallbackError) console.error('Fallback query error:', fallbackError)
    else console.log('Fallback returned', fallback?.length, 'rows')

    if (fallback && fallback.length > 0) {
      const clientIds = [...new Set(fallback.map(i => i.client_id))]
      const { data: clientData } = await supabase
        .from('clients')
        .select('id, full_name, lead_investor_id')
        .in('id', clientIds)
      const clientMap = new Map((clientData ?? []).map(c => [c.id, c]))
      investmentData = fallback.map(i => ({
        ...i,
        clients: clientMap.get(i.client_id) ?? null,
      }))
    }
  }

  // Current valuation
  const currentValuation = valuations?.[0] ?? null

  return (
    <CompanyPage
      company={company}
      valuations={valuations ?? []}
      currentValuation={currentValuation}
      investments={(investmentData ?? []) as typeof investments}
      kpiData={kpiData ?? []}
      internalUpdates={internalUpdates ?? []}
      news={news ?? []}
      initialAction={action ?? null}
    />
  )
}
