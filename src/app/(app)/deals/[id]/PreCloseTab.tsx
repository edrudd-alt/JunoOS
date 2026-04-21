'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { DealInvestor, CompanyInvestmentRow, FifoLot } from './dealDetailTypes'
import type { DealInvestmentRow } from './PostDealTab'
import type { Bookbuild } from './BookbuildSection'

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
  investors:              DealInvestor[]
  dealInvestments:        DealInvestmentRow[]
  perInvestor:            Record<string, Record<string, boolean>>
  completedInvestors:     Record<string, string>
  clientToSigningStatus:  Map<string, string>
  isBuyDeal:              boolean
  isSaleDeal:             boolean
  onSetInvestorItem:      (clientId: string, itemKey: string, value: boolean) => void
  onCompleteInvestor:     (clientId: string) => void
  onCompleteSellInvestor: (clientId: string, lots: FifoLot[]) => Promise<void>
  completingInvestor:     string | null
  dealStatus:             string
  saving:                 boolean
  saved:                  boolean
  onSave:                 () => void
  onFeeOverride:          (investmentId: string, feeRate: number, feeAmount: number) => Promise<void>
  bookbuild:              Bookbuild | null
  companyInvestments:     CompanyInvestmentRow[]
  dealSharePrice:         number | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PreCloseTab({
  investors, dealInvestments, perInvestor, completedInvestors,
  clientToSigningStatus, isBuyDeal, isSaleDeal,
  onSetInvestorItem, onCompleteInvestor, onCompleteSellInvestor, completingInvestor,
  dealStatus, saving, saved, onSave, onFeeOverride,
  bookbuild, companyInvestments, dealSharePrice,
}: Props) {
  const items      = isBuyDeal ? BUY_ITEMS : SELL_ITEMS
  const isDealDone = dealStatus === 'complete'

  // Investment lookup: clientId → row
  const invMap = new Map<string, DealInvestmentRow>()
  for (const inv of dealInvestments) {
    if (!invMap.has(inv.client_id)) invMap.set(inv.client_id, inv)
  }

  // Total shares sold across all selling investors — used for proportion calc
  const totalSharesSoldInDeal = (bookbuild?.entries ?? [])
    .filter(e => e.status === 'selling')
    .reduce((s, e) => s + (e.indicative_shares ?? 0), 0)

  // Local fee editing state
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

  // Sell completion modal state
  const [pendingCompletion, setPendingCompletion] = useState<{ clientId: string; lots: FifoLot[] } | null>(null)
  const [confirming,        setConfirming]        = useState(false)
  const [completionError,   setCompletionError]   = useState<{ clientId: string; message: string } | null>(null)

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

  // ── FIFO lot calculation ───────────────────────────────────────────────────

  function calcFifoLots(clientId: string): FifoLot[] {
    const salePrice    = dealSharePrice ?? 0
    const sharesToSell = bookbuild?.entries?.find(e => e.client_id === clientId)?.indicative_shares ?? 0

    const clientLots = companyInvestments.filter(inv => inv.client_id === clientId)

    let remaining = sharesToSell
    const lots: FifoLot[] = []

    for (const lot of clientLots) {
      if (remaining <= 0) break
      const sharesConsumed = Math.min(remaining, lot.shares_purchased)
      const costBasisTotal = lot.cost_basis ?? lot.sum_subscribed
      const lotCostBasis   = lot.shares_purchased > 0
        ? costBasisTotal * sharesConsumed / lot.shares_purchased
        : 0
      const lotProceeds = sharesConsumed * salePrice
      const gainLoss    = lotProceeds - lotCostBasis
      lots.push({ investmentId: lot.id, sharesConsumed, lotCostBasis, lotProceeds, gainLoss })
      remaining -= sharesConsumed
    }

    return lots
  }

  // ── Confirm handler ───────────────────────────────────────────────────────

  async function handleConfirmCompletion() {
    if (!pendingCompletion) return
    setConfirming(true)
    await onCompleteSellInvestor(pendingCompletion.clientId, pendingCompletion.lots)
    setConfirming(false)
    setPendingCompletion(null)
  }

  if (investors.length === 0) {
    return (
      <div className="card" style={{ padding: 28, textAlign: 'center', color: '#888', fontSize: 13 }}>
        No investors on this deal.
      </div>
    )
  }

  return (
    <>
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
                    <td style={tdSt}>
                      <div style={{ fontWeight: 500 }}>{di.clients?.full_name ?? '—'}</div>
                      {di.clients?.email && <div style={{ fontSize: 10, color: '#aaa' }}>{di.clients.email}</div>}
                      {isCompleted && (
                        <span className="pill pill-green" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>
                          Completed {formatDate(completedInvestors[clientId])}
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      {inv?.shares_purchased != null
                        ? inv.shares_purchased.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : '—'}
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      {inv?.sum_subscribed != null ? formatCurrency(inv.sum_subscribed) : '—'}
                    </td>
                    <td style={{ ...tdSt, textAlign: 'center' }}>
                      <span className={`pill ${badge.cls}`} style={{ fontSize: 10 }}>{badge.label}</span>
                    </td>
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
                    <td style={{ ...tdSt, textAlign: 'center' }}>
                      {isCompleted ? (
                        <span className="pill pill-green" style={{ fontSize: 11 }}>✓ Done</span>
                      ) : (
                        <button
                          onClick={() => {
                            if (isSaleDeal) {
                              const actualSharesHeld = companyInvestments
                                .filter(inv => inv.client_id === clientId)
                                .reduce((sum, inv) => sum + (inv.shares_purchased ?? 0), 0)
                              const sharesToSell = bookbuild?.entries?.find(e => e.client_id === clientId)?.indicative_shares ?? 0
                              if (sharesToSell > actualSharesHeld) {
                                setCompletionError({ clientId, message: `Cannot complete: ${sharesToSell.toLocaleString()} shares to sell exceeds the ${actualSharesHeld.toLocaleString()} shares held. Please update the bookbuild entry.` })
                                return
                              }
                              setCompletionError(null)
                              const lots = calcFifoLots(clientId)
                              setPendingCompletion({ clientId, lots })
                            } else {
                              onCompleteInvestor(clientId)
                            }
                          }}
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
                      {completionError?.clientId === clientId && (
                        <div style={{ fontSize: 10, color: '#a32d2d', marginTop: 4, maxWidth: 180 }}>
                          {completionError.message}
                        </div>
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

      {/* ── Sell completion confirmation modal ─────────────────────────────── */}
      {pendingCompletion && (() => {
        const { clientId, lots } = pendingCompletion
        const investorName = investors.find(di => di.clients?.id === clientId)?.clients?.full_name ?? '—'
        const inv          = invMap.get(clientId)
        const feeEdit      = inv ? (feeEdits[inv.id] ?? { rate: '', amount: '' }) : null
        const feeAmount    = feeEdit ? parseFloat(feeEdit.amount) || 0 : 0
        const feeRate      = feeEdit ? parseFloat(feeEdit.rate)   || 0 : 0

        const totalProceeds    = lots.reduce((s, l) => s + l.lotProceeds,   0)
        const totalCost        = lots.reduce((s, l) => s + l.lotCostBasis,  0)
        const totalGainLoss    = lots.reduce((s, l) => s + l.gainLoss,      0)
        const totalShares      = lots.reduce((s, l) => s + l.sharesConsumed, 0)
        const netProceeds      = totalProceeds - feeAmount
        const sharesToSellForModal = bookbuild?.entries?.find(e => e.client_id === clientId)?.indicative_shares ?? 0
        const sharesMismatch   = totalShares !== sharesToSellForModal

        const investorPct = totalSharesSoldInDeal > 0
          ? ((totalShares / totalSharesSoldInDeal) * 100).toFixed(1)
          : null

        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
          }}>
            <div className="card" style={{ width: 560, padding: '24px 28px', maxHeight: '90vh', overflowY: 'auto' }}>

              {/* Title */}
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', marginBottom: 4 }}>
                Complete — {investorName}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
                {totalShares.toLocaleString(undefined, { maximumFractionDigits: 0 })} shares
                {dealSharePrice != null ? ` at £${dealSharePrice.toFixed(4)}/share` : ''}
                {investorPct != null ? ` · ${investorPct}% of deal` : ''}
              </div>

              {/* Belt-and-braces mismatch warning */}
              {sharesMismatch && (
                <div style={{ background: '#fff8e6', border: '1px solid #f5d87a', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#7a5c00' }}>
                  Warning: only {totalShares.toLocaleString()} shares could be matched from existing holdings. Please check the investor's holding records.
                </div>
              )}

              {/* FIFO lot table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 12 }}>
                <thead>
                  <tr style={{ background: '#f9f9f7' }}>
                    <th style={{ ...thSt, fontSize: 9 }}>Original date</th>
                    <th style={{ ...thSt, fontSize: 9, textAlign: 'right' }}>Shares</th>
                    <th style={{ ...thSt, fontSize: 9, textAlign: 'right' }}>Cost basis</th>
                    <th style={{ ...thSt, fontSize: 9, textAlign: 'right' }}>Proceeds</th>
                    <th style={{ ...thSt, fontSize: 9, textAlign: 'right' }}>Gain / Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot, i) => {
                    const srcLot = companyInvestments.find(ci => ci.id === lot.investmentId)
                    return (
                      <tr key={i}>
                        <td style={tdSt}>{srcLot?.investment_date ? formatDate(srcLot.investment_date) : '—'}</td>
                        <td style={{ ...tdSt, textAlign: 'right' }}>{lot.sharesConsumed.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td style={{ ...tdSt, textAlign: 'right' }}>{formatCurrency(lot.lotCostBasis)}</td>
                        <td style={{ ...tdSt, textAlign: 'right' }}>{formatCurrency(lot.lotProceeds)}</td>
                        <td style={{ ...tdSt, textAlign: 'right', color: lot.gainLoss >= 0 ? '#1d9e75' : '#a32d2d' }}>
                          {lot.gainLoss >= 0 ? '+' : ''}{formatCurrency(lot.gainLoss)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9f9f7', fontWeight: 600 }}>
                    <td style={{ ...tdSt, fontSize: 11 }}>Total</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontSize: 11 }}>{totalShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontSize: 11 }}>{formatCurrency(totalCost)}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontSize: 11 }}>{formatCurrency(totalProceeds)}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontSize: 11, color: totalGainLoss >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Fee + net proceeds */}
              <div style={{ background: '#f9f9f7', borderRadius: 6, padding: '10px 14px', marginBottom: 20, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#888' }}>Fee ({feeRate}%)</span>
                  <span style={{ color: '#555' }}>{feeAmount > 0 ? `−${formatCurrency(feeAmount)}` : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#0f2744', borderTop: '0.5px solid #e8e7e0', paddingTop: 6 }}>
                  <span>Net proceeds</span>
                  <span>{formatCurrency(netProceeds)}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setPendingCompletion(null)}
                  disabled={confirming}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmCompletion}
                  disabled={confirming}
                >
                  {confirming ? 'Completing…' : 'Confirm completion'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
