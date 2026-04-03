'use client'

import type { CompanyHolding } from './ledgerUtils'
import { fmtAmt, moicFmt } from './ledgerUtils'

interface Props {
  holdings: CompanyHolding[]
  expanded: Set<string>
  onToggle: (id: string) => void
  onSell: (companyId: string) => void
}

export function HoldingsView({ holdings, expanded, onToggle, onSell }: Props) {
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
