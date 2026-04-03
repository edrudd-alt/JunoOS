'use client'

import type { RawInvestment, CompanyHolding } from './ledgerUtils'
import { fmtAmt, pct, moicFmt } from './ledgerUtils'

interface Props {
  investments: RawInvestment[]
  holdings: CompanyHolding[]
  clientById: Record<string, string>
}

function saleHoldPeriod(firstBuyDate: string, saleDateStr: string) {
  if (!firstBuyDate || !saleDateStr) return '—'
  const days = (new Date(saleDateStr).getTime() - new Date(firstBuyDate).getTime()) / (1000 * 60 * 60 * 24)
  if (days < 0) return '—'
  if (days < 365) return `${Math.round(days)}d`
  return `${(days / 365).toFixed(1)}y`
}

export function SalesView({ investments, holdings, clientById }: Props) {
  const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#888', padding: '8px 12px', borderBottom: '0.5px solid #e8e7e0', textAlign: 'right', whiteSpace: 'nowrap' }
  const thL: React.CSSProperties    = { ...thStyle, textAlign: 'left' }
  const td: React.CSSProperties     = { fontSize: 12, padding: '10px 12px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right' }
  const tdL: React.CSSProperties    = { ...td, textAlign: 'left' }

  // Company name lookup from holdings
  const companyNameById: Record<string, string> = {}
  for (const h of holdings) companyNameById[h.companyId] = h.companyName

  // Build buy summary per client+company (avg cost, first buy date)
  const buysMap = new Map<string, { totalCost: number; sharesIn: number; firstDate: string }>()
  for (const inv of investments) {
    const txType = inv.transaction_type ?? 'buy'
    if (txType !== 'buy' && txType !== 'transfer_in') continue
    const key = `${inv.client_id}::${inv.company_id}`
    const existing = buysMap.get(key) ?? { totalCost: 0, sharesIn: 0, firstDate: inv.investment_date }
    existing.totalCost += inv.sum_subscribed
    existing.sharesIn  += inv.shares_purchased
    if (inv.investment_date < existing.firstDate) existing.firstDate = inv.investment_date
    buysMap.set(key, existing)
  }

  // Remaining shares per client+company (from holdings rows)
  const remainingMap = new Map<string, number>()
  for (const h of holdings) {
    for (const r of h.rows) {
      remainingMap.set(`${r.clientId}::${h.companyId}`, r.remaining)
    }
  }

  // All sell transactions
  const sells = investments
    .filter(inv => (inv.transaction_type ?? 'buy') === 'sell')
    .sort((a, b) => b.investment_date.localeCompare(a.investment_date))

  // Portfolio summary
  const totalInvested     = holdings.reduce((s, h) => s + h.totalCost, 0)
  const totalCurrentValue = holdings.filter(h => h.remainingShares > 0).reduce((s, h) => s + h.currentValue, 0)
  const totalProceeds     = sells.reduce((s, inv) => s + inv.sum_subscribed, 0)
  const totalReturn       = totalCurrentValue + totalProceeds - totalInvested

  if (sells.length === 0) {
    return (
      <div>
        <div className="card" style={{ textAlign: 'center', padding: '48px 0', color: '#888', fontSize: 13, marginBottom: 16 }}>
          No exits recorded yet.
        </div>
        <PortfolioSummary
          totalInvested={totalInvested}
          totalCurrentValue={totalCurrentValue}
          totalProceeds={totalProceeds}
          totalReturn={totalReturn}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f7' }}>
              <th style={thL}>Company</th>
              <th style={thL}>Investor</th>
              <th style={thStyle}>Shares sold</th>
              <th style={thStyle}>Sale date</th>
              <th style={thStyle}>Cost basis</th>
              <th style={thStyle}>Sale proceeds</th>
              <th style={thStyle}>Realised P&L</th>
              <th style={thStyle}>Return %</th>
              <th style={thStyle}>Hold period</th>
              <th style={thStyle}>Exit type</th>
            </tr>
          </thead>
          <tbody>
            {sells.map(inv => {
              const key       = `${inv.client_id}::${inv.company_id}`
              const buys      = buysMap.get(key)
              const avgCost   = buys && buys.sharesIn > 0 ? buys.totalCost / buys.sharesIn : 0
              const costBasis = avgCost * inv.shares_purchased
              const proceeds  = inv.sum_subscribed
              const pl        = proceeds - costBasis
              const retPct    = costBasis > 0 ? (pl / costBasis) * 100 : 0
              const remaining = remainingMap.get(key) ?? 0
              const isPartial = remaining > 0

              return (
                <tr key={inv.id}>
                  <td style={tdL}>{companyNameById[inv.company_id] ?? inv.company_id}</td>
                  <td style={tdL}>{clientById[inv.client_id] ?? '—'}</td>
                  <td style={td}>{inv.shares_purchased.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td style={td}>{inv.investment_date}</td>
                  <td style={td}>{costBasis > 0 ? fmtAmt(costBasis) : '—'}</td>
                  <td style={td}>{fmtAmt(proceeds)}</td>
                  <td style={{ ...td, color: pl >= 0 ? '#1d9e75' : '#a32d2d' }}>
                    {(pl >= 0 ? '+' : '') + fmtAmt(pl)}
                  </td>
                  <td style={{ ...td, color: retPct >= 0 ? '#1d9e75' : '#a32d2d' }}>
                    {costBasis > 0 ? pct(retPct) : '—'}
                  </td>
                  <td style={td}>{saleHoldPeriod(buys?.firstDate ?? '', inv.investment_date)}</td>
                  <td style={{ ...td, textAlign: 'left' }}>
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

      <PortfolioSummary
        totalInvested={totalInvested}
        totalCurrentValue={totalCurrentValue}
        totalProceeds={totalProceeds}
        totalReturn={totalReturn}
      />
    </div>
  )
}

function PortfolioSummary({
  totalInvested, totalCurrentValue, totalProceeds, totalReturn,
}: { totalInvested: number; totalCurrentValue: number; totalProceeds: number; totalReturn: number }) {
  return (
    <div className="card" style={{ background: '#f9f9f7' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
        Portfolio performance summary
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {[
          { label: 'Total invested',          value: fmtAmt(totalInvested) },
          { label: 'Current holdings value',  value: fmtAmt(totalCurrentValue) },
          { label: 'Total sale proceeds',     value: fmtAmt(totalProceeds) },
          { label: 'Total return',            value: (totalReturn >= 0 ? '+' : '') + fmtAmt(totalReturn), colour: totalReturn >= 0 ? '#1d9e75' : '#a32d2d' },
          { label: 'Blended MOIC',            value: moicFmt(totalInvested, totalCurrentValue + totalProceeds) },
        ].map(({ label, value, colour }) => (
          <div key={label}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: colour ?? '#0f2744' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
