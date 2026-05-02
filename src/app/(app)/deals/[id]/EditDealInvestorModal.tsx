'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { editDealInvestor } from './bookbuildActions'
import type { DealInvestorFull, ClientFull, NomineeRow } from './dealUtils'

interface Props {
  di: DealInvestorFull
  client: ClientFull | null
  allClients: ClientFull[]
  nominees: NomineeRow[]
  dealId: string
  userId: string
  onSaved: (msg: string) => void
  onClose: () => void
}

export default function EditDealInvestorModal({
  di, client, allClients, nominees, dealId, userId, onSaved, onClose,
}: Props) {
  const supabase = createClient()

  const isConfirmedOrLater = ['confirmed', 'app_form_sent', 'signed', 'paid', 'complete'].includes(di.lifecycle_status)
  const isLocked           = di.fee_locked_at != null

  const [softAmount,  setSoftAmount]  = useState(String(di.soft_circle_amount ?? ''))
  const [confAmount,  setConfAmount]  = useState(String(di.confirmed_amount ?? ''))
  const [feePct,      setFeePct]      = useState(di.fee_pct != null ? (Number(di.fee_pct) * 100).toFixed(2) : '')
  const [poaHeld,     setPoaHeld]     = useState(di.poa_held)
  const [vehicleId,   setVehicleId]   = useState<string | null>(di.investing_vehicle_id)
  const [nomineeId,   setNomineeId]   = useState<string | null>(di.nominee_id)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const vehicles = allClients.filter(c => c.entity_type && c.entity_type !== 'individual' && c.lead_investor_id === di.client_id)

  async function handleSave() {
    if (!userId) { setError('Not authenticated.'); return }
    setSaving(true); setError(null)

    const updates: Record<string, unknown> = {
      poa_held:             poaHeld,
      investing_vehicle_id: vehicleId,
      nominee_id:           nomineeId,
    }

    const parsedSoft = parseFloat(softAmount.replace(/,/g, ''))
    if (!isNaN(parsedSoft)) updates.soft_circle_amount = parsedSoft

    if (isConfirmedOrLater) {
      const parsedConf = parseFloat(confAmount.replace(/,/g, ''))
      if (!isNaN(parsedConf)) updates.confirmed_amount = parsedConf
    }

    if (isConfirmedOrLater && !isLocked) {
      const parsedFee = parseFloat(feePct)
      if (!isNaN(parsedFee) && parsedFee >= 0 && parsedFee <= 100) {
        updates.fee_pct = parsedFee / 100
      }
    }

    const oldValues: Record<string, unknown> = {
      soft_circle_amount:   di.soft_circle_amount,
      confirmed_amount:     di.confirmed_amount,
      fee_pct:              di.fee_pct,
      poa_held:             di.poa_held,
      investing_vehicle_id: di.investing_vehicle_id,
      nominee_id:           di.nominee_id,
    }

    const result = await editDealInvestor(supabase, dealId, di.id, updates, oldValues, userId)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    onSaved(`Details updated for ${client?.full_name ?? 'investor'}`)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: '24px',
        width: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', marginBottom: 6 }}>
          Edit deal details
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
          {client?.full_name ?? 'Unknown investor'}
        </div>

        {/* Soft-circle amount */}
        <label style={{ display: 'block', marginBottom: 14 }}>
          <FieldLabel>Soft-circle amount (£)</FieldLabel>
          <input
            type="number" value={softAmount}
            onChange={e => setSoftAmount(e.target.value)}
            style={inputStyle}
            placeholder="0"
          />
        </label>

        {/* Confirmed amount */}
        {isConfirmedOrLater && (
          <label style={{ display: 'block', marginBottom: 14 }}>
            <FieldLabel>Confirmed amount (£)</FieldLabel>
            <input
              type="number" value={confAmount}
              onChange={e => setConfAmount(e.target.value)}
              style={inputStyle}
              placeholder="0"
            />
          </label>
        )}

        {/* Fee */}
        {isConfirmedOrLater && (
          <label style={{ display: 'block', marginBottom: 14 }}>
            <FieldLabel>{isLocked ? 'Fee (%) — locked' : 'Fee (%)'}</FieldLabel>
            <input
              type="number" value={feePct} disabled={isLocked}
              onChange={e => setFeePct(e.target.value)}
              min="0" max="100" step="0.01"
              style={{ ...inputStyle, opacity: isLocked ? 0.5 : 1 }}
              placeholder="0.00"
            />
            {isLocked && (
              <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>
                🔒 Fee locked — re-issue the application form to change.
              </div>
            )}
          </label>
        )}

        {/* POA held */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={poaHeld} onChange={e => setPoaHeld(e.target.checked)}
            style={{ accentColor: 'var(--teal)', width: 14, height: 14 }} />
          <span style={{ fontSize: 12, color: '#0f2744' }}>POA held</span>
        </label>

        {/* Vehicle */}
        <label style={{ display: 'block', marginBottom: 14 }}>
          <FieldLabel>Vehicle</FieldLabel>
          <select
            value={vehicleId ?? ''}
            onChange={e => setVehicleId(e.target.value || null)}
            style={{ ...inputStyle, background: '#fff' }}
          >
            <option value="">Own name</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.full_name}</option>
            ))}
          </select>
        </label>

        {/* Location */}
        <label style={{ display: 'block', marginBottom: 20 }}>
          <FieldLabel>Location (nominee)</FieldLabel>
          <select
            value={nomineeId ?? ''}
            onChange={e => setNomineeId(e.target.value || null)}
            style={{ ...inputStyle, background: '#fff' }}
          >
            <option value="">Direct</option>
            {nominees.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </label>

        {error && <div style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 12 }} disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleSave} disabled={saving}
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none',
              background: 'var(--teal)', color: '#fff', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color: '#888',
      textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5,
    }}>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 6,
  border: '1px solid #d0d0c8', outline: 'none', boxSizing: 'border-box',
}
