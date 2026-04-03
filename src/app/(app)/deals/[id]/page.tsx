import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DealDetail from './DealDetail'

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch deal without joins
  const { data: rawDeal, error: dealError } = await supabase
    .from('deals')
    .select('id, deal_type, status, created_at, investment_amount, share_price, share_class, completion_checklist, company_id')
    .eq('id', id)
    .maybeSingle()

  if (dealError) {
    console.error('DealDetail query error:', JSON.stringify(dealError))
    return <div style={{ padding: 32, color: '#a32d2d', fontFamily: 'monospace', fontSize: 12 }}>
      <strong>Deal failed to load.</strong><br />
      {JSON.stringify(dealError)}
    </div>
  }
  if (!rawDeal) notFound()

  // Fetch related data in parallel
  const [
    { data: dealInvestors },
    { data: companyData },
    { data: documents },
    { data: rawInvoices },
  ] = await Promise.all([
    supabase.from('deal_investors').select('id, amount, signing_status, poa_held, client_id').eq('deal_id', id),
    rawDeal.company_id
      ? supabase.from('companies').select('id, name').eq('id', rawDeal.company_id).maybeSingle()
      : { data: null },
    supabase.from('documents').select('id, filename, type, storage_url, document_date').eq('deal_id', id).order('document_date', { ascending: false }),
    supabase.from('invoices').select('id, client_id, amount, status, issued_at').eq('deal_id', id),
  ])

  // Collect all client IDs needed (deal_investors + invoices)
  const diClientIds      = [...new Set((dealInvestors ?? []).map(di => di.client_id).filter(Boolean))]
  const invoiceClientIds = [...new Set((rawInvoices ?? []).map(inv => inv.client_id).filter(Boolean))]
  const allClientIds     = [...new Set([...diClientIds, ...invoiceClientIds])]

  const { data: clientsData } = allClientIds.length > 0
    ? await supabase.from('clients').select('id, full_name, email').in('id', allClientIds)
    : { data: [] as { id: string; full_name: string; email: string | null }[] }

  const clientMap = new Map((clientsData ?? []).map(c => [c.id, c]))

  // Merge
  const mergedDealInvestors = (dealInvestors ?? []).map(di => ({
    ...di,
    clients: clientMap.get(di.client_id) ?? null,
  }))

  const mergedInvoices = (rawInvoices ?? []).map(inv => ({
    ...inv,
    clients: inv.client_id ? { full_name: clientMap.get(inv.client_id)?.full_name ?? null } : null,
  }))

  const deal = {
    ...rawDeal,
    companies:      companyData ?? null,
    deal_investors: mergedDealInvestors,
  }

  return (
    <DealDetail
      deal={deal as Record<string, unknown>}
      documents={(documents ?? []) as Record<string, unknown>[]}
      invoices={mergedInvoices as Record<string, unknown>[]}
    />
  )
}
