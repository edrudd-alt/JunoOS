'use client'

import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { StepBar }    from './buy/StepBar'
import { SetupStep }  from './buy/SetupStep'
import type { BuyDealType } from './buy/buyWizardTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  dealType:  BuyDealType
  companies: Record<string, unknown>[]
  onBack:    () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BuyDealWizard({ dealType, companies, onBack }: Props) {
  const isFollowOn = dealType === 'follow_on'
  const title      = isFollowOn ? 'Follow-on Investment' : 'New Investment'

  return (
    <div style={{ maxWidth: 1100 }}>
      <Breadcrumb items={[
        { label: 'Deals', href: '/deals' },
        { label: 'New deal', onClick: onBack },
        { label: title },
      ]} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>{title}</h1>
        </div>
        <Link href="/deals" className="btn btn-secondary" style={{ fontSize: 12 }}>Cancel</Link>
      </div>

      {/* Step bar — step 0 (Setup) is the only wizard-managed step; remaining steps live on the deal page */}
      <StepBar activeStep={0} />

      <SetupStep
        dealType={dealType}
        companies={companies as unknown as Parameters<typeof SetupStep>[0]['companies']}
        onBack={onBack}
      />
    </div>
  )
}
