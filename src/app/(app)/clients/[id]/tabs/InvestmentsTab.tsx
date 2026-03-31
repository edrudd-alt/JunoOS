'use client'

import { useState, useMemo } from 'react'
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
  status: string
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

export default function InvestmentsTab({ investments, valuations }: Props) {
  const [heldByFilter, setHeldByFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [eisFilter, setEisFilter] = useState('all')
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())

  const inv = investments as unknown as Investment[]
  const vals = valuations as unknown as Valuation[]

  const valuationByCompany = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of vals) m[v.company_id] = v.share_price
    return m
  }, [vals])

  const entityOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: 'all', label: 'All entities' }]
    // Collect unique holding_entity values
    const seen = new Set<string>()
    for (const i of inv) {
      if (i.holding_entity && !seen.has(i.holding_entity)) {
        seen.add(i.holding_entity)
        opts.push({ value: i.holding_entity, label: i.holding_entity })
      }
    }
    return opts
  }, [inv])

  const filtered = useMemo(() => {
    return inv.filter(i => {
      if (heldByFilter !== 'all' && i.holding_entity !== heldByFilter) return false
      if (locationFilter === 'direct' && i.holding_location !== 'direct') return false
      if (locationFilter === 'nominee' && i.holding_location !== 'nominee') return false
      if (eisFilter === 'eis' && i.eis_status !== 'yes') return false
      if (eisFilter === 'non_eis' && i.eis_status === 'yes') return false
      return true
    })
  }, [inv, heldByFilter, locationFilter, eisFilter])

  // Group by company
  const byCompany = useMemo(() => {
    const map = new Map<string, { company: Investment['companies']; rows: Investment[] }>()
    for (const i of filtered) {
      const cid = i.companies?.id ?? '__unknown'
      if (!map.has(cid)) map.set(cid, { company: i.companies, rows: [] })
      map.get(cid)!.rows.push(i)
    }
    return map
  }, [filtered])

  function toggleCompany(cid: string) {
    setExpandedCompanies(prev => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      return next
    })
  }

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

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Company</th>
              <th style={{ width: '18%' }}>Invested</th>
              <th style={{ width: '18%' }}>Current value</th>
              <th style={{ width: '20%' }}>Change</th>
              <th style={{ width: '16%' }}>Share class</th>
            </tr>
          </thead>
          <tbody>
            {byCompany.size === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>
                  No investments
                </td>
              </tr>
            ) : (
              Array.from(byCompany.entries()).map(([cid, { company, rows }]) => {
                const expanded = expandedCompanies.has(cid)
                const currentPrice = valuationByCompany[cid]

                const totalInvested = rows.reduce((s, r) => s + r.sum_subscribed, 0)
                const totalCurrentValue = rows.reduce((s, r) => s + r.shares_purchased * (currentPrice ?? r.original_share_price), 0)
                const { change, pct } = calcGainLoss(totalInvested, totalCurrentValue)

                return [
                  // Company summary row
                  <tr
                    key={`company-${cid}`}
                    onClick={() => toggleCompany(cid)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
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
                      </div>
                    </td>
                    <td>{formatCurrency(totalInvested)}</td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency(totalCurrentValue)}</td>
                    <td className={change >= 0 ? 'text-positive' : 'text-negative'}>
                      {change >= 0 ? '+' : ''}{formatCurrency(change)}
                      <div style={{ fontSize: 10 }}>{formatPercent(pct)}</div>
                    </td>
                    <td style={{ color: '#888' }}>{rows.length} holding{rows.length !== 1 ? 's' : ''}</td>
                  </tr>,

                  // Transaction rows (expanded)
                  ...(expanded ? rows.map(tx => {
                    const txCurrentValue = tx.shares_purchased * (currentPrice ?? tx.original_share_price)
                    const { change: txChange, pct: txPct } = calcGainLoss(tx.sum_subscribed, txCurrentValue)
                    return (
                      <tr key={`tx-${tx.id}`} style={{ background: '#fafaf8' }}>
                        <td style={{ paddingLeft: 36, fontSize: 11 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {formatDate(tx.investment_date)}
                            <EisTag status={tx.eis_status} />
                            {tx.holding_location === 'nominee' && <NomineeTag />}
                          </div>
                          {tx.holding_entity && (
                            <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>Held by: {tx.holding_entity}</div>
                          )}
                        </td>
                        <td style={{ fontSize: 11 }}>{formatCurrency(tx.sum_subscribed)}</td>
                        <td style={{ fontSize: 11, fontWeight: 500 }}>{formatCurrency(txCurrentValue)}</td>
                        <td style={{ fontSize: 11 }} className={txChange >= 0 ? 'text-positive' : 'text-negative'}>
                          {txChange >= 0 ? '+' : ''}{formatCurrency(txChange)}
                          <div style={{ fontSize: 10 }}>{formatPercent(txPct)}</div>
                        </td>
                        <td style={{ fontSize: 11 }}>{tx.share_class}</td>
                      </tr>
                    )
                  }) : []),
                ]
              })
            )}
          </tbody>
        </table>
      </div>
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
