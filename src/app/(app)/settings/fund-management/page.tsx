import { createClient } from '@/lib/supabase/server'
import FundManagementClient from './FundManagementClient'

export default async function FundManagementPage() {
  const supabase = await createClient()

  const [{ data: fundTypes }, { data: clients }] = await Promise.all([
    supabase.from('fund_types').select('*').order('code'),
    supabase
      .from('clients')
      .select('id, full_name, fund_type, active_fund_type')
      .order('full_name'),
  ])

  return (
    <FundManagementClient
      fundTypes={(fundTypes ?? []) as Record<string, unknown>[]}
      clients={(clients ?? []) as Record<string, unknown>[]}
    />
  )
}
