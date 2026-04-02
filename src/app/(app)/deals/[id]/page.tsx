import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DealDetail from './DealDetail'

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .select(`
      id, deal_type, status, created_at, investment_amount, share_price, share_class,
      completion_checklist,
      companies (id, name),
      deal_investors (
        id, amount, signing_status, poa_held,
        clients (id, full_name, email)
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (dealError) {
    console.error('DealDetail query error:', JSON.stringify(dealError))
    return <div style={{ padding: 32, color: '#a32d2d', fontFamily: 'monospace', fontSize: 12 }}>
      <strong>Deal failed to load.</strong><br />
      {JSON.stringify(dealError)}
    </div>
  }
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
