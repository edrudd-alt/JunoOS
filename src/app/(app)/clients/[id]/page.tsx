import { Suspense } from 'react'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientRecord from './ClientRecord'
import type { InvestmentRecord, NoteRecord, DocumentRecord, ValuationRecord, FeeScheduleRecord, FeeScheduleItemRecord, NomineeRecord, CompanyRecord, InvestmentDocRecord, InvestorUpdateRecord, TeamMemberRecord } from './ClientRecord'
import type { Client } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientRecordPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Fetch the requested client
  const { data: requestedClient } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!requestedClient) notFound()

  // 2. If this is a linked entity (not a lead), redirect to the lead
  //    with the entity pre-selected so the user lands in the right view.
  if (requestedClient.lead_investor_id) {
    redirect(`/clients/${requestedClient.lead_investor_id}?entity=${id}`)
  }

  const leadId = id

  // 3. Fetch the full client group (lead + all linked entities) in one query
  const { data: groupData } = await supabase
    .from('clients')
    .select('*')
    .or(`id.eq.${leadId},lead_investor_id.eq.${leadId}`)

  const lead = (groupData ?? []).find(c => c.id === leadId) as Client | undefined
  if (!lead) notFound()

  const linkedEntities = (groupData ?? [])
    .filter(c => c.id !== leadId) as Client[]

  const allGroupIds = (groupData ?? []).map(c => c.id)

  // 4. Parallel queries — all keyed off allGroupIds
  const [
    { data: investmentsData },
    { data: notesData },
    { data: documentsData },
    { data: feeSchedulesData },
    { data: investmentDocsData },
    { data: updateRecipientsData },
  ] = await Promise.all([
    supabase
      .from('investments')
      .select(
        'id, client_id, company_id, share_class, investment_date, original_share_price, ' +
        'shares_purchased, sum_subscribed, eis_status, holding_location, holding_entity, ' +
        'nominee_id, status, transaction_type, fund_type',
      )
      .in('client_id', allGroupIds)
      .order('investment_date', { ascending: false }),

    supabase
      .from('client_notes')
      .select('id, client_id, note_text, flag_for_followup, created_by, created_at')
      .in('client_id', allGroupIds)
      .order('created_at', { ascending: false }),

    // Membership documents used for the status strip (KYC/POA pills) and Overview tab
    supabase
      .from('documents')
      .select('id, client_id, type, filename, storage_url, document_date')
      .in('client_id', allGroupIds)
      .in('type', ['kyc', 'poa', 'membership_agreement', 'suitability_assessment', 'source_of_funds']),

    supabase
      .from('fee_schedules')
      .select('id, name')
      .eq('active', true)
      .order('name'),

    // Investment documents (application forms, EIS certs, tx statements, etc.)
    supabase
      .from('documents')
      .select('id, client_id, company_id, type, filename, storage_url, document_date, version')
      .in('client_id', allGroupIds)
      .in('type', ['application_form', 'eis_certificate', 'transaction_statement', 'exit_statement', 'side_letter', 'invoice'])
      .eq('superseded', false)
      .order('document_date', { ascending: false }),

    // Recipient records: used to identify which investor_updates to fetch
    supabase
      .from('investor_update_recipients')
      .select('investor_update_id, client_id')
      .in('client_id', allGroupIds)
      .eq('included', true),
  ])

  // 5. Fetch current valuations, fee items, nominees, companies, team members, and investor updates
  const typedInvestments  = (investmentsData ?? [])     as unknown as InvestmentRecord[]
  const typedInvestmentDocs = (investmentDocsData ?? []) as unknown as InvestmentDocRecord[]

  // Company IDs from investments + investment documents
  const companyIds = [
    ...new Set([
      ...typedInvestments.map(i => i.company_id).filter(Boolean),
      ...typedInvestmentDocs.map(d => d.company_id).filter((id): id is string => id != null),
    ]),
  ]

  // Investor update IDs from recipient records
  const updateIds = [
    ...new Set((updateRecipientsData ?? []).map(r => r.investor_update_id)),
  ]

  // Distinct non-null nominee IDs: entity defaults + investment-level overrides
  const nomineeIds = [
    ...new Set([
      ...(groupData ?? [])
        .map(c => c.default_nominee_id as string | null)
        .filter((id): id is string => id != null),
      ...typedInvestments
        .map(i => i.nominee_id)
        .filter((id): id is string => id != null),
    ]),
  ]

  const [
    { data: valuationsData },
    { data: feeItemsData },
    { data: nomineesData },
    { data: companiesData },
    { data: teamMembersData },
    { data: investorUpdatesData },
  ] = await Promise.all([
    companyIds.length > 0
      ? supabase
          .from('company_current_valuations')
          .select('company_id, share_price, valuation_date')
          .in('company_id', companyIds)
      : Promise.resolve({ data: [] as { company_id: string; share_price: number; valuation_date: string }[] }),

    // Fee items for the lead's schedule (for displaying the rate in Contact Details)
    lead.fee_schedule_id
      ? supabase
          .from('fee_schedule_items')
          .select('fee_type, rate, label')
          .eq('fee_schedule_id', lead.fee_schedule_id)
          .eq('fee_type', 'buy')
      : Promise.resolve({ data: [] as { fee_type: string; rate: number; label: string }[] }),

    nomineeIds.length > 0
      ? supabase
          .from('nominees')
          .select('id, name')
          .in('id', nomineeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),

    companyIds.length > 0
      ? supabase
          .from('companies')
          .select('id, name, logo_url, sector')
          .in('id', companyIds)
      : Promise.resolve({ data: [] as CompanyRecord[] }),

    supabase.from('team_members').select('id, full_name, initials'),

    updateIds.length > 0
      ? supabase
          .from('investor_updates')
          .select('id, company_id, update_type, title, sent_at, created_by')
          .in('id', updateIds)
          .order('sent_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; company_id: string; update_type: string; title: string | null; sent_at: string | null; created_by: string | null }[] }),
  ])

  // Merge recipients into investor updates
  const recipientsByUpdateId = new Map<string, string[]>()
  ;(updateRecipientsData ?? []).forEach(r => {
    if (!recipientsByUpdateId.has(r.investor_update_id)) {
      recipientsByUpdateId.set(r.investor_update_id, [])
    }
    recipientsByUpdateId.get(r.investor_update_id)!.push(r.client_id)
  })
  const typedInvestorUpdates: InvestorUpdateRecord[] = (investorUpdatesData ?? []).map(
    (u: { id: string; company_id: string; update_type: string; title: string | null; sent_at: string | null; created_by: string | null }) => ({
      ...u,
      recipient_client_ids: recipientsByUpdateId.get(u.id) ?? [],
    }),
  )

  return (
    <Suspense>
      <ClientRecord
        lead={lead}
        linkedEntities={linkedEntities}
        investments={typedInvestments}
        notes={(notesData ?? []) as unknown as NoteRecord[]}
        documents={(documentsData ?? []) as unknown as DocumentRecord[]}
        valuations={(valuationsData ?? []) as unknown as ValuationRecord[]}
        feeSchedules={(feeSchedulesData ?? []) as unknown as FeeScheduleRecord[]}
        feeScheduleItems={(feeItemsData ?? []) as unknown as FeeScheduleItemRecord[]}
        nominees={(nomineesData ?? []) as unknown as NomineeRecord[]}
        companies={(companiesData ?? []) as unknown as CompanyRecord[]}
        investmentDocs={typedInvestmentDocs}
        investorUpdates={typedInvestorUpdates}
        teamMembers={(teamMembersData ?? []) as unknown as TeamMemberRecord[]}
      />
    </Suspense>
  )
}
