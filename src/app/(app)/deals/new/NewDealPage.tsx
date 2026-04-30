'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { StepBar }    from './buy/StepBar'
import { SetupStep }  from './buy/SetupStep'
import SellDealWizard from './SellDealWizard'
import type { BuyDealType } from './buy/buyWizardTypes'

type DealTypeValue = BuyDealType | 'full_exit' | 'partial_exit'

interface DealTypeConfig {
  value: DealTypeValue
  label: string
  description: string
  group: 'buy' | 'sale' | 'other'
  color: string
}

const DEAL_TYPES: DealTypeConfig[] = [
  {
    value: 'new_investment',
    label: 'New Investment',
    description: 'First-time investment in a company',
    group: 'buy',
    color: '#1d9e75',
  },
  {
    value: 'follow_on',
    label: 'Follow-on Investment',
    description: 'Additional investment in an existing holding',
    group: 'buy',
    color: '#1d9e75',
  },
  {
    value: 'full_exit',
    label: 'Full Exit',
    description: 'Full sale of all shares in a company',
    group: 'sale',
    color: '#a32d2d',
  },
  {
    value: 'partial_exit',
    label: 'Partial Exit',
    description: 'Sell a portion of shares in a company',
    group: 'sale',
    color: '#e8a820',
  },
]

const GROUP_LABELS: Record<string, string> = {
  buy:   'Investments',
  sale:  'Exits',
  other: 'Other',
}

interface Props {
  companies: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  investments: Record<string, unknown>[]
}

export default function NewDealPage({ companies }: Props) {
  const [selectedType, setSelectedType] = useState<DealTypeValue | null>(null)

  if (selectedType === 'new_investment' || selectedType === 'follow_on') {
    const isFollowOn = selectedType === 'follow_on'
    const title      = isFollowOn ? 'Follow-on Investment' : 'New Investment'
    return (
      <div style={{ maxWidth: 1100 }}>
        <Breadcrumb items={[
          { label: 'Deals', href: '/deals' },
          { label: 'New deal', onClick: () => setSelectedType(null) },
          { label: title },
        ]} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>{title}</h1>
          <Link href="/deals" className="btn btn-secondary" style={{ fontSize: 12 }}>Cancel</Link>
        </div>
        <StepBar activeStep={0} />
        <SetupStep
          dealType={selectedType}
          companies={companies as unknown as Parameters<typeof SetupStep>[0]['companies']}
          onBack={() => setSelectedType(null)}
        />
      </div>
    )
  }

  if (selectedType === 'full_exit' || selectedType === 'partial_exit') {
    return (
      <SellDealWizard
        dealType={selectedType}
        companies={companies}
        onBack={() => setSelectedType(null)}
      />
    )
  }

  // Deal type selector
  const groups = ['buy', 'sale'] as const

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/deals" style={{ color: '#888', textDecoration: 'none' }}>Deals</Link>
        {' › '}New deal
      </div>
      <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>New deal</h1>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 28px' }}>Select the type of deal you want to create</p>

      {groups.map(group => {
        const types = DEAL_TYPES.filter(t => t.group === group)
        return (
          <div key={group} style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: '#aaa', marginBottom: 10,
            }}>
              {GROUP_LABELS[group]}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {types.map(dt => (
                <button
                  key={dt.value}
                  onClick={() => setSelectedType(dt.value)}
                  style={{
                    textAlign: 'left',
                    padding: '16px 18px',
                    background: '#fff',
                    border: '0.5px solid #e8e7e0',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = dt.color
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${dt.color}22`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#e8e7e0'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: dt.color + '18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 10,
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: dt.color }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', marginBottom: 4 }}>
                    {dt.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                    {dt.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
