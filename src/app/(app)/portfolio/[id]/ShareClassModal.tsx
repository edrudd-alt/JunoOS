'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ShareClass } from './tabs/CompanyShareClassesTab'

interface Props {
  companyId: string
  shareClass?: ShareClass   // undefined = add mode, defined = edit mode
  onClose: () => void
}

export default function ShareClassModal({ companyId, shareClass, onClose }: Props) {
  const isEdit = !!shareClass

  const [name,              setName]              = useState(shareClass?.name ?? '')
  const [instrumentType,    setInstrumentType]    = useState<'equity' | 'cln' | 'loan_note'>(shareClass?.instrument_type ?? 'equity')
  const [type,              setType]              = useState<'ordinary' | 'preference'>(shareClass?.type ?? 'ordinary')
  const [prefMultiple,      setPrefMultiple]      = useState(shareClass?.preference_multiple?.toString() ?? '')
  const [participating,     setParticipating]     = useState<boolean>(shareClass?.participating ?? false)
  const [dividendRate,      setDividendRate]      = useState(
    shareClass?.dividend_rate != null ? (shareClass.dividend_rate * 100).toFixed(2) : ''
  )
  const [dividendCumul,     setDividendCumul]     = useState<boolean>(shareClass?.dividend_cumulative ?? false)
  const [dividendPayment,   setDividendPayment]   = useState<'paid' | 'rolled_up' | ''>(shareClass?.dividend_payment ?? '')
  const [error,             setError]             = useState('')
  const [isPending,         startTransition]      = useTransition()
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const trimmedName = name.trim()
    if (!trimmedName) { setError('Name is required'); return }

    const payload: Record<string, unknown> = {
      company_id:      companyId,
      name:            trimmedName,
      instrument_type: instrumentType,
      // CLN and loan note classes are always ordinary — preference fields don't apply
      type: instrumentType === 'equity' ? type : 'ordinary',
      // Clear preference fields if type switched to ordinary
      dividend_rate:       type === 'preference' && dividendRate      ? parseFloat(dividendRate) / 100 : null,
      dividend_cumulative: type === 'preference' && dividendRate      ? dividendCumul : null,
      dividend_payment:    type === 'preference' && dividendRate && dividendPayment ? dividendPayment : null,
      preference_multiple: type === 'preference' && prefMultiple      ? parseFloat(prefMultiple) : null,
      participating:       type === 'preference'                      ? participating : null,
    }

    const supabase = createClient()
    const { error: dbError } = isEdit
      ? await supabase.from('company_share_classes').update(payload).eq('id', shareClass!.id)
      : await supabase.from('company_share_classes').insert(payload)

    if (dbError) { setError(dbError.message); return }

    onClose()
    startTransition(() => router.refresh())
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 440, padding: '24px 28px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 18px' }}>
          {isEdit ? 'Edit share class' : 'Add share class'}
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g. B Ordinary, Preference A"
              style={inputSt}
            />
          </div>

          {/* Instrument type */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Instrument type</label>
            <select
              value={instrumentType}
              onChange={e => setInstrumentType(e.target.value as 'equity' | 'cln' | 'loan_note')}
              style={inputSt}
            >
              <option value="equity">Equity</option>
              <option value="cln">CLN — Convertible loan note</option>
              <option value="loan_note">Loan note</option>
            </select>
          </div>

          {/* Type — only shown for equity; CLN/loan note are always ordinary */}
          {instrumentType === 'equity' && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as 'ordinary' | 'preference')}
              style={inputSt}
            >
              <option value="ordinary">Ordinary</option>
              <option value="preference">Preference</option>
            </select>
          </div>
          )}

          {/* Preference-only fields */}
          {instrumentType === 'equity' && type === 'preference' && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={labelSt}>Preference multiple</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={prefMultiple}
                  onChange={e => setPrefMultiple(e.target.value)}
                  placeholder="e.g. 1.0"
                  style={inputSt}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelSt}>Participating</label>
                <select
                  value={participating ? 'yes' : 'no'}
                  onChange={e => setParticipating(e.target.value === 'yes')}
                  style={inputSt}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelSt}>Dividend rate (% p.a., optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={dividendRate}
                  onChange={e => setDividendRate(e.target.value)}
                  placeholder="e.g. 8.00 for 8%"
                  style={inputSt}
                />
              </div>

              {dividendRate && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelSt}>Dividend cumulative</label>
                    <select
                      value={dividendCumul ? 'yes' : 'no'}
                      onChange={e => setDividendCumul(e.target.value === 'yes')}
                      style={inputSt}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={labelSt}>Dividend payment</label>
                    <select
                      value={dividendPayment}
                      onChange={e => setDividendPayment(e.target.value as 'paid' | 'rolled_up')}
                      style={inputSt}
                    >
                      <option value="">— Select —</option>
                      <option value="paid">Paid</option>
                      <option value="rolled_up">Rolled up</option>
                    </select>
                  </div>
                </>
              )}
            </>
          )}

          {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add share class'}
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
