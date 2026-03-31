import { createClient } from '@/lib/supabase/server'
import NewDealWizard from './NewDealWizard'

export default async function NewDealPage() {
  const supabase = await createClient()

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, share_classes')
    .order('name')

  const { data: clients } = await supabase
    .from('clients')
    .select('id, full_name, email, default_fee_rate, lead_investor_id')
    .order('full_name')

  return (
    <NewDealWizard
      companies={(companies ?? []) as Record<string, unknown>[]}
      clients={(clients ?? []) as Record<string, unknown>[]}
    />
  )
}
