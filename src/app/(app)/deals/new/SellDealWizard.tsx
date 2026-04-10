'use client'

import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { SellStepBar } from './sell/SellStepBar'
import { SetupStep }   from './sell/SetupStep'
import type { SellDealType } from './sell/sellWizardTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  dealType:  SellDealType
  companies: Record<string, unknown>[]
  onBack:    () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SellDealWizard({ dealType, companies, onBack }: Props) {
  const title = dealType === 'full_exit' ? 'Full Exit' : 'Partial Exit'

  return (
    <div style={{ maxWidth: 1100 }}>
      <Breadcrumb items={[
        { label: 'Deals', href: '/deals' },
        { label: 'New deal', onClick: onBack },
        { label: title },
      ]} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>{title}</h1>
        <Link href="/deals" className="btn btn-secondary" style={{ fontSize: 12 }}>Cancel</Link>
      </div>

      <SellStepBar activeStep={0} />

      <SetupStep
        dealType={dealType}
        companies={companies as unknown as Parameters<typeof SetupStep>[0]['companies']}
        onBack={onBack}
      />
    </div>
  )
}
