'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatPercent, formatDate, getInitials, calcGainLoss } from '@/lib/utils'

type SortKey = 'valuation' | 'change' | 'investors' | 'name' | 'last_updated'

interface Company {
  id: string
  name: string
  sector: string | null
  stage: string | null
  eis_eligible: boolean
  logo_url: string | null
}

interface PortfolioData {
  totalInvested: number
  currentValue: number
  gainLoss: number
  investorCount: number
}

interface KpiItem {
  name: string
  value: number
  unit: string | null
}

interface Props {
  companies: Company[]
  portfolioByCompany: Record<string, PortfolioData>
  valuationMap: Record<string, { share_price: number; valuation_date: string }>
  kpiByCompany: Record<string, KpiItem[]>
}

function CompanyAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }}
      />
    )
  }
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 6,
      background: '#dff0f9', color: '#185fa5',
      fontSize: 11, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {getInitials(name)}
    </div>
  )
}

function StagePill({ stage }: { stage: string | null }) {
  if (!stage) return null
  const labels: Record<string, string> = {
    'pre-seed': 'Pre-seed', 'seed': 'Seed', 'series_a': 'Series A',
    'series_b': 'Series B', 'series_c': 'Series C',
    'growth': 'Growth', 'late_stage': 'Late stage',
  }
  return <span className="pill pill-blue" style={{ fontSize: 10 }}>{labels[stage] ?? stage}</span>
}

function isStale(dateStr: string | undefined): boolean {
  if (!dateStr) return true
  const diff = Date.now() - new Date(dateStr).getTime()
  return diff > 90 * 24 * 60 * 60 * 1000 // 90 days
}

export default function PortfolioList({ companies, portfolioByCompany, valuationMap, kpiByCompany }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('valuation')

  // Headline totals
  const totals = useMemo(() => {
    let totalInvested = 0, currentValue = 0
    for (const p of Object.values(portfolioByCompany)) {
      totalInvested += p.totalInvested
      currentValue += p.currentValue
    }
    const { change, pct } = calcGainLoss(totalInvested, currentValue)
    return { totalInvested, currentValue, change, pct }
  }, [portfolioByCompany])

  const sorted = useMemo(() => {
    return [...companies].sort((a, b) => {
      const pa = portfolioByCompany[a.id]
      const pb = portfolioByCompany[b.id]
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'investors') return (pb?.investorCount ?? 0) - (pa?.investorCount ?? 0)
      if (sortBy === 'change') return (pb?.gainLoss ?? 0) - (pa?.gainLoss ?? 0)
      if (sortBy === 'last_updated') {
        const da = valuationMap[a.id]?.valuation_date ?? ''
        const db = valuationMap[b.id]?.valuation_date ?? ''
        return db.localeCompare(da)
      }
      // valuation (default)
      return (pb?.currentValue ?? 0) - (pa?.currentValue ?? 0)
    })
  }, [companies, portfolioByCompany, valuationMap, sortBy])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Portfolio</h1>
        <Link href="/portfolio/new" className="btn btn-primary">+ Add company</Link>
      </div>

      {/* Headline stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        <StatCard label="Total invested" value={formatCurrency(totals.totalInvested)} />
        <StatCard label="Current valuation" value={formatCurrency(totals.currentValue)} />
        <StatCard
          label="Total change"
          value={`${totals.change >= 0 ? '+' : ''}${formatCurrency(totals.change)}`}
          positive={totals.change >= 0}
        />
        <StatCard
          label="Overall return"
          value={formatPercent(totals.pct)}
          positive={totals.pct >= 0}
        />
      </div>

      {/* Sort + table */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortKey)}
          style={{
            padding: '5px 10px', border: '0.5px solid #d0d0c8',
            borderRadius: 5, fontSize: 12, background: '#fff', outline: 'none',
          }}
        >
          <option value="valuation">Total valuation ↓</option>
          <option value="change">Valuation change ↓</option>
          <option value="investors">Investors ↓</option>
          <option value="name">Name A–Z</option>
          <option value="last_updated">Last updated</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Company</th>
              <th style={{ width: '8%' }}>Investors</th>
              <th style={{ width: '14%' }}>Total invested</th>
              <th style={{ width: '14%' }}>Valuation</th>
              <th style={{ width: '14%' }}>Change</th>
              <th style={{ width: '18%' }}>Key KPIs</th>
              <th style={{ width: '10%' }}>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>
                  No companies yet — add your first portfolio company to get started
                </td>
              </tr>
            ) : (
              sorted.map(company => {
                const p = portfolioByCompany[company.id]
                const val = valuationMap[company.id]
                const kpis = kpiByCompany[company.id] ?? []
                const { change, pct } = p
                  ? calcGainLoss(p.totalInvested, p.currentValue)
                  : { change: 0, pct: 0 }
                const stale = isStale(val?.valuation_date)

                return (
                  <tr key={company.id}>
                    {/* Company */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CompanyAvatar name={company.name} logoUrl={company.logo_url} />
                        <div>
                          <Link
                            href={`/portfolio/${company.id}`}
                            style={{ fontWeight: 500, color: '#0f2744', textDecoration: 'none', fontSize: 13 }}
                          >
                            {company.name}
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            {company.sector && (
                              <span style={{ fontSize: 10, color: '#888' }}>{company.sector}</span>
                            )}
                            <StagePill stage={company.stage} />
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Investors */}
                    <td style={{ fontWeight: 500 }}>{p?.investorCount ?? 0}</td>

                    {/* Total invested */}
                    <td>{formatCurrency(p?.totalInvested)}</td>

                    {/* Valuation */}
                    <td style={{ fontWeight: 500 }}>{formatCurrency(p?.currentValue)}</td>

                    {/* Change */}
                    <td>
                      <div className={change >= 0 ? 'text-positive' : 'text-negative'} style={{ fontWeight: 500 }}>
                        {change >= 0 ? '+' : ''}{formatCurrency(change)}
                      </div>
                      <div style={{ fontSize: 10 }} className={pct >= 0 ? 'text-positive' : 'text-negative'}>
                        {formatPercent(pct)}
                      </div>
                    </td>

                    {/* Key KPIs */}
                    <td>
                      {kpis.length === 0 ? (
                        <span style={{ fontSize: 11, color: '#ccc' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {kpis.map(kpi => (
                            <div key={kpi.name} style={{ fontSize: 11 }}>
                              <span style={{ color: '#888' }}>{kpi.name}: </span>
                              <span style={{ fontWeight: 500 }}>
                                {kpi.unit === '£' ? formatCurrency(kpi.value) : `${kpi.value.toLocaleString()}${kpi.unit ? ` ${kpi.unit}` : ''}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Last updated */}
                    <td>
                      {val ? (
                        <div>
                          <span style={{ fontSize: 11, color: stale ? '#ba7517' : '#888' }}>
                            {formatDate(val.valuation_date)}
                          </span>
                          {stale && (
                            <div>
                              <Link
                                href={`/portfolio/${company.id}?action=update_valuation`}
                                style={{ fontSize: 10, color: '#185fa5', textDecoration: 'none' }}
                              >
                                Update valuation
                              </Link>
                            </div>
                          )}
                        </div>
                      ) : (
                        <Link
                          href={`/portfolio/${company.id}?action=update_valuation`}
                          style={{ fontSize: 11, color: '#185fa5', textDecoration: 'none' }}
                        >
                          Add valuation
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const color = positive === undefined ? '#0f2744' : positive ? '#0f6e56' : '#a32d2d'
  return (
    <div className="card">
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color }}>{value}</div>
    </div>
  )
}
