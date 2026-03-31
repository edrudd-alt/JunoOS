'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  companyId: string
  companyName: string
  currentPrice: number | null
  onClose: () => void
}

export default function UpdateValuationModal({ companyId, companyName, currentPrice, onClose }: Props) {
  const [price, setPrice] = useState(currentPrice?.toString() ?? '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const parsedPrice = parseFloat(price)
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError('Please enter a valid share price')
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error: dbError } = await supabase.from('valuations').insert({
      company_id: companyId,
      share_price: parsedPrice,
      valuation_date: date,
      notes: notes.trim() || null,
      updated_by: user?.id ?? null,
    })

    if (dbError) {
      setError(dbError.message)
      return
    }

    // Log internal update
    await supabase.from('internal_updates').insert({
      company_id: companyId,
      update_type: 'valuation',
      description: `Share price updated to £${parsedPrice.toFixed(4)}`,
      created_by: user?.id ?? null,
    })

    onClose()
    startTransition(() => router.refresh())
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 400, padding: '24px 28px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Update valuation</h2>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 20px' }}>{companyName}</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>New share price (£)</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={price}
              onChange={e => setPrice(e.target.value)}
              required
              placeholder={currentPrice ? currentPrice.toFixed(4) : '0.0000'}
              style={inputStyle}
            />
            {currentPrice && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                Current: £{currentPrice.toFixed(4)}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Valuation date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Based on Series B round at £1.20/share"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save valuation'}
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

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 5,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
