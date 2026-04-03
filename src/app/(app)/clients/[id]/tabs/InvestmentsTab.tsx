'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
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
  status: string
  transaction_type?: string
  companies: { id: string; name: string; sector: string | null; stage: string | null } | null
}

interface Valuation {
  company_id: string
  share_price: number
  valuation_date: string
}

interface LinkedEntity {
  id: string
  full_name: string
  entity_type: string
}

interface Props {
  investments: Record<string, unknown>[]
  valuations: Record<string, unknown>[]
  linkedEntities: LinkedEntity[]
}

function EisTag({ status }: { status: string }) {
  if (status === 'yes') return <span className="pill pill-green" style={{ fontSize: 10 }}>EIS</span>
  if (status === 'no') return <span className="pill pill-grey" style={{ fontSize: 10 }}>Non-EIS</span>
  return <span className="pill pill-amber" style={{ fontSize: 10 }}>EIS TBC</span>
}

function NomineeTag() {
  return <span className="pill pill-purple" style={{ fontSize: 10 }}>Nominee</span>
}

function isBuyTx(tx: Investment) {
  const t = tx.transaction_type ?? 'buy'
  return t === 'buy' || t === 'transfer_in'
}

function isSellTx(tx: Investment) {
  const t = tx.transaction_type ?? 'buy'
  return t === 'sell' || t === 'transfer_out'
}

export default function InvestmentsTab({ investments, valuations }: Props) {
  const [heldByFilter, setHeldByFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [eisFilter, setEisFilter] = useState('all')
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())
  const [showExitHistory, setShowExitHistory] = useState(false)

  const inv = investments as unknown as Investment[]
  const vals = valuations as unknown as Valuation[]

  const valuationByCompany = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of vals) m[v.company_id] = v.share_price
    return m
  }, [vals])

  const entityOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: 'all', label: 'All entities' }]
    const seen = new Set<string>()
    for (const i of inv) {
      if (isBuyTx(i) && i.holding_entity && !seen.has(i.holding_entity)) {
        seen.add(i.holding_entity)
        opts.push({ value: i.holding_entity, label: i.holding_entity })
      }
    }
    return opts
  }, [inv])

  // Compute net position per company from ALL transactions (unfiltered)
  const netByCompany = useMemo(() => {
    const map = new Map<string, {
      company: Investment['companies']
      sharesIn: number
      sharesOut: number
      remaining: number
      totalCost: number
      totalProceeds: number
      costOfRemaining: number
      realisedPL: number
    }>()
    for (const i of inv) {
      const cid = i.companies?.id ?? '__unknown'
      if (!map.has(cid)) {
        map.set(cid, {
          company: i.companies,
          sharesIn: 0, sharesOut: 0, remaining: 0,
          totalCost: 0, totalProceeds: 0, costOfRemaining: 0, realisedPL: 0,
        })
      }
      const pos = map.get(cid)!
      if (isBuyTx(i)) {
        pos.sharesIn  += i.shares_purchased
        pos.totalCost += i.sum_subscribed
      } else if (isSellTx(i)) {
        pos.sharesOut     += i.shares_purchased
        pos.totalProceeds += i.sum_subscribed
      }
    }
    // Compute derived fields
    for (const pos of map.values()) {
      pos.remaining = pos.sharesIn - pos.sharesOut
      const avgCost = pos.sharesIn > 0 ? pos.totalCost / pos.sharesIn : 0
      pos.costOfRemaining = avgCost * pos.remaining
      const costOfSold = avgCost * pos.sharesOut
      pos.realisedPL = pos.totalProceeds - costOfSold
    }
    return map
  }, [inv])

  // Buy-only rows, filtered for holdings display
  const filteredBuyRows = useMemo(() => {
    return inv.filter(i => {
      if (!isBuyTx(i)) return false
      if (heldByFilter !== 'all' && i.holding_entity !== heldByFilter) return false
      if (locationFilter === 'direct' && i.holding_location !== 'direct') return false
      if (locationFilter === 'nominee' && i.holding_location !== 'nominee') return false
      if (eisFilter === 'eis' && i.eis_status !== 'yes') return false
      if (eisFilter === 'non_eis' && i.eis_status === 'yes') return false
      return true
    })
  }, [inv, heldByFilter, locationFilter, eisFilter])

  // Group filtered buy rows by company — only show companies with net remaining > 0
  const holdingsByCompany = useMemo(() => {
    const map = new Map<string, { company: Investment['companies']; rows: Investment[] }>()
    for (const i of filteredBuyRows) {
      const cid = i.companies?.id ?? '__unknown'
      const netPos = netByCompany.get(cid)
      if (!netPos || netPos.remaining <= 0) continue
      if (!map.has(cid)) map.set(cid, { company: i.companies, rows: [] })
      map.get(cid)!.rows.push(i)
    }
    return map
  }, [filteredBuyRows, netByCompany])

  // All sell rows for exit history (unfiltered, newest first)
  const sellRows = useMemo(() => {
    return inv
      .filter(isSellTx)
      .sort((a, b) => b.investment_date.localeCompare(a.investment_date))
  }, [inv])

  function toggleCompany(cid: string) {
    setExpandedCompanies(prev => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      return next
    })
  }

  const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#888', padding: '8px 12px', borderBottom: '0.5px solid #e8e7e0', whiteSpace: 'nowrap' }
  const thL: React.CSSProperties = { ...thStyle, textAlign: 'left' }
  const thR: React.CSSProperties = { ...thStyle, textAlign: 'right' }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={heldByFilter} onChange={e => setHeldByFilter(e.target.value)} style={filterStyle}>
          {entityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={filterStyle}>
          <option value="all">Direct + nominee</option>
          <option value="direct">Direct only</option>
          <option value="nominee">Nominee only</option>
        </select>
        <select value={eisFilter} onChange={e => setEisFilter(e.target.value)} style={filterStyle}>
          <option value="all">All</option>
          <option value="eis">EIS only</option>
          <option value="non_eis">Non-EIS only</option>
        </select>
      </div>

      {/* Holdings table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <table>
          <thead>
            <tr>
              <th style={{ ...thL, width: '30%' }}>Company</th>
              <th style={{ ...thR, width: '18%' }}>Invested</th>
              <th style={{ ...thR, width: '18%' }}>Current value</th>
              <th style={{ ...thR, width: '20%' }}>Change</th>
              <th style={{ ...thL, width: '14%' }}>Share class</th>
            </tr>
          </thead>
          <tbody>
            {holdingsByCompany.size === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#888' }}>
                    <TrendingUp size={24} strokeWidth={1.5} />
                    <span style={{ fontSize: 13 }}>No active holdings</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>Investments will appear here when deals are completed</span>
                    <Link href="/deals/new" className="btn btn-secondary" style={{ fontSize: 12, marginTop: 4 }}>Start a deal</Link>
                  </div>
                </td>
              </tr>
            ) : (
              Array.from(holdingsByCompany.entries()).map(([cid, { company, rows }]) => {
                const expanded    = expandedCompanies.has(cid)
                const currentPrice = valuationByCompany[cid]
                const netPos      = netByCompany.get(cid)!
                const costOfRem   = netPos.costOfRemaining
                const currentVal  = netPos.remaining * (currentPrice ?? 0)
                const unrealisedPL = currentPrice != null ? currentVal - costOfRem : null
                const { pct }     = calcGainLoss(costOfRem, currentVal)
                const isPartial   = netPos.sharesOut > 0

                return [
                  <tr
                    key={`company-${cid}`}
                    onClick={() => toggleCompany(cid)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`expand-arrow ${expanded ? 'open' : ''}`} style={{ color: '#aaa', fontSize: 11 }}>›</span>
                        <Link
                          href={`/portfolio/${cid}`}
                          onClick={e => e.stopPropagation()}
                          style={{ fontWeight: 500, color: '#0f2744', textDecoration: 'none' }}
                        >
                          {company?.name ?? 'Unknown'}
                        </Link>
                        {company?.sector && (
                          <span style={{ fontSize: 10, color: '#888' }}>{company.sector}</span>
                        )}
                        {isPartial && <span className="pill pill-amber" style={{ fontSize: 9 }}>Partial exit</span>}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(costOfRem)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>
                      {currentPrice != null ? formatCurrency(currentVal) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }} className={unrealisedPL != null && unrealisedPL >= 0 ? 'text-positive' : 'text-negative'}>
                      {unrealisedPL != null
                        ? <>{unrealisedPL >= 0 ? '+' : ''}{formatCurrency(unrealisedPL)}<div style={{ fontSize: 10 }}>{formatPercent(pct)}</div></>
                        : '—'
                      }
                    </td>
                    <td style={{ padding: '10px 12px', color: '#888' }}>{rows.length} holding{rows.length !== 1 ? 's' : ''}</td>
                  </tr>,

                  // Buy transaction rows (expanded)
                  ...(expanded ? rows.map(tx => {
                    const txCurrentValue = tx.shares_purchased * (currentPrice ?? tx.original_share_price)
                    const avgCost = netPos.sharesIn > 0 ? netPos.totalCost / netPos.sharesIn : 0
                    const txCostOfRem = avgCost * tx.shares_purchased
                    const txUnrealisedPL = currentPrice != null ? txCurrentValue - txCostOfRem : null
                    const { pct: txPct } = calcGainLoss(txCostOfRem, txCurrentValue)
                    return (
                      <tr key={`tx-${tx.id}`} style={{ background: '#fafaf8' }}>
                        <td style={{ paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 11 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {formatDate(tx.investment_date)}
                            <EisTag status={tx.eis_status} />
                            {tx.holding_location === 'nominee' && <NomineeTag />}
                          </div>
                          {tx.holding_entity && (
                            <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>Held by: {tx.holding_entity}</div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 11, textAlign: 'right' }}>{formatCurrency(tx.sum_subscribed)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, textAlign: 'right', fontWeight: 500 }}>
                          {currentPrice != null ? formatCurrency(txCurrentValue) : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 11, textAlign: 'right' }} className={txUnrealisedPL != null && txUnrealisedPL >= 0 ? 'text-positive' : 'text-negative'}>
                          {txUnrealisedPL != null
                            ? <>{txUnrealisedPL >= 0 ? '+' : ''}{formatCurrency(txUnrealisedPL)}<div style={{ fontSize: 10 }}>{formatPercent(txPct)}</div></>
                            : '—'
                          }
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 11 }}>{tx.share_class}</td>
                      </tr>
                    )
                  }) : []),
                ]
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Exit history toggle */}
      {sellRows.length > 0 && (
        <button
          onClick={() => setShowExitHistory(v => !v)}
          style={{ ...filterStyle, marginBottom: showExitHistory ? 14 : 0, color: showExitHistory ? '#0f2744' : '#555', fontWeight: showExitHistory ? 600 : 400 }}
        >
          {showExitHistory ? '▼' : '▶'} Show exit history ({sellRows.length})
        </button>
      )}

      {/* Exit history table */}
      {showExitHistory && sellRows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', fontSize: 12, fontWeight: 600, color: '#0f2744' }}>
            Exit History ({sellRows.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f7' }}>
                <th style={thL}>Company</th>
                <th style={thR}>Date</th>
                <th style={thR}>Shares sold</th>
                <th style={thR}>Sale proceeds</th>
                <th style={thR}>Realised P&L</th>
                <th style={{ ...thL, paddingLeft: 12 }}>Exit type</th>
              </tr>
            </thead>
            <tbody>
              {sellRows.map(tx => {
                const cid     = tx.companies?.id ?? '__unknown'
                const netPos  = netByCompany.get(cid)
                const avgCost = netPos && netPos.sharesIn > 0 ? netPos.totalCost / netPos.sharesIn : 0
                const costOfSold = avgCost * tx.shares_purchased
                const realisedPL = tx.sum_subscribed - costOfSold
                const isPartial  = netPos ? netPos.remaining > 0 : false
                const td: React.CSSProperties = { fontSize: 12, padding: '10px 12px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right' }
                const tdL: React.CSSProperties = { ...td, textAlign: 'left' }
                return (
                  <tr key={`sell-${tx.id}`}>
                    <td style={tdL}>
                      <Link href={`/portfolio/${cid}`} style={{ fontWeight: 500, color: '#0f2744', textDecoration: 'none' }}>
                        {tx.companies?.name ?? 'Unknown'}
                      </Link>
                    </td>
                    <td style={td}>{formatDate(tx.investment_date)}</td>
                    <td style={td}>{tx.shares_purchased.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={td}>{formatCurrency(tx.sum_subscribed)}</td>
                    <td style={{ ...td, color: realisedPL >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {costOfSold > 0
                        ? <>{realisedPL >= 0 ? '+' : ''}{formatCurrency(realisedPL)}</>
                        : '—'
                      }
                    </td>
                    <td style={{ ...tdL, paddingLeft: 12 }}>
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
  )
}

const filterStyle: React.CSSProperties = {
  padding: '5px 10px',
  border: '0.5px solid #d0d0c8',
  borderRadius: 5,
  fontSize: 12,
  background: '#fff',
  outline: 'none',
  cursor: 'pointer',
}
