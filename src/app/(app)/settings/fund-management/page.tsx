import { createClient } from '@/lib/supabase/server'
import FundManagementClient from './FundManagementClient'

export default async function FundManagementPage() {
  const supabase = await createClient()

  const [
    { data: fundTypes },
    { data: clients },
    { data: feeSchedules },
    { data: feeScheduleItems },
  ] = await Promise.all([
    supabase.from('fund_types').select('id, name, code, description, default_fee_schedule_id').order('code'),
    supabase.from('clients').select('id, full_name, fund_type, active_fund_type').order('full_name'),
    supabase.from('fee_schedules').select('id, name, description, active, created_at').order('name'),
    supabase.from('fee_schedule_items').select('*').order('display_order'),
  ])

  return (
    <FundManagementClient
      fundTypes={(fundTypes ?? []) as Record<string, unknown>[]}
      clients={(clients ?? []) as Record<string, unknown>[]}
      feeSchedules={(feeSchedules ?? []) as Record<string, unknown>[]}
      feeScheduleItems={(feeScheduleItems ?? []) as Record<string, unknown>[]}
    />
  )
}
