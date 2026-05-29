import { createClient } from '@/lib/supabase/server'
import NewClientForm from './NewClientForm'

export default async function NewClientPage() {
  const supabase = await createClient()

  const [
    { data: leads },
    { data: feeSchedules },
    { data: fundTypes },
    { data: nominees },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, fee_schedule_id')
      .is('lead_investor_id', null)
      .order('full_name'),
    supabase
      .from('fee_schedules')
      .select('id, name')
      .eq('active', true)
      .order('name'),
    supabase
      .from('fund_types')
      .select('id, name, code, default_fee_schedule_id')
      .order('name'),
    supabase
      .from('nominees')
      .select('id, name')
      .eq('active', true)
      .order('name'),
  ])

  return (
    <NewClientForm
      leads={(leads ?? []) as { id: string; full_name: string; fee_schedule_id: string | null }[]}
      feeSchedules={(feeSchedules ?? []) as { id: string; name: string }[]}
      nominees={(nominees ?? []) as { id: string; name: string }[]}
    />
  )
}
