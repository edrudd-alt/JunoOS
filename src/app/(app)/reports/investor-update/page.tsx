import { createClient } from '@/lib/supabase/server'
import InvestorUpdateWizard from './InvestorUpdateWizard'

export default async function InvestorUpdatePage() {
  const supabase = await createClient()

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .order('name')

  const { data: investments } = await supabase
    .from('investments')
    .select('client_id, company_id, shares_purchased, sum_subscribed, investment_date, eis_status, share_class, clients(id, full_name, email)')
    .eq('status', 'active')

  const { data: portfolio } = await supabase
    .from('client_portfolio_summary')
    .select('client_id, company_id, company_name, total_shares, total_invested, current_value, gain_loss')

  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, full_name')

  return (
    <InvestorUpdateWizard
      companies={(companies ?? []) as Record<string, unknown>[]}
      investments={(investments ?? []) as Record<string, unknown>[]}
      portfolio={(portfolio ?? []) as Record<string, unknown>[]}
      teamMembers={(teamMembers ?? []) as Record<string, unknown>[]}
    />
  )
}
