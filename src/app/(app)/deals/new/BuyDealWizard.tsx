'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { StepBar }    from './buy/StepBar'
import { SetupStep }  from './buy/SetupStep'
import { InvestorsStep } from './buy/InvestorsStep'
import type { BuyDealType, SetupData } from './buy/buyWizardTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  dealType:    BuyDealType
  companies:   Record<string, unknown>[]
  clients:     Record<string, unknown>[]
  investments: Record<string, unknown>[]
  onBack:      () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BuyDealWizard({ dealType, companies, clients, investments, onBack }: Props) {
  const [step,      setStep]      = useState<0 | 1>(0)
  const [setupData, setSetupData] = useState<SetupData | null>(null)

  const isFollowOn = dealType === 'follow_on'
  const title      = isFollowOn ? 'Follow-on Investment' : 'New Investment'

  function handleSetupContinue(data: SetupData) {
    setSetupData(data)
    setStep(1)
  }

  function handleInvestorsBack() {
    setStep(0)
  }

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
          {setupData?.companyName && step === 1 && (
            <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{setupData.companyName}</p>
          )}
        </div>
        <Link href="/deals" className="btn btn-secondary" style={{ fontSize: 12 }}>Cancel</Link>
      </div>

      {/* Step bar — shows all 7 steps; wizard manages steps 0 and 1 */}
      <StepBar activeStep={step} />

      {step === 0 && (
        <SetupStep
          dealType={dealType}
          companies={companies as unknown as Parameters<typeof SetupStep>[0]['companies']}
          initialData={setupData ?? undefined}
          onBack={onBack}
        />
      )}

      {step === 1 && setupData && (
        <InvestorsStep
          dealType={dealType}
          setupData={setupData}
          clients={clients}
          investments={investments}
          onBack={handleInvestorsBack}
        />
      )}
    </div>
  )
}
