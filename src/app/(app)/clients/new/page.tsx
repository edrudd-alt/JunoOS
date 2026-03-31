import { createClient } from '@/lib/supabase/server'
import NewClientForm from './NewClientForm'

export default async function NewClientPage() {
  const supabase = await createClient()

  // Load lead investors for "linked entity" option
  const { data: leads } = await supabase
    .from('clients')
    .select('id, full_name')
    .is('lead_investor_id', null)
    .order('full_name')

  return <NewClientForm leads={leads ?? []} />
}
