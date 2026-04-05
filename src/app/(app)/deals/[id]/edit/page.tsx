import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import SaleDealForm, { type ExistingSaleDeal } from '../../new/SaleDealForm'

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: rawDeal },
    { data: companies },
    { data: clients },
    { data: investments },
  ] = await Promise.all([
    // Fetch deal without the nested clients join
    supabase
      .from('deals')
      .select('id, deal_type, status, company_id, share_class, share_price, investment_date, eis_qualifying, completion_checklist')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('companies').select('id, name, share_classes').order('name'),
    supabase.from('clients')
      .select('id, full_name, email, default_fee_rate, tax_status, lead_investor_id, fund_type, active_fund_type')
      .order('full_name'),
    supabase.from('investments')
      .select('id, client_id, company_id, share_class, shares_purchased, original_share_price, sum_subscribed, eis_status')
      .eq('status', 'active'),
  ])

  if (!rawDeal) return notFound()
  if (rawDeal.status === 'complete') {
    return (
      <div style={{ padding: 32, fontSize: 13, color: '#888' }}>
        This deal is complete and cannot be edited.
      </div>
    )
  }

  // Fetch deal_investors separately and merge with clients data
  const { data: dealInvestors } = await supabase
    .from('deal_investors')
    .select('id, client_id, amount, poa_held, signing_status')
    .eq('deal_id', id)

  // Reuse the already-fetched clients array for the lookup (avoids extra query)
  const clientsMap = new Map((clients ?? []).map(c => [c.id, c]))
  const mergedDealInvestors = (dealInvestors ?? []).map(di => ({
    ...di,
    clients: clientsMap.get(di.client_id) ?? null,
  }))

  const deal = { ...rawDeal, deal_investors: mergedDealInvestors }

  const backHref = `/deals/${id}`

  // Buy deals: edit functionality is handled within the new deal workflow
  if (deal.deal_type === 'new_investment' || deal.deal_type === 'follow_on') {
    redirect(backHref)
  }

  if (deal.deal_type === 'full_exit' || deal.deal_type === 'partial_exit') {
    return (
      <SaleDealForm
        dealType={deal.deal_type as 'full_exit' | 'partial_exit'}
        companies={(companies ?? []) as Record<string, unknown>[]}
        clients={(clients ?? []) as Record<string, unknown>[]}
        investments={(investments ?? []) as Record<string, unknown>[]}
        backHref={backHref}
        existingDeal={deal as unknown as ExistingSaleDeal}
      />
    )
  }

  // KYC / side_letter / membership — redirect to deal page (wizard doesn't support edit)
  return (
    <div style={{ padding: 32, fontSize: 13, color: '#888' }}>
      Editing this deal type is not supported here.
    </div>
  )
}
