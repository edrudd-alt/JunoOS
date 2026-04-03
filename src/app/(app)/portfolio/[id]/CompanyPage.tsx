'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
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
  transaction_type?: string
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

interface InternalUpdate {
  id: string
  update_type: string
  description: string | null
  created_at: string
}

interface NewsItem {
  id: string
  headline: string
  url: string | null
  published_at: string | null
  source: string | null
}

function isBuyTx(tx: Investment) {
  const t = tx.transaction_type ?? 'buy'
  return t === 'buy' || t === 'transfer_in'
}

function isSellTx(tx: Investment) {
  const t = tx.transaction_type ?? 'buy'
  return t === 'sell' || t === 'transfer_out'
}

export default function CompanyPage({
  company, valuations, currentValuation, investments,
  kpiData, internalUpdates, news, initialAction,
}: Props) {
  const [showValuationModal, setShowValuationModal] = useState(initialAction === 'update_valuation')
  const [currentInvestorsCollapsed, setCurrentInvestorsCollapsed] = useState(false)
  const [exitHistoryCollapsed, setExitHistoryCollapsed] = useState(true)
  const [expandedInvestors, setExpandedInvestors] = useState<Set<string>>(new Set())

  const toggleInvestor = useCallback((clientId: string) => {
    setExpandedInvestors(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }, [])

  const inv = investments as unknown as Investment[]
  const updates = internalUpdates as unknown as InternalUpdate[]
  const newsItems = news as unknown as NewsItem[]

  const currentPrice = currentValuation?.share_price ?? 0

  // Net position per client
  const netByClient = useMemo(() => {
    const map = new Map<string, {
      client: Investment['clients']
      sharesIn: number
      sharesOut: number
      remaining: number
      totalCost: number
      totalProceeds: number
      costOfRemaining: number
      buyRows: Investment[]
    }>()

    for (const i of inv) {
      const cid = i.client_id
      if (!map.has(cid)) {
        map.set(cid, {
          client: i.clients,
          sharesIn: 0, sharesOut: 0, remaining: 0,
          totalCost: 0, totalProceeds: 0, costOfRemaining: 0,
          buyRows: [],
        })
      }
      const pos = map.get(cid)!
      if (isBuyTx(i)) {
        pos.sharesIn  += i.shares_purchased
        pos.totalCost += i.sum_subscribed
        pos.buyRows.push(i)
      } else if (isSellTx(i)) {
        pos.sharesOut     += i.shares_purchased
        pos.totalProceeds += i.sum_subscribed
      }
    }

    for (const pos of map.values()) {
      pos.remaining = pos.sharesIn - pos.sharesOut
      const avgCost = pos.sharesIn > 0 ? pos.totalCost / pos.sharesIn : 0
      pos.costOfRemaining = avgCost * Math.max(pos.remaining, 0)
    }

    return map
  }, [inv])

  // Current investors (remaining > 0), sorted by name
  const currentInvestors = useMemo(() => {
    return [...netByClient.values()]
      .filter(p => p.remaining > 0)
      .sort((a, b) => (a.client?.full_name ?? '').localeCompare(b.client?.full_name ?? ''))
  }, [netByClient])

  // All sell transactions, newest first
  const sellRows = useMemo(() => {
    return inv
      .filter(isSellTx)
      .sort((a, b) => b.investment_date.localeCompare(a.investment_date))
  }, [inv])

  // Stats — remaining shares only
  const totalInvested  = currentInvestors.reduce((s, p) => s + p.costOfRemaining, 0)
  const currentValue   = currentInvestors.reduce((s, p) => s + p.remaining * currentPrice, 0)
  const { change, pct } = calcGainLoss(totalInvested, currentValue)

  // Share classes (from all buy rows)
  const shareClasses = new Set(inv.filter(isBuyTx).map(i => i.share_class))

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

  const prevKpiValues = useMemo(() => {
    const counts: Record<string, number> = {}
    const result: Record<string, number> = {}
    for (const row of kpiData) {
      counts[row.kpi_name] = (counts[row.kpi_name] ?? 0) + 1
      if (counts[row.kpi_name] === 2) result[row.kpi_name] = row.value
    }
    return result
  }, [kpiData])

  const thStyle: React.CSSProperties = {
    textAlign: 'left', fontWeight: 500, color: '#aaa',
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 6,
  }
  const thR: React.CSSProperties = { ...thStyle, textAlign: 'right' }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Portfolio', href: '/portfolio' }, { label: company.name }]} />

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
                <span style={{ fontSize: 11, color: '#888' }}>{currentInvestors.length} investor{currentInvestors.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              disabled
              title="Coming soon"
              style={{ opacity: 0.45, cursor: 'not-allowed' }}
            >
              Add info
            </button>
            <button className="btn btn-secondary" onClick={() => setShowValuationModal(true)}>
              Update valuation
            </button>
            <Link href="/reports/investor-update" className="btn btn-secondary">Investor update</Link>
            <Link href={`/portfolio/${company.id}/settings`} className="btn btn-secondary">Settings</Link>
          </div>
        </div>
      </div>

      {/* Stats row — current holdings only */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Total invested</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>{formatCurrency(totalInvested)}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>Cost of current holdings</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Current valuation</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>{currentPrice > 0 ? formatCurrency(currentValue) : '—'}</div>
          {currentValuation && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
              @ £{currentValuation.share_price.toFixed(2)} · {formatDate(currentValuation.valuation_date)}
            </div>
          )}
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Change</div>
          <div style={{ fontSize: 18, fontWeight: 600 }} className={currentPrice > 0 ? (change >= 0 ? 'text-positive' : 'text-negative') : ''}>
            {currentPrice > 0 ? <>{change >= 0 ? '+' : ''}{formatCurrency(change)}</> : '—'}
          </div>
          {currentPrice > 0 && (
            <div style={{ fontSize: 11, marginTop: 3 }} className={change >= 0 ? 'text-positive' : 'text-negative'}>
              {formatPercent(pct)} unrealised
            </div>
          )}
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Investors</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>{currentInvestors.length}</div>
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

      {/* Current Investors */}
      <div className="card" style={{ marginBottom: 12 }}>
        <button
          onClick={() => setCurrentInvestorsCollapsed(c => !c)}
          style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>
            Current Investors ({currentInvestors.length})
          </div>
          <span className={`expand-arrow${currentInvestorsCollapsed ? '' : ' open'}`} />
        </button>

        {!currentInvestorsCollapsed && (
          <div style={{ marginTop: 14 }}>
            {currentInvestors.length === 0 ? (
              <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '12px 0' }}>No current investors</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <th style={thStyle}>Investor</th>
                    <th style={thR}>Shares Held</th>
                    <th style={thR}>Total Invested</th>
                    <th style={thR}>Current Value</th>
                    <th style={thR}>Unrealised P&L</th>
                    <th style={{ ...thStyle, paddingLeft: 8 }}>Share class</th>
                    <th style={{ ...thStyle, paddingLeft: 8 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentInvestors.map(pos => {
                    const cid      = pos.client?.id ?? ''
                    const name     = pos.client?.full_name ?? 'Unknown'
                    const curVal   = pos.remaining * currentPrice
                    const unrlPL   = currentPrice > 0 ? curVal - pos.costOfRemaining : null
                    const { pct: uPct } = calcGainLoss(pos.costOfRemaining, curVal)
                    const isExpanded = expandedInvestors.has(cid)
                    const classes  = [...new Set(pos.buyRows.map(r => r.share_class))].join(', ')
                    const isPartial = pos.sharesOut > 0

                    return (
                      <>
                        <tr
                          key={cid}
                          style={{ borderBottom: isExpanded ? 'none' : '1px solid #f8f8f8', cursor: 'pointer' }}
                          onClick={() => toggleInvestor(cid)}
                        >
                          <td style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={`expand-arrow${isExpanded ? ' open' : ''}`} style={{ flexShrink: 0 }} />
                            <Link
                              href={`/clients/${cid}`}
                              onClick={e => e.stopPropagation()}
                              style={{ color: '#185fa5', textDecoration: 'none', fontWeight: 500 }}
                            >
                              {name}
                            </Link>
                            {pos.client?.lead_investor_id && (
                              <span className="pill" style={{ fontSize: 9, background: '#f0e6ff', color: '#7c3aed' }}>Nominee</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px 0', color: '#0f2744' }}>
                            {pos.remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px 0', color: '#0f2744' }}>{formatCurrency(pos.costOfRemaining)}</td>
                          <td style={{ textAlign: 'right', padding: '8px 0', color: '#0f2744' }}>
                            {currentPrice > 0 ? formatCurrency(curVal) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px 0' }}>
                            {unrlPL != null ? (
                              <span className={unrlPL >= 0 ? 'text-positive' : 'text-negative'} style={{ fontSize: 11 }}>
                                {unrlPL >= 0 ? '+' : ''}{formatCurrency(unrlPL)} ({formatPercent(uPct)})
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ paddingLeft: 8, color: '#555' }}>{classes}</td>
                          <td style={{ paddingLeft: 8 }}>
                            {isPartial && <span className="pill pill-amber" style={{ fontSize: 9 }}>Partial exit</span>}
                          </td>
                        </tr>
                        {isExpanded && pos.buyRows.map(r => (
                          <tr key={r.id} style={{ background: '#fafbfc', borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '6px 0 6px 22px', color: '#555' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span>{formatDate(r.investment_date)}</span>
                                {r.eis_status === 'yes' ? (
                                  <span className="pill pill-green" style={{ fontSize: 9 }}>EIS</span>
                                ) : r.eis_status === 'no' ? (
                                  <span className="pill pill-grey" style={{ fontSize: 9 }}>Non-EIS</span>
                                ) : r.eis_status === 'tbc' ? (
                                  <span className="pill pill-amber" style={{ fontSize: 9 }}>EIS TBC</span>
                                ) : null}
                                {r.holding_location === 'nominee' && (
                                  <span className="pill" style={{ fontSize: 9, background: '#f0e6ff', color: '#7c3aed' }}>Nominee</span>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 0', color: '#555' }}>
                              {r.shares_purchased.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 0', color: '#555' }}>{formatCurrency(r.sum_subscribed)}</td>
                            <td style={{ textAlign: 'right', padding: '6px 0', color: '#555' }}>
                              {currentPrice > 0 ? formatCurrency(r.shares_purchased * currentPrice) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 0' }}>
                              {currentPrice > 0 ? (() => {
                                const rc = r.shares_purchased * currentPrice - r.sum_subscribed
                                const { pct: rp } = calcGainLoss(r.sum_subscribed, r.shares_purchased * currentPrice)
                                return (
                                  <span className={rc >= 0 ? 'text-positive' : 'text-negative'} style={{ fontSize: 11 }}>
                                    {rc >= 0 ? '+' : ''}{formatCurrency(rc)} ({formatPercent(rp)})
                                  </span>
                                )
                              })() : '—'}
                            </td>
                            <td style={{ paddingLeft: 8, color: '#555' }}>{r.share_class}</td>
                            <td />
                          </tr>
                        ))}
                      </>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Exit History */}
      {sellRows.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <button
            onClick={() => setExitHistoryCollapsed(c => !c)}
            style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>
              Exit History ({sellRows.length})
            </div>
            <span className={`expand-arrow${exitHistoryCollapsed ? '' : ' open'}`} />
          </button>

          {!exitHistoryCollapsed && (
            <div style={{ marginTop: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <th style={thStyle}>Investor</th>
                    <th style={thR}>Date</th>
                    <th style={thR}>Shares Sold</th>
                    <th style={thR}>Sale Proceeds</th>
                    <th style={thR}>Realised P&L</th>
                    <th style={thR}>Return %</th>
                    <th style={{ ...thStyle, paddingLeft: 8 }}>Exit Type</th>
                  </tr>
                </thead>
                <tbody>
                  {sellRows.map(tx => {
                    const pos      = netByClient.get(tx.client_id)
                    const avgCost  = pos && pos.sharesIn > 0 ? pos.totalCost / pos.sharesIn : 0
                    const costOfSold = avgCost * tx.shares_purchased
                    const realisedPL = tx.sum_subscribed - costOfSold
                    const retPct   = costOfSold > 0 ? (realisedPL / costOfSold) * 100 : 0
                    const isPartial = pos ? pos.remaining > 0 : false
                    const name     = tx.clients?.full_name ?? 'Unknown'
                    const cid      = tx.clients?.id ?? tx.client_id

                    return (
                      <tr key={tx.id} style={{ borderBottom: '1px solid #f8f8f8' }}>
                        <td style={{ padding: '8px 0' }}>
                          <Link href={`/clients/${cid}`} style={{ color: '#185fa5', textDecoration: 'none', fontWeight: 500 }}>
                            {name}
                          </Link>
                        </td>
                        <td style={{ textAlign: 'right', padding: '8px 0', color: '#555' }}>{formatDate(tx.investment_date)}</td>
                        <td style={{ textAlign: 'right', padding: '8px 0', color: '#555' }}>
                          {tx.shares_purchased.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td style={{ textAlign: 'right', padding: '8px 0', color: '#0f2744' }}>{formatCurrency(tx.sum_subscribed)}</td>
                        <td style={{ textAlign: 'right', padding: '8px 0' }}>
                          <span className={realisedPL >= 0 ? 'text-positive' : 'text-negative'} style={{ fontSize: 11 }}>
                            {costOfSold > 0 ? <>{realisedPL >= 0 ? '+' : ''}{formatCurrency(realisedPL)}</> : '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', padding: '8px 0' }}>
                          <span className={retPct >= 0 ? 'text-positive' : 'text-negative'} style={{ fontSize: 11 }}>
                            {costOfSold > 0 ? formatPercent(retPct) : '—'}
                          </span>
                        </td>
                        <td style={{ paddingLeft: 8 }}>
                          {isPartial
                            ? <span className="pill pill-amber" style={{ fontSize: 9 }}>Partial exit</span>
                            : <span className="pill pill-grey"  style={{ fontSize: 9 }}>Full exit</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Internal updates + News */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>Internal updates</div>
          {updates.length === 0 ? (
            <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '12px 0' }}>No updates yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {updates.slice(0, 8).map(u => (
                <div key={u.id} style={{ borderBottom: '1px solid #f5f5f5', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#185fa5' }}>
                      {u.update_type.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 10, color: '#aaa' }}>{formatDate(u.created_at)}</span>
                  </div>
                  {u.description && <div style={{ fontSize: 12, color: '#444' }}>{u.description}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>Company news</div>
          {newsItems.length === 0 ? (
            <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '12px 0' }}>No news articles</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {newsItems.slice(0, 8).map(n => (
                <div key={n.id} style={{ borderBottom: '1px solid #f5f5f5', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    {n.source && <span style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{n.source}</span>}
                    {n.published_at && <span style={{ fontSize: 10, color: '#aaa' }}>{formatDate(n.published_at)}</span>}
                  </div>
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#185fa5', textDecoration: 'none' }}>
                      {n.headline}
                    </a>
                  ) : (
                    <div style={{ fontSize: 12, color: '#444' }}>{n.headline}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
