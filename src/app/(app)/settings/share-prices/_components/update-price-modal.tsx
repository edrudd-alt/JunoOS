'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpdateModalData {
  companyId:      string
  companyName:    string
  classId:        string
  className:      string
  instrumentType: 'equity' | 'cln' | 'loan_note'
  currentPrice:   number | null
  hasValuation:   boolean
}

interface Props {
  data:    UpdateModalData
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UpdatePriceModal({ data, onClose }: Props) {
  const { companyId, companyName, classId, className, instrumentType, currentPrice } = data
  const isCln = instrumentType === 'cln' || instrumentType === 'loan_note'

  const defaultPrice = currentPrice != null ? currentPrice.toFixed(4) : (isCln ? '1.0000' : '')

  const [price,       setPrice]       = useState(defaultPrice)
  const [date,        setDate]        = useState(new Date().toISOString().slice(0, 10))
  const [methodology, setMethodology] = useState('')
  const [notes,       setNotes]       = useState('')
  const [error,       setError]       = useState('')
  const [isPending,   startTransition] = useTransition()
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const parsedPrice = parseFloat(price)
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Please enter a valid share price')
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error: dbError } = await supabase.from('valuations').insert({
      company_id:     companyId,
      share_class_id: classId,
      share_price:    parsedPrice,
      valuation_date: date,
      methodology:    methodology.trim() || null,
      source:         'manual',
      notes:          notes.trim() || null,
      updated_by:     user?.id ?? null,
    })

    if (dbError) { setError(dbError.message); return }

    await supabase.from('internal_updates').insert({
      company_id:  companyId,
      update_type: 'valuation',
      description: `Share price updated to £${parsedPrice.toFixed(4)} for ${companyName} ${className}`,
      created_by:  user?.id ?? null,
    })

    onClose()
    startTransition(() => router.refresh())
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 420, padding: '24px 28px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Update share price</h2>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
          {companyName} · {className}
        </p>

        {/* CLN context label */}
        {isCln && (
          <div style={{
            background: '#f0f4fa', border: '0.5px solid #c5d5ee', borderRadius: 5,
            padding: '8px 12px', fontSize: 12, color: '#1a3a6a', marginBottom: 16,
          }}>
            <strong>{instrumentType === 'cln' ? 'CLN holding' : 'Loan note'}</strong>
            {' · defaults to £1.00 (principal). Enter a write-down or write-up value below.'}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Share price (£)</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={price}
              onChange={e => setPrice(e.target.value)}
              required
              placeholder="0.0000"
              style={inputSt}
            />
            {data.currentPrice != null && data.hasValuation && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
                Current: £{data.currentPrice.toFixed(4)}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Effective date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              style={inputSt}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>
              {isCln ? 'Reason for write-down/up (optional)' : 'Methodology (optional)'}
            </label>
            <input
              type="text"
              value={methodology}
              onChange={e => setMethodology(e.target.value)}
              placeholder={isCln
                ? 'e.g. Company in administration; recoverable value 60p'
                : 'e.g. Series B, Board approved, 409A valuation'}
              style={inputSt}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelSt}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 5,
}
const inputSt: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
