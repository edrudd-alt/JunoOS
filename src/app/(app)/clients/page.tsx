import { createClient } from '@/lib/supabase/server'
import ClientList from './ClientList'

export default async function ClientsPage() {
  const supabase = await createClient()

  // Fetch all lead investors (lead_investor_id IS NULL = they are the lead)
  const { data: clients, error } = await supabase
    .from('clients')
    .select(`
      id, full_name, investor_reference, email, kyc_status, kyc_expiry,
      entity_type, tax_status, date_joined, lead_investor_id
    `)
    .order('full_name')

  if (error) {
    console.error('Error fetching clients:', error)
  }

  // Fetch portfolio summaries for each client
  const { data: portfolioSummaries } = await supabase
    .from('client_portfolio_summary')
    .select('client_id, company_id, total_invested, current_value, gain_loss')

  // Fetch all companies for filter
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .order('name')

  // Build portfolio data keyed by client_id
  const portfolioByClient: Record<string, {
    totalInvested: number
    currentValue: number
    gainLoss: number
    companyIds: Set<string>
  }> = {}

  for (const row of portfolioSummaries ?? []) {
    if (!portfolioByClient[row.client_id]) {
      portfolioByClient[row.client_id] = {
        totalInvested: 0,
        currentValue: 0,
        gainLoss: 0,
        companyIds: new Set(),
      }
    }
    portfolioByClient[row.client_id].totalInvested += Number(row.total_invested)
    portfolioByClient[row.client_id].currentValue += Number(row.current_value)
    portfolioByClient[row.client_id].gainLoss += Number(row.gain_loss)
    portfolioByClient[row.client_id].companyIds.add(row.company_id)
  }

  // Build company→client map for filtering
  const clientsByCompany: Record<string, Set<string>> = {}
  for (const row of portfolioSummaries ?? []) {
    if (!clientsByCompany[row.company_id]) clientsByCompany[row.company_id] = new Set()
    clientsByCompany[row.company_id].add(row.client_id)
  }

  const allClients = clients ?? []

  // Separate leads from linked entities
  const leads = allClients.filter(c => !c.lead_investor_id)
  const linkedByLead: Record<string, typeof allClients> = {}
  for (const c of allClients.filter(c => c.lead_investor_id)) {
    const lid = c.lead_investor_id!
    if (!linkedByLead[lid]) linkedByLead[lid] = []
    linkedByLead[lid].push(c)
  }

  // Last activity from internal_updates per client
  const { data: activityRows } = await supabase
    .from('internal_updates')
    .select('entity_id, created_at')
    .eq('entity_type', 'client')
    .order('created_at', { ascending: false })

  // Most recent activity per client (rows are already desc so first match wins)
  const lastActivityByClient: Record<string, string> = {}
  for (const row of (activityRows ?? []) as Record<string, string>[]) {
    if (row.entity_id && !lastActivityByClient[row.entity_id]) {
      lastActivityByClient[row.entity_id] = row.created_at
    }
  }

  // Serialise Sets to arrays for client component
  const portfolioByClientSerialisable = Object.fromEntries(
    Object.entries(portfolioByClient).map(([id, data]) => [
      id,
      { ...data, companyIds: Array.from(data.companyIds) },
    ])
  )
  const clientsByCompanySerialisable = Object.fromEntries(
    Object.entries(clientsByCompany).map(([id, set]) => [id, Array.from(set)])
  )

  return (
    <ClientList
      leads={leads}
      linkedByLead={linkedByLead}
      portfolioByClient={portfolioByClientSerialisable}
      clientsByCompany={clientsByCompanySerialisable}
      companies={companies ?? []}
      lastActivityByClient={lastActivityByClient}
    />
  )
}
