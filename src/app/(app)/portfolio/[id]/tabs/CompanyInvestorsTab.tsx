'use client'

import { useState, useMemo, useCallback } from 'react'
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

interface Props {
  investments: Record<string, unknown>[]
  currentValuation: Record<string, unknown> | null
}

function isBuyTx(tx: Investment) {
  const t = tx.transaction_type ?? 'buy'
  return t === 'buy' || t === 'transfer_in'
}

function isSellTx(tx: Investment) {
  const t = tx.transaction_type ?? 'buy'
  return t === 'sell' || t === 'transfer_out'
}

function accountKey(i: Investment) {
  return `${i.fund_type ?? ''}||${i.holding_location}||${i.holding_entity ?? ''}`
}

function accountLabel(key: string) {
  const [ft, loc, ent] = key.split('||')
  const parts: string[] = []
  if (ft)  parts.push(ft.replace(/_/g, ' '))
  if (loc) parts.push(loc.replace(/_/g, ' '))
  if (ent) parts.push(ent)
  return parts.join(' · ') || 'All accounts'
}

export default function CompanyInvestorsTab({ investments: invRaw, currentValuation: cvRaw }: Props) {
  const inv  = invRaw as unknown as Investment[]
  const cv   = cvRaw  as unknown as { share_price: number; valuation_date: string } | null

  const [currentCollapsed, setCurrentCollapsed] = useState(false)
  const [exitsCollapsed,   setExitsCollapsed]   = useState(true)
  const [expandedInvestors, setExpandedInvestors] = useState<Set<string>>(new Set())
  const [accountFilter, setAccountFilter] = useState<string>('all')

  const toggleInvestor = useCallback((cid: string) => {
    setExpandedInvestors(prev => {
      const next = new Set(prev)
      next.has(cid) ? next.delete(cid) : next.add(cid)
      return next
    })
  }, [])

  const currentPrice = cv?.share_price ?? 0

  // Net position per client
  const netByClient = useMemo(() => {
    const map = new Map<string, {
      client: Investment['clients']
      sharesIn: number; sharesOut: number; remaining: number
      totalCost: number; totalProceeds: number; costOfRemaining: number
      buyRows: Investment[]
    }>()
    for (const i of inv) {
      const cid = i.client_id
      if (!map.has(cid)) map.set(cid, {
        client: i.clients, sharesIn: 0, sharesOut: 0, remaining: 0,
        totalCost: 0, totalProceeds: 0, costOfRemaining: 0, buyRows: [],
      })
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

  // Account filter combos — from buy transactions only
  const accountCombos = useMemo(() => {
    const seen = new Set<string>()
    const combos: string[] = []
    for (const i of inv) {
      if (!isBuyTx(i)) continue
      const key = accountKey(i)
      if (!seen.has(key)) { seen.add(key); combos.push(key) }
    }
    return combos
  }, [inv])

  // Filter currentInvestors by selected account combo
  const filteredInvestors = useMemo(() => {
    if (accountFilter === 'all') return currentInvestors
    return currentInvestors.map(pos => {
      const filteredBuyRows = pos.buyRows.filter(r => accountKey(r) === accountFilter)
      if (filteredBuyRows.length === 0) return null
      const sharesIn    = filteredBuyRows.reduce((s, r) => s + r.shares_purchased, 0)
      const totalCost   = filteredBuyRows.reduce((s, r) => s + r.sum_subscribed, 0)
      const costOfRem   = totalCost // for filtered view, treat cost as all remaining cost in filter
      return { ...pos, buyRows: filteredBuyRows, sharesIn, totalCost, costOfRemaining: costOfRem, remaining: sharesIn }
    }).filter(Boolean) as typeof currentInvestors
  }, [currentInvestors, accountFilter])

  // Exit history
  const sellRows = useMemo(() =>
    inv.filter(isSellTx).sort((a, b) => b.investment_date.localeCompare(a.investment_date)),
    [inv]
  )

  // Stats
  const totalInvested = filteredInvestors.reduce((s, p) => s + p.costOfRemaining, 0)
  const currentValue  = filteredInvestors.reduce((s, p) => s + p.remaining * currentPrice, 0)
  const { change, pct } = calcGainLoss(totalInvested, currentValue)
  const shareClasses  = new Set(inv.filter(isBuyTx).map(i => i.share_class))

  const thStyle: React.CSSProperties = {
    textAlign: 'left', fontWeight: 500, color: '#aaa',
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 6,
  }
  const thR: React.CSSProperties = { ...thStyle, textAlign: 'right' }

  // Totals for current investors
  const totalShares    = filteredInvestors.reduce((s, p) => s + p.remaining, 0)
  const totalCost      = filteredInvestors.reduce((s, p) => s + p.costOfRemaining, 0)
  const totalCurVal    = filteredInvestors.reduce((s, p) => s + p.remaining * currentPrice, 0)
  const totalPL        = currentPrice > 0 ? totalCurVal - totalCost : null

  // Totals for exit history
  const exitTotalShares   = sellRows.reduce((s, r) => s + r.shares_purchased, 0)
  const exitTotalProceeds = sellRows.reduce((s, r) => s + r.sum_subscribed, 0)

  return (
    <div>
      {/* 4 stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Total invested</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>{formatCurrency(totalInvested)}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>Cost of current holdings</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Current valuation</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>{currentPrice > 0 ? formatCurrency(currentValue) : '—'}</div>
          {cv && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
              @ £{cv.share_price.toFixed(2)} · {formatDate(cv.valuation_date)}
            </div>
          )}
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Unrealised P&L</div>
          <div style={{ fontSize: 18, fontWeight: 600 }} className={currentPrice > 0 ? (change >= 0 ? 'text-positive' : 'text-negative') : ''}>
            {currentPrice > 0 ? <>{change >= 0 ? '+' : ''}{formatCurrency(change)}</> : '—'}
          </div>
          {currentPrice > 0 && (
            <div style={{ fontSize: 11, marginTop: 3 }} className={change >= 0 ? 'text-positive' : 'text-negative'}>
              {formatPercent(pct)} return
            </div>
          )}
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>Investors</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>{filteredInvestors.length}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{shareClasses.size} share class{shareClasses.size !== 1 ? 'es' : ''}</div>
        </div>
      </div>

      {/* Account filter */}
      {accountCombos.length >= 2 && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#888' }}>Account:</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              onClick={() => setAccountFilter('all')}
              style={{
                padding: '3px 10px', fontSize: 11, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: accountFilter === 'all' ? '#0f2744' : '#f5f5f2',
                color: accountFilter === 'all' ? '#fff' : '#555',
                fontWeight: accountFilter === 'all' ? 600 : 400,
              }}
            >
              All
            </button>
            {accountCombos.map(key => (
              <button
                key={key}
                onClick={() => setAccountFilter(key)}
                style={{
                  padding: '3px 10px', fontSize: 11, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: accountFilter === key ? '#0f2744' : '#f5f5f2',
                  color: accountFilter === key ? '#fff' : '#555',
                  fontWeight: accountFilter === key ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {accountLabel(key)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Current Investors */}
      <div className="card" style={{ marginBottom: 12 }}>
        <button
          onClick={() => setCurrentCollapsed(c => !c)}
          style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>
            Current Investors ({filteredInvestors.length})
          </div>
          <span className={`expand-arrow${currentCollapsed ? '' : ' open'}`} />
        </button>

        {!currentCollapsed && (
          <div style={{ marginTop: 14 }}>
            {filteredInvestors.length === 0 ? (
              <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '12px 0' }}>No current investors</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <th style={thStyle}>Investor</th>
                    <th style={thR}>Shares held</th>
                    <th style={thR}>Total invested</th>
                    <th style={thR}>Current value</th>
                    <th style={thR}>Unrealised P&L</th>
                    <th style={{ ...thStyle, paddingLeft: 8 }}>Share class</th>
                    <th style={{ ...thStyle, paddingLeft: 8 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvestors.map(pos => {
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
                                {r.fund_type && (
                                  <span className="pill pill-blue" style={{ fontSize: 9 }}>{r.fund_type.replace(/_/g, ' ')}</span>
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
                {/* Totals row */}
                <tfoot>
                  <tr style={{ borderTop: '1.5px solid #e8e7e0', background: '#f9f9f7' }}>
                    <td style={{ padding: '8px 0', fontWeight: 600, fontSize: 12, color: '#0f2744' }}>
                      Total ({filteredInvestors.length})
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, fontSize: 12, color: '#0f2744' }}>
                      {totalShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, fontSize: 12, color: '#0f2744' }}>
                      {formatCurrency(totalCost)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, fontSize: 12, color: '#0f2744' }}>
                      {currentPrice > 0 ? formatCurrency(totalCurVal) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, fontSize: 12 }}>
                      {totalPL != null ? (
                        <span className={totalPL >= 0 ? 'text-positive' : 'text-negative'}>
                          {totalPL >= 0 ? '+' : ''}{formatCurrency(totalPL)}
                        </span>
                      ) : '—'}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Exit History */}
      {sellRows.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <button
            onClick={() => setExitsCollapsed(c => !c)}
            style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>
              Exit History ({sellRows.length})
            </div>
            <span className={`expand-arrow${exitsCollapsed ? '' : ' open'}`} />
          </button>

          {!exitsCollapsed && (
            <div style={{ marginTop: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <th style={thStyle}>Investor</th>
                    <th style={thR}>Date</th>
                    <th style={thR}>Shares sold</th>
                    <th style={thR}>Sale proceeds</th>
                    <th style={thR}>Realised P&L</th>
                    <th style={thR}>Return %</th>
                    <th style={{ ...thStyle, paddingLeft: 8 }}>Exit type</th>
                  </tr>
                </thead>
                <tbody>
                  {sellRows.map(tx => {
                    const pos        = netByClient.get(tx.client_id)
                    const avgCost    = pos && pos.sharesIn > 0 ? pos.totalCost / pos.sharesIn : 0
                    const costOfSold = avgCost * tx.shares_purchased
                    const realisedPL = tx.sum_subscribed - costOfSold
                    const retPct     = costOfSold > 0 ? (realisedPL / costOfSold) * 100 : 0
                    const isPartial  = pos ? pos.remaining > 0 : false
                    const name       = tx.clients?.full_name ?? 'Unknown'
                    const cid        = tx.clients?.id ?? tx.client_id

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
                {/* Totals row */}
                <tfoot>
                  <tr style={{ borderTop: '1.5px solid #e8e7e0', background: '#f9f9f7' }}>
                    <td style={{ padding: '8px 0', fontWeight: 600, fontSize: 12, color: '#0f2744' }}>
                      Total ({sellRows.length} transactions)
                    </td>
                    <td />
                    <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, fontSize: 12, color: '#0f2744' }}>
                      {exitTotalShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, fontSize: 12, color: '#0f2744' }}>
                      {formatCurrency(exitTotalProceeds)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
