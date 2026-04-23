import { createClient } from '@/lib/supabase/server'
import ClientList from './ClientList'

export default async function ClientsPage() {
  const supabase = await createClient()

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const in60DaysStr = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: allClients },
    { data: portfolioSummaries },
    { data: companies },
    { data: activityRows },
    { data: rawInvestments },
    { data: rawDealInvestors },
    { data: nomineesData },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, investor_reference, email, kyc_status, kyc_expiry, vehicle_type, default_nominee_id, tax_status, date_joined, lead_investor_id, fund_type')
      .order('full_name'),
    supabase
      .from('client_portfolio_summary')
      .select('client_id, company_id, total_invested, current_value, gain_loss'),
    supabase
      .from('companies')
      .select('id, name')
      .order('name'),
    supabase
      .from('internal_updates')
      .select('entity_id, created_at')
      .eq('entity_type', 'client')
      .order('created_at', { ascending: false }),
    supabase
      .from('investments')
      .select('client_id, investment_date, transaction_type')
      .order('investment_date', { ascending: false }),
    supabase
      .from('deal_investors')
      .select('client_id, signing_status')
      .eq('signing_status', 'pending'),
    supabase
      .from('nominees')
      .select('id, name')
      .eq('active', true),
  ])

  // Last buy investment date per client (buy or null/legacy = treat as buy)
  const lastInvestmentByClient: Record<string, string> = {}
  for (const row of rawInvestments ?? []) {
    const txType = (row.transaction_type as string | null) ?? 'buy'
    if (txType !== 'buy' && txType !== 'transfer_in') continue
    const cid = row.client_id as string
    if (!lastInvestmentByClient[cid]) lastInvestmentByClient[cid] = row.investment_date as string
  }

  // Per-client flags
  const unsignedClientIds = new Set((rawDealInvestors ?? []).map(d => d.client_id as string))
  const clientFlags: Record<string, { kycOverdue: boolean; kycRenewalDue: boolean; appUnsigned: boolean }> = {}
  let kycOverdueCount = 0
  let kycRenewalCount = 0

  for (const c of allClients ?? []) {
    const expiry = c.kyc_expiry as string | null
    const kycOverdue = !!(expiry && expiry < todayStr)
    const kycRenewalDue = !!(expiry && expiry >= todayStr && expiry <= in60DaysStr)
    if (kycOverdue) kycOverdueCount++
    if (kycRenewalDue) kycRenewalCount++
    clientFlags[c.id] = {
      kycOverdue,
      kycRenewalDue,
      appUnsigned: unsignedClientIds.has(c.id),
    }
  }

  const attentionCounts = {
    kycOverdue:     kycOverdueCount,
    kycRenewalDue:  kycRenewalCount,
    appUnsigned:    unsignedClientIds.size,
    amlOutstanding: (allClients ?? []).filter(c => c.kyc_status === 'outstanding').length,
  }

  // Lead name lookup for linked-entity subtitles
  const leadNameById: Record<string, string> = {}
  for (const c of allClients ?? []) leadNameById[c.id] = c.full_name as string

  // Portfolio data
  const portfolioByClient: Record<string, { totalInvested: number; currentValue: number; gainLoss: number; companyIds: string[] }> = {}
  const clientsByCompanyMap: Record<string, Set<string>> = {}
  for (const row of portfolioSummaries ?? []) {
    const cid = row.client_id as string
    const coId = row.company_id as string
    if (!portfolioByClient[cid]) portfolioByClient[cid] = { totalInvested: 0, currentValue: 0, gainLoss: 0, companyIds: [] }
    portfolioByClient[cid].totalInvested += Number(row.total_invested)
    portfolioByClient[cid].currentValue  += Number(row.current_value)
    portfolioByClient[cid].gainLoss      += Number(row.gain_loss)
    portfolioByClient[cid].companyIds.push(coId)
    if (!clientsByCompanyMap[coId]) clientsByCompanyMap[coId] = new Set()
    clientsByCompanyMap[coId].add(cid)
  }
  const clientsByCompany = Object.fromEntries(
    Object.entries(clientsByCompanyMap).map(([k, v]) => [k, Array.from(v)])
  )

  // Last activity per client
  const lastActivityByClient: Record<string, string> = {}
  for (const row of (activityRows ?? []) as Record<string, string>[]) {
    if (row.entity_id && !lastActivityByClient[row.entity_id]) {
      lastActivityByClient[row.entity_id] = row.created_at
    }
  }

  return (
    <ClientList
      allClients={(allClients ?? []) as Record<string, unknown>[]}
      leadNameById={leadNameById}
      portfolioByClient={portfolioByClient}
      clientsByCompany={clientsByCompany}
      companies={companies ?? []}
      lastInvestmentByClient={lastInvestmentByClient}
      lastActivityByClient={lastActivityByClient}
      attentionCounts={attentionCounts}
      clientFlags={clientFlags}
      nominees={(nomineesData ?? []) as { id: string; name: string }[]}
    />
  )
}
