import { createClient } from '@/lib/supabase/server'
import NewDealPage from './NewDealPage'

export default async function NewDealServerPage() {
  const supabase = await createClient()

  const [
    { data: companies },
    { data: clients },
    { data: investments },
  ] = await Promise.all([
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('clients').select('id, full_name, email, default_fee_rate, tax_status, lead_investor_id').order('full_name'),
    supabase.from('investments')
      .select('id, client_id, company_id, share_class, shares_purchased, original_share_price, sum_subscribed, eis_status, transaction_type, investment_date, fund_type')
      .eq('status', 'active'),
  ])

  return (
    <NewDealPage
      companies={(companies ?? []) as Record<string, unknown>[]}
      clients={(clients ?? []) as Record<string, unknown>[]}
      investments={(investments ?? []) as Record<string, unknown>[]}
    />
  )
}
