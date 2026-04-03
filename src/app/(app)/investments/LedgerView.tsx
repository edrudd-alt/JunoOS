'use client'

import type { RawInvestment } from './ledgerUtils'
import { TX_COLORS, TX_LABELS, fmtAmt } from './ledgerUtils'

interface Props {
  investments: RawInvestment[]
  clientById: Record<string, string>
}

export function LedgerView({ investments, clientById }: Props) {
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
