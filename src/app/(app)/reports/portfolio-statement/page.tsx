import { createClient } from '@/lib/supabase/server'
import PortfolioStatementWizard from './PortfolioStatementWizard'

export default async function PortfolioStatementPage() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, full_name, email, lead_investor_id')
    .is('lead_investor_id', null)
    .order('full_name')

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .order('name')

  const { data: portfolio } = await supabase
    .from('client_portfolio_summary')
    .select('client_id, company_id, company_name, total_shares, total_invested, current_value, gain_loss')

  const { data: investments } = await supabase
    .from('investments')
    .select('id, client_id, company_id, shares_purchased, sum_subscribed, investment_date, eis_status, share_class')
    .eq('status', 'active')
    .order('investment_date', { ascending: true })

  return (
    <PortfolioStatementWizard
      clients={(clients ?? []) as Record<string, unknown>[]}
      companies={(companies ?? []) as Record<string, unknown>[]}
      portfolio={(portfolio ?? []) as Record<string, unknown>[]}
      investments={(investments ?? []) as Record<string, unknown>[]}
    />
  )
}
