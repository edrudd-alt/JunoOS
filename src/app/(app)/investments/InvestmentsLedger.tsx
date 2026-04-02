'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TxType = 'buy' | 'sell' | 'transfer_in' | 'transfer_out'

interface RawInvestment {
  id: string
  client_id: string
  company_id: string
  share_class: string
  investment_date: string
  original_share_price: number
  shares_purchased: number
  sum_subscribed: number
  eis_status: string
  holding_entity: string | null
  holding_location: string
  status: string
  transaction_type: TxType
  cost_basis: number | null
  transfer_counterparty_id: string | null
  transfer_type: string | null
  notes: string | null
  companies: { id: string; name: string } | null
}

interface Company {
  id: string
  name: string
  share_classes: { name: string; type: string }[] | null
}

interface Client {
  id: string
  full_name: string
  email: string | null
  lead_investor_id: string | null
  entity_type: string
}

interface Valuation {
  company_id: string
  share_price: number
  valuation_date: string
}

interface HoldingRow {
  clientId: string
  clientName: string
  shareClass: string
  holdingLocation: string
  holdingEntity: string | null
  sharesIn: number
  sharesOut: number
  remaining: number
  totalCost: number
  proceeds: number
  costOfRemaining: number
  currentValue: number
  unrealisedPL: number
  realisedPL: number
  firstDate: string
}

interface CompanyHolding {
  companyId: string
  companyName: string
  currentPrice: number
  rows: HoldingRow[]
  totalCost: number
  remainingShares: number
  soldShares: number
  currentValue: number
  unrealisedPL: number
  realisedPL: number
  moic: number
  firstDate: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function moicFmt(cost: number, value: number) {
  if (cost <= 0) return '—'
  return `${(value / cost).toFixed(2)}x`
}

function irrFmt(cost: number, value: number, firstDate: string) {
  if (cost <= 0 || value <= 0 || !firstDate) return '—'
  const years = (Date.now() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24 * 365)
  if (years < 0.1) return '—'
  const r = (Math.pow(value / cost, 1 / years) - 1) * 100
  return pct(r)
}

function holdPeriod(firstDate: string) {
  if (!firstDate) return '—'
  const days = (Date.now() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24)
  if (days < 365) return `${Math.round(days)}d`
  return `${(days / 365).toFixed(1)}y`
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4,
}

function F({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

const TX_COLORS: Record<TxType, string> = {
  buy:          '#1d9e75',
  sell:         '#a32d2d',
  transfer_in:  '#6b40c4',
  transfer_out: '#6b40c4',
}

const TX_LABELS: Record<TxType, string> = {
  buy:          'Buy',
  sell:         'Sell',
  transfer_in:  'Transfer in',
  transfer_out: 'Transfer out',
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InvestmentsLedger({
  investments: initialInvestments,
  companies: companiesRaw,
  clients: clientsRaw,
  valuations: valuationsRaw,
}: {
  investments: Record<string, unknown>[]
  companies: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  valuations: Record<string, unknown>[]
}) {
  const router = useRouter()
  const companies  = companiesRaw  as unknown as Company[]
  const clients    = clientsRaw    as unknown as Client[]
  const valuations = valuationsRaw as unknown as Valuation[]

  const [investments, setInvestments] = useState<RawInvestment[]>(
    initialInvestments as unknown as RawInvestment[]
  )
  const [view, setView]           = useState<'holdings' | 'ledger' | 'performance'>('holdings')
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [modalPreset, setModalPreset] = useState<{ txType?: 'buy' | 'sell'; companyId?: string } | null>(null)

  // Latest price per company (valuations already ordered desc)
  const priceByCompany = useMemo(() => {
    const map: Record<string, number> = {}
    for (const v of valuations) {
      if (!map[v.company_id]) map[v.company_id] = v.share_price
    }
    return map
  }, [valuations])

  // Client name lookup
  const clientById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of clients) m[c.id] = c.full_name
    return m
  }, [clients])

  // Compute company holdings from raw investments
  const companyHoldings = useMemo<CompanyHolding[]>(() => {
    const byCompany: Record<string, Record<string, HoldingRow>> = {}

    for (const inv of investments) {
      const compId  = inv.company_id
      const rowKey  = `${inv.client_id}::${inv.share_class}::${inv.holding_location}::${inv.holding_entity ?? ''}`
      if (!byCompany[compId]) byCompany[compId] = {}
      if (!byCompany[compId][rowKey]) {
        byCompany[compId][rowKey] = {
          clientId:      inv.client_id,
          clientName:    clientById[inv.client_id] ?? '—',
          shareClass:    inv.share_class,
          holdingLocation: inv.holding_location,
          holdingEntity: inv.holding_entity,
          sharesIn: 0, sharesOut: 0, remaining: 0,
          totalCost: 0, proceeds: 0, costOfRemaining: 0,
          currentValue: 0, unrealisedPL: 0, realisedPL: 0,
          firstDate: inv.investment_date,
        }
      }
      const row = byCompany[compId][rowKey]
      const txType = inv.transaction_type ?? 'buy'

      if (txType === 'buy' || txType === 'transfer_in') {
        row.sharesIn  += inv.shares_purchased
        row.totalCost += inv.sum_subscribed
        if (inv.investment_date < row.firstDate) row.firstDate = inv.investment_date
      } else {
        row.sharesOut  += inv.shares_purchased
        row.proceeds   += inv.sum_subscribed
      }
    }

    const result: CompanyHolding[] = []

    for (const [compId, rowsMap] of Object.entries(byCompany)) {
      const price = priceByCompany[compId] ?? 0
      const compName = investments.find(i => i.company_id === compId)?.companies?.name ?? ''

      let aggCost = 0, aggRemaining = 0, aggSold = 0, aggValue = 0
      let aggUnrealisedPL = 0, aggRealisedPL = 0
      let firstDate = ''

      const rows = Object.values(rowsMap).map(row => {
        row.remaining = row.sharesIn - row.sharesOut
        row.costOfRemaining = row.sharesIn > 0
          ? row.totalCost * (row.remaining / row.sharesIn)
          : 0
        row.currentValue  = row.remaining * price
        row.unrealisedPL  = row.currentValue - row.costOfRemaining
        const costOfSold  = row.sharesIn > 0
          ? row.totalCost * (row.sharesOut / row.sharesIn)
          : 0
        row.realisedPL    = row.proceeds - costOfSold

        aggCost       += row.totalCost
        aggRemaining  += row.remaining
        aggSold       += row.sharesOut
        aggValue      += row.currentValue
        aggUnrealisedPL += row.unrealisedPL
        aggRealisedPL   += row.realisedPL
        if (!firstDate || row.firstDate < firstDate) firstDate = row.firstDate

        return row
      })

      result.push({
        companyId:      compId,
        companyName:    compName,
        currentPrice:   price,
        rows,
        totalCost:      aggCost,
        remainingShares: aggRemaining,
        soldShares:     aggSold,
        currentValue:   aggValue,
        unrealisedPL:   aggUnrealisedPL,
        realisedPL:     aggRealisedPL,
        moic:           aggCost > 0 ? (aggValue + (aggSold > 0 ? rows.reduce((s, r) => s + r.proceeds, 0) : 0)) / aggCost : 0,
        firstDate,
      })
    }

    return result.sort((a, b) => a.companyName.localeCompare(b.companyName))
  }, [investments, priceByCompany, clientById])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openSell(companyId: string) {
    setModalPreset({ txType: 'sell', companyId })
    setShowModal(true)
  }

  function handleSaved(newInv: RawInvestment[]) {
    setInvestments(prev => [...newInv, ...prev])
    setShowModal(false)
    router.refresh()
  }

  const viewBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? '#0f2744' : '#fff',
    color: active ? '#fff' : '#555',
    border: '0.5px solid #d0d0c8',
    borderRadius: 5, cursor: 'pointer',
  })

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Investments</h1>
        <button
          className="btn btn-primary"
          style={{ fontSize: 12 }}
          onClick={() => { setModalPreset(null); setShowModal(true) }}
        >
          + Record transaction
        </button>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        <button style={viewBtnStyle(view === 'holdings')}    onClick={() => setView('holdings')}>Holdings</button>
        <button style={viewBtnStyle(view === 'ledger')}      onClick={() => setView('ledger')}>Full ledger</button>
        <button style={viewBtnStyle(view === 'performance')} onClick={() => setView('performance')}>Performance</button>
      </div>

      {/* ── Holdings view ── */}
      {view === 'holdings' && (
        <HoldingsView
          holdings={companyHoldings}
          expanded={expanded}
          onToggle={toggleExpand}
          onSell={openSell}
        />
      )}

      {/* ── Ledger view ── */}
      {view === 'ledger' && (
        <LedgerView investments={investments} clientById={clientById} />
      )}

      {/* ── Performance view ── */}
      {view === 'performance' && (
        <PerformanceView holdings={companyHoldings} />
      )}

      {/* ── Modal ── */}
      {showModal && (
        <RecordTransactionModal
          companies={companies}
          clients={clients}
          investments={investments}
          preset={modalPreset}
          onSave={handleSaved}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ─── Holdings view ────────────────────────────────────────────────────────────

function HoldingsView({
  holdings, expanded, onToggle, onSell,
}: {
  holdings: CompanyHolding[]
  expanded: Set<string>
  onToggle: (id: string) => void
  onSell: (companyId: string) => void
}) {
  if (holdings.length === 0) {
    return <div className="card" style={{ color: '#888', fontSize: 13 }}>No investment records yet.</div>
  }

  const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#888', textAlign: 'right', padding: '8px 12px', borderBottom: '0.5px solid #e8e7e0', whiteSpace: 'nowrap' }
  const thL: React.CSSProperties    = { ...thStyle, textAlign: 'left' }
  const td: React.CSSProperties     = { fontSize: 12, padding: '10px 12px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right', verticalAlign: 'middle' }
  const tdL: React.CSSProperties    = { ...td, textAlign: 'left' }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9f9f7' }}>
            <th style={thL}>Company</th>
            <th style={thStyle}>Total cost</th>
            <th style={thStyle}>Remaining</th>
            <th style={thStyle}>Sold</th>
            <th style={thStyle}>Current value</th>
            <th style={thStyle}>Unrealised P&L</th>
            <th style={thStyle}>Realised P&L</th>
            <th style={thStyle}>MOIC</th>
            <th style={{ ...thStyle, width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map(h => {
            const isOpen = expanded.has(h.companyId)
            return (
              <>
                {/* Company row */}
                <tr
                  key={h.companyId}
                  onClick={() => onToggle(h.companyId)}
                  style={{ cursor: 'pointer', background: isOpen ? '#f9f9f7' : '#fff' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f9f9f7')}
                  onMouseLeave={e => (e.currentTarget.style.background = isOpen ? '#f9f9f7' : '#fff')}
                >
                  <td style={tdL}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#aaa', userSelect: 'none' }}>{isOpen ? '▼' : '▶'}</span>
                      <span style={{ fontWeight: 500 }}>{h.companyName}</span>
                    </div>
                  </td>
                  <td style={td}>{fmtAmt(h.totalCost)}</td>
                  <td style={td}>{h.remainingShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td style={td}>{h.soldShares > 0 ? h.soldShares.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</td>
                  <td style={td}>{h.currentPrice > 0 ? fmtAmt(h.currentValue) : '—'}</td>
                  <td style={{ ...td, color: h.unrealisedPL >= 0 ? '#1d9e75' : '#a32d2d' }}>
                    {h.currentPrice > 0 ? (h.unrealisedPL >= 0 ? '+' : '') + fmtAmt(h.unrealisedPL) : '—'}
                  </td>
                  <td style={{ ...td, color: h.realisedPL >= 0 ? '#1d9e75' : '#a32d2d' }}>
                    {h.soldShares > 0 ? (h.realisedPL >= 0 ? '+' : '') + fmtAmt(h.realisedPL) : '—'}
                  </td>
                  <td style={{ ...td, fontWeight: 500 }}>{moicFmt(h.totalCost, h.currentValue + h.rows.reduce((s, r) => s + r.proceeds, 0))}</td>
                  <td style={td}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}
                      onClick={e => { e.stopPropagation(); onSell(h.companyId) }}
                    >
                      + Sell
                    </button>
                  </td>
                </tr>

                {/* Expanded rows */}
                {isOpen && h.rows.map((r, i) => (
                  <tr key={i} style={{ background: '#fafaf8' }}>
                    <td style={{ ...tdL, paddingLeft: 32, fontSize: 11 }}>
                      <div style={{ fontWeight: 500, color: '#333' }}>{r.shareClass}</div>
                      <div style={{ color: '#888', marginTop: 1 }}>{r.clientName} · {r.holdingLocation}</div>
                    </td>
                    <td style={{ ...td, fontSize: 11 }}>{fmtAmt(r.totalCost)}</td>
                    <td style={{ ...td, fontSize: 11 }}>{r.remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={{ ...td, fontSize: 11 }}>{r.sharesOut > 0 ? r.sharesOut.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</td>
                    <td style={{ ...td, fontSize: 11 }}>{h.currentPrice > 0 ? fmtAmt(r.currentValue) : '—'}</td>
                    <td style={{ ...td, fontSize: 11, color: r.unrealisedPL >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {h.currentPrice > 0 ? (r.unrealisedPL >= 0 ? '+' : '') + fmtAmt(r.unrealisedPL) : '—'}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: r.realisedPL >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {r.sharesOut > 0 ? (r.realisedPL >= 0 ? '+' : '') + fmtAmt(r.realisedPL) : '—'}
                    </td>
                    <td style={{ ...td, fontSize: 11 }}>{moicFmt(r.totalCost, r.currentValue + r.proceeds)}</td>
                    <td style={td}></td>
                  </tr>
                ))}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Ledger view ──────────────────────────────────────────────────────────────

function LedgerView({ investments, clientById }: { investments: RawInvestment[]; clientById: Record<string, string> }) {
  const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#888', padding: '8px 12px', borderBottom: '0.5px solid #e8e7e0', textAlign: 'left', whiteSpace: 'nowrap' }
  const thR: React.CSSProperties    = { ...thStyle, textAlign: 'right' }
  const td: React.CSSProperties     = { fontSize: 12, padding: '10px 12px', borderBottom: '0.5px solid #f0f0ec', verticalAlign: 'top' }
  const tdR: React.CSSProperties    = { ...td, textAlign: 'right' }

  if (investments.length === 0) {
    return <div className="card" style={{ color: '#888', fontSize: 13 }}>No transactions recorded yet.</div>
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9f9f7' }}>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Company</th>
            <th style={thStyle}>Share class</th>
            <th style={thR}>Shares</th>
            <th style={thR}>Price/share</th>
            <th style={thR}>Amount</th>
            <th style={thStyle}>Held by</th>
            <th style={thStyle}>Tags</th>
          </tr>
        </thead>
        <tbody>
          {investments.map(inv => {
            const txType = inv.transaction_type ?? 'buy'
            const colour = TX_COLORS[txType]
            const label  = TX_LABELS[txType]
            const counterpartyName = inv.transfer_counterparty_id
              ? clientById[inv.transfer_counterparty_id] ?? '—'
              : null
            return (
              <tr key={inv.id}>
                <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{inv.investment_date}</td>
                <td style={td}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '2px 8px', borderRadius: 4,
                    background: colour + '18', color: colour,
                    fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </div>
                  {counterpartyName && (
                    <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>
                      {txType === 'transfer_out' ? 'To: ' : 'From: '}{counterpartyName}
                    </div>
                  )}
                </td>
                <td style={{ ...td, fontWeight: 500 }}>{inv.companies?.name ?? '—'}</td>
                <td style={{ ...td, color: '#888' }}>{inv.share_class}</td>
                <td style={tdR}>{inv.shares_purchased.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td style={tdR}>£{inv.original_share_price.toFixed(4)}</td>
                <td style={{ ...tdR, fontWeight: 500 }}>{fmtAmt(inv.sum_subscribed)}</td>
                <td style={{ ...td, fontSize: 11, color: '#555' }}>
                  {clientById[inv.client_id] ?? '—'}
                  {inv.holding_entity && <div style={{ color: '#aaa', fontSize: 10 }}>{inv.holding_entity}</div>}
                </td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {inv.eis_status === 'yes' && <span className="pill pill-green" style={{ fontSize: 9 }}>EIS</span>}
                    {inv.holding_location === 'nominee' && <span className="pill pill-blue" style={{ fontSize: 9 }}>Nominee</span>}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Performance view ─────────────────────────────────────────────────────────

function PerformanceView({ holdings }: { holdings: CompanyHolding[] }) {
  const unrealised = holdings.filter(h => h.remainingShares > 0)
  const realised   = holdings.filter(h => h.soldShares > 0)

  const totalProceeds = realised.reduce((s, h) => s + h.rows.reduce((sr, r) => sr + r.proceeds, 0), 0)
  const totalInvested = holdings.reduce((s, h) => s + h.totalCost, 0)
  const totalCurrentValue = unrealised.reduce((s, h) => s + h.currentValue, 0)
  const totalReturn = totalCurrentValue + totalProceeds - totalInvested
  const blendedMoic = totalInvested > 0 ? (totalCurrentValue + totalProceeds) / totalInvested : 0

  const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#888', padding: '8px 12px', borderBottom: '0.5px solid #e8e7e0', textAlign: 'right', whiteSpace: 'nowrap' }
  const thL: React.CSSProperties    = { ...thStyle, textAlign: 'left' }
  const td: React.CSSProperties     = { fontSize: 12, padding: '10px 12px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right' }
  const tdL: React.CSSProperties    = { ...td, textAlign: 'left', fontWeight: 500 }

  return (
    <div>
      {/* Unrealised */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', marginBottom: 10 }}>Unrealised holdings</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        {unrealised.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: '#888' }}>No active holdings.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f7' }}>
                <th style={thL}>Company</th>
                <th style={thStyle}>Cost</th>
                <th style={thStyle}>Shares</th>
                <th style={thStyle}>Current price</th>
                <th style={thStyle}>Current value</th>
                <th style={thStyle}>Gain / loss</th>
                <th style={thStyle}>Return %</th>
                <th style={thStyle}>MOIC</th>
                <th style={thStyle}>IRR</th>
              </tr>
            </thead>
            <tbody>
              {unrealised.map(h => {
                const costOfRemaining = h.totalCost > 0 && h.remainingShares > 0
                  ? h.totalCost * (h.remainingShares / (h.remainingShares + h.soldShares || 1))
                  : h.totalCost
                const retPct = costOfRemaining > 0
                  ? ((h.currentValue - costOfRemaining) / costOfRemaining) * 100
                  : 0
                return (
                  <tr key={h.companyId}>
                    <td style={tdL}>{h.companyName}</td>
                    <td style={td}>{fmtAmt(costOfRemaining)}</td>
                    <td style={td}>{h.remainingShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={td}>{h.currentPrice > 0 ? `£${h.currentPrice.toFixed(4)}` : '—'}</td>
                    <td style={td}>{h.currentPrice > 0 ? fmtAmt(h.currentValue) : '—'}</td>
                    <td style={{ ...td, color: h.unrealisedPL >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {h.currentPrice > 0 ? (h.unrealisedPL >= 0 ? '+' : '') + fmtAmt(h.unrealisedPL) : '—'}
                    </td>
                    <td style={{ ...td, color: retPct >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {h.currentPrice > 0 ? pct(retPct) : '—'}
                    </td>
                    <td style={{ ...td, fontWeight: 500 }}>{moicFmt(costOfRemaining, h.currentValue)}</td>
                    <td style={td}>{h.currentPrice > 0 ? irrFmt(costOfRemaining, h.currentValue, h.firstDate) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Realised */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', marginBottom: 10 }}>Realised exits</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        {realised.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: '#888' }}>No exits recorded.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f7' }}>
                <th style={thL}>Company</th>
                <th style={thStyle}>Cost of sold</th>
                <th style={thStyle}>Shares sold</th>
                <th style={thStyle}>Proceeds</th>
                <th style={thStyle}>Profit / loss</th>
                <th style={thStyle}>Return %</th>
                <th style={thStyle}>MOIC</th>
                <th style={thStyle}>Hold period</th>
              </tr>
            </thead>
            <tbody>
              {realised.map(h => {
                const proceeds = h.rows.reduce((s, r) => s + r.proceeds, 0)
                const costOfSold = h.totalCost > 0 && h.soldShares > 0
                  ? h.totalCost * (h.soldShares / (h.remainingShares + h.soldShares || 1))
                  : 0
                const pl = proceeds - costOfSold
                const retPct = costOfSold > 0 ? (pl / costOfSold) * 100 : 0
                return (
                  <tr key={h.companyId}>
                    <td style={tdL}>{h.companyName}</td>
                    <td style={td}>{fmtAmt(costOfSold)}</td>
                    <td style={td}>{h.soldShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={td}>{fmtAmt(proceeds)}</td>
                    <td style={{ ...td, color: pl >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {(pl >= 0 ? '+' : '') + fmtAmt(pl)}
                    </td>
                    <td style={{ ...td, color: retPct >= 0 ? '#1d9e75' : '#a32d2d' }}>{pct(retPct)}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{moicFmt(costOfSold, proceeds)}</td>
                    <td style={td}>{holdPeriod(h.firstDate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Combined summary */}
      <div className="card" style={{ background: '#f9f9f7' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
          Portfolio summary
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'Total invested',       value: fmtAmt(totalInvested) },
            { label: 'Current value + proceeds', value: fmtAmt(totalCurrentValue + totalProceeds) },
            { label: 'Total return',          value: (totalReturn >= 0 ? '+' : '') + fmtAmt(totalReturn), colour: totalReturn >= 0 ? '#1d9e75' : '#a32d2d' },
            { label: 'Blended MOIC',          value: moicFmt(totalInvested, totalCurrentValue + totalProceeds) },
          ].map(({ label, value, colour }) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: colour ?? '#0f2744' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Record transaction modal ─────────────────────────────────────────────────

interface LocationRow {
  id: string
  location: string
  shares: string
  eis: string
  available?: number
}

function uid() { return Math.random().toString(36).slice(2) }

const BUY_LOCATIONS = ['Direct', 'Nominee', 'ISA', 'SIPP', 'Other']

function RecordTransactionModal({
  companies, clients, investments, preset, onSave, onClose,
}: {
  companies: Company[]
  clients: Client[]
  investments: RawInvestment[]
  preset: { txType?: 'buy' | 'sell'; companyId?: string } | null
  onSave: (inv: RawInvestment[]) => void
  onClose: () => void
}) {
  const [modalType,    setModalType]    = useState<'buy' | 'sell' | 'transfer'>(preset?.txType ?? 'buy')
  const [companyId,    setCompanyId]    = useState(preset?.companyId ?? '')
  const [shareClass,   setShareClass]   = useState('')
  const [txDate,       setTxDate]       = useState(new Date().toISOString().slice(0, 10))
  const [price,        setPrice]        = useState('')
  const [heldBy,       setHeldBy]       = useState('')
  const [fromClient,   setFromClient]   = useState('')
  const [locationRows, setLocationRows] = useState<LocationRow[]>([
    { id: uid(), location: '', shares: '', eis: 'tbc' },
  ])
  // Transfer-to fields
  const [toClient,   setToClient]   = useState('')
  const [toLocation, setToLocation] = useState('direct')
  const [xferType,   setXferType]   = useState<'commercial' | 'gift'>('commercial')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState('')

  const selectedCompany = companies.find(c => c.id === companyId)
  const shareClasses = Array.isArray(selectedCompany?.share_classes)
    ? selectedCompany!.share_classes as { name: string }[]
    : []

  // Net holdings per (clientId → location) for selected company (+shareClass when set)
  const holdingsMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    if (!companyId) return map
    for (const inv of investments) {
      if (inv.company_id !== companyId) continue
      if (shareClass && inv.share_class !== shareClass) continue
      const { client_id, holding_location } = inv
      if (!map[client_id]) map[client_id] = {}
      if (!map[client_id][holding_location]) map[client_id][holding_location] = 0
      const tt = inv.transaction_type ?? 'buy'
      if (tt === 'buy'  || tt === 'transfer_in')  map[client_id][holding_location] += inv.shares_purchased
      if (tt === 'sell' || tt === 'transfer_out') map[client_id][holding_location] -= inv.shares_purchased
    }
    return map
  }, [investments, companyId, shareClass])

  // Net holdings per company (any class) → used to filter company list for sell/transfer
  const companyClientNet = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const inv of investments) {
      const { company_id, client_id, shares_purchased, transaction_type } = inv
      if (!map[company_id]) map[company_id] = {}
      if (!map[company_id][client_id]) map[company_id][client_id] = 0
      const tt = transaction_type ?? 'buy'
      if (tt === 'buy'  || tt === 'transfer_in')  map[company_id][client_id] += shares_purchased
      if (tt === 'sell' || tt === 'transfer_out') map[company_id][client_id] -= shares_purchased
    }
    return map
  }, [investments])

  const companiesWithHoldings = useMemo(() => {
    const set = new Set<string>()
    for (const [compId, clientMap] of Object.entries(companyClientNet)) {
      if (Object.values(clientMap).some(n => n > 0)) set.add(compId)
    }
    return set
  }, [companyClientNet])

  // Investors eligible in the "Held by / Transferring from" dropdown
  const eligibleInvestors = useMemo(() => {
    if (modalType === 'buy') return clients
    return clients.filter(c => Object.values(holdingsMap[c.id] ?? {}).some(n => n > 0))
  }, [modalType, clients, holdingsMap])

  // Investor currently acting as the source (sell → heldBy, transfer → fromClient)
  const activeClient = modalType === 'transfer' ? fromClient : heldBy

  // Auto-populate location rows for sell/transfer when investor or holdings change
  useEffect(() => {
    if (modalType === 'buy') return
    if (!activeClient) { setLocationRows([]); return }
    const locs = holdingsMap[activeClient] ?? {}
    const rows: LocationRow[] = Object.entries(locs)
      .filter(([, n]) => n > 0)
      .map(([loc, available]) => ({ id: uid(), location: loc, shares: '', eis: 'tbc', available }))
    setLocationRows(rows)
  }, [activeClient, holdingsMap, modalType])

  // Total amount across all filled rows
  const priceNum = parseFloat(price) || 0
  const totalAmount = locationRows.reduce((sum, row) => sum + (parseInt(row.shares) || 0) * priceNum, 0)

  function updateRow(id: string, field: keyof LocationRow, value: string) {
    setLocationRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function addRow() {
    setLocationRows(rows => [...rows, { id: uid(), location: '', shares: '', eis: 'tbc' }])
  }

  function removeRow(id: string) {
    setLocationRows(rows => rows.filter(r => r.id !== id))
  }

  // Per-row errors (oversell) and warnings (de minimis)
  const rowErrors = useMemo(() => {
    if (modalType === 'buy') return {} as Record<string, string>
    const errs: Record<string, string> = {}
    for (const row of locationRows) {
      const n = parseInt(row.shares) || 0
      if (n > 0 && row.available !== undefined && n > row.available) {
        errs[row.id] = `Only ${row.available.toLocaleString()} available`
      }
    }
    return errs
  }, [locationRows, modalType])

  const rowWarnings = useMemo(() => {
    if (modalType === 'buy') return {} as Record<string, string>
    const warns: Record<string, string> = {}
    for (const row of locationRows) {
      const n = parseInt(row.shares) || 0
      const avail = row.available ?? 0
      if (n > 0 && avail > 0 && !rowErrors[row.id]) {
        const remaining = avail - n
        if (remaining > 0 && remaining / avail < 0.01) {
          warns[row.id] = `Only ${remaining.toLocaleString()} share${remaining !== 1 ? 's' : ''} would remain (${((remaining / avail) * 100).toFixed(2)}%)`
        }
      }
    }
    return warns
  }, [locationRows, rowErrors, modalType])

  async function handleSave() {
    setErr('')
    if (!companyId)  { setErr('Select a company'); return }
    if (!shareClass) { setErr('Select a share class'); return }
    if (!price)      { setErr('Enter price per share'); return }

    if (modalType === 'buy' && !heldBy)        { setErr('Select who holds the shares'); return }
    if (modalType === 'sell' && !heldBy)        { setErr('Select who holds the shares'); return }
    if (modalType === 'transfer' && !fromClient){ setErr('Select the transferring party'); return }
    if (modalType === 'transfer' && !toClient)  { setErr('Select the recipient'); return }

    const filledRows = locationRows.filter(r => r.location && parseInt(r.shares) > 0)
    if (filledRows.length === 0) { setErr('Enter shares for at least one location'); return }
    if (Object.keys(rowErrors).length > 0) {
      setErr('One or more rows exceed available shares — correct before saving')
      return
    }

    setSaving(true)
    const supabase = createClient()

    const base = {
      company_id:           companyId,
      share_class:          shareClass,
      investment_date:      txDate,
      original_share_price: priceNum,
      status:               'active',
      notes:                notes || null,
    }

    let rows: Record<string, unknown>[]

    if (modalType === 'transfer') {
      rows = filledRows.flatMap(r => {
        const sharesNum = parseInt(r.shares)
        return [
          {
            ...base,
            client_id:                fromClient,
            transaction_type:         'transfer_out',
            holding_location:         r.location,
            eis_status:               r.eis,
            shares_purchased:         sharesNum,
            sum_subscribed:           sharesNum * priceNum,
            transfer_counterparty_id: toClient,
            transfer_type:            xferType,
          },
          {
            ...base,
            client_id:                toClient,
            transaction_type:         'transfer_in',
            holding_location:         toLocation,
            eis_status:               r.eis,
            shares_purchased:         sharesNum,
            sum_subscribed:           sharesNum * priceNum,
            transfer_counterparty_id: fromClient,
            transfer_type:            xferType,
            cost_basis:               xferType === 'gift' ? priceNum : null,
          },
        ]
      })
    } else {
      rows = filledRows.map(r => {
        const sharesNum = parseInt(r.shares)
        return {
          ...base,
          client_id:        heldBy,
          transaction_type: modalType,
          holding_location: r.location,
          eis_status:       r.eis,
          shares_purchased: sharesNum,
          sum_subscribed:   sharesNum * priceNum,
        }
      })
    }

    const { data, error } = await supabase
      .from('investments')
      .insert(rows)
      .select(`
        id, client_id, company_id, share_class, investment_date,
        original_share_price, shares_purchased, sum_subscribed,
        eis_status, holding_entity, holding_location, status,
        transaction_type, cost_basis, transfer_counterparty_id, transfer_type, notes,
        companies (id, name)
      `)

    setSaving(false)
    if (error) { setErr(error.message); return }
    onSave((data ?? []) as unknown as RawInvestment[])
  }

  const typeBtn = (t: 'buy' | 'sell' | 'transfer'): React.CSSProperties => ({
    flex: 1, padding: '8px 0', fontSize: 12, fontWeight: modalType === t ? 600 : 400,
    background: modalType === t ? '#0f2744' : '#fff',
    color: modalType === t ? '#fff' : '#555',
    border: '0.5px solid #d0d0c8', cursor: 'pointer',
  })

  const filteredCompanies = modalType === 'buy'
    ? companies
    : companies.filter(c => companiesWithHoldings.has(c.id))

  const thCell: React.CSSProperties = {
    fontSize: 10, fontWeight: 500, color: '#888',
    padding: '6px 8px', borderBottom: '0.5px solid #e8e7e0', textAlign: 'left',
  }
  const thCellR: React.CSSProperties = { ...thCell, textAlign: 'right' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 580, maxHeight: '90vh', overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Record transaction</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#aaa' }}>×</button>
        </div>

        {/* Type selector */}
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
          <button style={typeBtn('buy')} onClick={() => {
            setModalType('buy'); setHeldBy(''); setFromClient('')
            setLocationRows([{ id: uid(), location: '', shares: '', eis: 'tbc' }])
          }}>Buy</button>
          <button style={typeBtn('sell')} onClick={() => {
            setModalType('sell'); setHeldBy(''); setFromClient(''); setLocationRows([])
          }}>Sell</button>
          <button style={typeBtn('transfer')} onClick={() => {
            setModalType('transfer'); setHeldBy(''); setFromClient(''); setLocationRows([])
          }}>Internal transfer</button>
        </div>

        {/* Contextual notes */}
        {modalType === 'sell' && (
          <div style={{ background: '#f9f9f7', border: '0.5px solid #e8e7e0', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#888' }}>
            Oldest lots sold first (FIFO). Cost basis will be allocated automatically.
          </div>
        )}
        {modalType === 'transfer' && xferType === 'gift' && (
          <div style={{ background: '#fffbeb', border: '0.5px solid #f0c674', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#78500a' }}>
            Gift transfer: recipient inherits the donor&apos;s cost basis for P&amp;L purposes.
          </div>
        )}

        {/* Company */}
        <F label="Company *">
          <select
            value={companyId}
            onChange={e => { setCompanyId(e.target.value); setShareClass(''); setHeldBy(''); setFromClient(''); setLocationRows(modalType === 'buy' ? [{ id: uid(), location: '', shares: '', eis: 'tbc' }] : []) }}
            style={inputStyle}
          >
            <option value="">Select company…</option>
            {filteredCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {modalType !== 'buy' && filteredCompanies.length === 0 && companyId === '' && (
            <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>No companies with existing holdings recorded</div>
          )}
        </F>

        {/* Share class */}
        <F label="Share class *">
          <select
            value={shareClass}
            onChange={e => { setShareClass(e.target.value); setLocationRows(modalType === 'buy' ? [{ id: uid(), location: '', shares: '', eis: 'tbc' }] : []) }}
            style={inputStyle}
            disabled={!companyId}
          >
            <option value="">Select…</option>
            {shareClasses.map(sc => <option key={sc.name} value={sc.name}>{sc.name}</option>)}
            <option value="Ordinary">Ordinary</option>
          </select>
        </F>

        {/* Held by / Transferring from */}
        <F label={modalType === 'transfer' ? 'Transferring from *' : 'Held by *'}>
          <select
            value={activeClient}
            onChange={e => {
              if (modalType === 'transfer') setFromClient(e.target.value)
              else setHeldBy(e.target.value)
            }}
            style={inputStyle}
            disabled={!companyId}
          >
            <option value="">
              {!companyId ? 'Select a company first…' : 'Select…'}
            </option>
            {eligibleInvestors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </F>

        {/* Price + Date side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <F label="Price per share (£) *">
            <input
              type="number" min="0" step="0.0001"
              value={price} onChange={e => setPrice(e.target.value)}
              placeholder="1.0000" style={inputStyle}
            />
          </F>
          <F label="Date *">
            <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} style={inputStyle} />
          </F>
        </div>

        {/* Location table */}
        {(modalType === 'buy' || activeClient) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 8 }}>
              {modalType === 'buy' ? 'Locations' : 'Locations with available shares'}
            </div>

            {locationRows.length === 0 && modalType !== 'buy' && (
              <div style={{ fontSize: 12, color: '#aaa', padding: '8px 0' }}>
                No shares found for the selected investor and share class.
              </div>
            )}

            {locationRows.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
                <thead>
                  <tr style={{ background: '#f9f9f7' }}>
                    <th style={thCell}>Location</th>
                    {modalType !== 'buy' && <th style={thCellR}>Available</th>}
                    <th style={thCellR}>Shares</th>
                    {modalType !== 'buy' && <th style={thCellR}>Remaining</th>}
                    {modalType !== 'buy' && <th style={thCellR}>Proceeds</th>}
                    <th style={thCell}>EIS qualifying</th>
                    {modalType === 'buy' && <th style={{ ...thCell, width: 24 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {locationRows.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec' }}>
                        {modalType === 'buy' ? (
                          <select
                            value={row.location}
                            onChange={e => updateRow(row.id, 'location', e.target.value)}
                            style={{ ...inputStyle, padding: '5px 8px' }}
                          >
                            <option value="">Select…</option>
                            {BUY_LOCATIONS.map(l => (
                              <option key={l} value={l.toLowerCase()}>{l}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 500 }}>
                            {row.location.charAt(0).toUpperCase() + row.location.slice(1)}
                          </span>
                        )}
                      </td>
                      {modalType !== 'buy' && (
                        <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right', fontSize: 12, color: '#555' }}>
                          {row.available?.toLocaleString() ?? '—'}
                        </td>
                      )}
                      <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec' }}>
                        <input
                          type="number" min="0" step="1"
                          value={row.shares}
                          onChange={e => updateRow(row.id, 'shares', e.target.value)}
                          placeholder="0"
                          style={{
                            ...inputStyle, padding: '5px 8px', textAlign: 'right',
                            borderColor: rowErrors[row.id] ? '#fca5a5' : '#d0d0c8',
                          }}
                        />
                        {rowErrors[row.id] && (
                          <div style={{ fontSize: 10, color: '#a32d2d', marginTop: 2 }}>
                            ⚠ {rowErrors[row.id]}
                          </div>
                        )}
                        {rowWarnings[row.id] && !rowErrors[row.id] && (
                          <div style={{ fontSize: 10, color: '#78500a', marginTop: 2 }}>
                            ⚠ {rowWarnings[row.id]}
                          </div>
                        )}
                      </td>
                      {modalType !== 'buy' && (() => {
                        const sharesEntered = parseInt(row.shares) || 0
                        const remaining = row.available !== undefined ? row.available - sharesEntered : null
                        const proceeds = sharesEntered > 0 ? sharesEntered * priceNum : null
                        return (
                          <>
                            <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right', fontSize: 12, color: remaining !== null && remaining < 0 ? '#a32d2d' : '#555' }}>
                              {sharesEntered > 0 && remaining !== null ? remaining.toLocaleString() : '—'}
                            </td>
                            <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right', fontSize: 12, fontWeight: 500, color: '#0f2744' }}>
                              {proceeds !== null ? fmtAmt(proceeds) : '—'}
                            </td>
                          </>
                        )
                      })()}
                      <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec' }}>
                        <select
                          value={row.eis}
                          onChange={e => updateRow(row.id, 'eis', e.target.value)}
                          style={{ ...inputStyle, padding: '5px 8px' }}
                        >
                          <option value="tbc">TBC</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </td>
                      {modalType === 'buy' && (
                        <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'center' }}>
                          {locationRows.length > 1 && (
                            <button
                              onClick={() => removeRow(row.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 15, padding: 0, lineHeight: 1 }}
                            >×</button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {modalType === 'buy' && (
              <button
                onClick={addRow}
                style={{ fontSize: 11, color: '#0f2744', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}
              >
                + Add location
              </button>
            )}
          </div>
        )}

        {/* Total amount */}
        {totalAmount > 0 && (
          <div style={{ fontSize: 12, color: '#555', marginBottom: 14, padding: '8px 10px', background: '#f9f9f7', borderRadius: 5 }}>
            Total amount: <strong>{fmtAmt(totalAmount)}</strong>
          </div>
        )}

        {/* Transfer-to section */}
        {modalType === 'transfer' && (
          <div style={{ borderTop: '0.5px solid #e8e7e0', paddingTop: 16, marginTop: 4, marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 12 }}>Transfer to</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <F label="Transfer type">
                  <select value={xferType} onChange={e => setXferType(e.target.value as 'commercial' | 'gift')} style={inputStyle}>
                    <option value="commercial">Commercial sale</option>
                    <option value="gift">Gift</option>
                  </select>
                </F>
              </div>
              <F label="Transferring to *">
                <select value={toClient} onChange={e => setToClient(e.target.value)} style={inputStyle}>
                  <option value="">Select…</option>
                  {clients.filter(c => c.id !== fromClient).map(c =>
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  )}
                </select>
              </F>
              <F label="Recipient location">
                <select value={toLocation} onChange={e => setToLocation(e.target.value)} style={inputStyle}>
                  {BUY_LOCATIONS.map(l => <option key={l} value={l.toLowerCase()}>{l}</option>)}
                </select>
              </F>
            </div>
          </div>
        )}

        <F label="Notes (optional)">
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. EIS3 received" style={inputStyle} />
        </F>

        {err && <p style={{ fontSize: 12, color: '#a32d2d', margin: '0 0 12px' }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '9px 0' }}>
            {saving ? 'Saving…' : modalType === 'transfer' ? 'Record transfer' : `Record ${modalType}`}
          </button>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '9px 16px' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
