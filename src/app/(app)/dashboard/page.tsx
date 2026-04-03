import { createClient } from '@/lib/supabase/server'
import Dashboard from './Dashboard'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Headline metrics + feed data in parallel — no embedded joins
  const [
    { data: clients },
    { data: companies },
    { data: portfolioRows },
    { data: recentValuations },
    { data: rawActivity },
    { data: rawNews },
    { data: investments },
  ] = await Promise.all([
    supabase.from('clients').select('id, lead_investor_id'),
    supabase.from('companies').select('id, name'),
    supabase.from('client_portfolio_summary').select('client_id, total_invested, current_value, gain_loss'),
    supabase.from('valuations').select('company_id, share_price, valuation_date').order('valuation_date', { ascending: false }).limit(20),
    supabase.from('internal_updates').select('id, update_type, description, created_at, company_id, created_by').order('created_at', { ascending: false }).limit(15),
    supabase.from('company_news').select('id, company_id, headline, source, url, published_at, is_significant').order('published_at', { ascending: false }).limit(12),
    supabase.from('investments').select('client_id, company_id, shares_purchased').eq('status', 'active'),
  ])

  // Collect all company IDs and team member IDs needed
  const valuationCids  = [...new Set((recentValuations ?? []).map(v => v.company_id as string).filter(Boolean))]
  const activityCids   = [...new Set((rawActivity ?? []).map(a => (a.company_id as string | null)).filter((c): c is string => Boolean(c)))]
  const newsCids       = [...new Set((rawNews ?? []).map(n => (n.company_id as string | null)).filter((c): c is string => Boolean(c)))]
  const allFeedCids    = [...new Set([...valuationCids, ...activityCids, ...newsCids])]
  const teamMemberIds  = [...new Set((rawActivity ?? []).map(a => (a.created_by as string | null)).filter((c): c is string => Boolean(c)))]

  // Fetch feed company names and team members in parallel
  const [
    { data: feedCompanies },
    { data: teamMembersData },
  ] = await Promise.all([
    allFeedCids.length > 0
      ? supabase.from('companies').select('id, name').in('id', allFeedCids)
      : { data: [] as { id: string; name: string }[] },
    teamMemberIds.length > 0
      ? supabase.from('team_members').select('id, full_name').in('id', teamMemberIds)
      : { data: [] as { id: string; full_name: string }[] },
  ])

  const feedCompanyMap  = new Map((feedCompanies ?? []).map(c => [c.id, c]))
  const teamMemberMap   = new Map((teamMembersData ?? []).map(t => [t.id, t]))

  // Merge company/team names into feed data
  const mergedValuations = (recentValuations ?? []).map(v => ({
    ...v,
    companies: { name: feedCompanyMap.get(v.company_id as string)?.name ?? 'Unknown' },
  }))

  const activity = (rawActivity ?? []).map(a => ({
    ...a,
    companies:    (a.company_id as string | null) ? { name: feedCompanyMap.get(a.company_id as string)?.name ?? null } : null,
    team_members: (a.created_by as string | null) ? { full_name: teamMemberMap.get(a.created_by as string)?.full_name ?? null } : null,
  }))

  const news = (rawNews ?? []).map(n => ({
    ...n,
    companies: (n.company_id as string | null) ? { name: feedCompanyMap.get(n.company_id as string)?.name ?? null } : null,
  }))

  // Compute totals
  let totalInvested = 0
  let totalCurrentValue = 0
  for (const row of portfolioRows ?? []) {
    totalInvested     += Number(row.total_invested ?? 0)
    totalCurrentValue += Number(row.current_value ?? 0)
  }
  const leadClients = (clients ?? []).filter(c => !c.lead_investor_id)

  // Build valuation changes from merged valuations
  type ValuationChange = {
    companyId: string
    companyName: string
    newPrice: number
    oldPrice: number | null
    date: string
    affectedClients: number
    aggregateChange: number
  }

  const companyValuations: Record<string, number[]> = {}
  for (const v of mergedValuations) {
    const cid = v.company_id as string
    if (!companyValuations[cid]) companyValuations[cid] = []
    companyValuations[cid].push(Number(v.share_price))
  }

  const clientsByCompany: Record<string, Set<string>> = {}
  const sharesByCompany: Record<string, number> = {}
  for (const inv of investments ?? []) {
    const cid = inv.company_id as string
    if (!clientsByCompany[cid]) clientsByCompany[cid] = new Set()
    clientsByCompany[cid].add(inv.client_id as string)
    sharesByCompany[cid] = (sharesByCompany[cid] ?? 0) + Number(inv.shares_purchased ?? 0)
  }

  const valuationChanges: ValuationChange[] = []
  const seenCompanies = new Set<string>()
  for (const v of mergedValuations) {
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
      companyId:       cid,
      companyName:     v.companies.name,
      newPrice,
      oldPrice,
      date:            v.valuation_date as string,
      affectedClients,
      aggregateChange,
    })
  }

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
      activity={activity as Record<string, unknown>[]}
      news={news as Record<string, unknown>[]}
    />
  )
}
