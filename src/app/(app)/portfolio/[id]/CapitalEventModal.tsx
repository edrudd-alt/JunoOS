'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ShareClass } from './tabs/CompanyShareClassesTab'

interface Props {
  companyId: string
  shareClasses: ShareClass[]
  onClose: () => void
}

export default function CapitalEventModal({ companyId, shareClasses, onClose }: Props) {
  const [shareClassId,    setShareClassId]    = useState(shareClasses[0]?.id ?? '')
  const [preferenceRank,  setPreferenceRank]  = useState('')
  const [effectiveFrom,   setEffectiveFrom]   = useState(new Date().toISOString().slice(0, 10))
  const [reason,          setReason]          = useState('')
  const [error,           setError]           = useState('')
  const [isPending,       startTransition]    = useTransition()
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!shareClassId)       { setError('Please select a share class'); return }
    if (!reason.trim())      { setError('Reason is required'); return }
    if (!effectiveFrom)      { setError('Effective date is required'); return }

    const parsedRank = preferenceRank.trim() === '' ? null : parseInt(preferenceRank, 10)
    if (preferenceRank.trim() !== '' && (isNaN(parsedRank!) || parsedRank! < 1)) {
      setError('Preference rank must be a positive integer, or leave blank for ordinary shares')
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error: dbError } = await supabase.from('share_class_ranking_history').insert({
      company_id:      companyId,
      share_class_id:  shareClassId,
      preference_rank: parsedRank,
      effective_from:  effectiveFrom,
      reason:          reason.trim(),
      created_by:      user?.id ?? null,
    })

    if (dbError) { setError(dbError.message); return }

    onClose()
    startTransition(() => router.refresh())
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 440, padding: '24px 28px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Record capital event</h2>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 20px' }}>Record a preference ranking change for a share class.</p>

        <form onSubmit={handleSubmit}>
          {/* Share class */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Share class</label>
            {shareClasses.length === 0 ? (
              <p style={{ fontSize: 12, color: '#a32d2d' }}>No share classes exist yet. Add a share class first.</p>
            ) : (
              <select
                value={shareClassId}
                onChange={e => setShareClassId(e.target.value)}
                required
                style={inputSt}
              >
                {shareClasses.map(sc => (
                  <option key={sc.id} value={sc.id}>{sc.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Preference rank */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>New preference rank</label>
            <input
              type="number"
              min="1"
              step="1"
              value={preferenceRank}
              onChange={e => setPreferenceRank(e.target.value)}
              placeholder="Leave blank for ordinary shares"
              style={inputSt}
            />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              Leave blank for ordinary shares. Lower number = paid first in waterfall. Multiple classes can share the same rank (pari passu).
            </div>
          </div>

          {/* Effective date */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Effective date</label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
              required
              style={inputSt}
            />
          </div>

          {/* Reason */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelSt}>Reason</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
              rows={3}
              placeholder="e.g. Series B round — Series A demoted from rank 1 to rank 2"
              style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={isPending || shareClasses.length === 0}>
              {isPending ? 'Saving…' : 'Record event'}
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
