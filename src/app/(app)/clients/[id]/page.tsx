import { Suspense } from 'react'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientRecord from './ClientRecord'
import type { InvestmentRecord, NoteRecord, DocumentRecord, ValuationRecord } from './ClientRecord'
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
  ] = await Promise.all([
    supabase
      .from('investments')
      .select(
        'id, client_id, company_id, share_class, investment_date, original_share_price, ' +
        'shares_purchased, sum_subscribed, eis_status, holding_location, holding_entity, ' +
        'status, transaction_type, fund_type',
      )
      .in('client_id', allGroupIds)
      .order('investment_date', { ascending: false }),

    supabase
      .from('client_notes')
      .select('id, client_id, note_text, flag_for_followup, created_by, created_at')
      .in('client_id', allGroupIds)
      .order('created_at', { ascending: false }),

    // Membership documents used for the status strip (KYC/POA pills)
    supabase
      .from('documents')
      .select('id, client_id, type, filename, storage_url, document_date')
      .in('client_id', allGroupIds)
      .in('type', ['kyc', 'poa', 'membership_agreement', 'suitability_assessment', 'source_of_funds']),
  ])

  // 5. Fetch current valuations — needs investment company IDs first
  const typedInvestments = (investmentsData ?? []) as unknown as InvestmentRecord[]
  const companyIds = [
    ...new Set(typedInvestments.map(i => i.company_id).filter(Boolean)),
  ]

  const { data: valuationsData } = companyIds.length > 0
    ? await supabase
        .from('company_current_valuations')
        .select('company_id, share_price, valuation_date')
        .in('company_id', companyIds)
    : { data: [] as { company_id: string; share_price: number; valuation_date: string }[] }

  return (
    <Suspense>
      <ClientRecord
        lead={lead}
        linkedEntities={linkedEntities}
        investments={typedInvestments}
        notes={(notesData ?? []) as unknown as NoteRecord[]}
        documents={(documentsData ?? []) as unknown as DocumentRecord[]}
        valuations={(valuationsData ?? []) as unknown as ValuationRecord[]}
      />
    </Suspense>
  )
}
