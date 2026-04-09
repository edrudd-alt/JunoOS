'use client'

import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { DealInvestor, InvestorData } from './dealDetailTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DealInvestmentRow {
  id:               string
  client_id:        string
  sum_subscribed:   number | null
  shares_purchased: number | null
  status:           string
  completion_date:  string | null
  eis_status:       string | null
}

interface Props {
  investors:          DealInvestor[]
  investorData:       Record<string, InvestorData>
  perInvestor:        Record<string, Record<string, boolean>>
  completedInvestors: Record<string, string>
  dealInvestments:    DealInvestmentRow[]
  showEisItems:       boolean
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 500, color: '#888',
  textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e8e7e0',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

const tdSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 12, borderBottom: '0.5px solid #f0f0ec', verticalAlign: 'middle',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PostDealTab({
  investors, investorData, perInvestor, completedInvestors, dealInvestments, showEisItems,
}: Props) {
  // Build a map from client_id → investment row for quick lookup
  const invMap = new Map<string, DealInvestmentRow>()
  for (const inv of dealInvestments) {
    if (!invMap.has(inv.client_id)) invMap.set(inv.client_id, inv)
  }

  if (investors.length === 0) {
    return (
      <div className="card" style={{ padding: '28px', textAlign: 'center', color: '#888', fontSize: 13 }}>
        No investors on this deal
      </div>
    )
  }

  const anyCompleted = Object.keys(completedInvestors).length > 0
  if (!anyCompleted) {
    return (
      <div className="card" style={{ padding: '28px', textAlign: 'center', color: '#888', fontSize: 13 }}>
        No investors have completed yet. The post-deal checklist will appear here once an investor is marked as complete.
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Post-deal tracker</div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9f9f7' }}>
              <th style={thSt}>Investor</th>
              <th style={{ ...thSt, textAlign: 'right' }}>Amount</th>
              <th style={{ ...thSt, textAlign: 'right' }}>Shares</th>
              <th style={thSt}>Completed</th>
              <th style={{ ...thSt, textAlign: 'center' }}>Statement</th>
              {showEisItems && (
                <th style={{ ...thSt, textAlign: 'center', color: '#5a7a9a' }}>EIS certificate</th>
              )}
              <th style={{ ...thSt, textAlign: 'center' }}>Status</th>
              <th style={{ ...thSt, width: 50 }} />
            </tr>
          </thead>
          <tbody>
            {investors.map(di => {
              const clientId       = di.clients?.id ?? ''
              const checks         = perInvestor[clientId] ?? {}
              const iData          = clientId ? investorData[clientId] : null
              const isEis          = ['yes', 'tbc'].includes(iData?.eis ?? '')
              const completionDate = completedInvestors[clientId] ?? null
              const investment     = clientId ? invMap.get(clientId) : null

              const statementSent  = checks.statement_sent  === true
              const eisCertReceived = checks.eis_cert_received === true
              const eisCertSent     = checks.eis_cert_sent    === true

              const allDone = statementSent && (!isEis || eisCertSent)

              // Derive EIS certificate display state
              let eisCell: React.ReactNode = null
              if (showEisItems) {
                if (!isEis) {
                  eisCell = <span style={{ color: '#ccc', fontSize: 11 }}>N/A</span>
                } else if (eisCertReceived && eisCertSent) {
                  eisCell = <span className="pill pill-green" style={{ fontSize: 11 }}>Sent</span>
                } else if (eisCertReceived) {
                  eisCell = <span className="pill pill-blue" style={{ fontSize: 11 }}>Received</span>
                } else {
                  eisCell = <span className="pill pill-amber" style={{ fontSize: 11 }}>Outstanding</span>
                }
              }

              return (
                <tr key={di.id}>
                  <td style={tdSt}>
                    <div style={{ fontWeight: 500 }}>{di.clients?.full_name ?? '—'}</div>
                    {di.clients?.email && (
                      <div style={{ fontSize: 10, color: '#aaa' }}>{di.clients.email}</div>
                    )}
                  </td>

                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    {investment?.sum_subscribed != null
                      ? formatCurrency(investment.sum_subscribed)
                      : '—'}
                  </td>

                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    {investment?.shares_purchased != null
                      ? investment.shares_purchased.toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : '—'}
                  </td>

                  <td style={tdSt}>
                    {completionDate
                      ? <span style={{ color: '#1d9e75', fontWeight: 500 }}>{formatDate(completionDate)}</span>
                      : <span style={{ color: '#aaa' }}>Not completed</span>}
                  </td>

                  <td style={{ ...tdSt, textAlign: 'center' }}>
                    <StatusBadge done={statementSent} doneLabel="Sent" pendingLabel="Not sent" />
                  </td>

                  {showEisItems && (
                    <td style={{ ...tdSt, textAlign: 'center' }}>{eisCell}</td>
                  )}

                  <td style={{ ...tdSt, textAlign: 'center' }}>
                    {allDone
                      ? <span className="pill pill-green">All done</span>
                      : <span className="pill pill-amber">Outstanding</span>}
                  </td>

                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    {investment?.id
                      ? <Link href={`/investments/${investment.id}`} style={{ fontSize: 11, color: '#185fa5', textDecoration: 'none' }}>View</Link>
                      : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function StatusBadge({ done, doneLabel, pendingLabel }: { done: boolean; doneLabel: string; pendingLabel: string }) {
  return done
    ? <span style={{ fontSize: 11, fontWeight: 500, color: '#1d9e75' }}>✓ {doneLabel}</span>
    : <span style={{ fontSize: 11, color: '#aaa' }}>{pendingLabel}</span>
}
