import { createClient } from '@/lib/supabase/server'
import DealsList from './DealsList'

export default async function DealsPage() {
  const supabase = await createClient()

  const { data: deals } = await supabase
    .from('deals')
    .select(`
      id, deal_type, status, created_at, updated_at, investment_amount,
      companies (id, name),
      deal_investors (
        id, amount, signing_status,
        clients (id, full_name)
      )
    `)
    .order('created_at', { ascending: false })

  return <DealsList deals={(deals ?? []) as Record<string, unknown>[]} />
}
