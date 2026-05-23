import { createClient } from '@/lib/supabase/server'
import FundManagementClient from './FundManagementClient'

export default async function FundManagementPage() {
  const supabase = await createClient()

  const [
    { data: fundTypes },
    { data: investmentFundTypes },
    { data: clients },
    { data: feeSchedules },
    { data: feeScheduleItems },
  ] = await Promise.all([
    supabase.from('fund_types').select('id, name, code, description, default_fee_schedule_id').order('code'),
    supabase.from('investments').select('client_id, fund_type'),
    supabase.from('clients').select('id, full_name').is('lead_investor_id', null).order('full_name'),
    supabase.from('fee_schedules').select('id, name, description, active, created_at').order('name'),
    supabase.from('fee_schedule_items').select('*').order('display_order'),
  ])

  // Count distinct clients per fund type from the investments table.
  // A client may appear in more than one bucket if they have investments of different fund types.
  const fundTypeClientSets: Record<string, Set<string>> = {}
  for (const row of (investmentFundTypes ?? [])) {
    const ft = (row as { client_id: string; fund_type: string }).fund_type
    const id = (row as { client_id: string; fund_type: string }).client_id
    if (!fundTypeClientSets[ft]) fundTypeClientSets[ft] = new Set()
    fundTypeClientSets[ft].add(id)
  }
  const fundTypeCounts = Object.fromEntries(
    Object.entries(fundTypeClientSets).map(([ft, ids]) => [ft, ids.size])
  )

  return (
    <FundManagementClient
      fundTypes={(fundTypes ?? []) as Record<string, unknown>[]}
      clients={(clients ?? []) as Record<string, unknown>[]}
      fundTypeCounts={fundTypeCounts}
      feeSchedules={(feeSchedules ?? []) as Record<string, unknown>[]}
      feeScheduleItems={(feeScheduleItems ?? []) as Record<string, unknown>[]}
    />
  )
}
