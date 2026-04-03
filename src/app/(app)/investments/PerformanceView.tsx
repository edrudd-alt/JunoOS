'use client'

import type { CompanyHolding } from './ledgerUtils'
import { fmtAmt, pct, moicFmt, irrFmt, holdPeriod } from './ledgerUtils'

interface Props {
  holdings: CompanyHolding[]
}

export function PerformanceView({ holdings }: Props) {
  const unrealised = holdings.filter(h => h.remainingShares > 0)
  const realised   = holdings.filter(h => h.soldShares > 0)

  const totalProceeds     = realised.reduce((s, h) => s + h.rows.reduce((sr, r) => sr + r.proceeds, 0), 0)
  const totalInvested     = holdings.reduce((s, h) => s + h.totalCost, 0)
  const totalCurrentValue = unrealised.reduce((s, h) => s + h.currentValue, 0)
  const totalReturn       = totalCurrentValue + totalProceeds - totalInvested

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
            { label: 'Total invested',            value: fmtAmt(totalInvested) },
            { label: 'Current value + proceeds',  value: fmtAmt(totalCurrentValue + totalProceeds) },
            { label: 'Total return',               value: (totalReturn >= 0 ? '+' : '') + fmtAmt(totalReturn), colour: totalReturn >= 0 ? '#1d9e75' : '#a32d2d' },
            { label: 'Blended MOIC',               value: moicFmt(totalInvested, totalCurrentValue + totalProceeds) },
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
