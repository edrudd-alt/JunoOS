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
    { data: rawBookbuild },
    { data: allClientsData },
  ] = await Promise.all([
    supabase.from('deal_investors').select('id, amount, signing_status, poa_held, client_id').eq('deal_id', id),
    rawDeal.company_id
      ? supabase.from('companies').select('id, name').eq('id', rawDeal.company_id).maybeSingle()
      : { data: null },
    supabase.from('documents').select('id, filename, type, storage_url, document_date').eq('deal_id', id).order('document_date', { ascending: false }),
    supabase.from('invoices').select('id, client_id, amount, status, issued_at').eq('deal_id', id),
    supabase.from('bookbuilds').select('id, deal_id, company_id, target_raise, status').eq('deal_id', id).maybeSingle(),
    supabase.from('clients').select('id, full_name, email').order('full_name'),
  ])

  // Build a map from allClientsData for all name lookups
  const allClientsMap = new Map(
    ((allClientsData ?? []) as { id: string; full_name: string; email: string | null }[]).map(c => [c.id, c]),
  )

  // Bookbuild entries (sequential — needs bookbuild id)
  let rawEntries: Record<string, unknown>[] = []
  if (rawBookbuild) {
    const { data: entries } = await supabase
      .from('bookbuild_entries')
      .select('id, bookbuild_id, client_id, investing_vehicle_id, indicative_amount, status, notes, updated_at')
      .eq('bookbuild_id', (rawBookbuild as Record<string, unknown>).id as string)
      .order('created_at')
    rawEntries = (entries ?? []) as Record<string, unknown>[]
  }

  const mergedEntries = rawEntries.map(e => ({
    ...e,
    client_name:           allClientsMap.get(e.client_id as string)?.full_name ?? 'Unknown',
    investing_vehicle_name: e.investing_vehicle_id
      ? (allClientsMap.get(e.investing_vehicle_id as string)?.full_name ?? null)
      : null,
  }))

  const bookbuild = rawBookbuild
    ? { ...(rawBookbuild as Record<string, unknown>), entries: mergedEntries }
    : null

  // Collect client IDs needed for deal_investors + invoices merges
  const diClientIds      = [...new Set((dealInvestors ?? []).map(di => di.client_id).filter(Boolean))]
  const invoiceClientIds = [...new Set((rawInvoices ?? []).map(inv => inv.client_id).filter(Boolean))]
  const allClientIds     = [...new Set([...diClientIds, ...invoiceClientIds])]

  // Re-use allClientsMap to avoid a second query
  const clientMap = new Map(
    allClientIds.map(cid => [cid, allClientsMap.get(cid)]).filter((pair): pair is [string, { id: string; full_name: string; email: string | null }] => !!pair[1]),
  )

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
      bookbuild={bookbuild}
      allClients={(allClientsData ?? []) as Record<string, unknown>[]}
    />
  )
}
