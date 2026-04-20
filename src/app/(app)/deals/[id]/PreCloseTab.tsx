'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { DealInvestor } from './dealDetailTypes'
import type { DealInvestmentRow } from './PostDealTab'

// ─── Config ───────────────────────────────────────────────────────────────────

const BUY_ITEMS = [
  { key: 'cash_received', label: 'Cash received'    },
  { key: 'docs_signed',   label: 'Documents signed' },
]

const SELL_ITEMS = [
  { key: 'consent_confirmed',     label: 'Consent confirmed'     },
  { key: 'poa_confirmed',         label: 'PoA confirmed'          },
  { key: 'bank_details_received', label: 'Bank details received'  },
]

const SIGNING_BADGE: Record<string, { label: string; cls: string }> = {
  not_sent: { label: 'Not sent', cls: 'pill-grey'  },
  pending:  { label: 'Pending',  cls: 'pill-grey'  },
  sent:     { label: 'Sent',     cls: 'pill-amber' },
  viewed:   { label: 'Viewed',   cls: 'pill-blue'  },
  signed:   { label: 'Signed',   cls: 'pill-green' },
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
const inputSt: React.CSSProperties = {
  width: 72, padding: '4px 6px', textAlign: 'right',
  border: '0.5px solid #d0d0c8', borderRadius: 4,
  fontSize: 12, outline: 'none', background: '#fff',
  fontFamily: 'inherit',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  investors:             DealInvestor[]
  dealInvestments:       DealInvestmentRow[]
  perInvestor:           Record<string, Record<string, boolean>>
  completedInvestors:    Record<string, string>
  clientToSigningStatus: Map<string, string>
  isBuyDeal:             boolean
  isSaleDeal:            boolean
  onSetInvestorItem:     (clientId: string, itemKey: string, value: boolean) => void
  onCompleteInvestor:    (clientId: string) => void
  completingInvestor:    string | null
  dealStatus:            string
  saving:                boolean
  saved:                 boolean
  onSave:                () => void
  onFeeOverride:         (investmentId: string, feeRate: number, feeAmount: number) => Promise<void>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PreCloseTab({
  investors, dealInvestments, perInvestor, completedInvestors,
  clientToSigningStatus, isBuyDeal,
  onSetInvestorItem, onCompleteInvestor, completingInvestor,
  dealStatus, saving, saved, onSave, onFeeOverride,
}: Props) {
  const items     = isBuyDeal ? BUY_ITEMS : SELL_ITEMS
  const isDealDone = dealStatus === 'complete'

  // Investment lookup: clientId → row
  const invMap = new Map<string, DealInvestmentRow>()
  for (const inv of dealInvestments) {
    if (!invMap.has(inv.client_id)) invMap.set(inv.client_id, inv)
  }

  // Local fee editing state: investmentId → { rate, amount }
  const [feeEdits, setFeeEdits] = useState<Record<string, { rate: string; amount: string }>>(() => {
    const init: Record<string, { rate: string; amount: string }> = {}
    for (const inv of dealInvestments) {
      init[inv.id] = {
        rate:   inv.fee_rate   != null ? String(inv.fee_rate)   : '',
        amount: inv.fee_amount != null ? String(inv.fee_amount) : '',
      }
    }
    return init
  })

  function isInvestorDone(clientId: string): boolean {
    const checks = perInvestor[clientId] ?? {}
    const signed = clientToSigningStatus.get(clientId) === 'signed'
    return signed && items.every(i => checks[i.key])
  }

  function tickAll(itemKey: string) {
    for (const di of investors) {
      const clientId = di.clients?.id ?? ''
      if (!clientId || completedInvestors[clientId] || isDealDone) continue
      if (!perInvestor[clientId]?.[itemKey]) {
        onSetInvestorItem(clientId, itemKey, true)
      }
    }
  }

  async function handleRateBlur(inv: DealInvestmentRow) {
    const edit = feeEdits[inv.id]
    if (!edit) return
    const rate   = parseFloat(edit.rate) || 0
    const amount = inv.sum_subscribed != null
      ? parseFloat((inv.sum_subscribed * rate / 100).toFixed(2))
      : parseFloat(edit.amount) || 0
    setFeeEdits(prev => ({ ...prev, [inv.id]: { rate: edit.rate, amount: String(amount) } }))
    await onFeeOverride(inv.id, rate, amount)
  }

  async function handleAmountBlur(inv: DealInvestmentRow) {
    const edit = feeEdits[inv.id]
    if (!edit) return
    const rate   = parseFloat(edit.rate)   || 0
    const amount = parseFloat(edit.amount) || 0
    await onFeeOverride(inv.id, rate, amount)
  }

  if (investors.length === 0) {
    return (
      <div className="card" style={{ padding: 28, textAlign: 'center', color: '#888', fontSize: 13 }}>
        No investors on this deal.
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Pre-close checklist</div>
        {!isDealDone && (
          <div style={{ display: 'flex', gap: 8 }}>
            {items.map(item => (
              <button
                key={item.key}
                onClick={() => tickAll(item.key)}
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                Tick all — {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9f9f7' }}>
              <th style={thSt}>Investor</th>
              <th style={{ ...thSt, textAlign: 'right' }}>Shares</th>
              <th style={{ ...thSt, textAlign: 'right' }}>Amount</th>
              <th style={{ ...thSt, textAlign: 'center' }}>Application form</th>
              {items.map(item => (
                <th key={item.key} style={{ ...thSt, textAlign: 'center' }}>{item.label}</th>
              ))}
              <th style={{ ...thSt, textAlign: 'right' }}>Fee %</th>
              <th style={{ ...thSt, textAlign: 'right' }}>Fee £</th>
              <th style={{ ...thSt, textAlign: 'center' }}>Complete</th>
            </tr>
          </thead>
          <tbody>
            {investors.map(di => {
              const clientId      = di.clients?.id ?? ''
              const inv           = invMap.get(clientId)
              const checks        = perInvestor[clientId] ?? {}
              const isCompleted   = !!completedInvestors[clientId]
              const isDone        = isInvestorDone(clientId)
              const isDisabled    = isDealDone || isCompleted
              const signingStatus = clientToSigningStatus.get(clientId) ?? 'not_sent'
              const badge         = SIGNING_BADGE[signingStatus] ?? SIGNING_BADGE['not_sent']
              const feeEdit       = inv ? (feeEdits[inv.id] ?? { rate: '', amount: '' }) : null

              return (
                <tr key={di.id} style={{ background: isCompleted ? '#f0faf6' : undefined }}>
                  {/* Investor */}
                  <td style={tdSt}>
                    <div style={{ fontWeight: 500 }}>{di.clients?.full_name ?? '—'}</div>
                    {di.clients?.email && <div style={{ fontSize: 10, color: '#aaa' }}>{di.clients.email}</div>}
                    {isCompleted && (
                      <span className="pill pill-green" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>
                        Completed {formatDate(completedInvestors[clientId])}
                      </span>
                    )}
                  </td>

                  {/* Shares */}
                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    {inv?.shares_purchased != null
                      ? inv.shares_purchased.toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : '—'}
                  </td>

                  {/* Amount */}
                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    {inv?.sum_subscribed != null ? formatCurrency(inv.sum_subscribed) : '—'}
                  </td>

                  {/* Application form — signing status badge */}
                  <td style={{ ...tdSt, textAlign: 'center' }}>
                    <span className={`pill ${badge.cls}`} style={{ fontSize: 10 }}>{badge.label}</span>
                  </td>

                  {/* Per-investor checklist checkboxes */}
                  {items.map(item => (
                    <td key={item.key} style={{ ...tdSt, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={checks[item.key] ?? false}
                        onChange={e => onSetInvestorItem(clientId, item.key, e.target.checked)}
                        disabled={isDisabled}
                        style={{ accentColor: '#1d9e75', width: 15, height: 15, cursor: isDisabled ? 'default' : 'pointer' }}
                      />
                    </td>
                  ))}

                  {/* Fee % */}
                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    {inv && feeEdit ? (
                      <input
                        type="number" min="0" max="100" step="0.5"
                        value={feeEdit.rate}
                        onChange={e => setFeeEdits(prev => ({ ...prev, [inv.id]: { ...prev[inv.id], rate: e.target.value } }))}
                        onBlur={() => handleRateBlur(inv)}
                        disabled={isDisabled}
                        style={inputSt}
                      />
                    ) : <span style={{ color: '#ccc' }}>—</span>}
                  </td>

                  {/* Fee £ */}
                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    {inv && feeEdit ? (
                      <input
                        type="number" min="0" step="0.01"
                        value={feeEdit.amount}
                        onChange={e => setFeeEdits(prev => ({ ...prev, [inv.id]: { ...prev[inv.id], amount: e.target.value } }))}
                        onBlur={() => handleAmountBlur(inv)}
                        disabled={isDisabled}
                        style={inputSt}
                      />
                    ) : <span style={{ color: '#ccc' }}>—</span>}
                  </td>

                  {/* Complete */}
                  <td style={{ ...tdSt, textAlign: 'center' }}>
                    {isCompleted ? (
                      <span className="pill pill-green" style={{ fontSize: 11 }}>✓ Done</span>
                    ) : (
                      <button
                        onClick={() => onCompleteInvestor(clientId)}
                        disabled={!isDone || completingInvestor === clientId || isDealDone}
                        title={!isDone ? 'Complete all checklist items first' : undefined}
                        style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 4,
                          background: isDone ? '#0f2744' : '#f5f5f2',
                          color: isDone ? '#fff' : '#bbb',
                          border: `0.5px solid ${isDone ? '#0f2744' : '#e0e0d8'}`,
                          cursor: isDone ? 'pointer' : 'not-allowed',
                          fontFamily: 'inherit', fontWeight: 500,
                        }}
                      >
                        {completingInvestor === clientId ? '…' : 'Complete'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer save */}
      {!isDealDone && (
        <div style={{ padding: '10px 16px', borderTop: '0.5px solid #e8e7e0' }}>
          <button
            className="btn"
            onClick={onSave}
            disabled={saving}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
