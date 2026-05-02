'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { confirmInvestment, getDefaultFeePct } from './bookbuildActions'
import type { DealInvestorFull, ClientFull } from './dealUtils'

interface Props {
  di: DealInvestorFull
  client: ClientFull | null
  sharePrice: number | null
  dealId: string
  userId: string
  onConfirmed: (investorName: string) => void
  onClose: () => void
}

export default function ConfirmInvestmentModal({
  di, client, sharePrice, dealId, userId, onConfirmed, onClose,
}: Props) {
  const supabase = createClient()
  const [amount, setAmount]   = useState(String(di.soft_circle_amount ?? ''))
  const [feePct, setFeePct]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [feeLoading, setFeeLoading] = useState(true)

  const investorName = client?.full_name ?? 'Unknown investor'

  useEffect(() => {
    if (!client) { setFeePct('5.00'); setFeeLoading(false); return }
    getDefaultFeePct(supabase, client).then(pct => {
      setFeePct((pct * 100).toFixed(2))
      setFeeLoading(false)
    })
  }, [])

  async function handleConfirm() {
    const parsedAmount = parseFloat(amount.replace(/,/g, ''))
    const parsedFee    = parseFloat(feePct)
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('Enter a valid investment amount.'); return }
    if (isNaN(parsedFee) || parsedFee < 0 || parsedFee > 100) { setError('Enter a valid fee % (0–100).'); return }
    if (!userId) { setError('Not authenticated.'); return }

    setSaving(true); setError(null)
    const result = await confirmInvestment(
      supabase, dealId, di.id,
      parsedAmount, parsedFee / 100,
      sharePrice, userId,
    )
    setSaving(false)
    if (result.error) { setError(result.error); return }
    onConfirmed(investorName)
  }

  const parsedAmount  = parseFloat(amount.replace(/,/g, ''))
  const parsedFee     = parseFloat(feePct)
  const estShares     = sharePrice && !isNaN(parsedAmount) && parsedAmount > 0 && sharePrice > 0
    ? parseFloat((parsedAmount / sharePrice).toFixed(4))
    : null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: '24px',
        width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', marginBottom: 6 }}>
          Confirm investment
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
          {investorName}
        </div>

        {/* Amount */}
        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
            Confirmed amount (£)
          </div>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            min="0"
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6,
              border: '1px solid #d0d0c8', outline: 'none', boxSizing: 'border-box',
            }}
            placeholder="0"
          />
          {estShares != null && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              = {estShares.toLocaleString('en-GB')} shares at £{sharePrice?.toFixed(2)}
            </div>
          )}
        </label>

        {/* Fee */}
        <label style={{ display: 'block', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
            Fee (%)
          </div>
          <input
            type="number"
            value={feeLoading ? '' : feePct}
            onChange={e => setFeePct(e.target.value)}
            min="0" max="100" step="0.01"
            disabled={feeLoading}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6,
              border: '1px solid #d0d0c8', outline: 'none', boxSizing: 'border-box',
              opacity: feeLoading ? 0.5 : 1,
            }}
            placeholder={feeLoading ? 'Loading…' : '5.00'}
          />
          {!feeLoading && !isNaN(parsedFee) && !isNaN(parsedAmount) && parsedAmount > 0 && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              = {formatCurrency(parsedAmount * parsedFee / 100)} fee
            </div>
          )}
        </label>

        {error && (
          <div style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 12 }} disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || feeLoading}
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none',
              background: 'var(--teal)', color: '#fff', fontWeight: 600,
              cursor: saving || feeLoading ? 'not-allowed' : 'pointer',
              opacity: saving || feeLoading ? 0.6 : 1,
            }}
          >
            {saving ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bulk confirm modal ─────────────────────────────────────────────────────────

interface BulkRow {
  di: DealInvestorFull
  client: ClientFull | null
  amount: string
}

interface BulkConfirmModalProps {
  rows: BulkRow[]
  sharePrice: number | null
  dealId: string
  userId: string
  onConfirmed: (count: number) => void
  onClose: () => void
}

export function BulkConfirmModal({
  rows: initialRows, sharePrice, dealId, userId, onConfirmed, onClose,
}: BulkConfirmModalProps) {
  const supabase    = createClient()
  const [rows, setRows] = useState<BulkRow[]>(initialRows)
  const [setAllValue, setSetAllValue] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  function applySetAll() {
    if (!setAllValue) return
    setRows(r => r.map(row => ({ ...row, amount: setAllValue })))
  }

  async function handleConfirm() {
    if (!userId) { setError('Not authenticated.'); return }
    const parsed = rows.map(r => ({
      di: r.di,
      client: r.client,
      amount: parseFloat(r.amount.replace(/,/g, '')),
    }))
    if (parsed.some(r => isNaN(r.amount) || r.amount <= 0)) {
      setError('All amounts must be valid positive numbers.'); return
    }
    setSaving(true); setError(null)

    for (const row of parsed) {
      const feePct = row.client
        ? await getDefaultFeePct(supabase, row.client)
        : 0.05
      const result = await confirmInvestment(
        supabase, dealId, row.di.id, row.amount, feePct, sharePrice, userId,
      )
      if (result.error) { setError(result.error); setSaving(false); return }
    }
    setSaving(false)
    onConfirmed(rows.length)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: '24px',
        width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', marginBottom: 16 }}>
          Confirm investment — {rows.length} investors
        </div>

        {/* Set all */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end' }}>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Set all amounts to (£)
            </div>
            <input
              type="number" value={setAllValue}
              onChange={e => setSetAllValue(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #d0d0c8', boxSizing: 'border-box' }}
              placeholder="Optional"
            />
          </label>
          <button onClick={applySetAll} className="btn btn-secondary" style={{ fontSize: 12, height: 33 }}>
            Apply
          </button>
        </div>

        {/* Per-row amounts */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          {rows.map((row, i) => (
            <div key={row.di.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ flex: 1, fontSize: 12, color: '#0f2744', fontWeight: 500 }}>
                {row.client?.full_name ?? 'Unknown'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#888' }}>£</span>
                <input
                  type="number" value={row.amount}
                  onChange={e => setRows(r => r.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                  style={{ width: 120, padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d0d0c8' }}
                  placeholder="Amount"
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
          Fees will be pre-filled from each investor's default rate.
        </div>

        {error && <div style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 12 }} disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleConfirm} disabled={saving}
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none',
              background: 'var(--teal)', color: '#fff', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Confirming…' : `Confirm ${rows.length} investments`}
          </button>
        </div>
      </div>
    </div>
  )
}
