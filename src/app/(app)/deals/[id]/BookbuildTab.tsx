'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  DealInvestorFull, ClientFull, NomineeRow,
  getDisplayedStatus, ACTIVE_STATUSES, PAST_STATUSES,
  STATUS_SORT_ORDER, DisplayedStatus, isBookbuildLocked,
} from './dealUtils'
import {
  sendChaser, declineInvestor, removeFromDeal, moveBackwards,
  markPoaHeld, bulkDeclineInvestors,
} from './bookbuildActions'
import AddInvestorsModal        from './AddInvestorsModal'
import ConfirmInvestmentModal, { BulkConfirmModal } from './ConfirmInvestmentModal'
import SendApplicationFormModal  from './SendApplicationFormModal'
import { retryDistributeAction }  from './applicationFormActions'
import FeePopover                from './FeePopover'
import RowMenuDropdown           from './RowMenuDropdown'
import type { MenuAction }       from './RowMenuDropdown'
import EditDealInvestorModal     from './EditDealInvestorModal'
import SignatureUploadModal       from './SignatureUploadModal'
import ConfirmDialog             from './ConfirmDialog'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<DisplayedStatus, { label: string; cls: string }> = {
  soft_circled:  { label: 'Soft-circled',  cls: 'pill-grey'  },
  confirmed:     { label: 'Confirmed',      cls: 'pill-teal'  },
  app_form_sent: { label: 'App form sent',  cls: 'pill-blue'  },
  chase:         { label: 'Chase',          cls: 'pill-amber' },
  declined:      { label: 'Declined',       cls: 'pill-grey'  },
  signed:        { label: 'Signed',         cls: 'pill-green' },
  paid:          { label: 'Paid',           cls: 'pill-green' },
  complete:      { label: 'Complete',       cls: 'pill-green' },
  superseded:    { label: 'Superseded',     cls: 'pill-grey'  },
}

const KYC_DOT: Record<string, string> = {
  verified:    '#1d9e75',
  renewal_due: '#ba7517',
  outstanding: '#a32d2d',
}

const ALL_FILTER_STATUSES: DisplayedStatus[] = [
  'soft_circled', 'confirmed', 'app_form_sent', 'chase', 'declined', 'signed', 'paid', 'complete',
]

const STATUS_FILTER_LABEL: Record<DisplayedStatus, string> = {
  soft_circled:  'Soft-circled',
  confirmed:     'Confirmed',
  app_form_sent: 'App form sent',
  chase:         'Chase',
  declined:      'Declined',
  signed:        'Signed',
  paid:          'Paid',
  complete:      'Complete',
  superseded:    'Superseded',
}

function fmtWhole(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface DealRow {
  id: string
  status: string
  eis_qualifying: string | null
  share_price: number | null
  company_id: string | null
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
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => Promise<void>
} | null

// ── Main component ────────────────────────────────────────────────────────────

export default function BookbuildTab({
  deal, dealInvestors, clientMap, allClients, nominees, onDataRefresh,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()

  // Auth
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  // Toast
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }
  function showError(msg: string) {
    setToast(`Error: ${msg}`)
    setTimeout(() => setToast(null), 5000)
  }

  // Modal states
  const [addModalOpen,    setAddModalOpen]    = useState(false)
  const [confirmDi,       setConfirmDi]       = useState<DealInvestorFull | null>(null)
  const [sendAppFormDi,   setSendAppFormDi]   = useState<{ dealInvestorId: string; isReissue: boolean } | null>(null)
  const [feePopover,      setFeePopover]      = useState<{ di: DealInvestorFull; rect: DOMRect } | null>(null)
  const [rowMenu,         setRowMenu]         = useState<{ di: DealInvestorFull; x: number; y: number; isPast: boolean } | null>(null)
  const [editDi,          setEditDi]          = useState<DealInvestorFull | null>(null)
  const [signatureDi,     setSignatureDi]     = useState<DealInvestorFull | null>(null)
  const [confirmDialog,   setConfirmDialog]   = useState<ConfirmDialogState>(null)
  const [confirmDlgSaving, setConfirmDlgSaving] = useState(false)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Filters
  const [searchQuery,       setSearchQuery]       = useState('')
  const [statusFilters,     setStatusFilters]     = useState<Set<DisplayedStatus>>(new Set())
  const [vehicleFilter,     setVehicleFilter]     = useState<string | null>(null)
  const [statusDropOpen,    setStatusDropOpen]    = useState(false)
  const [vehicleDropOpen,   setVehicleDropOpen]   = useState(false)

  const isReadOnly = deal.status === 'complete'
  const showEis    = deal.eis_qualifying === 'yes'
  const locked     = isBookbuildLocked(dealInvestors)
  const nomineeMap = new Map(nominees.map(n => [n.id, n]))

  // Unique vehicles in this deal for filter dropdown
  const dealVehicles = [...new Map(
    dealInvestors
      .filter(di => di.investing_vehicle_id != null)
      .map(di => [di.investing_vehicle_id!, clientMap.get(di.investing_vehicle_id!)?.full_name ?? ''])
  ).entries()].sort((a, b) => a[1].localeCompare(b[1]))

  // Filter logic
  function matchesFilters(di: DealInvestorFull): boolean {
    const ds          = getDisplayedStatus(di)
    const clientName  = clientMap.get(di.client_id)?.full_name ?? ''
    const vehicleName = di.investing_vehicle_id ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? '') : ''
    const nomineeName = di.nominee_id ? (nomineeMap.get(di.nominee_id)?.name ?? '') : ''

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (![clientName, vehicleName, nomineeName].some(s => s.toLowerCase().includes(q))) return false
    }

    if (statusFilters.size > 0 && !statusFilters.has(ds)) return false

    if (vehicleFilter === 'own_name'    && di.investing_vehicle_id != null) return false
    if (vehicleFilter === 'via_vehicle' && di.investing_vehicle_id == null) return false
    if (vehicleFilter && vehicleFilter !== 'own_name' && vehicleFilter !== 'via_vehicle') {
      if (di.investing_vehicle_id !== vehicleFilter) return false
    }

    return true
  }

  const filtersActive = searchQuery.length > 0 || statusFilters.size > 0 || vehicleFilter != null

  function clearFilters() {
    setSearchQuery(''); setStatusFilters(new Set()); setVehicleFilter(null)
  }

  // Partition and sort
  const allActiveRows = dealInvestors
    .filter(di => ACTIVE_STATUSES.has(getDisplayedStatus(di)))
    .sort((a, b) => {
      const sa = STATUS_SORT_ORDER[getDisplayedStatus(a)] ?? 99
      const sb = STATUS_SORT_ORDER[getDisplayedStatus(b)] ?? 99
      if (sa !== sb) return sa - sb
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

  const allPastRows = dealInvestors
    .filter(di => PAST_STATUSES.has(getDisplayedStatus(di)))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const activeRows  = allActiveRows.filter(matchesFilters)
  const pastRows    = allPastRows.filter(matchesFilters)

  const declinedCount      = allActiveRows.filter(di => getDisplayedStatus(di) === 'declined').length
  const activeNonDeclined  = allActiveRows.filter(di => getDisplayedStatus(di) !== 'declined')
  const totalSoftCircle    = activeNonDeclined.reduce((s, di) => s + (di.soft_circle_amount ?? 0), 0)
  const totalConfirmed     = activeNonDeclined.reduce((s, di) => s + (di.confirmed_amount ?? 0), 0)
  const totalShares        = activeNonDeclined.reduce((s, di) => s + (di.shares ?? 0), 0)
  const totalFeeAmount     = activeNonDeclined
    .filter(di => getDisplayedStatus(di) === 'confirmed' && di.fee_pct != null && di.confirmed_amount != null)
    .reduce((s, di) => s + (Number(di.fee_pct) * (di.confirmed_amount ?? 0)), 0)

  // Filtered totals
  const filteredNonDeclined = activeRows.filter(di => getDisplayedStatus(di) !== 'declined')
  const filteredSoftCircle  = filteredNonDeclined.reduce((s, di) => s + (di.soft_circle_amount ?? 0), 0)
  const filteredConfirmed   = filteredNonDeclined.reduce((s, di) => s + (di.confirmed_amount ?? 0), 0)
  const filteredShares      = filteredNonDeclined.reduce((s, di) => s + (di.shares ?? 0), 0)
  const filteredFeeAmount   = filteredNonDeclined
    .filter(di => getDisplayedStatus(di) === 'confirmed' && di.fee_pct != null && di.confirmed_amount != null)
    .reduce((s, di) => s + (Number(di.fee_pct) * (di.confirmed_amount ?? 0)), 0)

  // Bulk selection
  const selectedActive = activeRows.filter(di => selectedIds.has(di.id))
  const selectedStatuses = new Set(selectedActive.map(di => getDisplayedStatus(di)))
  const allSameStatus = selectedStatuses.size === 1

  let bulkPrimaryLabel: string | null = null
  let bulkPrimaryWarning: string | null = null

  if (selectedActive.length > 0) {
    if (selectedStatuses.size > 1) {
      bulkPrimaryWarning = 'Selected rows have different statuses. Select rows with the same status to enable bulk actions.'
    } else {
      const s = [...selectedStatuses][0]
      if (s === 'soft_circled') bulkPrimaryLabel = `Confirm investment (${selectedActive.length})`
      else if (s === 'confirmed') bulkPrimaryWarning = 'Send application form is per-investor only — use the row action button.'
      else if (s === 'chase') bulkPrimaryLabel = `Send chaser (${selectedActive.length})`
      else bulkPrimaryWarning = "Selected rows can't be bulk-progressed. Use individual row actions."
    }
  }

  const existingInvestorIds = new Set(dealInvestors.map(di => di.client_id))

  // Grid
  const cols = [
    '32px', 'minmax(160px, 1fr)', '130px', '140px',
    '100px', '100px', '90px', '80px', '120px', '52px',
    ...(showEis ? ['52px'] : []),
    '150px', '44px',
  ]
  const gridTemplate = cols.join(' ')

  // ── Action handlers ──────────────────────────────────────────────────────────

  function requireUser(): string | null {
    if (!userId) { showError('Not authenticated — please reload.'); return null }
    return userId
  }

  async function handleSendChaser(di: DealInvestorFull) {
    const uid = requireUser(); if (!uid) return
    const result = await sendChaser(supabase, deal.id, di.id, uid)
    if (result.error) { showError(result.error); return }
    showToast('Chaser drafted (Outlook integration coming soon). Chase timer reset.')
    onDataRefresh()
  }

  async function handleDecline(di: DealInvestorFull) {
    const uid = requireUser(); if (!uid) return
    const ds = getDisplayedStatus(di)
    setConfirmDialog({
      title: 'Move to declined',
      message: `Mark ${clientMap.get(di.client_id)?.full_name ?? 'this investor'} as declined?`,
      confirmLabel: 'Decline',
      danger: true,
      onConfirm: async () => {
        const result = await declineInvestor(supabase, deal.id, di.id, ds, uid)
        if (result.error) { showError(result.error); return }
        showToast(`${clientMap.get(di.client_id)?.full_name ?? 'Investor'} declined.`)
        setSelectedIds(prev => { const next = new Set(prev); next.delete(di.id); return next })
        onDataRefresh()
      },
    })
  }

  async function handleRemove(di: DealInvestorFull) {
    const uid = requireUser(); if (!uid) return
    const name = clientMap.get(di.client_id)?.full_name ?? 'this investor'
    setConfirmDialog({
      title: 'Remove from deal',
      message: `Remove ${name} from this deal? The row will be deleted entirely. The action will be logged.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        const result = await removeFromDeal(supabase, deal.id, di, uid)
        if (result.error) { showError(result.error); return }
        showToast(`${name} removed from deal.`)
        setSelectedIds(prev => { const next = new Set(prev); next.delete(di.id); return next })
        onDataRefresh()
      },
    })
  }

  async function handleMoveBack(
    di: DealInvestorFull,
    fromStatus: string,
    toStatus: string,
    extraUpdates?: Record<string, unknown>,
  ) {
    const uid = requireUser(); if (!uid) return
    const name = clientMap.get(di.client_id)?.full_name ?? 'this investor'

    const labelMap: Record<string, string> = {
      soft_circled: 'soft-circled', confirmed: 'confirmed',
      app_form_sent: 'app form sent', signed: 'signed', paid: 'paid',
    }
    const toLabel = labelMap[toStatus] ?? toStatus

    let extraMsg = ''
    if (fromStatus === 'confirmed' && toStatus === 'soft_circled') {
      extraMsg = ' This will clear the confirmed amount and fee.'
    }
    if (fromStatus === 'app_form_sent' && toStatus === 'confirmed') {
      extraMsg = ' The application form will be marked superseded.'
    }

    setConfirmDialog({
      title: `Move back to ${toLabel}`,
      message: `Move ${name} back to ${toLabel}?${extraMsg}`,
      confirmLabel: 'Move back',
      onConfirm: async () => {
        let extra: Record<string, unknown> = extraUpdates ?? {}

        // Specific cleanup for confirmed → soft_circled
        if (fromStatus === 'confirmed' && toStatus === 'soft_circled') {
          extra = { confirmed_amount: null, fee_pct: null, fee_overridden: false, shares: null, ...extra }
        }

        // app_form_sent → confirmed: unlock fee and supersede placeholder doc
        if (fromStatus === 'app_form_sent' && toStatus === 'confirmed') {
          extra = { fee_locked_at: null, signing_status: 'not_reviewed', ...extra }
          // Supersede the placeholder document
          await supabase
            .from('documents')
            .update({ superseded: true, superseded_at: new Date().toISOString() })
            .eq('deal_investor_id', di.id).eq('type', 'app_form').eq('superseded', false)
        }

        const result = await moveBackwards(supabase, deal.id, di.id, fromStatus, toStatus, uid, extra)
        if (result.error) { showError(result.error); return }
        showToast(`${name} moved back to ${toLabel}.`)
        onDataRefresh()
      },
    })
  }

  async function handleUndecline(di: DealInvestorFull) {
    const uid = requireUser(); if (!uid) return
    const name = clientMap.get(di.client_id)?.full_name ?? 'this investor'
    setConfirmDialog({
      title: 'Restore to soft-circled',
      message: `Restore ${name} to soft-circled?`,
      confirmLabel: 'Restore',
      onConfirm: async () => {
        const result = await moveBackwards(supabase, deal.id, di.id, 'declined', 'soft_circled', uid)
        if (result.error) { showError(result.error); return }
        showToast(`${name} restored to soft-circled.`)
        onDataRefresh()
      },
    })
  }

  function handleMenuAction(di: DealInvestorFull, action: MenuAction, isPast: boolean) {
    const ds = getDisplayedStatus(di)
    switch (action.type) {
      case 'view_investor':
        window.open(`/clients/${di.client_id}`, '_blank')
        break
      case 'go_to_closing':
        router.push(`?tab=closing`)
        break
      case 'edit_deal_investor':
        setEditDi(di)
        break
      case 'mark_confirmed':
        setConfirmDi(di)
        break
      case 'send_app_form':
        setSendAppFormDi({ dealInvestorId: di.id, isReissue: false })
        break
      case 'reissue_app_form':
        setSendAppFormDi({ dealInvestorId: di.id, isReissue: true })
        break
      case 'retry_distribute':
        handleRetryDistribute(di)
        break
      case 'mark_signed':
        setSignatureDi(di)
        break
      case 'decline':
        handleDecline(di)
        break
      case 'undecline':
        handleUndecline(di)
        break
      case 'remove_from_deal':
        handleRemove(di)
        break
      case 'move_back_to_soft_circled':
        handleMoveBack(di, ds, 'soft_circled')
        break
      case 'move_back_to_confirmed':
        handleMoveBack(di, 'app_form_sent', 'confirmed')
        break
      case 'move_back_to_app_form_sent':
        handleMoveBack(di, 'signed', 'app_form_sent')
        break
      case 'move_back_to_signed':
        handleMoveBack(di, 'paid', 'signed')
        break
      case 'move_back_to_paid':
        handleMoveBack(di, 'complete', 'paid')
        break
    }
  }

  async function handleRetryDistribute(di: DealInvestorFull) {
    const result = await retryDistributeAction(di.id)
    if (result.error) { showError(result.error); return }
    showToast('Application form sent — signing request emailed to investor.')
    onDataRefresh()
  }

  async function handleBulkMarkPoa() {
    const uid = requireUser(); if (!uid) return
    const ids  = selectedActive.map(di => di.id)
    setConfirmDialog({
      title: 'Mark POA held',
      message: `Mark POA held for ${ids.length} selected investor${ids.length !== 1 ? 's' : ''}?`,
      confirmLabel: 'Mark POA held',
      onConfirm: async () => {
        const result = await markPoaHeld(supabase, deal.id, ids, uid)
        if (result.error) { showError(result.error); return }
        showToast(`POA marked as held for ${ids.length} investor${ids.length !== 1 ? 's' : ''}.`)
        setSelectedIds(new Set())
        onDataRefresh()
      },
    })
  }

  async function handleBulkDecline() {
    const uid = requireUser(); if (!uid) return
    setConfirmDialog({
      title: 'Decline investors',
      message: `Mark ${selectedActive.length} selected investor${selectedActive.length !== 1 ? 's' : ''} as declined?`,
      confirmLabel: 'Decline all',
      danger: true,
      onConfirm: async () => {
        const result = await bulkDeclineInvestors(supabase, deal.id, selectedActive, uid)
        if (result.error) { showError(result.error); return }
        showToast(`${selectedActive.length} investor${selectedActive.length !== 1 ? 's' : ''} declined.`)
        setSelectedIds(new Set())
        onDataRefresh()
      },
    })
  }

  async function handleBulkChaser() {
    const uid = requireUser(); if (!uid) return
    for (const di of selectedActive) {
      await sendChaser(supabase, deal.id, di.id, uid)
    }
    showToast(`Chaser drafted for ${selectedActive.length} investor${selectedActive.length !== 1 ? 's' : ''} (Outlook integration coming soon). Timers reset.`)
    setSelectedIds(new Set())
    onDataRefresh()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative' }}>

      {/* Deal closed banner */}
      {isReadOnly && (
        <div style={{
          padding: '8px 16px',
          background: '#f0faf6',
          borderBottom: '0.5px solid #a8dfc9',
          fontSize: 12, color: '#0a5a3d',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>✓</span>
          <span><strong>Deal closed.</strong> This deal is read-only — all actions are disabled.</span>
        </div>
      )}

      {/* Auto-lock banner */}
      {locked && !isReadOnly && (
        <div style={{
          padding: '8px 16px',
          background: '#fff8e8',
          borderBottom: '0.5px solid #f0d080',
          fontSize: 12, color: '#7a5500',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>🔒</span>
          <span>
            <strong>Bookbuild locked.</strong>{' '}
            At least one investor has signed. New investors must be added via{' '}
            &ldquo;+ Add late addition&rdquo; in the Closing tab.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        padding: '10px 12px', borderBottom: '0.5px solid var(--card-border)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        {/* Search */}
        <input
          type="text" value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by lead, beneficial owner, or legal owner…"
          style={{
            padding: '6px 10px', fontSize: 12, borderRadius: 6,
            border: '1px solid #d0d0c8', outline: 'none',
            width: 280, flexShrink: 0,
          }}
        />

        {/* Status filter */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setStatusDropOpen(v => !v); setVehicleDropOpen(false) }}
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
          >
            {statusFilters.size === 0 ? 'All statuses' : `${statusFilters.size} status${statusFilters.size !== 1 ? 'es' : ''}`}
            {' ▾'}
          </button>
          {statusDropOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 300,
              background: '#fff', border: '0.5px solid var(--card-border)',
              borderRadius: 8, padding: '8px 0', minWidth: 180,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}>
              {ALL_FILTER_STATUSES.map(s => (
                <label key={s} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                  color: '#0f2744',
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
                  {STATUS_FILTER_LABEL[s]}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Vehicle filter */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setVehicleDropOpen(v => !v); setStatusDropOpen(false) }}
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
          >
            {vehicleFilter == null ? 'All vehicles'
              : vehicleFilter === 'own_name' ? 'Own name only'
              : vehicleFilter === 'via_vehicle' ? 'Via vehicle only'
              : clientMap.get(vehicleFilter)?.full_name ?? 'Vehicle'}
            {' ▾'}
          </button>
          {vehicleDropOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 300,
              background: '#fff', border: '0.5px solid var(--card-border)',
              borderRadius: 8, padding: '4px 0', minWidth: 180,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}>
              {[
                { value: null,          label: 'All vehicles' },
                { value: 'own_name',    label: 'Own name only' },
                { value: 'via_vehicle', label: 'Via vehicle only' },
                ...dealVehicles.map(([id, name]) => ({ value: id, label: name })),
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => { setVehicleFilter(opt.value); setVehicleDropOpen(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 14px', fontSize: 12, background: 'none', border: 'none',
                    color: vehicleFilter === opt.value ? 'var(--teal)' : '#0f2744',
                    cursor: 'pointer', fontWeight: vehicleFilter === opt.value ? 600 : 400,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear filters */}
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

        {/* Spacer + Add investors */}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => !locked && !isReadOnly && setAddModalOpen(true)}
          className="btn btn-primary"
          disabled={locked || isReadOnly}
          style={{ fontSize: 12, opacity: locked || isReadOnly ? 0.45 : 1, cursor: locked || isReadOnly ? 'not-allowed' : 'pointer' }}
          title={isReadOnly ? 'Deal is closed — read only' : locked ? 'Bookbuild is locked — use "+ Add late addition" in the Closing tab' : undefined}
        >
          + Add investors
        </button>
      </div>

      {/* Horizontally scrollable table */}
      <div
        style={{ overflowX: 'auto' }}
        onClick={() => { setStatusDropOpen(false); setVehicleDropOpen(false) }}
      >

        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridTemplate,
          padding: '0 8px', borderBottom: '0.5px solid var(--card-border)',
          background: '#fafaf8',
        }}>
          {/* Select-all checkbox */}
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
          <ColHeader label="Lead investor"    align="left"  />
          <ColHeader label="Beneficial owner" align="center"/>
          <ColHeader label="Legal owner"      align="center"/>
          <ColHeader label="Soft-circle" align="right" />
          <ColHeader label="Confirmed"   align="right" />
          <ColHeader label="Shares"      align="right" />
          <ColHeader label="Fee"         align="right" />
          <ColHeader label="Status"      align="center"/>
          <ColHeader label="POA"         align="center"/>
          {showEis && <ColHeader label="EIS" align="center"/>}
          <ColHeader label="Next step"   align="left"  />
          <ColHeader />
        </div>

        {/* Active rows */}
        {activeRows.map(di => (
          <InvestorRow
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
              const ds = getDisplayedStatus(di2)
              if (ds === 'soft_circled') setConfirmDi(di2)
              else if (ds === 'confirmed') setSendAppFormDi({ dealInvestorId: di2.id, isReissue: false })
              else if (ds === 'chase') handleSendChaser(di2)
            }}
            readOnly={isReadOnly}
            onFeeClick={(di2, rect) => {
              const ds = getDisplayedStatus(di2)
              if (!isReadOnly && (ds === 'confirmed' || di2.fee_locked_at != null)) {
                setFeePopover({ di: di2, rect })
              }
            }}
            onMenuClick={(di2, x, y) => setRowMenu({ di: di2, x, y, isPast: false })}
          />
        ))}

        {/* Empty state when filters hide everything */}
        {activeRows.length === 0 && pastRows.length === 0 && filtersActive && (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: '#999', fontSize: 13 }}>
            No investors match your filters.{' '}
            <button onClick={clearFilters} style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
              Clear filters
            </button>
          </div>
        )}

        {/* No investors at all */}
        {dealInvestors.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#999', fontSize: 13 }}>
            No investors yet — click &ldquo;+ Add investors&rdquo; to get started.
          </div>
        )}

        {/* Past section */}
        {pastRows.length > 0 && (
          <div style={{
            padding: '5px 16px',
            background: '#fafaf8',
            borderTop: '0.5px solid var(--card-border)',
            borderBottom: '0.5px solid var(--card-border)',
            fontSize: 10, fontWeight: 600, color: '#aaa',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Signed &amp; beyond
          </div>
        )}
        {pastRows.map(di => (
          <InvestorRow
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
            onFeeClick={() => {}}
            onMenuClick={(di2, x, y) => setRowMenu({ di: di2, x, y, isPast: true })}
          />
        ))}

        {/* Totals row */}
        {(activeRows.length > 0 || pastRows.length > 0) && (
          <div style={{
            display: 'grid', gridTemplateColumns: gridTemplate,
            padding: '0 8px',
            borderTop: '0.5px solid var(--card-border)',
            background: '#fafaf8',
          }}>
            <div />
            <TotalCell align="left" style={{ color: '#888', fontWeight: 400, fontSize: 11 }}>
              {filtersActive
                ? `Filtered: ${filteredNonDeclined.length} of ${activeNonDeclined.length} active · ${declinedCount > 0 ? `${declinedCount} declined` : ''}`
                : `${activeNonDeclined.length} active${declinedCount > 0 ? ` · ${declinedCount} declined` : ''}`}
            </TotalCell>
            <div /><div />
            <TotalCell align="right">
              {(filtersActive ? filteredSoftCircle : totalSoftCircle) > 0
                ? formatCurrency(filtersActive ? filteredSoftCircle : totalSoftCircle) : '—'}
            </TotalCell>
            <TotalCell align="right">
              {(filtersActive ? filteredConfirmed : totalConfirmed) > 0
                ? formatCurrency(filtersActive ? filteredConfirmed : totalConfirmed) : '—'}
            </TotalCell>
            <TotalCell align="right">
              {(filtersActive ? filteredShares : totalShares) > 0
                ? fmtWhole(filtersActive ? filteredShares : totalShares) : '—'}
            </TotalCell>
            <TotalCell align="right">
              {(filtersActive ? filteredFeeAmount : totalFeeAmount) > 0
                ? formatCurrency(filtersActive ? filteredFeeAmount : totalFeeAmount) : '—'}
            </TotalCell>
            <div /><div />
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

          <button
            onClick={handleBulkMarkPoa}
            style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 6, border: 'none',
              background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontWeight: 500,
            }}
          >
            Mark POA held
          </button>

          <button
            onClick={handleBulkDecline}
            style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 6, border: 'none',
              background: 'rgba(163,45,45,0.7)', color: '#fff', cursor: 'pointer', fontWeight: 500,
            }}
          >
            Decline
          </button>

          {bulkPrimaryLabel && (
            <button
              onClick={() => {
                const s = [...selectedStatuses][0]
                if (s === 'soft_circled') setBulkConfirmOpen(true)
                else if (s === 'chase') handleBulkChaser()
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

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {addModalOpen && (
        <AddInvestorsModal
          dealId={deal.id}
          allClients={allClients}
          nominees={nominees}
          existingInvestorIds={existingInvestorIds}
          onClose={() => setAddModalOpen(false)}
          onSaved={() => { setAddModalOpen(false); onDataRefresh() }}
        />
      )}

      {confirmDi && userId && (
        <ConfirmInvestmentModal
          di={confirmDi}
          client={clientMap.get(confirmDi.client_id) ?? null}
          sharePrice={deal.share_price}
          dealId={deal.id}
          userId={userId}
          onConfirmed={name => {
            setConfirmDi(null)
            showToast(`Investment confirmed for ${name}`)
            setSelectedIds(prev => { const n = new Set(prev); n.delete(confirmDi.id); return n })
            onDataRefresh()
          }}
          onClose={() => setConfirmDi(null)}
        />
      )}

      {bulkConfirmOpen && userId && (
        <BulkConfirmModal
          rows={selectedActive.map(di => ({
            di, client: clientMap.get(di.client_id) ?? null,
            amount: String(di.soft_circle_amount ?? ''),
          }))}
          sharePrice={deal.share_price}
          dealId={deal.id}
          userId={userId}
          onConfirmed={count => {
            setBulkConfirmOpen(false)
            showToast(`${count} investment${count !== 1 ? 's' : ''} confirmed.`)
            setSelectedIds(new Set())
            onDataRefresh()
          }}
          onClose={() => setBulkConfirmOpen(false)}
        />
      )}

      {sendAppFormDi && (
        <SendApplicationFormModal
          dealInvestorId={sendAppFormDi.dealInvestorId}
          isReissue={sendAppFormDi.isReissue}
          onSent={() => {
            setSendAppFormDi(null)
            showToast(sendAppFormDi.isReissue
              ? 'Application form re-issued.'
              : 'Application form sent for signing.')
            onDataRefresh()
          }}
          onClose={() => setSendAppFormDi(null)}
        />
      )}

      {feePopover && userId && (
        <FeePopover
          di={feePopover.di}
          client={clientMap.get(feePopover.di.client_id) ?? null}
          investorName={clientMap.get(feePopover.di.client_id)?.full_name ?? 'Investor'}
          anchorRect={feePopover.rect}
          dealId={deal.id}
          userId={userId}
          onSaved={msg => { setFeePopover(null); showToast(msg); onDataRefresh() }}
          onClose={() => setFeePopover(null)}
        />
      )}

      {rowMenu && (
        <RowMenuDropdown
          status={getDisplayedStatus(rowMenu.di)}
          signingStatus={rowMenu.di.signing_status}
          clientId={rowMenu.di.client_id}
          hasConfirmedAmount={!!rowMenu.di.confirmed_amount}
          isPast={rowMenu.isPast}
          x={rowMenu.x}
          y={rowMenu.y}
          onAction={action => handleMenuAction(rowMenu.di, action, rowMenu.isPast)}
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

      {signatureDi && userId && (
        <SignatureUploadModal
          di={signatureDi}
          client={clientMap.get(signatureDi.client_id) ?? null}
          dealId={deal.id}
          dealCompanyId={deal.company_id}
          userId={userId}
          onUploaded={name => {
            setSignatureDi(null)
            showToast(`Signed form uploaded for ${name}.`)
            onDataRefresh()
          }}
          onClose={() => setSignatureDi(null)}
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
          position: 'fixed', bottom: selectedActive.length > 0 ? 72 : 24,
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

// ── InvestorRow ───────────────────────────────────────────────────────────────

interface RowProps {
  di:           DealInvestorFull
  client:       ClientFull | null
  vehicleName:  string | null
  nomineeName:  string | null
  showEis:      boolean
  gridTemplate: string
  dim:          boolean
  readOnly?:    boolean
  selected:     boolean
  onSelectChange: (checked: boolean) => void
  onNextStep:   (di: DealInvestorFull) => void
  onFeeClick:   (di: DealInvestorFull, rect: DOMRect) => void
  onMenuClick:  (di: DealInvestorFull, x: number, y: number) => void
}

function InvestorRow({
  di, client, vehicleName, nomineeName, showEis, gridTemplate, dim,
  readOnly = false, selected, onSelectChange, onNextStep, onFeeClick, onMenuClick,
}: RowProps) {
  const ds       = getDisplayedStatus(di)
  const badge    = STATUS_BADGE[ds] ?? { label: ds, cls: 'pill-grey' }
  const kycColor = client ? (KYC_DOT[client.kyc_status] ?? '#ccc') : '#ccc'
  const isPast   = PAST_STATUSES.has(ds)

  // Next-step button config
  type NextStepConfig = { label: string; bg: string; color: string; italic?: boolean } | null
  const nextStep: NextStepConfig = (
    ds === 'soft_circled'  ? { label: 'Confirm investment',       bg: '#fff',    color: '#0f2744' } :
    ds === 'confirmed'     ? { label: 'Send application form →',  bg: '#1d8c5e', color: '#fff'    } :
    ds === 'chase'         ? { label: 'Send chaser',              bg: '#b87b1a', color: '#fff'    } :
    ds === 'app_form_sent' && di.signing_status === 'created_not_sent'
                           ? { label: '⚠ Send not completed',    bg: 'none',    color: '#a32d2d', italic: true } :
    ds === 'app_form_sent' ? { label: 'Awaiting signature',       bg: 'none',    color: '#aaa', italic: true } :
    ds === 'declined'      ? { label: 'No action',                bg: 'none',    color: '#aaa', italic: true } :
    null
  )

  const showFee         = (ds === 'confirmed' || ds === 'app_form_sent' || di.fee_locked_at != null) && di.fee_pct != null
  const feeClickable    = !readOnly && (ds === 'confirmed' || di.fee_locked_at != null)
  const isActionButton  = nextStep && ds !== 'app_form_sent' && ds !== 'declined'

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: gridTemplate,
      padding: '0 8px', borderBottom: '0.5px solid var(--card-border)',
      opacity: dim ? 0.45 : 1, alignItems: 'center',
      transition: 'opacity 0.15s',
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
          : <span style={{ color: '#aaa' }}>Lead investor</span>}
      </div>

      {/* Location */}
      <div style={{ padding: '10px 8px', fontSize: 12, textAlign: 'center' }}>
        {nomineeName
          ? <span style={{ color: '#0f2744', fontWeight: 500 }}>{nomineeName}</span>
          : <span style={{ color: '#aaa' }}>Direct (no nominee)</span>}
      </div>

      {/* Soft-circle */}
      <div style={{ padding: '10px 8px', fontSize: 12, color: '#0f2744', textAlign: 'right' }}>
        {di.soft_circle_amount != null ? formatCurrency(di.soft_circle_amount) : '—'}
      </div>

      {/* Confirmed */}
      <div style={{ padding: '10px 8px', fontSize: 12, color: '#0f2744', textAlign: 'right' }}>
        {di.confirmed_amount != null ? formatCurrency(di.confirmed_amount) : '—'}
      </div>

      {/* Shares */}
      <div style={{ padding: '10px 8px', fontSize: 12, color: '#0f2744', textAlign: 'right' }}>
        {di.shares != null ? fmtWhole(di.shares) : '—'}
      </div>

      {/* Fee */}
      <div
        onClick={e => {
          if (feeClickable) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            onFeeClick(di, rect)
          }
        }}
        style={{
          padding: '10px 8px', fontSize: 12, textAlign: 'right',
          cursor: feeClickable ? 'pointer' : 'default',
        }}
      >
        {showFee ? (
          <span style={{
            color: di.fee_overridden ? 'var(--warning)' : '#0f2744',
            textDecoration: feeClickable ? 'underline dotted' : 'none',
          }}>
            {(Number(di.fee_pct) * 100).toFixed(2)}%
            {di.fee_locked_at ? ' 🔒' : di.fee_overridden ? ' ✎' : ''}
          </span>
        ) : (
          <span style={{ color: '#ccc' }}>—</span>
        )}
      </div>

      {/* Status */}
      <div style={{ padding: '10px 8px', display: 'flex', justifyContent: 'center' }}>
        <span className={`pill ${badge.cls}`} style={{ fontSize: 11 }}>{badge.label}</span>
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
        {readOnly && isActionButton ? (
          <span style={{ fontSize: 11, color: '#ccc', fontStyle: 'italic' }} title="Deal is closed — read only">
            {nextStep!.label}
          </span>
        ) : nextStep ? (
          isActionButton ? (
            <button
              onClick={() => onNextStep(di)}
              style={{
                fontSize: 11, padding: '4px 8px',
                background: nextStep.bg,
                border: nextStep.bg === '#fff' ? '0.5px solid #d8d8d0' : 'none',
                borderRadius: 6, color: nextStep.color,
                cursor: 'pointer', whiteSpace: 'nowrap',
                fontWeight: 500,
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
          <span style={{ fontSize: 12, color: '#ccc' }}>—</span>
        )}
      </div>

      {/* Menu */}
      <div style={{ padding: '10px 8px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            onMenuClick(di, rect.left, rect.bottom + 4)
          }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, color: '#888', padding: '0 4px',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#0f2744' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#888' }}
        >
          ⋯
        </button>
      </div>
    </div>
  )
}
