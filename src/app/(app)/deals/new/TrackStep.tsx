'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { DealInvestor, WizardDocument } from './wizardTypes'
import { labelStyle } from './wizardTypes'

interface Props {
  dealId: string
  investors: DealInvestor[]
  documents: WizardDocument[]
  sentDate: string | null
  companyId: string
  companyName: string
  amount: string
  isInvestmentDeal: boolean
  showInvoiceCard: boolean
  invoiceInvestorIdx: number
  invoiceFeeRate: string
  invoicesSaved: string[]
  onInvoiceRateChange: (v: string) => void
  onInvoiceConfirm: () => void
  onInvoiceSkip: () => void
  onNext: () => void
}

export function TrackStep({
  dealId, investors, documents, sentDate,
  companyId, companyName, amount, isInvestmentDeal,
  showInvoiceCard, invoiceInvestorIdx, invoiceFeeRate, invoicesSaved,
  onInvoiceRateChange, onInvoiceConfirm, onInvoiceSkip, onNext,
}: Props) {
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const inv of investors) {
      for (const doc of documents) {
        if (doc.signingRequired) init[`${inv.clientId}::${doc.id}`] = 'pending'
      }
    }
    return init
  })

  const signingDocs = documents.filter(d => d.signingRequired)
  const allSigned = signingDocs.length > 0 && Object.values(statuses).every(s => s === 'signed' || s === 'not_required')
  const anySigned = Object.values(statuses).some(s => s === 'signed')

  const statusPill = (s: string) => {
    if (s === 'signed')        return <span className="pill pill-green"  style={{ fontSize: 10 }}>Signed</span>
    if (s === 'reviewed')      return <span className="pill pill-blue"   style={{ fontSize: 10 }}>Reviewed</span>
    if (s === 'not_required')  return <span className="pill pill-grey"   style={{ fontSize: 10 }}>N/A</span>
    return                            <span className="pill pill-amber"  style={{ fontSize: 10 }}>Pending</span>
  }

  const currentInvoiceInvestor = investors[invoiceInvestorIdx]
  const investmentAmount = parseFloat(amount) || 0
  const feeAmount = invoiceFeeRate ? investmentAmount * (parseFloat(invoiceFeeRate) / 100) : 0

  return (
    <div>
      {/* Sent confirmation */}
      <div style={{
        background: '#f0faf5', border: '0.5px solid #a8dfc5',
        borderRadius: 8, padding: '12px 16px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>✓</span>
        <div style={{ fontSize: 12, color: '#0f5c38' }}>
          Documents sent{sentDate ? ` on ${sentDate}` : ''}. Investment added to portfolio as pending.
        </div>
      </div>

      {/* Invoice card */}
      {showInvoiceCard && currentInvoiceInvestor && !invoicesSaved.includes(currentInvoiceInvestor.clientId) && (
        <div className="card" style={{ marginBottom: 16, border: '0.5px solid #d0d0c8' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 10, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Generate invoice — {currentInvoiceInvestor.name}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Fee rate (%)</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={invoiceFeeRate}
                onChange={e => onInvoiceRateChange(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #d0d0c8', borderRadius: 5, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
              />
            </div>
            <div style={{ fontSize: 12, color: '#555', paddingBottom: 8 }}>
              Fee: <strong>{formatCurrency(feeAmount)}</strong>
              <span style={{ color: '#888', marginLeft: 8 }}>VAT exempt · due immediately</span>
            </div>
            <div style={{ display: 'flex', gap: 6, paddingBottom: 6 }}>
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={onInvoiceConfirm}>
                Generate &amp; push to Xero
              </button>
              <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={onInvoiceSkip}>
                Do this later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suggested next step */}
      {anySigned && !allSigned && (
        <div style={{
          background: '#f0f7ff', border: '0.5px solid #c0d8f0',
          borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>Suggested next step</div>
            <div style={{ fontSize: 11, color: '#555' }}>An investor has reviewed — consider countersigning now</div>
          </div>
          <button
            className="btn btn-primary"
            disabled
            title="Electronic countersigning coming soon"
            style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.45, cursor: 'not-allowed' }}
          >
            Sign now
          </button>
        </div>
      )}

      {/* Signature tracking — per document */}
      {signingDocs.map(doc => (
        <div key={doc.id} className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '10px 16px', background: '#f9f9f7',
            borderBottom: '0.5px solid #e8e7e0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0f2744' }}>{doc.name}</span>
            {sentDate && <span style={{ fontSize: 11, color: '#888' }}>Sent {sentDate}</span>}
          </div>
          <table>
            <thead>
              <tr>
                <th>Investor</th>
                <th style={{ width: 100 }}>Method</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {investors.map(inv => {
                const key = `${inv.clientId}::${doc.id}`
                const status = statuses[key] ?? 'pending'
                return (
                  <tr key={inv.clientId}>
                    <td style={{ fontWeight: 500, fontSize: 12 }}>{inv.name}</td>
                    <td style={{ fontSize: 11, color: '#888' }}>
                      {inv.poaHeld ? 'POA — Juno signs' : 'Electronic'}
                    </td>
                    <td>
                      <select
                        value={status}
                        onChange={e => setStatuses(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{
                          padding: '3px 6px', border: '0.5px solid #d0d0c8',
                          borderRadius: 4, fontSize: 11, outline: 'none', background: '#fff',
                        }}
                      >
                        <option value="pending">Pending</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="signed">Signed</option>
                        <option value="not_required">Not required</option>
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-secondary"
                          disabled
                          title="Automated reminders coming soon"
                          style={{ fontSize: 10, padding: '3px 8px', opacity: 0.45, cursor: 'not-allowed' }}
                        >
                          Send reminder
                        </button>
                        {inv.poaHeld && (
                          <button
                            className="btn btn-secondary"
                            disabled
                            title="Electronic signing coming soon"
                            style={{ fontSize: 10, padding: '3px 8px', opacity: 0.45, cursor: 'not-allowed' }}
                          >
                            Sign now
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ marginTop: 20 }}>
        <button
          className="btn btn-primary"
          onClick={onNext}
          style={{ padding: '8px 20px' }}
        >
          View completion checklist →
        </button>
      </div>
    </div>
  )
}
