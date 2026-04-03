import { createClient } from '@/lib/supabase/server'
import Dashboard from './Dashboard'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Headline metrics
  const { data: clients } = await supabase
    .from('clients')
    .select('id, lead_investor_id')

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')

  const { data: portfolioRows } = await supabase
    .from('client_portfolio_summary')
    .select('client_id, total_invested, current_value, gain_loss')

  // Total AUM and change
  let totalInvested = 0
  let totalCurrentValue = 0
  for (const row of portfolioRows ?? []) {
    totalInvested += Number(row.total_invested ?? 0)
    totalCurrentValue += Number(row.current_value ?? 0)
  }

  const leadClients = (clients ?? []).filter(c => !c.lead_investor_id)

  // Recent valuations (for valuation changes panel)
  const { data: recentValuations } = await supabase
    .from('valuations')
    .select('company_id, share_price, valuation_date, companies(name)')
    .order('valuation_date', { ascending: false })
    .limit(20)

  // Most significant recent valuation change
  type ValuationChange = {
    companyId: string
    companyName: string
    newPrice: number
    oldPrice: number | null
    date: string
    affectedClients: number
    aggregateChange: number
  }

  const valuationChanges: ValuationChange[] = []
  const seenCompanies = new Set<string>()
  const companyValuations: Record<string, number[]> = {}

  for (const v of recentValuations ?? []) {
    const cid = v.company_id as string
    if (!companyValuations[cid]) companyValuations[cid] = []
    companyValuations[cid].push(Number(v.share_price))
  }

  // Recent activity feed
  const { data: activity } = await supabase
    .from('internal_updates')
    .select('id, update_type, description, created_at, company_id, companies(name), team_members(full_name)')
    .order('created_at', { ascending: false })
    .limit(15)

  // Company news (significant flagged)
  const { data: news } = await supabase
    .from('company_news')
    .select('id, company_id, headline, source, url, published_at, is_significant, companies(name)')
    .order('published_at', { ascending: false })
    .limit(12)

  // Active investments grouped by company — used to compute affected investor counts
  // and aggregate share counts for valuation change calculations
  const { data: investments } = await supabase
    .from('investments')
    .select('client_id, company_id, shares_purchased')
    .eq('status', 'active')

  const clientsByCompany: Record<string, Set<string>> = {}
  const sharesByCompany: Record<string, number> = {}

  for (const inv of investments ?? []) {
    const cid = inv.company_id as string
    if (!clientsByCompany[cid]) clientsByCompany[cid] = new Set()
    clientsByCompany[cid].add(inv.client_id as string)
    sharesByCompany[cid] = (sharesByCompany[cid] ?? 0) + Number(inv.shares_purchased ?? 0)
  }

  for (const v of recentValuations ?? []) {
    const cid = v.company_id as string
    if (seenCompanies.has(cid)) continue
    seenCompanies.add(cid)
    const prices = companyValuations[cid]
    const newPrice = prices[0]
    const oldPrice = prices[1] ?? null

    const affectedClients = clientsByCompany[cid]?.size ?? 0
    const totalShares = sharesByCompany[cid] ?? 0
    const aggregateChange = oldPrice !== null ? totalShares * (newPrice - oldPrice) : 0

    valuationChanges.push({
      companyId: cid,
      companyName: (v.companies as unknown as { name: string } | null)?.name ?? 'Unknown',
      newPrice,
      oldPrice,
      date: v.valuation_date as string,
      affectedClients,
      aggregateChange,
    })
  }

  // Sort by largest absolute aggregate change
  const topChanges = valuationChanges
    .filter(v => v.oldPrice !== null && v.aggregateChange !== 0)
    .sort((a, b) => Math.abs(b.aggregateChange) - Math.abs(a.aggregateChange))
    .slice(0, 5)

  const bannerChange = topChanges[0] ?? null

  return (
    <Dashboard
      totalAUM={totalCurrentValue}
      totalInvested={totalInvested}
      activeClients={leadClients.length}
      portfolioCompanies={(companies ?? []).length}
      bannerChange={bannerChange}
      topChanges={topChanges}
      activity={(activity ?? []) as Record<string, unknown>[]}
      news={(news ?? []) as Record<string, unknown>[]}
    />
  )
}
