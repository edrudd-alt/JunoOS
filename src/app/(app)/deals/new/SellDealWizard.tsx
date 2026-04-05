'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { SellStepBar } from './sell/SellStepBar'
import { SetupStep }   from './sell/SetupStep'
import { InvestorsStep } from './sell/InvestorsStep'
import type { SellDealType, SellSetupData } from './sell/sellWizardTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  dealType:    SellDealType
  companies:   Record<string, unknown>[]
  clients:     Record<string, unknown>[]
  investments: Record<string, unknown>[]
  onBack:      () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SellDealWizard({ dealType, companies, clients, investments, onBack }: Props) {
  const [step,      setStep]      = useState<0 | 1>(0)
  const [setupData, setSetupData] = useState<SellSetupData | null>(null)

  const isFullExit = dealType === 'full_exit'
  const title      = isFullExit ? 'Full Exit' : 'Partial Exit'

  function handleSetupContinue(data: SellSetupData) {
    setSetupData(data)
    setStep(1)
  }

  function handleInvestorsBack() {
    setStep(0)
  }

  return (
    <div style={{ maxWidth: 1200 }}>
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

      {/* Step bar — shows all 9 steps; wizard manages steps 0 and 1 */}
      <SellStepBar activeStep={step} />

      {step === 0 && (
        <SetupStep
          dealType={dealType}
          companies={companies as unknown as Parameters<typeof SetupStep>[0]['companies']}
          initialData={setupData ?? undefined}
          onContinue={handleSetupContinue}
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
