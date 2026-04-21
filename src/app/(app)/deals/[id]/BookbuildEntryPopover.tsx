'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { checkNeedsWarning, runBookbuildSideEffects } from './bookbuildSideEffects'
import type { BookbuildEntry, Client } from './BookbuildSection'
import type { DealInfo } from './DealDetail'
import type { CompanyInvestmentRow } from './dealDetailTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const BUY_STATUS_OPTIONS = [
  { value: 'interested', label: 'Interested' },
  { value: 'confirmed',  label: 'Confirmed'  },
  { value: 'rejected',   label: 'Rejected'   },
  { value: 'withdrawn',  label: 'Withdrawn'  },
]

const SELL_STATUS_OPTIONS = [
  { value: 'undecided',   label: 'Undecided'   },
  { value: 'selling',     label: 'Selling'     },
  { value: 'not_selling', label: 'Not selling' },
  { value: 'withdrawn',   label: 'Withdrawn'   },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  entry:               BookbuildEntry
  bookbuildId:         string
  clients:             Client[]
  companyInvestments:  CompanyInvestmentRow[]
  dealInfo:            DealInfo
  completionChecklist: Record<string, unknown> | null
  top:                 number
  left:                number
  onClose:             () => void
  onSaved:             () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BookbuildEntryPopover({
  entry, bookbuildId, clients, companyInvestments, dealInfo, completionChecklist,
  top, left, onClose, onSaved,
}: Props) {
  const isSellDeal      = dealInfo.dealType === 'full_exit' || dealInfo.dealType === 'partial_exit'
  const statusOptions   = isSellDeal ? SELL_STATUS_OPTIONS : BUY_STATUS_OPTIONS
  const confirmedStatus = isSellDeal ? 'selling' : 'confirmed'
  const sharePrice      = dealInfo.sharePrice ?? 0
  const hasSharePrice   = sharePrice > 0
  const supabase        = createClient()

  const entryAmount = entry.indicative_amount ?? null
  const entryShares = entry.indicative_shares != null ? Math.round(entry.indicative_shares) : null

  const [localStatus,   setLocalStatus]   = useState(entry.status)
  const [localAmount,   setLocalAmount]   = useState(
    entry.indicative_amount != null
      ? entry.indicative_amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '',
  )
  const [localShares,   setLocalShares]   = useState(
    entry.indicative_shares != null ? String(Math.round(entry.indicative_shares)) : '',
  )
  const [saving,        setSaving]        = useState(false)
  const [sharesError,   setSharesError]   = useState('')
  const [showWarning,   setShowWarning]   = useState(false)
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)

  const maxShares = isSellDeal
    ? companyInvestments
        .filter(inv => inv.client_id === entry.client_id)
        .reduce((sum, inv) => sum + (inv.shares_purchased ?? 0), 0)
    : null

  const popoverRef = useRef<HTMLDivElement>(null)

  const isDirty = (() => {
    const a = localAmount ? parseFloat(localAmount.replace(/,/g, '')) : null
    const s = localShares ? Math.round(parseFloat(localShares)) : null
    return a !== entryAmount || s !== entryShares
  })()

  // Click-outside closes the popover
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  // ── Bidirectional amount/shares calc ─────────────────────────────────────────

  function snapToWholeShares(raw: string): { amount: string; shares: string } {
    if (!raw || !hasSharePrice) return { amount: raw, shares: '' }
    const num = parseFloat(raw.replace(/,/g, ''))
    if (isNaN(num)) return { amount: raw, shares: '' }
    const wholeShares  = Math.round(num / sharePrice)
    const canonicalAmt = wholeShares * sharePrice
    return {
      amount: canonicalAmt.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      shares: String(wholeShares),
    }
  }

  function handleAmountChange(val: string) {
    setLocalAmount(val)
    if (hasSharePrice && val) {
      const num    = parseFloat(val.replace(/,/g, ''))
      const shares = Math.round(num / sharePrice)
      setLocalShares(isNaN(shares) ? '' : String(shares))
      if (maxShares !== null && !isNaN(shares) && shares > maxShares) {
        setSharesError(`This investor holds ${maxShares.toLocaleString()} shares. Cannot sell more than ${maxShares.toLocaleString()} shares.`)
      } else {
        setSharesError('')
      }
    } else {
      setLocalShares('')
      setSharesError('')
    }
  }

  function handleAmountBlur() {
    const { amount, shares } = snapToWholeShares(localAmount)
    setLocalAmount(amount)
    if (shares) setLocalShares(shares)
  }

  function handleAmountFocus() {
    setLocalAmount(localAmount.replace(/,/g, ''))
  }

  function handleSharesChange(val: string) {
    if (!val) { setLocalShares(''); setLocalAmount(''); setSharesError(''); return }
    const wholeShares  = Math.round(parseFloat(val))
    if (isNaN(wholeShares)) { setLocalShares(''); setLocalAmount(''); setSharesError(''); return }
    const canonicalAmt = wholeShares * sharePrice
    setLocalShares(String(wholeShares))
    setLocalAmount(
      hasSharePrice
        ? canonicalAmt.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '',
    )
    if (maxShares !== null && wholeShares > maxShares) {
      setSharesError(`This investor holds ${maxShares.toLocaleString()} shares. Cannot sell more than ${maxShares.toLocaleString()} shares.`)
    } else {
      setSharesError('')
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function saveEntry(statusToSave: string) {
    setSaving(true)
    const amount = localAmount ? parseFloat(localAmount.replace(/,/g, '')) : null
    const shares = localShares ? Math.round(parseFloat(localShares))       : null

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('bookbuild_entries').update({
      indicative_amount: amount,
      indicative_shares: shares,
      status:            statusToSave,
      updated_by:        user?.id ?? null,
      updated_at:        new Date().toISOString(),
    }).eq('id', entry.id)

    await runBookbuildSideEffects({
      status:         statusToSave,
      previousStatus: entry.status,
      confirmedStatus,
      isSellDeal,
      clientId:       entry.client_id,
      amount,
      shares,
      entryAmount,
      entryShares,
      clients,
      dealInfo,
      bookbuildId,
      completionChecklist,
      supabase,
    })

    setSaving(false)
    onSaved()
  }

  async function handleStatusChange(newStatus: string) {
    setLocalStatus(newStatus)
    const amount = localAmount ? parseFloat(localAmount.replace(/,/g, '')) : null
    const shares = localShares ? Math.round(parseFloat(localShares))       : null

    if (checkNeedsWarning({
      previousStatus: entry.status, status: newStatus, confirmedStatus,
      clientId: entry.client_id, amount, entryAmount, shares, entryShares,
      completionChecklist, pendingSave: false,
    })) {
      setPendingStatus(newStatus)
      setShowWarning(true)
      return
    }

    await saveEntry(newStatus)
  }

  async function handleSave() {
    const amount = localAmount ? parseFloat(localAmount.replace(/,/g, '')) : null
    const shares = localShares ? Math.round(parseFloat(localShares))       : null

    if (checkNeedsWarning({
      previousStatus: entry.status, status: localStatus, confirmedStatus,
      clientId: entry.client_id, amount, entryAmount, shares, entryShares,
      completionChecklist, pendingSave: false,
    })) {
      setPendingStatus(localStatus)
      setShowWarning(true)
      return
    }

    await saveEntry(localStatus)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed', top, left, zIndex: 300,
        background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8,
        padding: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 280,
      }}
    >
      {/* Investor name */}
      <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginBottom: 8 }}>
        {entry.client_name}
      </div>

      {/* Status dropdown */}
      <select
        value={localStatus}
        onChange={e => handleStatusChange(e.target.value)}
        disabled={saving}
        style={{
          width: '100%', padding: '6px 8px', fontSize: 12,
          border: '0.5px solid #d0d0c8', borderRadius: 5,
          outline: 'none', background: '#fff', fontFamily: 'inherit',
          marginBottom: 10, boxSizing: 'border-box',
        }}
      >
        {statusOptions.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Amount + Shares */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: isDirty ? 10 : 0 }}>
        <div>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>Amount</div>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11, color: '#888', pointerEvents: 'none',
            }}>£</span>
            <input
              type="text"
              inputMode="decimal"
              value={localAmount}
              onChange={e => handleAmountChange(e.target.value.replace(/,/g, ''))}
              onBlur={handleAmountBlur}
              onFocus={handleAmountFocus}
              disabled={saving}
              placeholder="0.00"
              style={{
                width: '100%', padding: '5px 8px 5px 18px', fontSize: 12,
                border: '0.5px solid #d0d0c8', borderRadius: 4, outline: 'none',
                background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>Shares</div>
          {hasSharePrice ? (
            <input
              type="number" min="0" step="1"
              value={localShares}
              onChange={e => handleSharesChange(e.target.value)}
              disabled={saving}
              placeholder="0"
              onKeyDown={e => { if (e.key === '.') e.preventDefault() }}
              style={{
                width: '100%', padding: '5px 8px', fontSize: 12,
                border: `0.5px solid ${sharesError ? '#a32d2d' : '#d0d0c8'}`, borderRadius: 4, outline: 'none',
                background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          ) : (
            <div style={{
              padding: '5px 8px', fontSize: 11, color: '#aaa',
              border: '0.5px solid #e8e7e0', borderRadius: 4, background: '#f9f9f7',
            }}>
              No price set
            </div>
          )}
          {sharesError && (
            <div style={{ fontSize: 10, color: '#a32d2d', marginTop: 3 }}>{sharesError}</div>
          )}
        </div>
      </div>

      {/* Save button — only when amount/shares is dirty */}
      {isDirty && (
        <button
          onClick={handleSave}
          disabled={saving || !!sharesError}
          className="btn btn-primary"
          style={{ fontSize: 11, padding: '4px 12px', width: '100%' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}

      {/* Warning dialog */}
      {showWarning && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
        }}>
          <div className="card" style={{ width: 360, padding: '24px 28px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f2744', marginBottom: 10 }}>
              Application form already signed
            </div>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.5, marginBottom: 20 }}>
              An application form has already been signed for this investor. To change their status, a new application form will be required.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowWarning(false); setLocalStatus(entry.status); setPendingStatus(null) }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: '#a32d2d', borderColor: '#a32d2d' }}
                onClick={() => { setShowWarning(false); saveEntry(pendingStatus ?? localStatus) }}
              >
                Proceed anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
