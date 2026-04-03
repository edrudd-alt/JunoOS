import { createClient } from '@/lib/supabase/server'
import DealsList from './DealsList'

export default async function DealsPage() {
  const supabase = await createClient()

  // Fetch deals without joins
  const { data: rawDeals } = await supabase
    .from('deals')
    .select('id, deal_type, status, created_at, updated_at, investment_amount, company_id')
    .order('created_at', { ascending: false })

  const dealIds     = (rawDeals ?? []).map(d => d.id)
  const companyCids = [...new Set((rawDeals ?? []).map(d => d.company_id).filter((c): c is string => Boolean(c)))]

  // Fetch deal_investors and companies in parallel
  const [
    { data: dealInvestors },
    { data: companiesData },
  ] = await Promise.all([
    dealIds.length > 0
      ? supabase.from('deal_investors').select('id, deal_id, amount, signing_status, client_id').in('deal_id', dealIds)
      : { data: [] as { id: string; deal_id: string; amount: number | null; signing_status: string | null; client_id: string }[] },
    companyCids.length > 0
      ? supabase.from('companies').select('id, name').in('id', companyCids)
      : { data: [] as { id: string; name: string }[] },
  ])

  // Fetch clients for those deal_investors
  const clientIds = [...new Set((dealInvestors ?? []).map(di => di.client_id).filter(Boolean))]
  const { data: clientsData } = clientIds.length > 0
    ? await supabase.from('clients').select('id, full_name').in('id', clientIds)
    : { data: [] as { id: string; full_name: string }[] }

  // Build lookup maps
  const companyMap = new Map((companiesData ?? []).map(c => [c.id, c]))
  const clientMap  = new Map((clientsData ?? []).map(c => [c.id, c]))

  // Group deal_investors by deal_id (with nested clients)
  const investorsByDeal = new Map<string, Record<string, unknown>[]>()
  for (const di of dealInvestors ?? []) {
    const arr = investorsByDeal.get(di.deal_id) ?? []
    arr.push({ ...di, clients: clientMap.get(di.client_id) ?? null })
    investorsByDeal.set(di.deal_id, arr)
  }

  // Merge into deals
  const deals = (rawDeals ?? []).map(d => ({
    ...d,
    companies:      d.company_id ? (companyMap.get(d.company_id) ?? null) : null,
    deal_investors: investorsByDeal.get(d.id) ?? [],
  }))

  return <DealsList deals={deals as Record<string, unknown>[]} />
}
