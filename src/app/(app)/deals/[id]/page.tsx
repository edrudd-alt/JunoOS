import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DealDetail from './DealDetail'

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch deal without joins
  const { data: rawDeal, error: dealError } = await supabase
    .from('deals')
    .select('id, deal_type, status, created_at, investment_amount, share_price, share_class, share_class_id, investment_date, eis_qualifying, completion_checklist, company_id')
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
    { data: rawBookbuildInitial },
    { data: allClientsData },
    { data: dealInvestmentsData },
  ] = await Promise.all([
    supabase.from('deal_investors').select('id, amount, signing_status, poa_held, client_id').eq('deal_id', id),
    rawDeal.company_id
      ? supabase.from('companies').select('id, name').eq('id', rawDeal.company_id).maybeSingle()
      : { data: null },
    supabase.from('documents').select('id, filename, type, storage_url, document_date').eq('deal_id', id).order('document_date', { ascending: false }),
    supabase.from('invoices').select('id, client_id, amount, status, issued_at').eq('deal_id', id),
    supabase.from('bookbuilds').select('id, deal_id, company_id, target_raise, status').eq('deal_id', id).maybeSingle(),
    supabase.from('clients').select('id, full_name, email, default_fee_rate, fund_type').order('full_name'),
    supabase.from('investments').select('id, client_id, sum_subscribed, shares_purchased, status, completion_date').eq('deal_id', id),
  ])

  // Build a map from allClientsData for all name lookups
  const allClientsMap = new Map(
    ((allClientsData ?? []) as { id: string; full_name: string; email: string | null }[]).map(c => [c.id, c]),
  )

  // Auto-populate bookbuild for follow-on deals with no bookbuild yet
  let rawBookbuild = rawBookbuildInitial
  if (rawDeal.deal_type === 'follow_on' && !rawBookbuild && rawDeal.company_id) {
    try {
      // Fetch active investments for this company to get existing investors
      const { data: existingInvs } = await supabase
        .from('investments')
        .select('client_id, sum_subscribed, investment_date')
        .eq('company_id', rawDeal.company_id)
        .eq('status', 'active')
        .order('investment_date', { ascending: false })

      // De-duplicate by client_id — keep most recent investment per client
      const byClient = new Map<string, { client_id: string; sum_subscribed: number }>()
      for (const inv of existingInvs ?? []) {
        if (!byClient.has(inv.client_id)) {
          byClient.set(inv.client_id, { client_id: inv.client_id, sum_subscribed: inv.sum_subscribed ?? 0 })
        }
      }

      // Create the bookbuild record
      const { data: newBookbuild } = await supabase
        .from('bookbuilds')
        .insert({ deal_id: id, company_id: rawDeal.company_id, status: 'open' })
        .select('id, deal_id, company_id, target_raise, status')
        .single()

      if (newBookbuild && byClient.size > 0) {
        await supabase.from('bookbuild_entries').insert(
          [...byClient.values()].map(inv => ({
            bookbuild_id:      newBookbuild.id,
            company_id:        rawDeal.company_id,
            client_id:         inv.client_id,
            indicative_amount: inv.sum_subscribed || null,
            status:            'interested',
          })),
        )
      }

      rawBookbuild = newBookbuild
    } catch (e) {
      console.error('Auto-populate bookbuild failed:', e)
    }
  }

  // Bookbuild entries (sequential — needs bookbuild id)
  let rawEntries: Record<string, unknown>[] = []
  if (rawBookbuild) {
    const { data: entries } = await supabase
      .from('bookbuild_entries')
      .select('id, bookbuild_id, client_id, investing_vehicle_id, indicative_amount, indicative_shares, status, notes, updated_at')
      .eq('bookbuild_id', (rawBookbuild as Record<string, unknown>).id as string)
      .order('created_at')
    rawEntries = (entries ?? []) as Record<string, unknown>[]
  }

  const mergedEntries = rawEntries.map(e => ({
    ...e,
    client_name:            allClientsMap.get(e.client_id as string)?.full_name ?? 'Unknown',
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
    <Suspense>
      <DealDetail
        deal={deal as Record<string, unknown>}
        documents={(documents ?? []) as Record<string, unknown>[]}
        invoices={mergedInvoices as Record<string, unknown>[]}
        bookbuild={bookbuild}
        allClients={(allClientsData ?? []) as Record<string, unknown>[]}
        dealInvestments={(dealInvestmentsData ?? []) as Record<string, unknown>[]}
      />
    </Suspense>
  )
}
