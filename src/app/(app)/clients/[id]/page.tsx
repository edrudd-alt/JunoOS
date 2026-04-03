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

  // Query 3: all independent queries in parallel
  const [
    { data: portfolioRows },
    { data: investments },
    { data: documents },
    { data: updateRecipients },
    { data: notes },
    { data: membershipDocs },
    { data: pendingInvestments },
    { data: dealInvestorRows },
    { data: followUpNotes },
    { data: lastActivityRow },
  ] = await Promise.all([
    // Portfolio data per entity
    supabase
      .from('client_portfolio_summary')
      .select('*')
      .in('client_id', allGroupIds),

    // Investments with company data (for Investments tab)
    supabase
      .from('investments')
      .select(`
        id, share_class, investment_date, original_share_price,
        shares_purchased, sum_subscribed, eis_status, holding_entity,
        holding_location, status,
        companies (id, name, sector, stage)
      `)
      .in('client_id', allGroupIds)
      .eq('status', 'active')
      .order('investment_date', { ascending: false }),

    // Documents
    supabase
      .from('documents')
      .select('id, type, filename, storage_url, period, document_date, company_id, companies(name)')
      .or(`client_id.eq.${id}${allGroupIds.length > 1 ? `,client_id.in.(${allGroupIds.join(',')})` : ''}`)
      .order('document_date', { ascending: false }),

    // Updates sent (investor_update_recipients)
    supabase
      .from('investor_update_recipients')
      .select(`
        id, sent_at,
        investor_updates (id, title, update_type, sent_at)
      `)
      .eq('client_id', id)
      .order('sent_at', { ascending: false }),

    // Notes
    supabase
      .from('client_notes')
      .select('id, note_text, created_at, team_members(full_name)')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),

    // Membership documents
    supabase
      .from('documents')
      .select('id, type, filename, storage_url, document_date')
      .eq('client_id', id)
      .in('type', ['kyc', 'poa', 'membership_agreement', 'suitability_assessment', 'source_of_funds'])
      .order('document_date', { ascending: false }),

    // Pending investments (awaiting deal completion)
    supabase
      .from('investments')
      .select('id, share_class, company_id, companies(id, name)')
      .in('client_id', allGroupIds)
      .eq('status', 'pending'),

    // Deal investors → active deals (second half handled below)
    supabase
      .from('deal_investors')
      .select('deal_id')
      .in('client_id', allGroupIds),

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
  ])

  // Query 4a: valuations (depends on investments result)
  const companyIds = [
    ...new Set(
      (investments ?? [])
        .map((i) => (i.companies as unknown as { id: string } | null)?.id)
        .filter((cid): cid is string => Boolean(cid))
    ),
  ]
  const { data: valuations } = companyIds.length > 0
    ? await supabase
        .from('company_current_valuations')
        .select('company_id, share_price, valuation_date')
        .in('company_id', companyIds)
    : { data: [] }

  // Query 4b: active deals (depends on dealInvestorRows result)
  const dealIds = [...new Set((dealInvestorRows ?? []).map(d => (d as Record<string, unknown>).deal_id as string))]
  const { data: activeDeals } = dealIds.length > 0
    ? await supabase
        .from('deals')
        .select('id, deal_type, status, companies(id, name)')
        .in('id', dealIds)
        .neq('status', 'complete')
    : { data: [] }

  const lastActivity = (lastActivityRow as Record<string, unknown> | null)?.created_at as string | null
    ?? client.date_joined ?? null

  return (
    <ClientRecord
      client={client as unknown as ClientRow}
      lead={lead}
      linkedEntities={linkedEntities}
      portfolioRows={(portfolioRows ?? []) as unknown as Parameters<typeof ClientRecord>[0]['portfolioRows']}
      investments={(investments ?? []) as Record<string, unknown>[]}
      valuations={(valuations ?? []) as Record<string, unknown>[]}
      documents={(documents ?? []) as Record<string, unknown>[]}
      updateRecipients={(updateRecipients ?? []) as Record<string, unknown>[]}
      notes={(notes ?? []) as Record<string, unknown>[]}
      membershipDocs={(membershipDocs ?? []) as unknown as Parameters<typeof ClientRecord>[0]['membershipDocs']}
      pendingInvestments={(pendingInvestments ?? []) as Record<string, unknown>[]}
      activeDeals={(activeDeals ?? []) as Record<string, unknown>[]}
      followUpNotes={(followUpNotes ?? []) as Record<string, unknown>[]}
      lastActivity={lastActivity}
    />
  )
}
