import { createClient } from '@/lib/supabase/server'
import NomineesClient from './NomineesClient'

export default async function NomineesPage() {
  const supabase = await createClient()

  const { data: nominees } = await supabase
    .from('nominees')
    .select('id, name, description, active, created_at, bank_account_name, bank_sort_code, bank_account_number, bank_iban, bank_swift_bic')
    .order('name')

  return <NomineesClient nominees={(nominees ?? []) as Record<string, unknown>[]} />
}
