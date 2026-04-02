import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DealDetail from './DealDetail'

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: deal } = await supabase
    .from('deals')
    .select(`
      id, deal_type, status, created_at, investment_amount, share_price, share_class,
      completion_checklist, notes,
      companies (id, name, share_classes),
      deal_investors (
        id, amount, signing_status, poa_held, fee_rate,
        clients (id, full_name, email)
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!deal) notFound()

  const { data: documents } = await supabase
    .from('documents')
    .select('id, filename, type, storage_url, document_date')
    .eq('deal_id', id)
    .order('document_date', { ascending: false })

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, client_id, amount, status, issued_at, clients(full_name)')
    .eq('deal_id', id)

  return (
    <DealDetail
      deal={deal as Record<string, unknown>}
      documents={(documents ?? []) as Record<string, unknown>[]}
      invoices={(invoices ?? []) as Record<string, unknown>[]}
    />
  )
}
