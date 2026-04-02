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

  // Fetch client
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  // Fetch linked entities if lead, or parent lead if linked
  const leadId = client.lead_investor_id ?? client.id
  const { data: allInGroup } = await supabase
    .from('clients')
    .select('id, full_name, entity_type, holding_location, kyc_status, lead_investor_id')
    .or(`id.eq.${leadId},lead_investor_id.eq.${leadId}`)

  const lead = (allInGroup?.find(c => c.id === leadId) ?? null) as ClientRow | null
  const linkedEntities = (allInGroup?.filter(c => c.id !== leadId) ?? []) as unknown as ClientRow[]

  // Portfolio data per entity
  const allGroupIds = [leadId, ...linkedEntities.map(e => e.id)]
  const { data: portfolioRows } = await supabase
    .from('client_portfolio_summary')
    .select('*')
    .in('client_id', allGroupIds)

  // Investments with company data (for Investments tab)
  const { data: investments } = await supabase
    .from('investments')
    .select(`
      id, share_class, investment_date, original_share_price,
      shares_purchased, sum_subscribed, eis_status, holding_entity,
      holding_location, status,
      companies (id, name, sector, stage)
    `)
    .in('client_id', allGroupIds)
    .eq('status', 'active')
    .order('investment_date', { ascending: false })

  // Latest valuations for each company in portfolio
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

  // Documents
  const { data: documents } = await supabase
    .from('documents')
    .select('id, type, filename, storage_url, period, document_date, company_id, companies(name)')
    .or(`client_id.eq.${id}${allGroupIds.length > 1 ? `,client_id.in.(${allGroupIds.join(',')})` : ''}`)
    .order('document_date', { ascending: false })

  // Updates sent (investor_update_recipients)
  const { data: updateRecipients } = await supabase
    .from('investor_update_recipients')
    .select(`
      id, sent_at,
      investor_updates (id, title, update_type, sent_at)
    `)
    .eq('client_id', id)
    .order('sent_at', { ascending: false })

  // Notes
  const { data: notes } = await supabase
    .from('client_notes')
    .select('id, note_text, created_at, team_members(full_name)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  // Membership documents
  const { data: membershipDocs } = await supabase
    .from('documents')
    .select('id, type, filename, storage_url, document_date')
    .eq('client_id', id)
    .in('type', ['kyc', 'poa', 'membership_agreement', 'suitability_assessment', 'source_of_funds'])
    .order('document_date', { ascending: false })

  // Pending investments (awaiting deal completion)
  const { data: pendingInvestments } = await supabase
    .from('investments')
    .select('id, share_class, company_id, companies(id, name)')
    .in('client_id', allGroupIds)
    .eq('status', 'pending')

  // Active deals for this client group
  const { data: dealInvestorRows } = await supabase
    .from('deal_investors')
    .select('deal_id')
    .in('client_id', allGroupIds)
  const dealIds = [...new Set((dealInvestorRows ?? []).map(d => (d as Record<string, unknown>).deal_id as string))]
  const { data: activeDeals } = dealIds.length > 0
    ? await supabase
        .from('deals')
        .select('id, deal_type, status, companies(id, name)')
        .in('id', dealIds)
        .neq('status', 'complete')
    : { data: [] }

  // Follow-up notes (contain chase / reminder language)
  const { data: followUpNotes } = await supabase
    .from('client_notes')
    .select('id, note_text, created_at')
    .eq('client_id', id)
    .or('note_text.ilike.%follow up%,note_text.ilike.%call back%,note_text.ilike.%chase%,note_text.ilike.%reminder%')
    .order('created_at', { ascending: false })

  // Last activity from internal_updates, fallback to date_joined
  const { data: lastActivityRow } = await supabase
    .from('internal_updates')
    .select('created_at')
    .eq('entity_type', 'client')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
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
