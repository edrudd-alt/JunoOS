import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import EditInvestorsClient from './EditInvestorsClient'
import type { SetupData }    from '../../new/buy/buyWizardTypes'
import type { SellSetupData } from '../../new/sell/sellWizardTypes'

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: deal } = await supabase
    .from('deals')
    .select('id, deal_type, status, company_id, share_price, share_class, investment_date, eis_qualifying, completion_checklist, notes, companies(id, name)')
    .eq('id', id)
    .maybeSingle()

  if (!deal) return notFound()

  if (deal.status === 'complete') {
    return (
      <div style={{ padding: 32, fontSize: 13, color: '#888' }}>
        This deal is complete and cannot be edited.
      </div>
    )
  }

  const isBuyDeal  = deal.deal_type === 'new_investment' || deal.deal_type === 'follow_on'
  const isSellDeal = deal.deal_type === 'full_exit'      || deal.deal_type === 'partial_exit'

  if (!isBuyDeal && !isSellDeal) {
    redirect(`/deals/${id}`)
  }

  const [{ data: clients }, { data: investments }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, email, default_fee_rate, tax_status, lead_investor_id, fund_type, active_fund_type')
      .order('full_name'),
    supabase
      .from('investments')
      .select('id, client_id, company_id, share_class, shares_purchased, original_share_price, sum_subscribed, eis_status, transaction_type, investment_date')
      .eq('status', 'active'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const company     = deal.companies as any
  const cc          = (deal.completion_checklist ?? {}) as Record<string, unknown>
  const companyName = company?.name ?? ''

  if (isBuyDeal) {
    const setupData: SetupData = {
      companyId:      deal.company_id   ?? '',
      companyName,
      shareClass:     deal.share_class  ?? '',
      sharePrice:     String(deal.share_price ?? ''),
      investmentDate: deal.investment_date ?? '',
      eisQualifying:  (deal.eis_qualifying as 'yes' | 'no' | 'tbc') ?? 'tbc',
    }
    return (
      <EditInvestorsClient
        dealTypeCategory="buy"
        dealType={deal.deal_type as 'new_investment' | 'follow_on'}
        dealId={id}
        setupData={setupData}
        clients={(clients ?? []) as Record<string, unknown>[]}
        investments={(investments ?? []) as Record<string, unknown>[]}
        existingInvestorData={(cc.investor_data ?? {}) as Record<string, unknown>}
      />
    )
  }

  // Sell deal
  const setupData: SellSetupData = {
    companyId:          deal.company_id ?? '',
    companyName,
    grossPricePerShare: String(deal.share_price ?? ''),
    saleDate:           deal.investment_date ?? '',
    dealCosts:          cc.deal_costs != null ? String(cc.deal_costs) : '',
    netProceedsMethod:  (cc.net_proceeds_method as SellSetupData['netProceedsMethod']) ?? 'gross_less_costs',
    netPricePerShare:   cc.net_price_per_share != null ? String(cc.net_price_per_share) : '',
    totalNetProceeds:   cc.total_net_proceeds  != null ? String(cc.total_net_proceeds)  : '',
    shareClass:         deal.share_class ?? '',
    notes:              deal.notes ?? '',
  }

  return (
    <EditInvestorsClient
      dealTypeCategory="sell"
      dealType={deal.deal_type as 'full_exit' | 'partial_exit'}
      dealId={id}
      setupData={setupData}
      clients={(clients ?? []) as Record<string, unknown>[]}
      investments={(investments ?? []) as Record<string, unknown>[]}
      existingInvestorData={(cc.investor_data ?? {}) as Record<string, unknown>}
    />
  )
}
