import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditClientForm from './EditClientForm'

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: leads }] = await Promise.all([
    supabase
      .from('clients')
      .select(`
        id, full_name, investor_reference, email, phone,
        address_line1, address_line2, city, postcode, date_joined,
        tax_status, kyc_status, kyc_expiry, default_fee_rate,
        report_delivery_email, holding_location,
        lead_investor_id, notes
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('clients')
      .select('id, full_name')
      .is('lead_investor_id', null)
      .order('full_name'),
  ])

  if (!client) return notFound()

  return (
    <EditClientForm
      client={client}
      leads={leads ?? []}
    />
  )
}
