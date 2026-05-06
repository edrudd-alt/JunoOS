'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { DealInvestorFull, ClientFull, NomineeRow } from './dealUtils'
import { moveBackwards } from './bookbuildActions'
import {
  parseChecklist, isItemDisabled, isMarkCompleteEnabled, toggleChecklistItem,
  setChecklistItemDisabled, markComplete, closeDeal,
  ChecklistState, ChecklistItemKey, CHECKLIST_LABELS,
} from './completionActions'
import EditDealInvestorModal  from './EditDealInvestorModal'
import CompletionRowMenuDropdown from './CompletionRowMenuDropdown'
import type { CompletionMenuAction } from './CompletionRowMenuDropdown'
import ConfirmDialog          from './ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

type CompletionDisplayStatus = 'paid' | 'complete'

const KYC_DOT: Record<string, string> = {
  verified:    '#1d9e75',
  renewal_due: '#ba7517',
  outstanding: '#a32d2d',
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function fmtWhole(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

function parseDateInput(val: string): string {
  // Accept DD/MM/YYYY or YYYY-MM-DD; normalise to YYYY-MM-DD for storage
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(val)
    ? val
    : val.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')
  return iso
}

function isDateInFuture(iso: string): boolean {
  if (!iso) return false
  return new Date(iso) > new Date()
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface DealRow {
  id:             string
  status:         string
  eis_qualifying: string | null
  company_id:     string | null
  share_price:    number | null
  share_class:    string | null
  share_class_id: string | null
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

// ── Checklist icons (inline Option A) ─────────────────────────────────────────

const CHECKLIST_KEYS: ChecklistItemKey[] = [
  'share_cert_filed', 'eis3_issued', 'transaction_statement_sent', 'documents_archived',
]
const CHECKLIST_SHORT: Record<ChecklistItemKey, string> = {
  share_cert_filed:           'SC',
  eis3_issued:                'E3',
  transaction_statement_sent: 'TS',
  documents_archived:         'DA',
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CompletionTab({
  deal, dealInvestors, clientMap, allClients, nominees, onDataRefresh,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  const isReadOnly = deal.status === 'complete'
  const eisQualifying = deal.eis_qualifying === 'yes'

  // Toast
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3500)
  }
  function showError(msg: string) {
    setToast(`Error: ${msg}`); setTimeout(() => setToast(null), 5000)
  }

  // Modal / overlay state
  const [rowMenu,          setRowMenu]          = useState<{ di: DealInvestorFull; x: number; y: number } | null>(null)
  const [editDi,           setEditDi]           = useState<DealInvestorFull | null>(null)
  const [markCompleteDi,   setMarkCompleteDi]   = useState<DealInvestorFull | null>(null)
  const [confirmDialog,    setConfirmDialog]    = useState<ConfirmDialogState>(null)
  const [confirmDlgSaving, setConfirmDlgSaving] = useState(false)
  const [closeDealPending, setCloseDealPending] = useState(false)

  // Mark-complete modal fields
  const [investmentDate, setInvestmentDate] = useState('')
  const [completionDate, setCompletionDate] = useState('')
  const [dateErrors,     setDateErrors]     = useState<{ inv?: string; comp?: string }>({})
  const [modalSaving,    setModalSaving]    = useState(false)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Filters
  const [searchQuery,    setSearchQuery]    = useState('')
  const [statusFilters,  setStatusFilters]  = useState<Set<CompletionDisplayStatus>>(new Set())
  const [statusDropOpen, setStatusDropOpen] = useState(false)

  const nomineeMap = new Map(nominees.map(n => [n.id, n]))

  // Partition
  const paidRows = dealInvestors
    .filter(di => di.lifecycle_status === 'paid')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const completeRows = dealInvestors
    .filter(di => di.lifecycle_status === 'complete')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  // "Close the deal" is enabled when ALL non-declined investors are complete
  const nonDeclined = dealInvestors.filter(di =>
    di.lifecycle_status !== 'declined' && di.lifecycle_status !== 'superseded',
  )
  const allComplete = nonDeclined.length > 0 && nonDeclined.every(di => di.lifecycle_status === 'complete')
  const canCloseDeal = allComplete && !isReadOnly

  // Filter logic
  function matchesFilters(di: DealInvestorFull): boolean {
    const ds = di.lifecycle_status as CompletionDisplayStatus
    const clientName = clientMap.get(di.client_id)?.full_name ?? ''
    const vName  = di.investing_vehicle_id ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? '') : ''
    const nName  = di.nominee_id ? (nomineeMap.get(di.nominee_id)?.name ?? '') : ''
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (![clientName, vName, nName].some(s => s.toLowerCase().includes(q))) return false
    }
    if (statusFilters.size > 0 && !statusFilters.has(ds)) return false
    return true
  }

  const filtersActive = searchQuery.length > 0 || statusFilters.size > 0
  function clearFilters() { setSearchQuery(''); setStatusFilters(new Set()) }

  const filteredPaid     = paidRows.filter(matchesFilters)
  const filteredComplete = completeRows.filter(matchesFilters)

  // Totals (active rows only)
  const totalConfirmed = paidRows.reduce((s, di) => s + (di.confirmed_amount ?? 0), 0)
  const totalShares    = paidRows.reduce((s, di) => s + (di.shares ?? 0), 0)

  // Bulk (checkboxes only on paid rows)
  const selectedPaid = filteredPaid.filter(di => selectedIds.has(di.id))

  // Grid template
  const cols = [
    '32px', 'minmax(160px, 1fr)', '130px', '140px',
    '110px', '90px', '140px', '52px', '52px', '70px', '150px', '44px',
  ]
  const gridTemplate = cols.join(' ')

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function requireUser(): string | null {
    if (!userId) { showError('Not authenticated — please reload.'); return null }
    return userId
  }

  function getChecklist(di: DealInvestorFull): ChecklistState {
    return parseChecklist(di.completion_checklist ?? null)
  }

  // ── Action handlers ───────────────────────────────────────────────────────────

  async function handleToggleChecklist(di: DealInvestorFull, key: ChecklistItemKey, newValue: boolean) {
    const uid = requireUser(); if (!uid) return
    const state = getChecklist(di)
    const result = await toggleChecklistItem(supabase, deal.id, di.id, state, key, newValue, uid)
    if (result.error) { showError(result.error); return }
    onDataRefresh()
  }

  async function handleSetItemDisabled(di: DealInvestorFull, key: ChecklistItemKey, disabled: boolean) {
    const uid = requireUser(); if (!uid) return
    const state = getChecklist(di)
    const result = await setChecklistItemDisabled(supabase, deal.id, di.id, state, key, disabled, uid)
    if (result.error) { showError(result.error); return }
    showToast(disabled ? `'${CHECKLIST_LABELS[key]}' disabled for this investor.` : `'${CHECKLIST_LABELS[key]}' re-enabled.`)
    onDataRefresh()
  }

  async function handleMoveBack(di: DealInvestorFull, fromStatus: string, toStatus: string) {
    const uid = requireUser(); if (!uid) return
    const name    = clientMap.get(di.client_id)?.full_name ?? 'Investor'
    const toLabel = toStatus === 'signed' ? 'signed' : 'paid'

    const warningNote = toStatus === 'paid' && fromStatus === 'complete'
      ? '\n\nNote: the investments record created at completion will NOT be deleted automatically. Contact your administrator if it needs to be removed.'
      : ''

    setConfirmDialog({
      title: `Move back to ${toLabel}`,
      message: `Move ${name} back to ${toLabel}?${warningNote}`,
      confirmLabel: 'Move back',
      onConfirm: async () => {
        const result = await moveBackwards(supabase, deal.id, di.id, fromStatus, toStatus, uid)
        if (result.error) { showError(result.error); return }
        showToast(`${name} moved back to ${toLabel}.`)
        onDataRefresh()
      },
    })
  }

  function openMarkCompleteModal(di: DealInvestorFull) {
    setMarkCompleteDi(di)
    setInvestmentDate('')
    setCompletionDate('')
    setDateErrors({})
    setModalSaving(false)
  }

  async function handleMarkCompleteConfirm() {
    const uid = requireUser(); if (!uid) return
    if (!markCompleteDi) return

    // Validate dates
    const invIso  = parseDateInput(investmentDate)
    const compIso = parseDateInput(completionDate)
    const errs: { inv?: string; comp?: string } = {}
    if (!invIso || !/^\d{4}-\d{2}-\d{2}$/.test(invIso)) errs.inv = 'Enter a valid investment date.'
    else if (isDateInFuture(invIso)) errs.inv = 'Investment date cannot be in the future.'
    if (!compIso || !/^\d{4}-\d{2}-\d{2}$/.test(compIso)) errs.comp = 'Enter a valid completion date.'
    else if (isDateInFuture(compIso)) errs.comp = 'Completion date cannot be in the future.'
    if (Object.keys(errs).length > 0) { setDateErrors(errs); return }

    setModalSaving(true)
    const di = markCompleteDi
    const client = clientMap.get(di.client_id)
    const result = await markComplete(supabase, {
      dealId:            deal.id,
      dealInvestorId:    di.id,
      clientId:          di.client_id,
      investingVehicleId: di.investing_vehicle_id,
      nomineeId:         di.nominee_id,
      confirmedAmount:   di.confirmed_amount,
      shares:            di.shares,
      shareClassId:      deal.share_class_id,
      shareClass:        deal.share_class,
      sharePrice:        deal.share_price,
      companyId:         deal.company_id,
      eisQualifying:     deal.eis_qualifying,
      fundType:          client?.fund_type ?? 'syndicate',
      checklistState:    getChecklist(di),
      investmentDate:    invIso,
      completionDate:    compIso,
      userId:            uid,
    })
    setModalSaving(false)
    if (result.error) { showError(result.error); return }

    const name = clientMap.get(di.client_id)?.full_name ?? 'Investor'
    showToast(`${name} marked complete.`)
    setMarkCompleteDi(null)
    onDataRefresh()
  }

  async function handleCloseDeal() {
    const uid = requireUser(); if (!uid) return
    setCloseDealPending(false)
    const result = await closeDeal(supabase, deal.id, uid)
    if (result.error) { showError(result.error); return }
    showToast('Deal closed.')
    onDataRefresh()
    // Router refresh so header status pill updates and all tabs go read-only
    router.refresh()
  }

  function handleMenuAction(di: DealInvestorFull, action: CompletionMenuAction) {
    switch (action.type) {
      case 'view_investor':
        window.open(`/clients/${di.client_id}`, '_blank'); break
      case 'edit_deal_investor':
        setEditDi(di); break
      case 'toggle_checklist':
        handleToggleChecklist(di, action.item, action.newValue); break
      case 'disable_item':
        handleSetItemDisabled(di, action.item, true); break
      case 'enable_item':
        handleSetItemDisabled(di, action.item, false); break
      case 'move_back_to_signed':
        handleMoveBack(di, 'paid', 'signed'); break
      case 'mark_complete':
        openMarkCompleteModal(di); break
      case 'move_back_to_paid':
        handleMoveBack(di, 'complete', 'paid'); break
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative' }}>

      {/* Toolbar + Close the deal button */}
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
              {(['paid', 'complete'] as CompletionDisplayStatus[]).map(s => (
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
                  {s === 'paid' ? 'Paid' : 'Complete'}
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

        {/* "Close the deal" */}
        {isReadOnly ? (
          <span style={{
            fontSize: 12, fontWeight: 600, color: '#1d9e75',
            padding: '6px 12px', background: '#e8faf3', borderRadius: 6,
          }}>
            ✓ Deal closed
          </span>
        ) : (
          <button
            onClick={() => setCloseDealPending(true)}
            disabled={!canCloseDeal}
            title={canCloseDeal ? undefined : 'Available when all investors are marked complete'}
            className="btn"
            style={{
              fontSize: 12,
              background: canCloseDeal ? '#0f2744' : '#f0f0ec',
              color: canCloseDeal ? '#fff' : '#bbb',
              border: 'none',
              cursor: canCloseDeal ? 'pointer' : 'not-allowed',
            }}
          >
            Close the deal
          </button>
        )}
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
              checked={filteredPaid.length > 0 && filteredPaid.every(di => selectedIds.has(di.id))}
              onChange={e => {
                if (e.target.checked) setSelectedIds(new Set(filteredPaid.map(di => di.id)))
                else setSelectedIds(new Set())
              }}
              style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
              title="Select all"
            />
          </div>
          <ColHeader label="Client"       align="left"   />
          <ColHeader label="Vehicle"      align="center" />
          <ColHeader label="Location"     align="center" />
          <ColHeader label="Confirmed"    align="right"  />
          <ColHeader label="Shares"       align="right"  />
          <ColHeader label="Checklist"    align="center" />
          <ColHeader label="POA"          align="center" />
          <ColHeader label="EIS"          align="center" />
          <ColHeader label="Days"         align="center" />
          <ColHeader label="Next step"    align="left"   />
          <ColHeader />
        </div>

        {/* Active (paid) rows */}
        {filteredPaid.map(di => {
          const checklist = getChecklist(di)
          const canComplete = isMarkCompleteEnabled(checklist, eisQualifying)
          return (
            <CompletionRow
              key={di.id}
              di={di}
              client={clientMap.get(di.client_id) ?? null}
              vehicleName={di.investing_vehicle_id ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? null) : null}
              nomineeName={di.nominee_id ? (nomineeMap.get(di.nominee_id)?.name ?? null) : null}
              eisQualifying={eisQualifying}
              checklist={checklist}
              canMarkComplete={canComplete}
              gridTemplate={gridTemplate}
              dim={false}
              readOnly={isReadOnly}
              selected={selectedIds.has(di.id)}
              onSelectChange={checked => {
                setSelectedIds(prev => {
                  const next = new Set(prev)
                  checked ? next.add(di.id) : next.delete(di.id)
                  return next
                })
              }}
              onChecklistToggle={(key, newVal) => handleToggleChecklist(di, key, newVal)}
              onMarkComplete={() => openMarkCompleteModal(di)}
              onMenuClick={(di2, x, y) => setRowMenu({ di: di2, x, y })}
            />
          )
        })}

        {/* Empty state */}
        {filteredPaid.length === 0 && filteredComplete.length === 0 && filtersActive && (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: '#999', fontSize: 13 }}>
            No investors match your filters.{' '}
            <button onClick={clearFilters} style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
              Clear filters
            </button>
          </div>
        )}

        {paidRows.length === 0 && completeRows.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#999', fontSize: 13 }}>
            No paid investors yet — investors appear here after being marked as paid in the Closing tab.
          </div>
        )}

        {/* Past (complete) section */}
        {filteredComplete.length > 0 && (
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
        {filteredComplete.map(di => {
          const checklist = getChecklist(di)
          return (
            <CompletionRow
              key={di.id}
              di={di}
              client={clientMap.get(di.client_id) ?? null}
              vehicleName={di.investing_vehicle_id ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? null) : null}
              nomineeName={di.nominee_id ? (nomineeMap.get(di.nominee_id)?.name ?? null) : null}
              eisQualifying={eisQualifying}
              checklist={checklist}
              canMarkComplete={false}
              gridTemplate={gridTemplate}
              dim={true}
              readOnly={true}
              selected={false}
              onSelectChange={() => {}}
              onChecklistToggle={() => {}}
              onMarkComplete={() => {}}
              onMenuClick={(di2, x, y) => setRowMenu({ di: di2, x, y })}
            />
          )
        })}

        {/* Totals */}
        {(paidRows.length > 0 || completeRows.length > 0) && (
          <div style={{
            display: 'grid', gridTemplateColumns: gridTemplate,
            padding: '0 8px',
            borderTop: '0.5px solid var(--card-border)',
            background: '#fafaf8',
          }}>
            <div />
            <TotalCell align="left" style={{ color: '#888', fontWeight: 400, fontSize: 11 }}>
              {paidRows.length} active · {completeRows.length} complete
            </TotalCell>
            <div /><div />
            <TotalCell align="right">
              {totalConfirmed > 0 ? formatCurrency(totalConfirmed) : '—'}
            </TotalCell>
            <TotalCell align="right">
              {totalShares > 0 ? fmtWhole(totalShares) : '—'}
            </TotalCell>
            <div /><div /><div /><div /><div /><div />
          </div>
        )}
      </div>

      {/* Bulk action footer */}
      {selectedPaid.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#0f2744', color: '#fff', zIndex: 200,
          padding: '12px 24px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 -2px 12px rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            {selectedPaid.length} selected
          </span>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#f0c060', flex: 1 }}>
            Mark complete requires individual date entry — use the Mark complete button on each row.
          </span>
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

      {/* Close the deal confirm */}
      {closeDealPending && (
        <ConfirmDialog
          title="Close the deal"
          message={`All investors are complete. Mark this deal as closed?\n\nAfter closing, the deal will be read-only across all tabs.`}
          confirmLabel="Close the deal"
          saving={false}
          onConfirm={handleCloseDeal}
          onCancel={() => setCloseDealPending(false)}
        />
      )}

      {/* Mark complete modal */}
      {markCompleteDi && (
        <MarkCompleteModal
          di={markCompleteDi}
          investorName={clientMap.get(markCompleteDi.client_id)?.full_name ?? 'Investor'}
          checklist={getChecklist(markCompleteDi)}
          eisQualifying={eisQualifying}
          investmentDate={investmentDate}
          completionDate={completionDate}
          dateErrors={dateErrors}
          saving={modalSaving}
          onInvestmentDateChange={setInvestmentDate}
          onCompletionDateChange={setCompletionDate}
          onConfirm={handleMarkCompleteConfirm}
          onCancel={() => setMarkCompleteDi(null)}
        />
      )}

      {rowMenu && (
        <CompletionRowMenuDropdown
          status={rowMenu.di.lifecycle_status as 'paid' | 'complete'}
          checklistState={getChecklist(rowMenu.di)}
          eisQualifying={eisQualifying}
          canMarkComplete={isMarkCompleteEnabled(getChecklist(rowMenu.di), eisQualifying)}
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

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: selectedPaid.length > 0 ? 72 : 24,
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
      textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#aaa',
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

// ── ChecklistCell ─────────────────────────────────────────────────────────────

function ChecklistCell({
  checklist, eisQualifying, readOnly, onToggle,
}: {
  checklist: ChecklistState
  eisQualifying: boolean
  readOnly: boolean
  onToggle: (key: ChecklistItemKey, newValue: boolean) => void
}) {
  const doneCount = CHECKLIST_KEYS.filter(k => {
    if (isItemDisabled(checklist, k, eisQualifying)) return true
    return !!checklist[k]
  }).length

  return (
    <div style={{
      padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center',
    }}>
      {CHECKLIST_KEYS.map(key => {
        const disabled = isItemDisabled(checklist, key, eisQualifying)
        const checked  = !!checklist[key]
        const label    = `${CHECKLIST_LABELS[key]}: ${disabled ? 'N/A' : checked ? 'done' : 'pending'}`

        if (disabled) {
          return (
            <span
              key={key}
              title={label}
              style={{
                fontSize: 10, fontWeight: 600, color: '#ccc',
                padding: '2px 4px', borderRadius: 3,
                background: '#f5f5f2',
              }}
            >
              {CHECKLIST_SHORT[key]}
            </span>
          )
        }

        return (
          <button
            key={key}
            title={label}
            disabled={readOnly}
            onClick={() => !readOnly && onToggle(key, !checked)}
            style={{
              fontSize: 10, fontWeight: 600,
              padding: '2px 4px', borderRadius: 3, border: 'none',
              cursor: readOnly ? 'default' : 'pointer',
              background: checked ? '#d0f0e6' : '#f0f0ec',
              color: checked ? '#0a5a3d' : '#888',
            }}
          >
            {checked ? '✓' : CHECKLIST_SHORT[key]}
          </button>
        )
      })}
      <span style={{ fontSize: 9, color: '#aaa', marginLeft: 2 }}>
        {doneCount}/4
      </span>
    </div>
  )
}

// ── CompletionRow ─────────────────────────────────────────────────────────────

interface RowProps {
  di:               DealInvestorFull
  client:           ClientFull | null
  vehicleName:      string | null
  nomineeName:      string | null
  eisQualifying:    boolean
  checklist:        ChecklistState
  canMarkComplete:  boolean
  gridTemplate:     string
  dim:              boolean
  readOnly:         boolean
  selected:         boolean
  onSelectChange:   (checked: boolean) => void
  onChecklistToggle: (key: ChecklistItemKey, newValue: boolean) => void
  onMarkComplete:   () => void
  onMenuClick:      (di: DealInvestorFull, x: number, y: number) => void
}

function CompletionRow({
  di, client, vehicleName, nomineeName, eisQualifying, checklist,
  canMarkComplete, gridTemplate, dim, readOnly,
  selected, onSelectChange, onChecklistToggle, onMarkComplete, onMenuClick,
}: RowProps) {
  const isPast   = di.lifecycle_status === 'complete'
  const kycColor = client ? (KYC_DOT[client.kyc_status] ?? '#ccc') : '#ccc'
  const days     = daysSince(di.updated_at)

  const eisLabel = eisQualifying ? 'EIS' : '—'
  const eisColor = eisQualifying ? '#1d9e75' : '#ccc'

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

      {/* Checklist */}
      <div>
        {isPast ? (
          <div style={{ padding: '10px 8px', fontSize: 11, textAlign: 'center', color: '#1d9e75', fontWeight: 600 }}>
            ✓ All done
          </div>
        ) : (
          <ChecklistCell
            checklist={checklist}
            eisQualifying={eisQualifying}
            readOnly={readOnly}
            onToggle={onChecklistToggle}
          />
        )}
      </div>

      {/* POA */}
      <div style={{
        padding: '10px 8px', fontSize: 12, textAlign: 'center',
        color: di.poa_held ? '#1d9e75' : '#ccc', fontWeight: di.poa_held ? 600 : 400,
      }}>
        {di.poa_held ? '✓' : '—'}
      </div>

      {/* EIS */}
      <div style={{ padding: '10px 8px', fontSize: 11, textAlign: 'center', color: eisColor, fontWeight: 600 }}>
        {eisLabel}
      </div>

      {/* Days since paid */}
      <div style={{ padding: '10px 8px', fontSize: 12, textAlign: 'center', color: '#0f2744' }}>
        {isPast ? '—' : `${days}d`}
      </div>

      {/* Next step */}
      <div style={{ padding: '10px 8px' }}>
        {isPast ? (
          <span style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>Complete</span>
        ) : canMarkComplete && !readOnly ? (
          <button
            onClick={onMarkComplete}
            style={{
              fontSize: 11, padding: '4px 8px',
              background: '#1d9e75', border: 'none',
              borderRadius: 6, color: '#fff',
              cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500,
            }}
          >
            Mark complete
          </button>
        ) : (
          <span style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>
            {readOnly ? 'Read only' : 'Tick checklist items'}
          </span>
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

// ── Mark complete modal ───────────────────────────────────────────────────────

function MarkCompleteModal({
  di, investorName, checklist, eisQualifying,
  investmentDate, completionDate, dateErrors, saving,
  onInvestmentDateChange, onCompletionDateChange,
  onConfirm, onCancel,
}: {
  di: DealInvestorFull
  investorName: string
  checklist: ChecklistState
  eisQualifying: boolean
  investmentDate: string
  completionDate: string
  dateErrors: { inv?: string; comp?: string }
  saving: boolean
  onInvestmentDateChange: (v: string) => void
  onCompletionDateChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 6,
    border: '1px solid #d0d0c8', outline: 'none', boxSizing: 'border-box',
  }
  const errStyle: React.CSSProperties = { fontSize: 11, color: '#a32d2d', marginTop: 4 }

  // Build checklist summary for display in modal
  const displayItems: { label: string; state: 'done' | 'na' }[] = CHECKLIST_KEYS.map(key => {
    const disabled = isItemDisabled(checklist, key, eisQualifying)
    return {
      label: CHECKLIST_LABELS[key],
      state: disabled ? 'na' : 'done',
    }
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: '24px',
        width: 480, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', marginBottom: 4 }}>
          Mark complete: {investorName}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
          Confirm all checklist items are done.
        </div>

        {/* Checklist summary */}
        <div style={{
          background: '#fafaf8', borderRadius: 8, padding: '12px 14px', marginBottom: 16,
        }}>
          {displayItems.map(item => (
            <div key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: '#0f2744', marginBottom: 6,
            }}>
              <span style={{ color: item.state === 'na' ? '#aaa' : '#1d9e75', fontWeight: 600, fontSize: 13 }}>
                {item.state === 'na' ? '—' : '✓'}
              </span>
              <span style={{ color: item.state === 'na' ? '#aaa' : '#0f2744' }}>{item.label}</span>
              {item.state === 'na' && <span style={{ fontSize: 10, color: '#aaa' }}>N/A</span>}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 6, color: '#1d9e75' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>✓</span>
            <span>Investment record created</span>
            <span style={{ fontSize: 10, color: '#aaa' }}>auto</span>
          </div>
        </div>

        <div style={{ height: 1, background: '#e8e7e0', marginBottom: 16 }} />

        {/* Investment date */}
        <div style={{ marginBottom: 14 }}>
          <label style={{
            fontSize: 10, fontWeight: 600, color: '#888',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            display: 'block', marginBottom: 5,
          }}>
            Investment date (legal)
          </label>
          <input
            type="date"
            value={investmentDate}
            onChange={e => onInvestmentDateChange(e.target.value)}
            style={inputStyle}
            max={new Date().toISOString().slice(0, 10)}
          />
          {dateErrors.inv && <div style={errStyle}>{dateErrors.inv}</div>}
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            The legal investment date for HMRC, share register, and EIS3 purposes.
          </div>
        </div>

        {/* Completion date */}
        <div style={{ marginBottom: 20 }}>
          <label style={{
            fontSize: 10, fontWeight: 600, color: '#888',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            display: 'block', marginBottom: 5,
          }}>
            Completion date (round close)
          </label>
          <input
            type="date"
            value={completionDate}
            onChange={e => onCompletionDateChange(e.target.value)}
            style={inputStyle}
            max={new Date().toISOString().slice(0, 10)}
          />
          {dateErrors.comp && <div style={errStyle}>{dateErrors.comp}</div>}
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            The date the whole funding round formally closed. Usually the same for all investors on a single-close deal.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} className="btn btn-secondary" style={{ fontSize: 12 }} disabled={saving}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none',
              background: '#1d9e75', color: '#fff', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Mark complete'}
          </button>
        </div>
      </div>
    </div>
  )
}
