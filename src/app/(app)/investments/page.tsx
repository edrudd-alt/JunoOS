import { createClient } from '@/lib/supabase/server'
import InvestmentsLedger from './InvestmentsLedger'

export default async function InvestmentsPage() {
  const supabase = await createClient()

  const [
    { data: investments },
    { data: companies },
    { data: clients },
    { data: valuations },
  ] = await Promise.all([
    supabase
      .from('investments')
      .select(`
        id, client_id, company_id, share_class, investment_date,
        original_share_price, shares_purchased, sum_subscribed,
        eis_status, holding_entity, holding_location, status,
        transaction_type, cost_basis, transfer_counterparty_id, transfer_type, notes,
        fund_type, companies (id, name)
      `)
      .order('investment_date', { ascending: false }),
    supabase
      .from('companies')
      .select('id, name')
      .order('name'),
    supabase
      .from('clients')
      .select('id, full_name, email, lead_investor_id, entity_type, fund_type')
      .order('full_name'),
    supabase
      .from('valuations')
      .select('company_id, share_price, valuation_date')
      .order('valuation_date', { ascending: false }),
  ])

  return (
    <InvestmentsLedger
      investments={(investments ?? []) as Record<string, unknown>[]}
      companies={(companies ?? []) as Record<string, unknown>[]}
      clients={(clients ?? []) as Record<string, unknown>[]}
      valuations={(valuations ?? []) as Record<string, unknown>[]}
    />
  )
}
