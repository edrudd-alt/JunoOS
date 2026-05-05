'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { DealInvestorFull, ClientFull, NomineeRow } from './dealUtils'
import {
  markPaidNoLog, logMarkPaid, revertPaidToSigned,
  markComplete, sendPaymentChaser, moveBackwards, logLateAddition,
} from './bookbuildActions'
import AddInvestorsModal      from './AddInvestorsModal'
import EditDealInvestorModal  from './EditDealInvestorModal'
import ClosingRowMenuDropdown from './ClosingRowMenuDropdown'
import type { ClosingMenuAction } from './ClosingRowMenuDropdown'
import ConfirmDialog          from './ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

type ClosingDisplayStatus = 'signed' | 'paid' | 'complete' | 'chase'

const CLOSING_STATUS_BADGE: Record<ClosingDisplayStatus, { label: string; cls: string }> = {
  signed:   { label: 'Signed',   cls: 'pill-green' },
  paid:     { label: 'Paid',     cls: 'pill-green' },
  complete: { label: 'Complete', cls: 'pill-green' },
  chase:    { label: 'Chase',    cls: 'pill-amber' },
}

const KYC_DOT: Record<string, string> = {
  verified:    '#1d9e75',
  renewal_due: '#ba7517',
  outstanding: '#a32d2d',
}

const CHASE_THRESHOLD_DAYS = 10

function getClosingDisplayStatus(di: DealInvestorFull): ClosingDisplayStatus {
  if (di.lifecycle_status === 'signed') {
    const days = (Date.now() - new Date(di.updated_at).getTime()) / 86_400_000
    if (days > CHASE_THRESHOLD_DAYS) return 'chase'
  }
  return di.lifecycle_status as ClosingDisplayStatus
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function fmtWhole(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface DealRow {
  id:            string
  eis_qualifying: string | null
  company_id:    string | null
}

interface Props {
  deal:          DealRow
  dealInvestors: DealInvestorFull[]
  clientMap:     Map<string, ClientFull>
  allClients:    ClientFull[]
  nominees:      NomineeRow[]
  onDataRefresh: () => void
}

type ConfirmDialogState = {
  title:         string
  message:       string
  confirmLabel?: string
  danger?:       boolean
  onConfirm:     () => Promise<void>
} | null

// ── Main component ────────────────────────────────────────────────────────────

export default function ClosingTab({
  deal, dealInvestors, clientMap, allClients, nominees, onDataRefresh,
}: Props) {
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  // Toast
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3500)
  }
  function showError(msg: string) {
    setToast(`Error: ${msg}`); setTimeout(() => setToast(null), 5000)
  }

  // 5-second undo state for mark_paid
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [undoMark, setUndoMark] = useState<{ diId: string; name: string } | null>(null)

  // Modal / overlay state
  const [rowMenu,          setRowMenu]          = useState<{ di: DealInvestorFull; x: number; y: number } | null>(null)
  const [editDi,           setEditDi]           = useState<DealInvestorFull | null>(null)
  const [confirmDialog,    setConfirmDialog]    = useState<ConfirmDialogState>(null)
  const [confirmDlgSaving, setConfirmDlgSaving] = useState(false)
  const [lateAddPending,   setLateAddPending]   = useState(false)
  const [addModalOpen,     setAddModalOpen]     = useState(false)
  const preAddCountRef = useRef(0)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Filters
  const [searchQuery,    setSearchQuery]    = useState('')
  const [statusFilters,  setStatusFilters]  = useState<Set<ClosingDisplayStatus>>(new Set())
  const [statusDropOpen, setStatusDropOpen] = useState(false)

  const showEis    = deal.eis_qualifying === 'yes'
  const nomineeMap = new Map(nominees.map(n => [n.id, n]))

  // Partition
  const closingRows = dealInvestors.filter(di =>
    di.lifecycle_status === 'signed' || di.lifecycle_status === 'paid',
  ).sort((a, b) => {
    // paid rows after signed
    const order = { signed: 0, paid: 1 }
    const oa = order[a.lifecycle_status as keyof typeof order] ?? 0
    const ob = order[b.lifecycle_status as keyof typeof order] ?? 0
    if (oa !== ob) return oa - ob
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const pastRows = dealInvestors
    .filter(di => di.lifecycle_status === 'complete')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  // Filter logic
  function matchesFilters(di: DealInvestorFull): boolean {
    const ds         = getClosingDisplayStatus(di)
    const clientName = clientMap.get(di.client_id)?.full_name ?? ''
    const vName      = di.investing_vehicle_id ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? '') : ''
    const nName      = di.nominee_id ? (nomineeMap.get(di.nominee_id)?.name ?? '') : ''

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (![clientName, vName, nName].some(s => s.toLowerCase().includes(q))) return false
    }
    if (statusFilters.size > 0 && !statusFilters.has(ds)) return false
    return true
  }

  const filtersActive = searchQuery.length > 0 || statusFilters.size > 0
  function clearFilters() { setSearchQuery(''); setStatusFilters(new Set()) }

  const activeRows  = closingRows.filter(matchesFilters)
  const filteredPast = pastRows.filter(matchesFilters)

  // Totals
  const totalConfirmed = closingRows.reduce((s, di) => s + (di.confirmed_amount ?? 0), 0)
  const totalShares    = closingRows.reduce((s, di) => s + (di.shares ?? 0), 0)

  // Bulk
  const selectedActive = activeRows.filter(di => selectedIds.has(di.id))
  const selectedStatuses = new Set(selectedActive.map(di => getClosingDisplayStatus(di)))

  let bulkPrimaryLabel: string | null = null
  let bulkPrimaryWarning: string | null = null
  if (selectedActive.length > 0) {
    if (selectedStatuses.size > 1) {
      bulkPrimaryWarning = 'Selected rows have different statuses. Select rows with the same status to enable bulk actions.'
    } else {
      const s = [...selectedStatuses][0]
      if (s === 'chase')  bulkPrimaryLabel = `Send payment chaser (${selectedActive.length})`
      else if (s === 'paid') bulkPrimaryLabel = `Move to complete (${selectedActive.length})`
      else bulkPrimaryWarning = "Selected rows can't be bulk-progressed."
    }
  }

  const existingInvestorIds = new Set(dealInvestors.map(di => di.client_id))

  // Grid
  const cols = [
    '32px', 'minmax(160px, 1fr)', '130px', '140px',
    '110px', '90px', '80px', '100px', '70px', '52px',
    ...(showEis ? ['52px'] : []),
    '150px', '44px',
  ]
  const gridTemplate = cols.join(' ')

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function requireUser(): string | null {
    if (!userId) { showError('Not authenticated — please reload.'); return null }
    return userId
  }

  // ── Mark paid (5-second undo) ─────────────────────────────────────────────────

  async function handleMarkPaid(di: DealInvestorFull) {
    const uid = requireUser(); if (!uid) return
    const name = clientMap.get(di.client_id)?.full_name ?? 'Investor'

    // If another undo is pending, commit it now before proceeding
    if (undoMark) {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
      await logMarkPaid(supabase, deal.id, undoMark.diId, uid)
      setUndoMark(null)
    }

    const result = await markPaidNoLog(supabase, di.id, uid)
    if (result.error) { showError(result.error); return }

    undoTimeoutRef.current = setTimeout(async () => {
      await logMarkPaid(supabase, deal.id, di.id, uid)
      setUndoMark(null)
    }, 5000)

    setUndoMark({ diId: di.id, name })
    onDataRefresh()
  }

  async function handleUndoMarkPaid() {
    if (!undoMark) return
    const uid = requireUser(); if (!uid) return
    if (undoTimeoutRef.current) { clearTimeout(undoTimeoutRef.current); undoTimeoutRef.current = null }
    const result = await revertPaidToSigned(supabase, undoMark.diId, uid)
    if (result.error) { showError(result.error); return }
    setUndoMark(null)
    onDataRefresh()
  }

  // ── Other action handlers ─────────────────────────────────────────────────────

  async function handleSendPaymentChaser(di: DealInvestorFull) {
    const uid = requireUser(); if (!uid) return
    const result = await sendPaymentChaser(supabase, deal.id, di.id, uid)
    if (result.error) { showError(result.error); return }
    showToast('Payment chaser drafted (Outlook integration coming soon). Chase timer reset.')
    onDataRefresh()
  }

  async function handleMoveToComplete(di: DealInvestorFull) {
    const uid = requireUser(); if (!uid) return
    const name = clientMap.get(di.client_id)?.full_name ?? 'Investor'
    setConfirmDialog({
      title: 'Move to complete',
      message: `Mark ${name} as complete? This moves them out of Closing.`,
      confirmLabel: 'Move to complete',
      onConfirm: async () => {
        const result = await markComplete(supabase, deal.id, di.id, uid)
        if (result.error) { showError(result.error); return }
        showToast(`${name} moved to complete.`)
        setSelectedIds(prev => { const n = new Set(prev); n.delete(di.id); return n })
        onDataRefresh()
      },
    })
  }

  async function handleMoveBack(di: DealInvestorFull, fromStatus: string, toStatus: string) {
    const uid = requireUser(); if (!uid) return
    const name = clientMap.get(di.client_id)?.full_name ?? 'Investor'
    const labelMap: Record<string, string> = {
      app_form_sent: 'app form sent', signed: 'signed', paid: 'paid',
    }
    const toLabel = labelMap[toStatus] ?? toStatus

    let extraUpdates: Record<string, unknown> = {}
    // Moving signed back to app_form_sent restores signing_status
    if (fromStatus === 'signed' && toStatus === 'app_form_sent') {
      extraUpdates = { signing_status: 'pending' }
    }

    setConfirmDialog({
      title: `Move back to ${toLabel}`,
      message: `Move ${name} back to ${toLabel}?`,
      confirmLabel: 'Move back',
      onConfirm: async () => {
        const result = await moveBackwards(supabase, deal.id, di.id, fromStatus, toStatus, uid, extraUpdates)
        if (result.error) { showError(result.error); return }
        showToast(`${name} moved back to ${toLabel}.`)
        onDataRefresh()
      },
    })
  }

  function handleMenuAction(di: DealInvestorFull, action: ClosingMenuAction) {
    switch (action.type) {
      case 'view_investor':
        window.open(`/clients/${di.client_id}`, '_blank'); break
      case 'edit_deal_investor':
        setEditDi(di); break
      case 'mark_paid':
        handleMarkPaid(di); break
      case 'move_to_complete':
        handleMoveToComplete(di); break
      case 'move_back_to_app_form_sent':
        handleMoveBack(di, 'signed', 'app_form_sent'); break
      case 'move_back_to_signed':
        handleMoveBack(di, 'paid', 'signed'); break
      case 'move_back_to_paid':
        handleMoveBack(di, 'complete', 'paid'); break
    }
  }

  // ── Bulk handlers ─────────────────────────────────────────────────────────────

  async function handleBulkPaymentChaser() {
    const uid = requireUser(); if (!uid) return
    for (const di of selectedActive) {
      await sendPaymentChaser(supabase, deal.id, di.id, uid)
    }
    showToast(`Payment chaser drafted for ${selectedActive.length} investor${selectedActive.length !== 1 ? 's' : ''} (Outlook integration coming soon).`)
    setSelectedIds(new Set())
    onDataRefresh()
  }

  async function handleBulkMoveToComplete() {
    const uid = requireUser(); if (!uid) return
    const count = selectedActive.length
    setConfirmDialog({
      title: 'Move to complete',
      message: `Mark ${count} selected investor${count !== 1 ? 's' : ''} as complete?`,
      confirmLabel: 'Move to complete',
      onConfirm: async () => {
        for (const di of selectedActive) {
          const result = await markComplete(supabase, deal.id, di.id, uid)
          if (result.error) { showError(result.error); return }
        }
        showToast(`${count} investor${count !== 1 ? 's' : ''} moved to complete.`)
        setSelectedIds(new Set())
        onDataRefresh()
      },
    })
  }

  // ── Late addition ─────────────────────────────────────────────────────────────

  function handleLateAdditionClick() {
    setLateAddPending(true)
  }

  async function handleLateAdditionConfirm() {
    const uid = requireUser(); if (!uid) { setLateAddPending(false); return }
    preAddCountRef.current = dealInvestors.length
    setLateAddPending(false)
    setAddModalOpen(true)
  }

  async function handleLateAdditionSaved() {
    const uid = userId
    setAddModalOpen(false)
    if (uid) {
      await logLateAddition(supabase, deal.id, preAddCountRef.current, uid)
    }
    onDataRefresh()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative' }}>

      {/* Toolbar */}
      <div style={{
        padding: '10px 12px', borderBottom: '0.5px solid var(--card-border)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <input
          type="text" value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search investors, vehicles, or locations…"
          style={{
            padding: '6px 10px', fontSize: 12, borderRadius: 6,
            border: '1px solid #d0d0c8', outline: 'none', width: 280, flexShrink: 0,
          }}
        />

        {/* Status filter */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setStatusDropOpen(v => !v)}
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
          >
            {statusFilters.size === 0
              ? 'All statuses'
              : `${statusFilters.size} status${statusFilters.size !== 1 ? 'es' : ''}`}
            {' ▾'}
          </button>
          {statusDropOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 300,
              background: '#fff', border: '0.5px solid var(--card-border)',
              borderRadius: 8, padding: '8px 0', minWidth: 160,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}>
              {(['signed', 'chase', 'paid', 'complete'] as ClosingDisplayStatus[]).map(s => (
                <label key={s} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: '#0f2744',
                }}>
                  <input
                    type="checkbox"
                    checked={statusFilters.has(s)}
                    onChange={() => {
                      setStatusFilters(prev => {
                        const next = new Set(prev)
                        next.has(s) ? next.delete(s) : next.add(s)
                        return next
                      })
                    }}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  {CLOSING_STATUS_BADGE[s].label}
                </label>
              ))}
            </div>
          )}
        </div>

        {filtersActive && (
          <button
            onClick={clearFilters}
            style={{
              fontSize: 11, color: '#888', background: 'none', border: 'none',
              cursor: 'pointer', textDecoration: 'underline', padding: '0 4px',
            }}
          >
            Clear filters
          </button>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={handleLateAdditionClick}
          className="btn btn-secondary"
          style={{ fontSize: 12 }}
          title="Add an investor after the bookbuild has locked"
        >
          + Add late addition
        </button>
      </div>

      {/* Scrollable table */}
      <div
        style={{ overflowX: 'auto' }}
        onClick={() => setStatusDropOpen(false)}
      >
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridTemplate,
          padding: '0 8px', borderBottom: '0.5px solid var(--card-border)',
          background: '#fafaf8',
        }}>
          <div style={{ padding: '7px 8px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={activeRows.length > 0 && activeRows.every(di => selectedIds.has(di.id))}
              onChange={e => {
                if (e.target.checked) setSelectedIds(new Set(activeRows.map(di => di.id)))
                else setSelectedIds(new Set())
              }}
              style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
              title="Select all"
            />
          </div>
          <ColHeader label="Client"     align="left"   />
          <ColHeader label="Vehicle"    align="center" />
          <ColHeader label="Location"   align="center" />
          <ColHeader label="Confirmed"  align="right"  />
          <ColHeader label="Shares"     align="right"  />
          <ColHeader label="Fee"        align="right"  />
          <ColHeader label="Status"     align="center" />
          <ColHeader label="Days"       align="center" />
          <ColHeader label="POA"        align="center" />
          {showEis && <ColHeader label="EIS" align="center" />}
          <ColHeader label="Next step"  align="left"   />
          <ColHeader />
        </div>

        {/* Active (signed + paid) rows */}
        {activeRows.map(di => (
          <ClosingRow
            key={di.id}
            di={di}
            client={clientMap.get(di.client_id) ?? null}
            vehicleName={di.investing_vehicle_id ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? null) : null}
            nomineeName={di.nominee_id ? (nomineeMap.get(di.nominee_id)?.name ?? null) : null}
            showEis={showEis}
            gridTemplate={gridTemplate}
            dim={false}
            selected={selectedIds.has(di.id)}
            onSelectChange={checked => {
              setSelectedIds(prev => {
                const next = new Set(prev)
                checked ? next.add(di.id) : next.delete(di.id)
                return next
              })
            }}
            onNextStep={di2 => {
              const ds = getClosingDisplayStatus(di2)
              if (ds === 'chase') handleSendPaymentChaser(di2)
              else if (ds === 'paid') handleMoveToComplete(di2)
            }}
            onMenuClick={(di2, x, y) => setRowMenu({ di: di2, x, y })}
          />
        ))}

        {/* Empty state */}
        {activeRows.length === 0 && filteredPast.length === 0 && filtersActive && (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: '#999', fontSize: 13 }}>
            No investors match your filters.{' '}
            <button onClick={clearFilters} style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
              Clear filters
            </button>
          </div>
        )}

        {closingRows.length === 0 && pastRows.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#999', fontSize: 13 }}>
            No signed investors yet — investors appear here after signing their application form.
          </div>
        )}

        {/* Past (complete) section */}
        {filteredPast.length > 0 && (
          <div style={{
            padding: '5px 16px',
            background: '#fafaf8',
            borderTop: '0.5px solid var(--card-border)',
            borderBottom: '0.5px solid var(--card-border)',
            fontSize: 10, fontWeight: 600, color: '#aaa',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Complete
          </div>
        )}
        {filteredPast.map(di => (
          <ClosingRow
            key={di.id}
            di={di}
            client={clientMap.get(di.client_id) ?? null}
            vehicleName={di.investing_vehicle_id ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? null) : null}
            nomineeName={di.nominee_id ? (nomineeMap.get(di.nominee_id)?.name ?? null) : null}
            showEis={showEis}
            gridTemplate={gridTemplate}
            dim={true}
            selected={false}
            onSelectChange={() => {}}
            onNextStep={() => {}}
            onMenuClick={(di2, x, y) => setRowMenu({ di: di2, x, y })}
          />
        ))}

        {/* Totals row */}
        {(closingRows.length > 0 || pastRows.length > 0) && (
          <div style={{
            display: 'grid', gridTemplateColumns: gridTemplate,
            padding: '0 8px',
            borderTop: '0.5px solid var(--card-border)',
            background: '#fafaf8',
          }}>
            <div />
            <TotalCell align="left" style={{ color: '#888', fontWeight: 400, fontSize: 11 }}>
              {closingRows.length} active · {pastRows.length} complete
            </TotalCell>
            <div /><div />
            <TotalCell align="right">
              {totalConfirmed > 0 ? formatCurrency(totalConfirmed) : '—'}
            </TotalCell>
            <TotalCell align="right">
              {totalShares > 0 ? fmtWhole(totalShares) : '—'}
            </TotalCell>
            <div /><div /><div /><div />
            {showEis && <div />}
            <div /><div />
          </div>
        )}
      </div>

      {/* Bulk action footer */}
      {selectedActive.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#0f2744', color: '#fff', zIndex: 200,
          padding: '12px 24px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 -2px 12px rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            {selectedActive.length} selected
          </span>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />

          {bulkPrimaryWarning && (
            <span style={{ fontSize: 11, color: '#f0c060', flex: 1 }}>{bulkPrimaryWarning}</span>
          )}
          {!bulkPrimaryWarning && <div style={{ flex: 1 }} />}

          {bulkPrimaryLabel && (
            <button
              onClick={() => {
                const s = [...selectedStatuses][0]
                if (s === 'chase') handleBulkPaymentChaser()
                else if (s === 'paid') handleBulkMoveToComplete()
              }}
              style={{
                fontSize: 12, padding: '6px 14px', borderRadius: 6, border: 'none',
                background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600,
              }}
            >
              {bulkPrimaryLabel}
            </button>
          )}

          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              fontSize: 12, padding: '6px 12px', borderRadius: 6,
              background: 'none', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', cursor: 'pointer',
            }}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}

      {/* Late addition confirm */}
      {lateAddPending && (
        <ConfirmDialog
          title="Late addition"
          message="The bookbuild is locked because at least one investor has signed. Adding this investor will be flagged as a late addition in the audit log. Continue?"
          confirmLabel="Add late addition"
          saving={false}
          onConfirm={handleLateAdditionConfirm}
          onCancel={() => setLateAddPending(false)}
        />
      )}

      {addModalOpen && (
        <AddInvestorsModal
          dealId={deal.id}
          allClients={allClients}
          nominees={nominees}
          existingInvestorIds={existingInvestorIds}
          onClose={() => setAddModalOpen(false)}
          onSaved={handleLateAdditionSaved}
        />
      )}

      {rowMenu && (
        <ClosingRowMenuDropdown
          status={rowMenu.di.lifecycle_status as 'signed' | 'paid' | 'complete'}
          x={rowMenu.x}
          y={rowMenu.y}
          onAction={action => handleMenuAction(rowMenu.di, action)}
          onClose={() => setRowMenu(null)}
        />
      )}

      {editDi && userId && (
        <EditDealInvestorModal
          di={editDi}
          client={clientMap.get(editDi.client_id) ?? null}
          allClients={allClients}
          nominees={nominees}
          dealId={deal.id}
          userId={userId}
          onSaved={msg => { setEditDi(null); showToast(msg); onDataRefresh() }}
          onClose={() => setEditDi(null)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          danger={confirmDialog.danger}
          saving={confirmDlgSaving}
          onConfirm={async () => {
            setConfirmDlgSaving(true)
            await confirmDialog.onConfirm()
            setConfirmDlgSaving(false)
            setConfirmDialog(null)
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Undo mark_paid toast */}
      {undoMark && (
        <div style={{
          position: 'fixed',
          bottom: selectedActive.length > 0 ? 72 : 24,
          left: '50%', transform: 'translateX(-50%)',
          background: '#0f2744', color: '#fff',
          fontSize: 12, fontWeight: 500, padding: '10px 16px',
          borderRadius: 6, zIndex: 700,
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          whiteSpace: 'nowrap',
        }}>
          <span>{undoMark.name} marked as paid.</span>
          <button
            onClick={handleUndoMarkPaid}
            style={{
              fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,0.2)', border: 'none',
              color: '#fff', borderRadius: 4, padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            Undo
          </button>
        </div>
      )}

      {/* Regular toast */}
      {toast && !undoMark && (
        <div style={{
          position: 'fixed',
          bottom: selectedActive.length > 0 ? 72 : 24,
          left: '50%', transform: 'translateX(-50%)',
          background: '#0f2744', color: '#fff',
          fontSize: 12, fontWeight: 500, padding: '10px 20px',
          borderRadius: 6, zIndex: 700, whiteSpace: 'nowrap',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColHeader({ label, align }: { label?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <div style={{
      padding: '7px 8px', fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em', color: '#aaa',
      textAlign: align ?? 'center',
    }}>
      {label ?? ''}
    </div>
  )
}

function TotalCell({
  children, align, style,
}: {
  children: React.ReactNode; align?: 'left' | 'right' | 'center'; style?: React.CSSProperties
}) {
  return (
    <div style={{ padding: '8px 8px', fontSize: 12, fontWeight: 600, color: '#0f2744', textAlign: align ?? 'center', ...style }}>
      {children}
    </div>
  )
}

// ── ClosingRow ────────────────────────────────────────────────────────────────

interface RowProps {
  di:             DealInvestorFull
  client:         ClientFull | null
  vehicleName:    string | null
  nomineeName:    string | null
  showEis:        boolean
  gridTemplate:   string
  dim:            boolean
  selected:       boolean
  onSelectChange: (checked: boolean) => void
  onNextStep:     (di: DealInvestorFull) => void
  onMenuClick:    (di: DealInvestorFull, x: number, y: number) => void
}

function ClosingRow({
  di, client, vehicleName, nomineeName, showEis, gridTemplate, dim,
  selected, onSelectChange, onNextStep, onMenuClick,
}: RowProps) {
  const ds       = getClosingDisplayStatus(di)
  const badge    = CLOSING_STATUS_BADGE[ds]
  const kycColor = client ? (KYC_DOT[client.kyc_status] ?? '#ccc') : '#ccc'
  const isPast   = di.lifecycle_status === 'complete'

  const days = daysSince(di.updated_at)

  type NextStepCfg = { label: string; bg: string; color: string; italic?: boolean; clickable: boolean } | null
  const nextStep: NextStepCfg =
    ds === 'signed' ? { label: 'Awaiting payment', bg: 'none', color: '#aaa', italic: true, clickable: false } :
    ds === 'chase'  ? { label: 'Send payment chaser', bg: '#b87b1a', color: '#fff', clickable: true } :
    ds === 'paid'   ? { label: 'Move to completion →', bg: '#1d8c5e', color: '#fff', clickable: true } :
    null

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: gridTemplate,
        padding: '0 8px', borderBottom: '0.5px solid var(--card-border)',
        opacity: dim ? 0.45 : 1, alignItems: 'center', transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { if (dim) (e.currentTarget as HTMLElement).style.opacity = '1' }}
      onMouseLeave={e => { if (dim) (e.currentTarget as HTMLElement).style.opacity = '0.45' }}
    >
      {/* Checkbox */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 8px' }}>
        <input
          type="checkbox"
          checked={selected}
          disabled={isPast}
          onChange={e => onSelectChange(e.target.checked)}
          style={{ cursor: isPast ? 'not-allowed' : 'pointer', accentColor: 'var(--teal)' }}
        />
      </div>

      {/* Client */}
      <div style={{ padding: '10px 8px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: kycColor, flexShrink: 0 }} />
          <span style={{
            fontSize: 12, fontWeight: 500, color: '#0f2744',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>
            {client?.full_name ?? 'Unknown'}
          </span>
        </div>
      </div>

      {/* Vehicle */}
      <div style={{ padding: '10px 8px', fontSize: 12, textAlign: 'center' }}>
        {vehicleName
          ? <span style={{ color: '#0f2744', fontWeight: 500 }}>{vehicleName}</span>
          : <span style={{ color: '#aaa' }}>Own name</span>}
      </div>

      {/* Location */}
      <div style={{ padding: '10px 8px', fontSize: 12, textAlign: 'center' }}>
        {nomineeName
          ? <span style={{ color: '#0f2744', fontWeight: 500 }}>{nomineeName}</span>
          : <span style={{ color: '#aaa' }}>Direct</span>}
      </div>

      {/* Confirmed */}
      <div style={{ padding: '10px 8px', fontSize: 12, color: '#0f2744', textAlign: 'right' }}>
        {di.confirmed_amount != null ? formatCurrency(di.confirmed_amount) : '—'}
      </div>

      {/* Shares */}
      <div style={{ padding: '10px 8px', fontSize: 12, color: '#0f2744', textAlign: 'right' }}>
        {di.shares != null ? fmtWhole(di.shares) : '—'}
      </div>

      {/* Fee (always locked in closing) */}
      <div style={{ padding: '10px 8px', fontSize: 12, textAlign: 'right' }}>
        {di.fee_pct != null ? (
          <span style={{ color: '#0f2744' }}>
            {(Number(di.fee_pct) * 100).toFixed(2)}% 🔒
          </span>
        ) : (
          <span style={{ color: '#ccc' }}>—</span>
        )}
      </div>

      {/* Status */}
      <div style={{ padding: '10px 8px', display: 'flex', justifyContent: 'center' }}>
        <span className={`pill ${badge.cls}`} style={{ fontSize: 11 }}>{badge.label}</span>
      </div>

      {/* Days */}
      <div style={{
        padding: '10px 8px', fontSize: 12, textAlign: 'center',
        color: ds === 'chase' ? 'var(--warning)' : '#0f2744',
        fontWeight: ds === 'chase' ? 600 : 400,
      }}>
        {isPast ? '—' : `${days}d`}
      </div>

      {/* POA */}
      <div style={{
        padding: '10px 8px', fontSize: 12, textAlign: 'center',
        color: di.poa_held ? '#1d9e75' : '#ccc', fontWeight: di.poa_held ? 600 : 400,
      }}>
        {di.poa_held ? '✓' : '—'}
      </div>

      {/* EIS */}
      {showEis && (
        <div style={{ padding: '10px 8px', fontSize: 12, textAlign: 'center', color: '#ccc' }}>—</div>
      )}

      {/* Next step */}
      <div style={{ padding: '10px 8px' }}>
        {nextStep ? (
          nextStep.clickable ? (
            <button
              onClick={() => onNextStep(di)}
              style={{
                fontSize: 11, padding: '4px 8px',
                background: nextStep.bg, border: 'none',
                borderRadius: 6, color: nextStep.color,
                cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500,
              }}
            >
              {nextStep.label}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: nextStep.color, fontStyle: nextStep.italic ? 'italic' : undefined }}>
              {nextStep.label}
            </span>
          )
        ) : (
          <span style={{ fontSize: 11, color: '#ccc' }}>—</span>
        )}
      </div>

      {/* Menu */}
      <div style={{ padding: '10px 8px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            onMenuClick(di, rect.left, rect.bottom + 4)
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#888', padding: '0 4px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#0f2744' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#888' }}
        >
          ⋯
        </button>
      </div>
    </div>
  )
}
