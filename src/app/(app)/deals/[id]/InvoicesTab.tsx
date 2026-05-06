'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  sendToXero, markInvoicePaid, markInvoiceUnsent, markInvoiceUnpaid,
  editInvoiceDueDate, deleteInvoice,
} from './invoiceActions'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InvoiceRow {
  id: string
  deal_id: string | null
  client_id: string
  company_id: string | null
  deal_investor_id: string | null
  investment_amount: number
  fee_percentage: number  // stored as 5.0, not 0.05
  fee_amount: number
  vat_amount: number
  due_date: string | null
  issued_at: string | null
  xero_invoice_id: string | null
  xero_invoice_number: string | null
  status: 'draft' | 'sent' | 'paid'
  created_at: string
  clientName: string
  vehicleName: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toDateInput(s: string | null | undefined): string {
  if (!s) return ''
  return s.slice(0, 10)
}

const STATUS_ORDER: Record<string, number> = { draft: 0, sent: 1, paid: 2 }

const STATUS_CONFIG = {
  draft: { label: 'Draft',        bg: '#fef3c7', color: '#92400e' },
  sent:  { label: 'Sent to Xero', bg: '#dbeafe', color: '#1e40af' },
  paid:  { label: 'Paid',         bg: '#d1fae5', color: '#065f46' },
}

function investorLabel(inv: InvoiceRow): string {
  return inv.vehicleName ? `${inv.clientName} via ${inv.vehicleName}` : inv.clientName
}

// ── Column layout ──────────────────────────────────────────────────────────────
// Widths chosen to keep total under ~1050px on a typical laptop viewport.
const COL = {
  investor:   { flex: 1, minWidth: 140 },
  investment: { width: 106 },
  feePct:     { width: 60  },
  fee:        { width: 92  },
  vat:        { width: 64  },
  total:      { width: 92  },
  issued:     { width: 86  },
  due:        { width: 86  },
  status:     { width: 94  },
  xero:       { width: 116 },
  menu:       { width: 40  },
}

function ColHead({ label, right }: { label: string; right?: boolean }) {
  return (
    <div style={{
      padding: '7px 6px',
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.05em', color: '#aaa',
      textAlign: right ? 'right' : 'left',
    }}>
      {label}
    </div>
  )
}

function Cell({ children, right, style }: {
  children: React.ReactNode; right?: boolean; style?: React.CSSProperties
}) {
  return (
    <div style={{
      padding: '9px 6px', fontSize: 12, color: '#0f2744',
      textAlign: right ? 'right' : 'left',
      fontVariantNumeric: right ? 'tabular-nums' : undefined,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function InvoicesTab({
  deal, invoices, onDataRefresh,
}: {
  deal: { id: string; company_id: string | null }
  invoices: InvoiceRow[]
  onDataRefresh: () => void
}) {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  // ── Toolbar state ─────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Set<'draft' | 'sent' | 'paid'>>(new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!filterOpen) return
    function onDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [filterOpen])

  // ── Menu state (portal pattern, position:fixed) ───────────────────────────
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  function openMenu(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (openMenuId === id) { setOpenMenuId(null); setMenuPos(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenuPos({ x: rect.right, y: rect.bottom + 4 })
    setOpenMenuId(id)
  }

  function closeMenu() { setOpenMenuId(null); setMenuPos(null) }

  // ── Modal state ───────────────────────────────────────────────────────────
  const [viewInvoice, setViewInvoice] = useState<InvoiceRow | null>(null)
  const [editInvoice, setEditInvoice] = useState<InvoiceRow | null>(null)
  const [editDueDate, setEditDueDate] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  type ConfirmType = 'sendToXero' | 'markPaid' | 'markUnsent' | 'markUnpaid' | 'delete'
  const [confirmModal, setConfirmModal] = useState<{ type: ConfirmType; invoice: InvoiceRow } | null>(null)
  const [confirmSaving, setConfirmSaving] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }
  function showError(msg: string) { setToast(`⚠ ${msg}`); setTimeout(() => setToast(null), 5000) }

  // ── Filtered + sorted ─────────────────────────────────────────────────────
  const filtered = [...invoices]
    .filter(inv => statusFilter.size === 0 || statusFilter.has(inv.status))
    .filter(inv => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        inv.clientName.toLowerCase().includes(q) ||
        (inv.vehicleName ?? '').toLowerCase().includes(q) ||
        (inv.xero_invoice_number ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      const sd = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0)
      if (sd !== 0) return sd
      return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')
    })

  const totalInvestment = filtered.reduce((s, i) => s + (i.investment_amount ?? 0), 0)
  const totalFee        = filtered.reduce((s, i) => s + (i.fee_amount ?? 0), 0)

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleConfirmAction() {
    if (!confirmModal || !userId) return
    const { type, invoice } = confirmModal
    setConfirmSaving(true); setConfirmError(null)
    let result: { error: string | null }

    if (type === 'sendToXero')  result = await sendToXero(supabase, invoice.id, deal.id, invoice.deal_investor_id, userId)
    else if (type === 'markPaid')   result = await markInvoicePaid(supabase, invoice.id, deal.id, invoice.deal_investor_id, userId)
    else if (type === 'markUnsent') result = await markInvoiceUnsent(supabase, invoice.id, deal.id, invoice.deal_investor_id, userId)
    else if (type === 'markUnpaid') result = await markInvoiceUnpaid(supabase, invoice.id, deal.id, invoice.deal_investor_id, userId)
    else result = await deleteInvoice(supabase, invoice.id, deal.id, invoice.deal_investor_id, userId)

    setConfirmSaving(false)
    if (result.error) { setConfirmError(result.error); return }

    const toasts: Record<ConfirmType, string> = {
      sendToXero:  'Invoice sent to Xero',
      markPaid:    'Invoice marked paid',
      markUnsent:  'Invoice moved back to draft',
      markUnpaid:  'Invoice marked unpaid',
      delete:      'Invoice deleted',
    }
    showToast(toasts[type])
    setConfirmModal(null)
    onDataRefresh()
  }

  async function handleEditSave() {
    if (!editInvoice || !userId || !editDueDate) { setEditError('Please enter a due date.'); return }
    setEditSaving(true); setEditError(null)
    const result = await editInvoiceDueDate(
      supabase, editInvoice.id, deal.id, editInvoice.deal_investor_id,
      editInvoice.due_date, editDueDate, userId,
    )
    setEditSaving(false)
    if (result.error) { setEditError(result.error); return }
    setEditInvoice(null)
    showToast('Due date updated')
    onDataRefresh()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div onClick={() => { if (openMenuId) closeMenu() }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '12px 16px', borderBottom: '0.5px solid var(--card-border)',
        background: '#fafaf8',
      }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by investor or Xero invoice number…"
          style={{
            flex: 1, minWidth: 180, maxWidth: 320, padding: '6px 10px', fontSize: 12,
            borderRadius: 6, border: '1px solid #d0d0c8', outline: 'none',
          }}
        />

        <div ref={filterRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setFilterOpen(o => !o)}
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 6,
              border: '1px solid #d0d0c8', background: statusFilter.size > 0 ? '#e8f0fb' : '#fff',
              color: statusFilter.size > 0 ? '#185fa5' : '#555',
              cursor: 'pointer', fontWeight: statusFilter.size > 0 ? 600 : 400,
            }}
          >
            Status {statusFilter.size > 0 ? `(${statusFilter.size})` : '▾'}
          </button>
          {filterOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
              background: '#fff', border: '0.5px solid var(--card-border)',
              borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              padding: '4px 0', minWidth: 160,
            }}>
              {(['draft', 'sent', 'paid'] as const).map(s => (
                <label key={s} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px', cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={statusFilter.has(s)}
                    onChange={() => {
                      setStatusFilter(prev => {
                        const next = new Set(prev)
                        if (next.has(s)) next.delete(s); else next.add(s)
                        return next
                      })
                    }}
                  />
                  <span style={{ fontSize: 12, color: '#0f2744' }}>{STATUS_CONFIG[s].label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {(search || statusFilter.size > 0) && (
          <button
            onClick={() => { setSearch(''); setStatusFilter(new Set()) }}
            style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: 'none', background: 'none', color: '#888', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto' }}>

        {/* Header */}
        <div style={{
          display: 'flex', borderBottom: '0.5px solid var(--card-border)',
          background: '#fafaf8', minWidth: 860,
        }}>
          <div style={{ ...COL.investor, padding: '0 6px' }}><ColHead label="Investor" /></div>
          <div style={{ ...COL.investment }}><ColHead label="Investment (£)" right /></div>
          <div style={{ ...COL.feePct    }}><ColHead label="Fee %" right /></div>
          <div style={{ ...COL.fee       }}><ColHead label="Fee (£)" right /></div>
          <div style={{ ...COL.vat       }}><ColHead label="VAT (£)" right /></div>
          <div style={{ ...COL.total     }}><ColHead label="Total (£)" right /></div>
          <div style={{ ...COL.issued    }}><ColHead label="Issued" right /></div>
          <div style={{ ...COL.due       }}><ColHead label="Due" right /></div>
          <div style={{ ...COL.status    }}><ColHead label="Status" /></div>
          <div style={{ ...COL.xero      }}><ColHead label="Xero Invoice #" /></div>
          <div style={{ ...COL.menu      }} />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            {invoices.length === 0 ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                  No invoices yet
                </div>
                <div style={{ fontSize: 12, color: '#999', maxWidth: 440, margin: '0 auto' }}>
                  Invoices are created automatically when you confirm an investment.
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>
                  No invoices match your filters.
                </div>
                <button
                  onClick={() => { setSearch(''); setStatusFilter(new Set()) }}
                  style={{ fontSize: 12, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {filtered.map((inv, idx) => {
              const sc = STATUS_CONFIG[inv.status]
              const isMenuOpen = openMenuId === inv.id
              const feePctNum = Number(inv.fee_percentage)
              const total = (inv.fee_amount ?? 0) + (inv.vat_amount ?? 0)

              return (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex', alignItems: 'center',
                    borderTop: idx > 0 ? '0.5px solid var(--card-border)' : undefined,
                    background: '#fff', minWidth: 860,
                  }}
                >
                  {/* Investor */}
                  <div style={{ ...COL.investor, padding: '0 6px', minWidth: COL.investor.minWidth, overflow: 'hidden' }}>
                    <Cell style={{ fontWeight: 500 }}>
                      {inv.clientName}
                      {inv.vehicleName && (
                        <span style={{ color: '#888', fontWeight: 400 }}> via {inv.vehicleName}</span>
                      )}
                    </Cell>
                  </div>

                  {/* Investment */}
                  <div style={{ ...COL.investment }}>
                    <Cell right>{formatCurrency(inv.investment_amount)}</Cell>
                  </div>

                  {/* Fee % */}
                  <div style={{ ...COL.feePct }}>
                    <Cell right>
                      <span style={{ color: feePctNum !== 5.0 ? '#d97706' : undefined }}>
                        {feePctNum.toFixed(1)}%
                      </span>
                      {feePctNum !== 5.0 && (
                        <span style={{ color: '#d97706', fontSize: 9, marginLeft: 2 }} title="Fee override">✎</span>
                      )}
                    </Cell>
                  </div>

                  {/* Fee */}
                  <div style={{ ...COL.fee }}>
                    <Cell right>{formatCurrency(inv.fee_amount)}</Cell>
                  </div>

                  {/* VAT */}
                  <div style={{ ...COL.vat }}>
                    <Cell right style={{ color: '#aaa' }}>{formatCurrency(inv.vat_amount)}</Cell>
                  </div>

                  {/* Total */}
                  <div style={{ ...COL.total }}>
                    <Cell right style={{ fontWeight: 500 }}>{formatCurrency(total)}</Cell>
                  </div>

                  {/* Issued */}
                  <div style={{ ...COL.issued }}>
                    <Cell right style={{ color: inv.issued_at ? '#0f2744' : '#bbb' }}>
                      {fmtDate(inv.issued_at)}
                    </Cell>
                  </div>

                  {/* Due */}
                  <div style={{ ...COL.due }}>
                    <Cell right>{fmtDate(inv.due_date)}</Cell>
                  </div>

                  {/* Status */}
                  <div style={{ ...COL.status }}>
                    <Cell>
                      <span style={{
                        display: 'inline-block',
                        background: sc.bg, color: sc.color,
                        fontSize: 10, fontWeight: 600,
                        borderRadius: 4, padding: '2px 7px',
                      }}>
                        {sc.label}
                      </span>
                    </Cell>
                  </div>

                  {/* Xero # */}
                  <div style={{ ...COL.xero }}>
                    <Cell style={{ fontSize: 11, color: inv.xero_invoice_number ? '#0f2744' : '#bbb' }}>
                      {inv.xero_invoice_number ?? '—'}
                    </Cell>
                  </div>

                  {/* ⋯ */}
                  <div style={{ ...COL.menu }}>
                    <button
                      onClick={e => openMenu(e, inv.id)}
                      style={{
                        background: isMenuOpen ? '#f0f0ec' : 'none', border: 'none', cursor: 'pointer',
                        fontSize: 16, color: '#888', padding: '2px 6px', borderRadius: 4, lineHeight: 1,
                      }}
                      title="Invoice actions"
                    >
                      ⋯
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Totals row */}
            <div style={{
              display: 'flex', borderTop: '1px solid var(--card-border)',
              background: '#fafaf8', minWidth: 860,
            }}>
              <div style={{ ...COL.investor, padding: '0 6px' }}>
                <Cell style={{ color: '#888', fontWeight: 500, fontSize: 11 }}>
                  {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}
                </Cell>
              </div>
              <div style={{ ...COL.investment }}>
                <Cell right style={{ fontWeight: 600, color: '#0f2744' }}>
                  {formatCurrency(totalInvestment)}
                </Cell>
              </div>
              <div style={{ ...COL.feePct }} />
              <div style={{ ...COL.fee }}>
                <Cell right style={{ fontWeight: 600, color: '#0f2744' }}>
                  {formatCurrency(totalFee)}
                </Cell>
              </div>
              <div style={{ ...COL.vat }}>
                <Cell right style={{ color: '#aaa' }}>{formatCurrency(0)}</Cell>
              </div>
              <div style={{ ...COL.total }}>
                <Cell right style={{ fontWeight: 600, color: '#0f2744' }}>
                  {formatCurrency(totalFee)}
                </Cell>
              </div>
              <div style={{ ...COL.issued }} />
              <div style={{ ...COL.due }} />
              <div style={{ ...COL.status }} />
              <div style={{ ...COL.xero }} />
              <div style={{ ...COL.menu }} />
            </div>
          </>
        )}
      </div>

      {/* ── Row menu (position:fixed, z-index 600) ───────────────────────── */}
      {openMenuId && menuPos && (() => {
        const inv = invoices.find(i => i.id === openMenuId)
        if (!inv) return null
        const menuWidth = 200
        const estHeight = inv.status === 'draft' ? 160 : 120
        const left = Math.min(menuPos.x - menuWidth, window.innerWidth - menuWidth - 8)
        const top  = Math.min(menuPos.y, window.innerHeight - estHeight - 8)

        return (
          <div
            style={{
              position: 'fixed', left, top, zIndex: 600,
              background: '#fff', border: '0.5px solid var(--card-border)',
              borderRadius: 8, padding: '4px 0', width: menuWidth,
              boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <MenuBtn label="View details" onClick={() => { closeMenu(); setViewInvoice(inv) }} />

            {inv.status === 'draft' && <>
              <MenuBtn label="Edit" onClick={() => { closeMenu(); setEditInvoice(inv); setEditDueDate(toDateInput(inv.due_date)) }} />
              <MenuBtn label="Send to Xero" onClick={() => { closeMenu(); setConfirmModal({ type: 'sendToXero', invoice: inv }) }} />
              <div style={{ height: '0.5px', background: 'var(--card-border)', margin: '4px 0' }} />
              <MenuBtn label="Delete" danger onClick={() => { closeMenu(); setConfirmModal({ type: 'delete', invoice: inv }) }} />
            </>}

            {inv.status === 'sent' && <>
              <MenuBtn label="Mark paid" onClick={() => { closeMenu(); setConfirmModal({ type: 'markPaid', invoice: inv }) }} />
              <MenuBtn label="Mark unsent" onClick={() => { closeMenu(); setConfirmModal({ type: 'markUnsent', invoice: inv }) }} />
            </>}

            {inv.status === 'paid' && (
              <MenuBtn label="Mark unpaid" onClick={() => { closeMenu(); setConfirmModal({ type: 'markUnpaid', invoice: inv }) }} />
            )}
          </div>
        )
      })()}

      {/* ── View details modal ───────────────────────────────────────────── */}
      {viewInvoice && (
        <ViewDetailsModal invoice={viewInvoice} onClose={() => setViewInvoice(null)} />
      )}

      {/* ── Edit modal ───────────────────────────────────────────────────── */}
      {editInvoice && (
        <Modal title="Edit invoice" onClose={() => setEditInvoice(null)}>
          {editInvoice.status === 'paid' && (
            <div style={{
              background: '#fef3c7', border: '0.5px solid #fcd34d',
              borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#92400e', marginBottom: 16,
            }}>
              This invoice is paid — editing is disabled.
            </div>
          )}
          <ReadonlyField label="Investor" value={investorLabel(editInvoice)} />
          <ReadonlyField label="Investment amount" value={formatCurrency(editInvoice.investment_amount)} />
          <ReadonlyField
            label="Fee"
            value={`${Number(editInvoice.fee_percentage).toFixed(1)}% = ${formatCurrency(editInvoice.fee_amount)}`}
            sub="To change the fee, edit on the Bookbuild row"
          />
          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
              Due date
            </div>
            <input
              type="date"
              value={editDueDate}
              onChange={e => setEditDueDate(e.target.value)}
              disabled={editInvoice.status === 'paid'}
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6,
                border: '1px solid #d0d0c8', outline: 'none', boxSizing: 'border-box',
                opacity: editInvoice.status === 'paid' ? 0.5 : 1,
              }}
            />
          </label>
          {editError && <div style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{editError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setEditInvoice(null)} className="btn btn-secondary" style={{ fontSize: 12 }}>
              Cancel
            </button>
            <button
              onClick={handleEditSave}
              disabled={editSaving || editInvoice.status === 'paid'}
              style={{
                fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none',
                background: 'var(--teal)', color: '#fff', fontWeight: 600,
                cursor: editSaving || editInvoice.status === 'paid' ? 'not-allowed' : 'pointer',
                opacity: editSaving || editInvoice.status === 'paid' ? 0.6 : 1,
              }}
            >
              {editSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Confirm modals ───────────────────────────────────────────────── */}
      {confirmModal && (() => {
        const { type, invoice } = confirmModal
        const configs: Record<ConfirmType, { title: string; body: string; btnLabel: string; danger?: boolean }> = {
          sendToXero: {
            title: 'Send to Xero?',
            body: `Send invoice for ${investorLabel(invoice)} (${formatCurrency(invoice.fee_amount)}) to Xero?`,
            btnLabel: 'Send to Xero',
          },
          markPaid: {
            title: 'Mark invoice paid?',
            body: `Mark invoice for ${investorLabel(invoice)} (${formatCurrency(invoice.fee_amount)}) as paid?`,
            btnLabel: 'Mark paid',
          },
          markUnsent: {
            title: 'Move back to draft?',
            body: 'Move this invoice back to draft? The Xero invoice number will be cleared.',
            btnLabel: 'Move to draft',
          },
          markUnpaid: {
            title: 'Mark invoice unpaid?',
            body: `Mark invoice for ${investorLabel(invoice)} (${formatCurrency(invoice.fee_amount)}) unpaid? It will return to Sent status.`,
            btnLabel: 'Mark unpaid',
          },
          delete: {
            title: 'Delete invoice?',
            body: 'Delete this draft invoice? This cannot be undone.',
            btnLabel: 'Delete',
            danger: true,
          },
        }
        const cfg = configs[type]

        return (
          <Modal title={cfg.title} onClose={() => { setConfirmModal(null); setConfirmError(null) }}>
            <p style={{ fontSize: 13, color: '#444', marginBottom: 20, lineHeight: 1.5 }}>{cfg.body}</p>
            {confirmError && <div style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{confirmError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { setConfirmModal(null); setConfirmError(null) }}
                className="btn btn-secondary" style={{ fontSize: 12 }}
                disabled={confirmSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={confirmSaving}
                style={{
                  fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none',
                  background: cfg.danger ? '#a32d2d' : 'var(--teal)',
                  color: '#fff', fontWeight: 600,
                  cursor: confirmSaving ? 'not-allowed' : 'pointer',
                  opacity: confirmSaving ? 0.6 : 1,
                }}
              >
                {confirmSaving ? 'Working…' : cfg.btnLabel}
              </button>
            </div>
          </Modal>
        )
      })()}

      {/* ── Toast ───────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 900,
          background: '#0f2744', color: '#fff',
          padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MenuBtn({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '7px 14px', fontSize: 12,
        background: 'none', border: 'none',
        color: danger ? '#a32d2d' : '#0f2744',
        cursor: 'pointer',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f5f5f0' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
    >
      {label}
    </button>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 700,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: '24px',
        width: 440, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', marginBottom: 20 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  )
}

function ReadonlyField({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#0f2744' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Divider() {
  return <div style={{ height: '0.5px', background: 'var(--card-border)', margin: '16px 0' }} />
}

function ViewDetailsModal({ invoice, onClose }: { invoice: InvoiceRow; onClose: () => void }) {
  const sc = STATUS_CONFIG[invoice.status]
  const total = (invoice.fee_amount ?? 0) + (invoice.vat_amount ?? 0)
  const feePctNum = Number(invoice.fee_percentage)

  return (
    <Modal title="Invoice details" onClose={onClose}>
      <ReadonlyField label="Investor" value={investorLabel(invoice)} />
      <ReadonlyField
        label="Status"
        value=""
      />
      <div style={{ marginBottom: 14, marginTop: -14 }}>
        <span style={{
          display: 'inline-block',
          background: sc.bg, color: sc.color,
          fontSize: 11, fontWeight: 600,
          borderRadius: 4, padding: '2px 8px',
        }}>
          {sc.label}
        </span>
      </div>

      <Divider />

      <ReadonlyField label="Investment amount" value={formatCurrency(invoice.investment_amount)} />
      <ReadonlyField
        label="Fee percentage"
        value={`${feePctNum.toFixed(1)}%${feePctNum !== 5.0 ? ' — override' : ''}`}
      />
      <ReadonlyField label="Fee amount" value={formatCurrency(invoice.fee_amount)} />
      <ReadonlyField label="VAT" value={`${formatCurrency(invoice.vat_amount)} (UK investment fees are VAT-exempt)`} />
      <ReadonlyField label="Total" value={formatCurrency(total)} />

      <Divider />

      <ReadonlyField label="Issued" value={invoice.issued_at ? fmtDate(invoice.issued_at) : 'Not yet issued'} />
      <ReadonlyField label="Due" value={fmtDate(invoice.due_date)} />
      <ReadonlyField label="Xero invoice number" value={invoice.xero_invoice_number ?? 'Not yet sent'} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 12 }}>
          Close
        </button>
      </div>
    </Modal>
  )
}
