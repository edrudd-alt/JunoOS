import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CompanySettingsForm from './CompanySettingsForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CompanySettingsPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, sector, stage, eis_eligible, website, description, bank_account_name, bank_sort_code, bank_account_number, bank_iban, bank_swift_bic')
    .eq('id', id)
    .single()

  if (!company) notFound()

  return <CompanySettingsForm company={company as Record<string, unknown>} />
}
