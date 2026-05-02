'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { overrideFee, resetFee, getDefaultFeePct } from './bookbuildActions'
import type { DealInvestorFull, ClientFull } from './dealUtils'

interface Props {
  di: DealInvestorFull
  client: ClientFull | null
  investorName: string
  anchorRect: DOMRect
  dealId: string
  userId: string
  onSaved: (message: string) => void
  onClose: () => void
}

export default function FeePopover({
  di, client, investorName, anchorRect, dealId, userId, onSaved, onClose,
}: Props) {
  const supabase = createClient()
  const popRef   = useRef<HTMLDivElement>(null)

  const isLocked  = di.fee_locked_at != null
  const currentPct = di.fee_pct != null ? Number(di.fee_pct) * 100 : 0

  const [newPct,      setNewPct]      = useState(currentPct.toFixed(2))
  const [reason,      setReason]      = useState('')
  const [defaultPct,  setDefaultPct]  = useState<number | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!isLocked && client) {
      getDefaultFeePct(supabase, client).then(pct => setDefaultPct(pct))
    }
    // Click-outside to close
    function handleClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 50)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const parsedNew  = parseFloat(newPct)
  const isDirty    = !isNaN(parsedNew) && Math.abs(parsedNew - currentPct) > 0.001
  const feeDisplay = currentPct.toFixed(2)

  // Position popover below-right of the anchor cell, clamped to viewport
  const top  = Math.min(anchorRect.bottom + 4, window.innerHeight - 320)
  const left = Math.min(anchorRect.right - 300, window.innerWidth - 320)

  async function handleSave() {
    if (isNaN(parsedNew) || parsedNew < 0 || parsedNew > 100) {
      setError('Enter a valid % between 0 and 100.'); return
    }
    if (!isDirty) { onClose(); return }
    if (!userId) { setError('Not authenticated.'); return }
    setSaving(true); setError(null)
    const result = await overrideFee(
      supabase, dealId, di.id,
      Number(di.fee_pct), parsedNew / 100,
      reason.trim() || null, userId,
    )
    setSaving(false)
    if (result.error) { setError(result.error); return }
    onSaved(`Fee overridden to ${parsedNew}%`)
  }

  async function handleReset() {
    if (defaultPct == null || !userId) return
    setSaving(true); setError(null)
    const result = await resetFee(
      supabase, dealId, di.id, defaultPct, Number(di.fee_pct), userId,
    )
    setSaving(false)
    if (result.error) { setError(result.error); return }
    onSaved(`Fee reset to default (${(defaultPct * 100).toFixed(2)}%)`)
  }

  const source = di.fee_overridden ? 'Manual override' : 'Default from client schedule'

  return (
    <div
      ref={popRef}
      style={{
        position: 'fixed', top, left, zIndex: 600,
        background: '#fff', border: '0.5px solid var(--card-border)',
        borderRadius: 8, padding: '16px',
        width: 300, boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', marginBottom: 4 }}>
        Fee for {investorName}{isLocked ? ' 🔒' : ''}
      </div>

      {isLocked ? (
        <>
          <div style={{ fontSize: 12, color: '#0f2744', marginBottom: 8 }}>
            <strong>{feeDisplay}%</strong> (locked)
          </div>
          <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5, marginBottom: 16 }}>
            Fee was locked when the application form was sent
            {di.fee_locked_at ? ` on ${formatDate(di.fee_locked_at)}` : ''}.
            Re-issue the document to change.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 12 }}>
              Close
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
            Current: <strong>{feeDisplay}%</strong> · Source: {source}
            {di.fee_overridden && di.fee_override_reason && (
              <div style={{ marginTop: 4, fontStyle: 'italic' }}>
                Reason: {di.fee_override_reason}
              </div>
            )}
          </div>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Change to (%)
            </div>
            <input
              type="number" value={newPct}
              onChange={e => setNewPct(e.target.value)}
              min="0" max="100" step="0.01"
              style={{
                width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 6,
                border: '1px solid #d0d0c8', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Reason for change (optional)
            </div>
            <input
              type="text" value={reason}
              onChange={e => setReason(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6,
                border: '1px solid #d0d0c8', outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="e.g. Negotiated discount"
            />
          </label>

          {error && <div style={{ fontSize: 11, color: '#a32d2d', marginBottom: 8 }}>{error}</div>}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {di.fee_overridden && defaultPct != null ? (
              <button
                onClick={handleReset} disabled={saving}
                style={{
                  fontSize: 11, color: '#888', background: 'none', border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer', padding: 0, textDecoration: 'underline',
                }}
              >
                Reset to default ({(defaultPct * 100).toFixed(2)}%)
              </button>
            ) : <span />}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 11 }} disabled={saving}>
                Cancel
              </button>
              <button
                onClick={handleSave} disabled={!isDirty || saving}
                style={{
                  fontSize: 11, padding: '5px 12px', borderRadius: 6, border: 'none',
                  background: 'var(--teal)', color: '#fff', fontWeight: 600,
                  cursor: (!isDirty || saving) ? 'not-allowed' : 'pointer',
                  opacity: (!isDirty || saving) ? 0.5 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
