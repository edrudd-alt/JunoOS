import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientRecord from './ClientRecord'
import type { ClientRow } from './ClientRecord'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientRecordPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // Query 1: client (everything depends on this)
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  // Query 2: group members (depends on client.lead_investor_id)
  const leadId = client.lead_investor_id ?? client.id
  const { data: allInGroup } = await supabase
    .from('clients')
    .select('id, full_name, entity_type, holding_location, kyc_status, lead_investor_id')
    .or(`id.eq.${leadId},lead_investor_id.eq.${leadId}`)

  const lead = (allInGroup?.find(c => c.id === leadId) ?? null) as ClientRow | null
  const linkedEntities = (allInGroup?.filter(c => c.id !== leadId) ?? []) as unknown as ClientRow[]
  const allGroupIds = [leadId, ...linkedEntities.map(e => e.id)]

  // Query 3: all independent queries in parallel — no embedded joins
  const [
    { data: portfolioRows },
    { data: rawInvestments },
    { data: documents },
    { data: updateRecipients },
    { data: notes },
    { data: membershipDocs },
    { data: pendingInvestments },
    { data: dealInvestorRows },
    { data: followUpNotes },
    { data: lastActivityRow },
    { data: relationshipRows },
    { data: feeSchedulesData },
  ] = await Promise.all([
    // Portfolio data per entity
    supabase
      .from('client_portfolio_summary')
      .select('*')
      .in('client_id', allGroupIds),

    // Investments — this client only, no status filter
    supabase
      .from('investments')
      .select(`
        id, share_class, investment_date, original_share_price,
        shares_purchased, sum_subscribed, eis_status, holding_entity,
        holding_location, status, company_id, transaction_type, fund_type
      `)
      .eq('client_id', id)
      .order('investment_date', { ascending: false }),

    // Documents — no join
    supabase
      .from('documents')
      .select('id, type, filename, storage_url, period, document_date, company_id')
      .or(`client_id.eq.${id}${allGroupIds.length > 1 ? `,client_id.in.(${allGroupIds.join(',')})` : ''}`)
      .order('document_date', { ascending: false }),

    // Updates sent — no join, include FK column for manual merge
    supabase
      .from('investor_update_recipients')
      .select('id, sent_at, investor_update_id')
      .eq('client_id', id)
      .order('sent_at', { ascending: false }),

    // Notes — no join, include created_by for manual merge
    supabase
      .from('client_notes')
      .select('id, note_text, created_at, created_by')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),

    // Membership documents — include company_id for EIS cert checks
    supabase
      .from('documents')
      .select('id, type, filename, storage_url, document_date, company_id')
      .eq('client_id', id)
      .in('type', ['kyc', 'poa', 'membership_agreement', 'suitability_assessment', 'source_of_funds', 'eis_certificate'])
      .order('document_date', { ascending: false }),

    // Pending investments — no join
    supabase
      .from('investments')
      .select('id, share_class, company_id')
      .in('client_id', allGroupIds)
      .eq('status', 'pending'),

    // Deal investors → deal IDs for this client only
    supabase
      .from('deal_investors')
      .select('deal_id')
      .eq('client_id', id),

    // Follow-up notes
    supabase
      .from('client_notes')
      .select('id, note_text, created_at')
      .eq('client_id', id)
      .or('note_text.ilike.%follow up%,note_text.ilike.%call back%,note_text.ilike.%chase%,note_text.ilike.%reminder%')
      .order('created_at', { ascending: false }),

    // Last activity from internal_updates
    supabase
      .from('internal_updates')
      .select('created_at')
      .eq('entity_type', 'client')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Client relationships — both directions
    supabase
      .from('client_relationships')
      .select('id, client_id, related_client_id, relationship_type, active, notes')
      .or(`client_id.eq.${id},related_client_id.eq.${id}`)
      .order('active', { ascending: false }),

    // Active fee schedules for assignment UI
    supabase
      .from('fee_schedules')
      .select('id, name')
      .eq('active', true)
      .order('name'),
  ])

  // Resolve names for related clients
  const relatedIds = [...new Set(
    (relationshipRows ?? []).flatMap(r => [
      (r as Record<string, unknown>).client_id as string,
      (r as Record<string, unknown>).related_client_id as string,
    ]).filter(cid => cid !== id)
  )]
  const { data: relatedClientsData } = relatedIds.length > 0
    ? await supabase.from('clients').select('id, full_name').in('id', relatedIds)
    : { data: [] as { id: string; full_name: string }[] }
  const relatedClientMap = new Map((relatedClientsData ?? []).map(c => [c.id, c.full_name]))
  const relationships = (relationshipRows ?? []).map(r => {
    const row = r as Record<string, unknown>
    const otherId = row.client_id === id ? row.related_client_id as string : row.client_id as string
    return { ...row, other_client_id: otherId, related_client_name: relatedClientMap.get(otherId) ?? '—' }
  })

  // Query 4a: active deals (depends on dealInvestorRows) — no join
  const dealIds = [...new Set((dealInvestorRows ?? []).map(d => (d as Record<string, unknown>).deal_id as string).filter(Boolean))]
  const { data: rawActiveDeals } = dealIds.length > 0
    ? await supabase
        .from('deals')
        .select('id, deal_type, status, company_id, created_at')
        .in('id', dealIds)
        .neq('status', 'complete')
    : { data: [] as { id: string; deal_type: string; status: string; company_id: string | null }[] }

  // Query 4b: all secondary lookups in parallel (now all company IDs are known)
  const investmentCids = [...new Set((rawInvestments ?? []).map(i => (i as Record<string, unknown>).company_id as string).filter(Boolean))]
  const documentCids   = [...new Set((documents ?? []).map(d => (d as Record<string, unknown>).company_id as string).filter(Boolean))]
  const pendingCids    = [...new Set((pendingInvestments ?? []).map(i => (i as Record<string, unknown>).company_id as string).filter(Boolean))]
  const dealCids       = [...new Set((rawActiveDeals ?? []).map(d => d.company_id).filter((c): c is string => Boolean(c)))]
  const allCids        = [...new Set([...investmentCids, ...documentCids, ...pendingCids, ...dealCids])]

  const updateIds  = [...new Set((updateRecipients ?? []).map(r => (r as Record<string, unknown>).investor_update_id as string).filter(Boolean))]
  const creatorIds = [...new Set((notes ?? []).map(n => (n as Record<string, unknown>).created_by as string).filter(Boolean))]

  const activeDealIds = (rawActiveDeals ?? []).map(d => d.id)

  const [
    { data: companiesData },
    { data: investorUpdatesData },
    { data: teamMembersData },
    { data: valuations },
    { data: allDealInvestorRows },
  ] = await Promise.all([
    allCids.length > 0
      ? supabase.from('companies').select('id, name, sector, stage').in('id', allCids)
      : { data: [] as { id: string; name: string; sector: string | null; stage: string | null }[] },
    updateIds.length > 0
      ? supabase.from('investor_updates').select('id, title, update_type, sent_at').in('id', updateIds)
      : { data: [] as { id: string; title: string; update_type: string; sent_at: string | null }[] },
    creatorIds.length > 0
      ? supabase.from('team_members').select('id, full_name').in('id', creatorIds)
      : { data: [] as { id: string; full_name: string }[] },
    investmentCids.length > 0
      ? supabase.from('company_current_valuations').select('company_id, share_price, valuation_date').in('company_id', investmentCids)
      : { data: [] as { company_id: string; share_price: number; valuation_date: string }[] },
    activeDealIds.length > 0
      ? supabase.from('deal_investors').select('deal_id').in('deal_id', activeDealIds)
      : { data: [] as { deal_id: string }[] },
  ])

  // Merge secondary data into results
  const companyMap    = new Map((companiesData ?? []).map(c => [c.id, c]))
  const updateMap     = new Map((investorUpdatesData ?? []).map(u => [u.id, u]))
  const teamMemberMap = new Map((teamMembersData ?? []).map(t => [t.id, t]))

  // Investor count per deal
  const investorCountByDeal: Record<string, number> = {}
  for (const di of allDealInvestorRows ?? []) {
    const did = (di as Record<string, unknown>).deal_id as string
    investorCountByDeal[did] = (investorCountByDeal[did] ?? 0) + 1
  }

  const investments = (rawInvestments ?? []).map(i => ({
    ...i,
    companies: companyMap.get((i as Record<string, unknown>).company_id as string) ?? null,
  }))

  const mergedDocuments = (documents ?? []).map(d => {
    const cid = (d as Record<string, unknown>).company_id as string | null
    return { ...d, companies: cid ? { name: companyMap.get(cid)?.name ?? null } : null }
  })

  const mergedUpdateRecipients = (updateRecipients ?? []).map(r => {
    const uid = (r as Record<string, unknown>).investor_update_id as string | null
    return { ...r, investor_updates: uid ? (updateMap.get(uid) ?? null) : null }
  })

  const mergedNotes = (notes ?? []).map(n => {
    const cby = (n as Record<string, unknown>).created_by as string | null
    return { ...n, team_members: cby ? { full_name: teamMemberMap.get(cby)?.full_name ?? null } : null }
  })

  const mergedPendingInvestments = (pendingInvestments ?? []).map(i => ({
    ...i,
    companies: companyMap.get((i as Record<string, unknown>).company_id as string) ?? null,
  }))

  const activeDeals = (rawActiveDeals ?? []).map(d => ({
    ...d,
    companies: d.company_id ? (companyMap.get(d.company_id) ?? null) : null,
    investor_count: investorCountByDeal[d.id] ?? 0,
  }))

  const lastActivity = (lastActivityRow as Record<string, unknown> | null)?.created_at as string | null
    ?? client.date_joined ?? null

  return (
    <ClientRecord
      client={client as unknown as ClientRow}
      lead={lead}
      linkedEntities={linkedEntities}
      portfolioRows={(portfolioRows ?? []) as unknown as Parameters<typeof ClientRecord>[0]['portfolioRows']}
      investments={investments as Record<string, unknown>[]}
      valuations={(valuations ?? []) as Record<string, unknown>[]}
      documents={mergedDocuments as Record<string, unknown>[]}
      updateRecipients={mergedUpdateRecipients as Record<string, unknown>[]}
      notes={mergedNotes as Record<string, unknown>[]}
      membershipDocs={(membershipDocs ?? []) as unknown as Parameters<typeof ClientRecord>[0]['membershipDocs']}
      pendingInvestments={mergedPendingInvestments as Record<string, unknown>[]}
      activeDeals={activeDeals as Record<string, unknown>[]}
      followUpNotes={(followUpNotes ?? []) as Record<string, unknown>[]}
      lastActivity={lastActivity}
      relationships={relationships as Record<string, unknown>[]}
      feeSchedules={(feeSchedulesData ?? []) as { id: string; name: string }[]}
    />
  )
}
