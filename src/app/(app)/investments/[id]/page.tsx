import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import InvestmentCockpit from './InvestmentCockpit'

export default async function InvestmentCockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: investment, error } = await supabase
    .from('investments')
    .select(`
      id, client_id, company_id, deal_id, share_class, share_class_id,
      investment_date, original_share_price, shares_purchased, sum_subscribed,
      eis_status, holding_entity, holding_location, held_by_entity_id,
      fee_rate, fee_amount, completion_date, status, transaction_type, fund_type
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('InvestmentCockpit query error:', JSON.stringify(error))
    return (
      <div style={{ padding: 32, color: '#a32d2d', fontFamily: 'monospace', fontSize: 12 }}>
        <strong>Investment failed to load.</strong><br />
        {JSON.stringify(error)}
      </div>
    )
  }
  if (!investment) notFound()

  // Parallel fetches — all available from investment row
  const [
    { data: deal },
    { data: company },
    { data: client },
    { data: valuation },
    { data: documents },
  ] = await Promise.all([
    investment.deal_id
      ? supabase
          .from('deals')
          .select('id, deal_type, share_class, share_price, eis_qualifying, completion_checklist, company_id')
          .eq('id', investment.deal_id)
          .maybeSingle()
      : { data: null },
    supabase
      .from('companies')
      .select('id, name')
      .eq('id', investment.company_id)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('id, full_name, email')
      .eq('id', investment.client_id)
      .maybeSingle(),
    supabase
      .from('company_current_valuations')
      .select('company_id, share_price, valuation_date')
      .eq('company_id', investment.company_id)
      .maybeSingle(),
    supabase
      .from('documents')
      .select('id, filename, type, storage_url, document_date')
      .eq('deal_id', investment.deal_id ?? '')
      .eq('client_id', investment.client_id)
      .order('document_date', { ascending: false }),
  ])

  // Sequential — needs held_by_entity_id from investment
  let heldByEntity: { full_name: string } | null = null
  if (investment.held_by_entity_id) {
    const { data } = await supabase
      .from('clients')
      .select('full_name')
      .eq('id', investment.held_by_entity_id)
      .maybeSingle()
    heldByEntity = data
  }

  return (
    <InvestmentCockpit
      investment={investment as Record<string, unknown>}
      deal={deal as Record<string, unknown> | null}
      company={company as Record<string, unknown> | null}
      client={client as Record<string, unknown> | null}
      heldByEntity={heldByEntity}
      currentValuation={valuation as Record<string, unknown> | null}
      documents={(documents ?? []) as Record<string, unknown>[]}
    />
  )
}
