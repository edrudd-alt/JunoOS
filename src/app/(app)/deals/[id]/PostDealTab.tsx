'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { DealInvestor, InvestorData, DeferredPaymentRow, DeferredNoteRow, TrancheScheduleItem } from './dealDetailTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DealInvestmentRow {
  id:               string
  client_id:        string
  sum_subscribed:   number | null
  shares_purchased: number | null
  status:           string
  completion_date:  string | null
  eis_status:       string | null
  fee_rate:         number | null
  fee_amount:       number | null
}

interface Props {
  investors:             DealInvestor[]
  investorData:          Record<string, InvestorData>
  perInvestor:           Record<string, Record<string, boolean>>
  completedInvestors:    Record<string, string>
  dealInvestments:       DealInvestmentRow[]
  showEisItems:          boolean
  isSaleDeal:            boolean
  deferredConsideration?: boolean
  deferredPayments?:     DeferredPaymentRow[]
  deferredNotes?:        DeferredNoteRow[]
  completionChecklist?:  Record<string, unknown> | null
  dealId?:               string
  onCloseOut?:           () => Promise<void>
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
  isSaleDeal, deferredConsideration, deferredPayments = [], deferredNotes = [],
  completionChecklist, dealId, onCloseOut,
}: Props) {
  const supabase = createClient()

  // Inline "mark received" form state: tranche_number → { open, amount, date }
  const [receiveForm, setReceiveForm] = useState<Record<number, { open: boolean; amount: string; date: string }>>({})
  const [waiveConfirm, setWaiveConfirm] = useState<number | null>(null)
  const [savingTranche, setSavingTranche] = useState<number | null>(null)

  const [showNoteHistory, setShowNoteHistory] = useState(false)
  const [noteModalOpen,   setNoteModalOpen]   = useState(false)
  const [noteDraft,       setNoteDraft]       = useState('')
  const [savingNote,      setSavingNote]      = useState(false)
  const [localNotes,      setLocalNotes]      = useState<DeferredNoteRow[]>(deferredNotes)

  const [closingOut, setClosingOut] = useState(false)

  // Build a map from client_id → investment row for quick lookup
  const invMap = new Map<string, DealInvestmentRow>()
  for (const inv of dealInvestments) {
    if (!invMap.has(inv.client_id)) invMap.set(inv.client_id, inv)
  }

  const completedInvestorsList = investors.filter(di => {
    const clientId = di.clients?.id ?? ''
    return !!completedInvestors[clientId]
  })

  // ── Tranche aggregation ──────────────────────────────────────────────────────

  type TrancheGroup = {
    tranche_number:          number
    label:                   string
    percentage:              number
    timing:                  string
    contingency_description: string | null
    is_final_tranche:        boolean
    expectedTotal:           number
    actualTotal:             number | null
    rows:                    DeferredPaymentRow[]
    status:                  string
  }

  const trancheDefs = (completionChecklist?.tranches ?? []) as TrancheScheduleItem[]

  const trancheMap = new Map<number, TrancheGroup>()
  for (const row of deferredPayments) {
    const n    = row.tranche_number
    const def  = trancheDefs[n - 1]
    if (!trancheMap.has(n)) {
      trancheMap.set(n, {
        tranche_number:          n,
        label:                   def?.label ?? `Tranche ${n}`,
        percentage:              def?.percentage ?? 0,
        timing:                  def?.timing ?? '—',
        contingency_description: row.contingency_description,
        is_final_tranche:        row.is_final_tranche,
        expectedTotal:           0,
        actualTotal:             null,
        rows:                    [],
        status:                  'expected',
      })
    }
    const g = trancheMap.get(n)!
    g.rows.push(row)
    g.expectedTotal += row.expected_amount
    if (row.actual_amount != null) {
      g.actualTotal = (g.actualTotal ?? 0) + row.actual_amount
    }
  }

  // Derive aggregate status per tranche
  for (const g of trancheMap.values()) {
    const statuses = g.rows.map(r => r.status)
    if (statuses.every(s => s === 'received'))  g.status = 'received'
    else if (statuses.every(s => s === 'waived')) g.status = 'waived'
    else if (statuses.some(s => s === 'overdue')) g.status = 'overdue'
    else                                           g.status = 'expected'
  }

  const trancheGroups = [...trancheMap.values()].sort((a, b) => a.tranche_number - b.tranche_number)

  // ── Tranche actions ──────────────────────────────────────────────────────────

  async function markTranchReceived(trancheNumber: number, amount: string, date: string) {
    if (!dealId) return
    setSavingTranche(trancheNumber)
    const actualAmount = parseFloat(amount)
    const actualDate   = date || null
    await supabase.from('deferred_payments')
      .update({ status: 'received', actual_amount: actualAmount, actual_date: actualDate, updated_at: new Date().toISOString() })
      .eq('deal_id', dealId)
      .eq('tranche_number', trancheNumber)
    setSavingTranche(null)
    setReceiveForm(prev => ({ ...prev, [trancheNumber]: { open: false, amount: '', date: '' } }))
    // Optimistically update local rows
    setLocalTranches(trancheNumber, 'received', actualAmount, actualDate)
  }

  async function waiveTranche(trancheNumber: number) {
    if (!dealId) return
    setSavingTranche(trancheNumber)
    await supabase.from('deferred_payments')
      .update({ status: 'waived', updated_at: new Date().toISOString() })
      .eq('deal_id', dealId)
      .eq('tranche_number', trancheNumber)
    setSavingTranche(null)
    setWaiveConfirm(null)
    setLocalTranches(trancheNumber, 'waived', null, null)
  }

  // Local state mirror for deferred_payments (avoids full page refresh after each action)
  const [localPayments, setLocalPayments] = useState<DeferredPaymentRow[]>(deferredPayments)

  function setLocalTranches(trancheNumber: number, status: string, actualAmount: number | null, actualDate: string | null) {
    setLocalPayments(prev => prev.map(p =>
      p.tranche_number === trancheNumber
        ? { ...p, status, actual_amount: actualAmount ?? p.actual_amount, actual_date: actualDate ?? p.actual_date }
        : p,
    ))
  }

  // Re-derive tranche groups from localPayments for rendering
  const localTrancheMap = new Map<number, TrancheGroup>()
  for (const row of localPayments) {
    const n   = row.tranche_number
    const def = trancheDefs[n - 1]
    if (!localTrancheMap.has(n)) {
      localTrancheMap.set(n, {
        tranche_number:          n,
        label:                   def?.label ?? `Tranche ${n}`,
        percentage:              def?.percentage ?? 0,
        timing:                  def?.timing ?? '—',
        contingency_description: row.contingency_description,
        is_final_tranche:        row.is_final_tranche,
        expectedTotal:           0,
        actualTotal:             null,
        rows:                    [],
        status:                  'expected',
      })
    }
    const g = localTrancheMap.get(n)!
    g.rows.push(row)
    g.expectedTotal += row.expected_amount
    if (row.actual_amount != null) {
      g.actualTotal = (g.actualTotal ?? 0) + row.actual_amount
    }
  }
  for (const g of localTrancheMap.values()) {
    const statuses = g.rows.map(r => r.status)
    if (statuses.every(s => s === 'received'))   g.status = 'received'
    else if (statuses.every(s => s === 'waived')) g.status = 'waived'
    else if (statuses.some(s => s === 'overdue')) g.status = 'overdue'
    else                                           g.status = 'expected'
  }
  const localTrancheGroups = [...localTrancheMap.values()].sort((a, b) => a.tranche_number - b.tranche_number)

  // ── Notes ────────────────────────────────────────────────────────────────────

  async function saveNote() {
    if (!dealId || !noteDraft.trim()) return
    setSavingNote(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: inserted } = await supabase.from('deal_deferred_notes')
      .insert({ deal_id: dealId, note: noteDraft.trim(), created_by: user?.id ?? null })
      .select('id, note, created_at, created_by')
      .single()
    setSavingNote(false)
    setNoteDraft('')
    setNoteModalOpen(false)
    if (inserted) {
      setLocalNotes(prev => [{ ...inserted, author_name: null } as DeferredNoteRow, ...prev])
    }
  }

  // ── Close-out banner ─────────────────────────────────────────────────────────

  const allResolved = localPayments.length > 0
    && localPayments.every(p => p.status === 'received' || p.status === 'waived')

  // ── Render ───────────────────────────────────────────────────────────────────

  if (completedInvestorsList.length === 0 && !deferredConsideration) {
    return (
      <div className="card" style={{ padding: '28px', textAlign: 'center', color: '#888', fontSize: 13 }}>
        No investors have been completed yet. Complete an investor using the checklist above to see their post-deal status here.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Investor table ── */}
      {completedInvestorsList.length > 0 && (
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
                  {isSaleDeal && (
                    <th style={{ ...thSt, textAlign: 'center' }}>Bank details</th>
                  )}
                  <th style={{ ...thSt, textAlign: 'center' }}>Statement</th>
                  {showEisItems && (
                    <th style={{ ...thSt, textAlign: 'center', color: '#5a7a9a' }}>EIS certificate</th>
                  )}
                  <th style={{ ...thSt, textAlign: 'center' }}>Status</th>
                  <th style={{ ...thSt, width: 50 }} />
                </tr>
              </thead>
              <tbody>
                {completedInvestorsList.map(di => {
                  const clientId          = di.clients?.id ?? ''
                  const checks            = perInvestor[clientId] ?? {}
                  const iData             = clientId ? investorData[clientId] : null
                  const isEis             = ['yes', 'tbc'].includes(iData?.eis ?? '')
                  const completionDate    = completedInvestors[clientId] ?? null
                  const investment        = clientId ? invMap.get(clientId) : null

                  const bankDetailsConfirmed = checks.bank_details_received === true
                  const statementSent        = checks.statement_sent        === true
                  const eisCertReceived      = checks.eis_cert_received      === true
                  const eisCertSent          = checks.eis_cert_sent          === true

                  const allDone = statementSent
                    && (!isEis || eisCertSent)
                    && (!isSaleDeal || bankDetailsConfirmed)

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

                      {isSaleDeal && (
                        <td style={{ ...tdSt, textAlign: 'center' }}>
                          <StatusBadge done={bankDetailsConfirmed} doneLabel="Confirmed" pendingLabel="Not confirmed" />
                        </td>
                      )}

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
      )}

      {/* ── Deferred consideration section ── */}
      {deferredConsideration === true && (
        <>
          {/* Sub-section A — Tranche tracker */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Deferred consideration — tranche tracker</div>
            </div>

            {localTrancheGroups.length === 0 ? (
              <div style={{ padding: '28px', textAlign: 'center', color: '#888', fontSize: 13 }}>
                No deferred payment records yet. Payments are created when investors are completed.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f9f9f7' }}>
                      <th style={thSt}>Tranche</th>
                      <th style={{ ...thSt, textAlign: 'right' }}>%</th>
                      <th style={thSt}>Timing</th>
                      <th style={{ ...thSt, textAlign: 'right' }}>Expected total</th>
                      <th style={{ ...thSt, textAlign: 'center' }}>Status</th>
                      <th style={{ ...thSt, textAlign: 'right' }}>Actual received</th>
                      <th style={{ ...thSt, width: 180 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localTrancheGroups.map(g => {
                      const form    = receiveForm[g.tranche_number]
                      const saving  = savingTranche === g.tranche_number
                      const settled = g.status === 'received' || g.status === 'waived'

                      return (
                        <tr key={g.tranche_number}>
                          <td style={tdSt}>
                            <div style={{ fontWeight: 500 }}>{g.label}</div>
                            {g.contingency_description && (
                              <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{g.contingency_description}</div>
                            )}
                          </td>

                          <td style={{ ...tdSt, textAlign: 'right' }}>
                            {g.percentage > 0 ? `${g.percentage}%` : '—'}
                          </td>

                          <td style={{ ...tdSt, color: '#555' }}>{g.timing || '—'}</td>

                          <td style={{ ...tdSt, textAlign: 'right' }}>
                            {formatCurrency(g.expectedTotal)}
                          </td>

                          <td style={{ ...tdSt, textAlign: 'center' }}>
                            <TranchStatusPill status={g.status} />
                          </td>

                          <td style={{ ...tdSt, textAlign: 'right' }}>
                            {g.actualTotal != null ? formatCurrency(g.actualTotal) : <span style={{ color: '#ccc' }}>—</span>}
                          </td>

                          <td style={{ ...tdSt }}>
                            {settled ? (
                              <span style={{ fontSize: 11, color: '#aaa' }}>
                                {g.status === 'received' ? '✓ Received' : 'Waived'}
                              </span>
                            ) : waiveConfirm === g.tranche_number ? (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: '#555' }}>Waive?</span>
                                <button
                                  onClick={() => waiveTranche(g.tranche_number)}
                                  disabled={saving}
                                  style={{ fontSize: 11, padding: '2px 8px', background: '#f0eee8', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}
                                >
                                  {saving ? '…' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setWaiveConfirm(null)}
                                  style={{ fontSize: 11, padding: '2px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : form?.open ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <input
                                    type="number"
                                    placeholder="Amount"
                                    value={form.amount}
                                    onChange={e => setReceiveForm(prev => ({ ...prev, [g.tranche_number]: { ...prev[g.tranche_number], amount: e.target.value } }))}
                                    style={{ width: 90, fontSize: 11, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                                  />
                                  <input
                                    type="date"
                                    value={form.date}
                                    onChange={e => setReceiveForm(prev => ({ ...prev, [g.tranche_number]: { ...prev[g.tranche_number], date: e.target.value } }))}
                                    style={{ width: 110, fontSize: 11, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button
                                    onClick={() => markTranchReceived(g.tranche_number, form.amount, form.date)}
                                    disabled={saving || !form.amount}
                                    style={{ fontSize: 11, padding: '2px 8px', background: '#0f2744', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                  >
                                    {saving ? '…' : 'Save'}
                                  </button>
                                  <button
                                    onClick={() => setReceiveForm(prev => ({ ...prev, [g.tranche_number]: { open: false, amount: '', date: '' } }))}
                                    style={{ fontSize: 11, padding: '2px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => setReceiveForm(prev => ({ ...prev, [g.tranche_number]: { open: true, amount: g.expectedTotal.toFixed(2), date: new Date().toISOString().split('T')[0] } }))}
                                  style={{ fontSize: 11, padding: '2px 8px', background: '#f0faf6', color: '#1d9e75', border: '1px solid #b2dfd0', borderRadius: 4, cursor: 'pointer' }}
                                >
                                  Mark received
                                </button>
                                <button
                                  onClick={() => setWaiveConfirm(g.tranche_number)}
                                  style={{ fontSize: 11, padding: '2px 8px', background: 'none', color: '#aaa', border: '1px solid #e0e0e0', borderRadius: 4, cursor: 'pointer' }}
                                >
                                  Waive
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sub-section B — Performance notes */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Performance notes</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {localNotes.length > 1 && (
                  <button
                    onClick={() => setShowNoteHistory(h => !h)}
                    style={{ fontSize: 11, padding: '3px 10px', background: 'none', border: '1px solid #e0e0e0', borderRadius: 4, cursor: 'pointer', color: '#555' }}
                  >
                    {showNoteHistory ? 'Hide history' : `View history (${localNotes.length})`}
                  </button>
                )}
                <button
                  onClick={() => setNoteModalOpen(true)}
                  style={{ fontSize: 11, padding: '3px 10px', background: '#0f2744', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                >
                  Add note
                </button>
              </div>
            </div>

            {localNotes.length === 0 ? (
              <div style={{ fontSize: 12, color: '#aaa' }}>No notes yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(showNoteHistory ? localNotes : localNotes.slice(0, 1)).map(n => (
                  <div key={n.id} style={{ fontSize: 12, borderLeft: '3px solid #e8e7e0', paddingLeft: 10 }}>
                    <div style={{ color: '#1a1a1a', lineHeight: 1.5 }}>{n.note}</div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
                      {n.author_name ? `${n.author_name} · ` : ''}{formatDate(n.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Close-out banner */}
          {allResolved && (
            <div className="card" style={{ padding: '16px 20px', background: '#f0faf6', border: '1px solid #b2dfd0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1d9e75' }}>All deferred consideration tranches have been resolved.</div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>Would you like to close out this position?</div>
              </div>
              <button
                onClick={async () => { setClosingOut(true); await onCloseOut?.(); setClosingOut(false) }}
                disabled={closingOut}
                className="btn btn-primary"
                style={{ fontSize: 12 }}
              >
                {closingOut ? 'Closing out…' : 'Close out'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Add note modal */}
      {noteModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 440, padding: '24px' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0f2744', margin: '0 0 12px' }}>Add performance note</h2>
            <textarea
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="Enter note…"
              rows={4}
              style={{ width: '100%', fontSize: 12, padding: '8px', border: '1px solid #ddd', borderRadius: 4, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                onClick={() => { setNoteModalOpen(false); setNoteDraft('') }}
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={saveNote}
                disabled={savingNote || !noteDraft.trim()}
                className="btn btn-primary"
                style={{ fontSize: 12 }}
              >
                {savingNote ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ done, doneLabel, pendingLabel }: { done: boolean; doneLabel: string; pendingLabel: string }) {
  return done
    ? <span style={{ fontSize: 11, fontWeight: 500, color: '#1d9e75' }}>✓ {doneLabel}</span>
    : <span style={{ fontSize: 11, color: '#aaa' }}>{pendingLabel}</span>
}

function TranchStatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; color: string }> = {
    expected: { label: 'Expected', bg: '#e8f0fe', color: '#185fa5' },
    received: { label: 'Received', bg: '#f0faf6', color: '#1d9e75' },
    overdue:  { label: 'Overdue',  bg: '#fff8e6', color: '#b07d00' },
    waived:   { label: 'Waived',   bg: '#f5f5f5', color: '#888'    },
  }
  const c = config[status] ?? config.expected
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.color }}>
      {c.label}
    </span>
  )
}
