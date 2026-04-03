'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatPercent, formatDate, calcGainLoss } from '@/lib/utils'

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
  fund_type: string | null
  status: string
  client_id: string
  transaction_type?: string
  clients: { id: string; full_name: string; lead_investor_id: string | null } | null
}

interface Valuation {
  id: string
  share_price: number
  valuation_date: string
  notes: string | null
}

interface KpiDataRow {
  id: string
  kpi_name: string
  period: string | null
  period_date: string | null
  value: number
  unit: string | null
}

interface InternalUpdate {
  id: string
  update_type: string
  description: string | null
  created_at: string
}

interface OpenDeal {
  id: string
  deal_type: string
  status: string
  created_at: string
  investor_count: number
}

interface CompanyDoc {
  id: string
  type: string
  filename: string
  storage_url: string | null
  document_date: string | null
  period: string | null
}

interface Props {
  companyId: string
  investments: Record<string, unknown>[]
  currentValuation: Record<string, unknown> | null
  kpiData: KpiDataRow[]
  internalUpdates: Record<string, unknown>[]
  openDeals: Record<string, unknown>[]
  companyDocs: Record<string, unknown>[]
  onOpenValuationModal: () => void
  onSwitchTab: (tab: string) => void
}

function isBuyTx(tx: Investment) {
  const t = tx.transaction_type ?? 'buy'
  return t === 'buy' || t === 'transfer_in'
}

function isSellTx(tx: Investment) {
  const t = tx.transaction_type ?? 'buy'
  return t === 'sell' || t === 'transfer_out'
}

function kpiFormat(value: number, unit: string | null) {
  if (unit === '£') return formatCurrency(value)
  if (unit === '%') return `${value.toFixed(1)}%`
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`
}

function dealTypeLabel(t: string) {
  return ({ equity: 'Equity deal', loan: 'Loan note', convertible: 'Convertible note', new_investment: 'New investment', follow_on: 'Follow-on' })[t] ?? t
}

function DealStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:            { label: 'Draft',            cls: 'pill-grey'  },
    sent:             { label: 'Sent',             cls: 'pill-amber' },
    partially_signed: { label: 'Partially signed', cls: 'pill-amber' },
    fully_signed:     { label: 'Fully signed',     cls: 'pill-teal'  },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'pill-grey' }
  return <span className={`pill ${cls}`} style={{ fontSize: 10 }}>{label}</span>
}

function activityDotColor(type: string) {
  if (type === 'valuation')  return '#1d9e75'
  if (type === 'deal')       return '#0f2744'
  if (type === 'document')   return '#185fa5'
  if (type === 'investment') return '#534ab7'
  return '#aaa'
}

export default function CompanyOverviewTab({
  companyId, investments: invRaw, currentValuation: cvRaw,
  kpiData, internalUpdates: updatesRaw, openDeals: dealsRaw,
  companyDocs: docsRaw, onOpenValuationModal, onSwitchTab,
}: Props) {
  const inv     = invRaw    as unknown as Investment[]
  const cv      = cvRaw     as unknown as Valuation | null
  const updates = updatesRaw as unknown as InternalUpdate[]
  const deals   = dealsRaw   as unknown as OpenDeal[]
  const docs    = docsRaw    as unknown as CompanyDoc[]

  const currentPrice = cv?.share_price ?? 0

  // Net position per client
  const netByClient = useMemo(() => {
    const map = new Map<string, {
      client: Investment['clients']
      sharesIn: number; sharesOut: number; remaining: number
      totalCost: number; costOfRemaining: number; buyRows: Investment[]
    }>()
    for (const i of inv) {
      const cid = i.client_id
      if (!map.has(cid)) map.set(cid, { client: i.clients, sharesIn: 0, sharesOut: 0, remaining: 0, totalCost: 0, costOfRemaining: 0, buyRows: [] })
      const pos = map.get(cid)!
      if (isBuyTx(i)) { pos.sharesIn += i.shares_purchased; pos.totalCost += i.sum_subscribed; pos.buyRows.push(i) }
      else if (isSellTx(i)) pos.sharesOut += i.shares_purchased
    }
    for (const pos of map.values()) {
      pos.remaining = pos.sharesIn - pos.sharesOut
      const avg = pos.sharesIn > 0 ? pos.totalCost / pos.sharesIn : 0
      pos.costOfRemaining = avg * Math.max(pos.remaining, 0)
    }
    return map
  }, [inv])

  const currentInvestors = useMemo(() =>
    [...netByClient.values()].filter(p => p.remaining > 0)
      .sort((a, b) => (a.client?.full_name ?? '').localeCompare(b.client?.full_name ?? '')),
    [netByClient]
  )

  const totalInvested = currentInvestors.reduce((s, p) => s + p.costOfRemaining, 0)
  const currentValue  = currentInvestors.reduce((s, p) => s + p.remaining * currentPrice, 0)
  const { change, pct } = calcGainLoss(totalInvested, currentValue)

  // KPI lookups
  const latestKpis = useMemo(() => {
    const seen = new Set<string>(); const result: KpiDataRow[] = []
    for (const k of kpiData) {
      if (!seen.has(k.kpi_name)) { seen.add(k.kpi_name); result.push(k); if (result.length === 4) break }
    }
    return result
  }, [kpiData])

  const prevKpiValues = useMemo(() => {
    const counts: Record<string, number> = {}; const result: Record<string, number> = {}
    for (const k of kpiData) {
      counts[k.kpi_name] = (counts[k.kpi_name] ?? 0) + 1
      if (counts[k.kpi_name] === 2) result[k.kpi_name] = k.value
    }
    return result
  }, [kpiData])

  const revenueKpi  = kpiData.find(k => /revenue|arr/i.test(k.kpi_name)) ?? null
  const runwayKpi   = kpiData.find(k => /runway|cash/i.test(k.kpi_name)) ?? null
  const prevRevenue = revenueKpi ? kpiData.filter(k => k.kpi_name === revenueKpi.kpi_name)[1] : null

  // Financials updated
  const latestFinDoc = docs.find(d => d.type === 'management_accounts' || d.type === 'board_minutes') ?? null

  // Valuation staleness (> 90 days)
  const valuationStale = !cv || (Date.now() - new Date(cv.valuation_date + 'T00:00:00').getTime()) > 90 * 24 * 60 * 60 * 1000

  // Top investors by current value
  const topInvestors = useMemo(() =>
    [...currentInvestors]
      .sort((a, b) => (b.remaining * currentPrice) - (a.remaining * currentPrice))
      .slice(0, 5),
    [currentInvestors, currentPrice]
  )

  const cardSt: React.CSSProperties = { background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '12px 14px' }
  const labelSt: React.CSSProperties = { fontSize: 10, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: '#aaa', marginBottom: 5 }

  return (
    <div>
      {/* Valuation staleness alert */}
      {valuationStale && (
        <div style={{ background: '#fffbf0', border: '0.5px solid #f0c674', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#78500a' }}>
            Valuation last updated {cv ? formatDate(cv.valuation_date) : 'never'} — consider updating.
          </span>
          <button
            onClick={onOpenValuationModal}
            style={{ fontSize: 10, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
          >
            Update now →
          </button>
        </div>
      )}

      {/* 6 stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 14 }}>
        {/* 1. Total invested */}
        <div style={cardSt}>
          <div style={labelSt}>Total invested</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744' }}>{formatCurrency(totalInvested)}</div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>{currentInvestors.length} investor{currentInvestors.length !== 1 ? 's' : ''}</div>
        </div>

        {/* 2. Current valuation */}
        <div style={cardSt}>
          <div style={labelSt}>Current valuation</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744' }}>{currentPrice > 0 ? formatCurrency(currentValue) : '—'}</div>
          {currentPrice > 0 && (
            <div style={{ fontSize: 10, marginTop: 3 }} className={change >= 0 ? 'text-positive' : 'text-negative'}>
              {change >= 0 ? '+' : ''}{formatCurrency(change)} ({formatPercent(pct)})
            </div>
          )}
        </div>

        {/* 3. Company valuation — PLACEHOLDER */}
        <div style={cardSt}>
          <div style={labelSt}>Company valuation</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#ba7517', fontStyle: 'italic' }}>TBC</div>
          <div style={{ fontSize: 10, color: '#ba7517', fontStyle: 'italic', marginTop: 3 }}>Calculation pending</div>
        </div>

        {/* 4. Revenue / ARR */}
        <div style={cardSt}>
          <div style={labelSt}>{revenueKpi?.kpi_name ?? 'Revenue (ARR)'}</div>
          {revenueKpi ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744' }}>{kpiFormat(revenueKpi.value, revenueKpi.unit)}</div>
              {prevRevenue && (() => {
                const qoq = ((revenueKpi.value - prevRevenue.value) / prevRevenue.value) * 100
                return <div style={{ fontSize: 10, marginTop: 3 }} className={qoq >= 0 ? 'text-positive' : 'text-negative'}>{qoq >= 0 ? '↑' : '↓'} {Math.abs(qoq).toFixed(1)}% QoQ</div>
              })()}
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#aaa' }}>—</div>
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>No data</div>
            </>
          )}
        </div>

        {/* 5. Cash runway */}
        <div style={cardSt}>
          <div style={labelSt}>{runwayKpi?.kpi_name ?? 'Cash runway'}</div>
          {runwayKpi ? (
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744' }}>{kpiFormat(runwayKpi.value, runwayKpi.unit)}</div>
          ) : (
            <div style={{ fontSize: 15, fontWeight: 600, color: '#aaa' }}>—</div>
          )}
        </div>

        {/* 6. Financials updated */}
        <div style={cardSt}>
          <div style={labelSt}>Financials updated</div>
          {latestFinDoc ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>{formatDate(latestFinDoc.document_date)}</div>
              {latestFinDoc.period && <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>Period to {latestFinDoc.period}</div>}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>No data uploaded</div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Key metrics */}
          <div style={cardSt}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Key metrics</span>
              <button
                onClick={() => onSwitchTab('performance')}
                style={{ fontSize: 10, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Full KPI history →
              </button>
            </div>
            {latestKpis.length === 0 ? (
              <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>
                No KPI data yet — add data in the Performance tab
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {latestKpis.map(kpi => {
                  const prev    = prevKpiValues[kpi.kpi_name]
                  const qoqPct  = prev && prev !== 0 ? ((kpi.value - prev) / prev) * 100 : null
                  return (
                    <div key={kpi.kpi_name} style={{ background: '#f9f9f7', borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#999', marginBottom: 4 }}>
                        {kpi.kpi_name}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 500, color: '#0f2744' }}>{kpiFormat(kpi.value, kpi.unit)}</div>
                      {qoqPct !== null && (
                        <div style={{ fontSize: 10, marginTop: 3 }} className={qoqPct >= 0 ? 'text-positive' : 'text-negative'}>
                          {qoqPct >= 0 ? '↑' : '↓'} {Math.abs(qoqPct).toFixed(1)}% QoQ
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div style={cardSt}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>Recent activity</div>
            {updates.length === 0 ? (
              <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '8px 0' }}>No activity yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {updates.slice(0, 6).map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: activityDotColor(u.update_type), marginTop: 5, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#444', lineHeight: 1.4 }}>{u.description ?? u.update_type.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{formatDate(u.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Upcoming / pending */}
          <div style={cardSt}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Upcoming / pending</span>
              {deals.length > 0 && <span style={{ fontSize: 10, color: '#999' }}>{deals.length} open</span>}
            </div>
            {deals.length === 0 ? (
              <div style={{ fontSize: 12, color: '#888' }}>No pending items</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deals.map(deal => (
                  <div key={deal.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 8, borderBottom: '0.5px solid #f0f0ec' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>{dealTypeLabel(deal.deal_type)}</div>
                      <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                        {formatDate(deal.created_at)} · {deal.investor_count} investor{deal.investor_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <DealStatusPill status={deal.status} />
                      <Link href={`/deals/${deal.id}`} className="btn btn-primary" style={{ fontSize: 9, padding: '3px 8px' }}>Continue →</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outstanding actions — PLACEHOLDER */}
          <div style={{ border: '2px dashed #d0d0c8', borderRadius: 8, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Coming soon</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#ba7517', marginBottom: 6 }}>Outstanding actions</div>
            <div style={{ fontSize: 10, color: '#999' }}>Investor updates due, documents to chase, follow-ups needed</div>
          </div>

          {/* Top investors */}
          <div style={cardSt}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Top investors</span>
              <button
                onClick={() => onSwitchTab('investors')}
                style={{ fontSize: 10, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                All investors →
              </button>
            </div>
            {topInvestors.length === 0 ? (
              <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '8px 0' }}>No current investors</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topInvestors.map(pos => {
                  const cid      = pos.client?.id ?? ''
                  const curVal   = pos.remaining * currentPrice
                  const { pct: uPct } = calcGainLoss(pos.costOfRemaining, curVal)
                  const classes  = [...new Set(pos.buyRows.map(r => r.share_class))]
                  return (
                    <div key={cid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '0.5px solid #f5f5f2' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link href={`/clients/${cid}`} style={{ fontSize: 12, fontWeight: 500, color: '#0f2744', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pos.client?.full_name ?? 'Unknown'}
                        </Link>
                        <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>
                          {pos.buyRows.length} holding{pos.buyRows.length !== 1 ? 's' : ''}{classes.length > 0 ? ` · ${classes.join(', ')}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>
                          {currentPrice > 0 ? formatCurrency(curVal) : '—'}
                        </div>
                        {currentPrice > 0 && pos.costOfRemaining > 0 && (
                          <div style={{ fontSize: 10 }} className={curVal >= pos.costOfRemaining ? 'text-positive' : 'text-negative'}>
                            {formatPercent(uPct)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Next board meeting */}
          <div style={{ ...cardSt, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#888' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#d0d0c8', flexShrink: 0 }} />
              No board date scheduled
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
