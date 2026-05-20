'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatPercent, formatDate, calcGainLoss } from '@/lib/utils'
import type { ClientRow } from '../ClientRecord'
import GenerateStatementSection from '../_components/GenerateStatementSection'
import type { StatementDoc } from '../_components/GenerateStatementSection'

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
  transaction_type?: string
  companies: { id: string; name: string } | null
}

interface Valuation {
  company_id: string
  share_price: number
  valuation_date: string
}

interface PendingDeal {
  id: string
  deal_type: string
  status: string
  company_id: string | null
  created_at: string | null
  investor_count: number
  companies: { id: string; name: string } | null
}

interface MembershipDoc {
  id: string
  type: string
  company_id: string | null
}

interface Requirement {
  key: string
  dotColor: string
  text: string
  action: string
  href: string | null
}

interface Props {
  client: ClientRow
  investments: Record<string, unknown>[]
  valuations: Record<string, unknown>[]
  pendingDeals: Record<string, unknown>[]
  membershipDocs: MembershipDoc[]
  onSwitchToInvestments: () => void
  portfolioStatements: StatementDoc[]
}

function isBuyTx(tx: Investment) {
  const t = tx.transaction_type ?? 'buy'
  return t === 'buy' || t === 'transfer_in'
}

function isSellTx(tx: Investment) {
  const t = tx.transaction_type ?? 'buy'
  return t === 'sell' || t === 'transfer_out'
}

function accountKey(ft: string | null, loc: string, ent: string | null) {
  return `${ft ?? 'syndicate'}||${loc}||${ent ?? ''}`
}

function accountLabel(ft: string | null, loc: string, ent: string | null) {
  const ftLabel = ft === 'multi_manager' ? 'Multi Manager' : 'Syndicate'
  const locLabel = loc === 'nominee' ? 'Nominee' : 'Direct'
  return ent ? `${ftLabel} — ${locLabel} — ${ent}` : `${ftLabel} — ${locLabel}`
}

function dealTypeLabel(t: string) {
  return ({ equity: 'Equity deal', loan: 'Loan note', convertible: 'Convertible note' })[t] ?? t
}

function DealStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:            { label: 'Draft',              cls: 'pill-grey'  },
    sent:             { label: 'Sent',               cls: 'pill-amber' },
    partially_signed: { label: 'Partially signed',   cls: 'pill-amber' },
    fully_signed:     { label: 'Fully signed',       cls: 'pill-teal'  },
    complete:         { label: 'Complete',            cls: 'pill-teal'  },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'pill-grey' }
  return <span className={`pill ${cls}`} style={{ fontSize: 10 }}>{label}</span>
}

export default function OverviewTab({
  client, investments: invRaw, valuations: valsRaw,
  pendingDeals: dealsRaw, membershipDocs, onSwitchToInvestments, portfolioStatements,
}: Props) {
  const [accountFilter, setAccountFilter] = useState('all')
  const [uploadToast, setUploadToast] = useState(false)

  const inv    = invRaw   as unknown as Investment[]
  const vals   = valsRaw  as unknown as Valuation[]
  const deals  = dealsRaw as unknown as PendingDeal[]

  function showUploadToast() {
    setUploadToast(true)
    setTimeout(() => setUploadToast(false), 2500)
  }

  // Valuation lookup
  const valuationByCompany = useMemo(() => {
    const m: Record<string, { price: number; date: string }> = {}
    for (const v of vals) m[v.company_id] = { price: v.share_price, date: v.valuation_date }
    return m
  }, [vals])

  // Account filter options from buy transactions
  const accountOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const i of inv) {
      if (!isBuyTx(i)) continue
      const k = accountKey(i.fund_type, i.holding_location, i.holding_entity)
      if (!map.has(k)) map.set(k, accountLabel(i.fund_type, i.holding_location, i.holding_entity))
    }
    return map
  }, [inv])

  const showAccountFilter = accountOptions.size >= 2

  // Net position per company
  const netByCompany = useMemo(() => {
    const map = new Map<string, {
      company: Investment['companies']
      sharesIn: number
      sharesOut: number
      remaining: number
      totalCost: number
      costOfRemaining: number
    }>()
    for (const i of inv) {
      const cid = i.companies?.id ?? '__unknown'
      if (!map.has(cid)) map.set(cid, { company: i.companies, sharesIn: 0, sharesOut: 0, remaining: 0, totalCost: 0, costOfRemaining: 0 })
      const pos = map.get(cid)!
      if (isBuyTx(i)) {
        pos.sharesIn  += i.shares_purchased
        pos.totalCost += i.sum_subscribed
      } else if (isSellTx(i)) {
        pos.sharesOut += i.shares_purchased
      }
    }
    for (const pos of map.values()) {
      pos.remaining = pos.sharesIn - pos.sharesOut
      const avg = pos.sharesIn > 0 ? pos.totalCost / pos.sharesIn : 0
      pos.costOfRemaining = avg * pos.remaining
    }
    return map
  }, [inv])

  // Holdings filtered by account selection
  const holdings = useMemo(() => {
    // Collect buy rows filtered by account
    const byCo = new Map<string, { netPos: (typeof netByCompany extends Map<string, infer V> ? V : never); cost: number }>()

    for (const i of inv) {
      if (!isBuyTx(i)) continue
      if (accountFilter !== 'all') {
        const k = accountKey(i.fund_type, i.holding_location, i.holding_entity)
        if (k !== accountFilter) continue
      }
      const cid = i.companies?.id ?? '__unknown'
      const netPos = netByCompany.get(cid)
      if (!netPos || netPos.remaining <= 0) continue
      if (!byCo.has(cid)) byCo.set(cid, { netPos, cost: 0 })
    }

    return Array.from(byCo.entries())
      .map(([cid, { netPos }]) => {
        const val = valuationByCompany[cid]
        const currentPrice = val?.price ?? null
        const currentValue = currentPrice != null ? netPos.remaining * currentPrice : null
        return { cid, netPos, currentPrice, currentValue }
      })
      .sort((a, b) => {
        const av = a.currentValue ?? 0
        const bv = b.currentValue ?? 0
        return bv - av
      })
  }, [inv, accountFilter, netByCompany, valuationByCompany])

  // Outstanding requirements
  const requirements = useMemo((): Requirement[] => {
    const today = new Date().toISOString().split('T')[0]
    const in60  = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const items: Requirement[] = []

    if (client.kyc_expiry && client.kyc_expiry < today) {
      items.push({ key: 'kyc_overdue', dotColor: '#a32d2d', text: `KYC expired — ${formatDate(client.kyc_expiry)}`, action: 'Renew →', href: `/clients/${client.id}/edit` })
    } else if (client.kyc_expiry && client.kyc_expiry <= in60) {
      items.push({ key: 'kyc_renewal', dotColor: '#ba7517', text: `KYC renewal due — expires ${formatDate(client.kyc_expiry)}`, action: 'Renew →', href: `/clients/${client.id}/edit` })
    }

    const hasPoa = membershipDocs.some(d => d.type === 'poa')
    if (!hasPoa) {
      items.push({ key: 'poa', dotColor: '#ba7517', text: 'Power of attorney not on file', action: 'Upload →', href: null })
    }

    const hasSuitability = membershipDocs.some(d => d.type === 'suitability_assessment')
    if (!hasSuitability) {
      items.push({ key: 'suitability', dotColor: '#ba7517', text: 'Suitability assessment missing', action: 'Upload →', href: null })
    }

    // EIS certificates outstanding
    const eisCompanyIds = new Set(
      inv.filter(i => i.eis_status === 'yes' || i.eis_status === 'tbc')
        .map(i => i.companies?.id)
        .filter((c): c is string => Boolean(c))
    )
    const eisCertCoIds = new Set(
      membershipDocs
        .filter(d => d.type === 'eis_certificate' && d.company_id)
        .map(d => d.company_id as string)
    )
    for (const cid of eisCompanyIds) {
      if (!eisCertCoIds.has(cid)) {
        const co = inv.find(i => i.companies?.id === cid)?.companies
        items.push({ key: `eis_${cid}`, dotColor: '#185fa5', text: `EIS certificate outstanding — ${co?.name ?? 'Unknown'}`, action: 'Upload →', href: null })
      }
    }

    return items
  }, [client, membershipDocs, inv])

  const VISIBLE_MAX = 8
  const visibleHoldings = holdings.slice(0, VISIBLE_MAX)
  const moreCount = holdings.length - VISIBLE_MAX

  return (
    <div>
      {/* Chart placeholders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        <ChartCard label="Portfolio value over time">
          <BarChartSvg />
        </ChartCard>
        <ChartCard label="Allocation by company">
          <DonutChartSvg />
        </ChartCard>
        <ChartCard label="Portfolio performance">
          <LineChartSvg />
        </ChartCard>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Holdings summary */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Holdings summary</span>
            <button
              onClick={onSwitchToInvestments}
              style={{ fontSize: 10, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              View all →
            </button>
          </div>

          {showAccountFilter && (
            <select
              value={accountFilter}
              onChange={e => setAccountFilter(e.target.value)}
              style={{ width: '100%', marginBottom: 10, padding: '5px 8px', border: '0.5px solid #d0d0c8', borderRadius: 5, fontSize: 11, background: '#fff', outline: 'none' }}
            >
              <option value="all">All accounts</option>
              {Array.from(accountOptions.entries()).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          )}

          {holdings.length === 0 ? (
            <div style={{ fontSize: 12, color: '#888', padding: '16px 0', textAlign: 'center' }}>No current holdings</div>
          ) : (
            <div>
              {visibleHoldings.map(({ cid, netPos, currentPrice, currentValue }) => {
                const costOfRem = netPos.costOfRemaining
                const { pct } = calcGainLoss(costOfRem, currentValue ?? costOfRem)
                const change = currentValue != null ? currentValue - costOfRem : null
                const isPositive = change != null && change >= 0
                return (
                  <div key={cid} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '0.5px solid #f0f0ec' }}>
                    <div>
                      <Link href={`/portfolio/${cid}`} style={{ fontSize: 12, fontWeight: 500, color: '#0f2744', textDecoration: 'none' }}>
                        {netPos.company?.name ?? 'Unknown'}
                      </Link>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 11, color: '#888' }}>Cost {formatCurrency(costOfRem)}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>
                          {currentValue != null ? formatCurrency(currentValue) : '—'}
                        </span>
                      </div>
                      {change != null && (
                        <div style={{ fontSize: 10, color: isPositive ? '#0f6e56' : '#a32d2d' }}>
                          {isPositive ? '+' : ''}{formatPercent(pct)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {moreCount > 0 && (
                <div style={{ fontSize: 11, color: '#888', paddingTop: 8, textAlign: 'center' }}>
                  +{moreCount} more {moreCount === 1 ? 'company' : 'companies'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Pending deals */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Pending deals</span>
              <span style={{ fontSize: 10, color: '#999' }}>
                {deals.length > 0 ? `${deals.length} open` : ''}
              </span>
            </div>

            {deals.length === 0 ? (
              <div style={{ fontSize: 12, color: '#888' }}>
                No pending deals.{' '}
                <Link href="/deals/new" style={{ color: '#185fa5', textDecoration: 'none' }}>Start a new deal →</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deals.map(deal => (
                  <div key={deal.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '0.5px solid #f0f0ec' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {deal.companies?.name ?? 'Unknown'} · {dealTypeLabel(deal.deal_type)}
                      </div>
                      <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                        {deal.created_at ? `Created ${formatDate(deal.created_at)} · ` : ''}{deal.investor_count} investor{deal.investor_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <DealStatusPill status={deal.status} />
                      <Link href={`/deals/${deal.id}`} className="btn btn-primary" style={{ fontSize: 9, padding: '3px 8px' }}>
                        Continue →
                      </Link>
                      <Link href={`/deals/${deal.id}`} className="btn btn-secondary" style={{ fontSize: 9, padding: '3px 8px' }}>
                        View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outstanding requirements */}
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>Outstanding requirements</div>

            {requirements.length === 0 ? (
              <div style={{ fontSize: 12, color: '#1d9e75', textAlign: 'center', padding: '8px 0' }}>
                ✓ All requirements clear
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {requirements.map(req => (
                  <div key={req.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: req.dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#333', flex: 1 }}>{req.text}</span>
                    {req.href ? (
                      <Link href={req.href} style={{ fontSize: 10, color: '#185fa5', textDecoration: 'none', flexShrink: 0 }}>
                        {req.action}
                      </Link>
                    ) : (
                      <button
                        onClick={showUploadToast}
                        style={{ fontSize: 10, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                      >
                        {req.action}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Portfolio statement generator */}
      <div style={{ marginTop: 20 }}>
        <GenerateStatementSection
          clientId={client.id}
          statements={portfolioStatements}
        />
      </div>

      {uploadToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#0f2744', color: '#fff', fontSize: 12, fontWeight: 500,
          padding: '10px 20px', borderRadius: 6, zIndex: 2000,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
        }}>
          Upload coming soon
        </div>
      )}
    </div>
  )
}

function ChartCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#999', marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function BarChartSvg() {
  const bars = [20, 35, 28, 46, 38, 56, 52, 70]
  const colors = ['#d0e8f9', '#a8d4f5', '#85b7eb', '#5a9bd8', '#3a7ec4', '#1d5fa8', '#0f3d80', '#042c53']
  return (
    <svg viewBox="0 0 220 80" style={{ width: '100%', height: 80 }} xmlns="http://www.w3.org/2000/svg">
      {bars.map((h, i) => (
        <rect key={i} x={i * 27 + 2} y={80 - h} width={18} height={h} fill={colors[i]} rx={2} />
      ))}
    </svg>
  )
}

function DonutChartSvg() {
  // r=30, cx=50, cy=50, circumference ≈ 188.5
  // Slices: 35% 25% 20% 12% 8% → arc lengths: 66, 47, 38, 23, 15
  // dashoffset: 0, -66, -113, -151, -174
  const slices = [
    { len: 66, offset: 0,    color: '#185fa5' },
    { len: 47, offset: -66,  color: '#1d9e75' },
    { len: 38, offset: -113, color: '#ba7517' },
    { len: 23, offset: -151, color: '#85b7eb' },
    { len: 15, offset: -174, color: '#d0d0c8' },
  ]
  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: 90 }} xmlns="http://www.w3.org/2000/svg">
      {slices.map((s, i) => (
        <circle
          key={i}
          cx="50" cy="50" r="30"
          fill="none"
          stroke={s.color}
          strokeWidth="18"
          strokeDasharray={`${s.len} ${188 - s.len}`}
          strokeDashoffset={s.offset}
          transform="rotate(-90 50 50)"
        />
      ))}
      <circle cx="50" cy="50" r="19" fill="white" />
    </svg>
  )
}

function LineChartSvg() {
  return (
    <svg viewBox="0 0 220 80" style={{ width: '100%', height: 80 }} xmlns="http://www.w3.org/2000/svg">
      {/* Cost baseline dashed */}
      <polyline
        points="0,65 30,62 60,58 90,55 120,52 150,50 180,48 220,45"
        fill="none" stroke="#d0d0c8" strokeWidth="1.5" strokeDasharray="4 3"
      />
      {/* Area under value line */}
      <polygon
        points="0,80 0,62 30,56 60,48 90,40 120,34 150,26 180,18 220,14 220,80"
        fill="#1d9e75" fillOpacity="0.08"
      />
      {/* Value line */}
      <polyline
        points="0,62 30,56 60,48 90,40 120,34 150,26 180,18 220,14"
        fill="none" stroke="#1d9e75" strokeWidth="2"
      />
    </svg>
  )
}
