'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatPercent, formatDate, getInitials, calcGainLoss } from '@/lib/utils'
import UpdateValuationModal from './UpdateValuationModal'
import SharePriceSection from './SharePriceSection'

interface Company {
  id: string
  name: string
  sector: string | null
  stage: string | null
  eis_eligible: boolean
  logo_url: string | null
  website: string | null
  description: string | null
  share_classes: unknown
}

interface Valuation {
  id: string
  share_price: number
  valuation_date: string
  notes: string | null
}

interface Investment {
  id: string
  share_class: string
  investment_date: string
  original_share_price: number
  shares_purchased: number
  sum_subscribed: number
  eis_status: string
  holding_entity: string | null
  holding_location: string
  status: string
  client_id: string
  clients: { id: string; full_name: string; lead_investor_id: string | null } | null
}

interface KpiDataRow {
  id: string
  kpi_name: string
  period: string | null
  period_date: string | null
  value: number
  unit: string | null
  auto_extracted: boolean
  manually_verified: boolean
}

interface Props {
  company: Company
  valuations: Valuation[]
  currentValuation: Valuation | null
  investments: Record<string, unknown>[]
  kpiData: KpiDataRow[]
  internalUpdates: Record<string, unknown>[]
  news: Record<string, unknown>[]
  initialAction: string | null
}

function CompanyAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return <img src={logoUrl} alt={name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain' }} />
  }
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 8,
      background: '#dff0f9', color: '#185fa5',
      fontSize: 16, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {getInitials(name)}
    </div>
  )
}

function StagePill({ stage }: { stage: string | null }) {
  if (!stage) return null
  const labels: Record<string, string> = {
    'pre-seed': 'Pre-seed', 'seed': 'Seed', 'series_a': 'Series A',
    'series_b': 'Series B', 'series_c': 'Series C', 'growth': 'Growth', 'late_stage': 'Late stage',
  }
  return <span className="pill pill-blue" style={{ fontSize: 10 }}>{labels[stage] ?? stage}</span>
}

export default function CompanyPage({
  company, valuations, currentValuation, investments,
  kpiData, initialAction,
}: Props) {
  const [showValuationModal, setShowValuationModal] = useState(initialAction === 'update_valuation')

  const inv = investments as unknown as Investment[]

  // Aggregate investment totals
  const currentPrice = currentValuation?.share_price ?? 0
  const totalInvested = inv.reduce((s, i) => s + i.sum_subscribed, 0)
  const currentValue = inv.reduce((s, i) => s + i.shares_purchased * (currentPrice || i.original_share_price), 0)
  const { change, pct } = calcGainLoss(totalInvested, currentValue)

  // Unique investors
  const investorSet = new Set(inv.map(i => i.client_id))
  const shareClasses = new Set(inv.map(i => i.share_class))

  // KPI summary — latest value per KPI (top 4)
  const latestKpis = useMemo(() => {
    const seen = new Set<string>()
    const result: KpiDataRow[] = []
    for (const row of kpiData) {
      if (seen.has(row.kpi_name)) continue
      seen.add(row.kpi_name)
      result.push(row)
      if (result.length === 4) break
    }
    return result
  }, [kpiData])

  // Previous period value per KPI for QoQ change
  const prevKpiValues = useMemo(() => {
    const counts: Record<string, number> = {}
    const result: Record<string, number> = {}
    for (const row of kpiData) {
      counts[row.kpi_name] = (counts[row.kpi_name] ?? 0) + 1
      if (counts[row.kpi_name] === 2) result[row.kpi_name] = row.value
    }
    return result
  }, [kpiData])

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/portfolio" style={{ color: '#888', textDecoration: 'none' }}>Portfolio</Link>
        {' › '}
        <span>{company.name}</span>
      </div>

      {/* Header */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <CompanyAvatar name={company.name} logoUrl={company.logo_url} />
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{company.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                {company.sector && <span style={{ fontSize: 11, color: '#888' }}>{company.sector}</span>}
                <StagePill stage={company.stage} />
                {company.eis_eligible && <span className="pill pill-green" style={{ fontSize: 10 }}>EIS eligible</span>}
                <span style={{ fontSize: 11, color: '#888' }}>{investorSet.size} investor{investorSet.size !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary">Add info</button>
            <button className="btn btn-secondary" onClick={() => setShowValuationModal(true)}>
              Update valuation
            </button>
            <button className="btn btn-secondary">Investor update</button>
            <Link href={`/portfolio/${company.id}/settings`} className="btn btn-secondary">Settings</Link>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Total invested</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>{formatCurrency(totalInvested)}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Current valuation</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>{formatCurrency(currentValue)}</div>
          <div style={{ fontSize: 11, marginTop: 3 }} className={change >= 0 ? 'text-positive' : 'text-negative'}>
            {change >= 0 ? '+' : ''}{formatCurrency(change)} ({formatPercent(pct)})
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Current share price</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>
            {currentValuation ? `£${currentValuation.share_price.toFixed(2)}` : '—'}
          </div>
          {currentValuation && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
              Updated {formatDate(currentValuation.valuation_date)}
            </div>
          )}
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Investors</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>{investorSet.size}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{shareClasses.size} share class{shareClasses.size !== 1 ? 'es' : ''}</div>
        </div>
      </div>

      {/* Share price chart */}
      <SharePriceSection
        companyId={company.id}
        valuations={valuations}
        investments={inv}
        shareClasses={[...shareClasses]}
      />

      {/* KPI cards */}
      {latestKpis.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Key metrics</div>
            <Link href={`/portfolio/${company.id}/kpis`} style={{ fontSize: 11, color: '#185fa5', textDecoration: 'none' }}>
              View full KPI history →
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(latestKpis.length, 4)}, 1fr)`, gap: 10 }}>
            {latestKpis.map(kpi => {
              const prev = prevKpiValues[kpi.kpi_name]
              const qoqChange = prev ? ((kpi.value - prev) / prev) * 100 : null
              return (
                <div key={kpi.kpi_name} className="card">
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>
                    {kpi.kpi_name}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#0f2744' }}>
                    {kpi.unit === '£' ? formatCurrency(kpi.value) : `${kpi.value.toLocaleString()}${kpi.unit ? ` ${kpi.unit}` : ''}`}
                  </div>
                  {qoqChange !== null && (
                    <div style={{ fontSize: 11, marginTop: 3 }} className={qoqChange >= 0 ? 'text-positive' : 'text-negative'}>
                      {qoqChange >= 0 ? '↑' : '↓'} {Math.abs(qoqChange).toFixed(1)}% QoQ
                    </div>
                  )}
                  {kpi.period && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{kpi.period}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Update Valuation Modal */}
      {showValuationModal && (
        <UpdateValuationModal
          companyId={company.id}
          companyName={company.name}
          currentPrice={currentValuation?.share_price ?? null}
          onClose={() => setShowValuationModal(false)}
        />
      )}
    </div>
  )
}
