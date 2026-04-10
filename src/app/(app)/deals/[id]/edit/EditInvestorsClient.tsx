'use client'

import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/Breadcrumb'
import { StepBar }    from '../../new/buy/StepBar'
import { InvestorsStep as BuyInvestorsStep } from '../../new/buy/InvestorsStep'
import type { SetupData, BuyDealType } from '../../new/buy/buyWizardTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  dealTypeCategory:     'buy'
  dealType:             BuyDealType
  dealId:               string
  setupData:            SetupData
  clients:              Record<string, unknown>[]
  investments:          Record<string, unknown>[]
  existingInvestorData: Record<string, unknown>
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  new_investment: 'New Investment',
  follow_on:      'Follow-on Investment',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditInvestorsClient(props: Props) {
  const router      = useRouter()
  const { dealId, clients, investments, existingInvestorData } = props
  const title       = DEAL_TYPE_LABELS[props.dealType] ?? props.dealType
  const companyName = props.setupData.companyName ?? ''

  return (
    <div style={{ maxWidth: 1200 }}>
      <Breadcrumb items={[
        { label: 'Deals',   href: '/deals' },
        { label: title,     href: `/deals/${dealId}` },
        { label: 'Edit investors' },
      ]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Edit investors</h1>
        {companyName && (
          <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{companyName}</p>
        )}
      </div>

      <StepBar activeStep={1} />
      <BuyInvestorsStep
        dealType={props.dealType}
        setupData={props.setupData}
        clients={clients}
        investments={investments}
        existingDealId={dealId}
        existingInvestorData={existingInvestorData as Record<string, { name?: string; shares?: number; shareClass?: string; eis?: string; poaHeld?: boolean; feeRate?: number; currentShares?: number; fundType?: string }>}
        onBack={() => router.push(`/deals/${dealId}`)}
      />
    </div>
  )
}
