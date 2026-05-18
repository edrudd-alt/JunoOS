'use client'

import { useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/types'
import type { FeeScheduleRecord } from './ClientRecord'

interface Props {
  lead: Client
  feeSchedules: FeeScheduleRecord[]
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  fullName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  postcode: string
  taxStatus: string
  feeScheduleId: string
}

function buildInitial(lead: Client): FormState {
  return {
    fullName:      lead.full_name,
    email:         lead.email ?? '',
    phone:         lead.phone ?? '',
    address1:      lead.address_line1 ?? '',
    address2:      lead.address_line2 ?? '',
    city:          lead.city ?? '',
    postcode:      lead.postcode ?? '',
    taxStatus:     lead.tax_status,
    feeScheduleId: lead.fee_schedule_id ?? '',
  }
}

export default function EditClientModal({ lead, feeSchedules, onClose, onSaved }: Props) {
  const [form, setForm]     = useState<FormState>(() => buildInitial(lead))
  const [isSaving, setSaving] = useState(false)
  const [saveError, setError] = useState<string | null>(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (isSaving) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase
      .from('clients')
      .update({
        full_name:      form.fullName.trim(),
        email:          form.email.trim() || null,
        phone:          form.phone.trim() || null,
        address_line1:  form.address1.trim() || null,
        address_line2:  form.address2.trim() || null,
        city:           form.city.trim() || null,
        postcode:       form.postcode.trim() || null,
        tax_status:     form.taxStatus,
        fee_schedule_id: form.feeScheduleId || null,
      })
      .eq('id', lead.id)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
  }

  function handleCancel() {
    if (isSaving) return
    onClose()
  }

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 39, 68, 0.45)',
        zIndex: 1000,
      }} />
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1001, padding: 20,
      }}>
        <div style={{
          background: '#fff', borderRadius: 12,
          border: '0.5px solid #e8e7e0',
          width: '100%', maxWidth: 560,
          maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 24px 16px',
            borderBottom: '0.5px solid #e8e7e0',
            position: 'sticky', top: 0, background: '#fff', zIndex: 1,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744' }}>Edit client details</div>
            <button onClick={handleCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', lineHeight: 1, padding: '0 4px' }} aria-label="Close">×</button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Field label="Full name">
              <input type="text" value={form.fullName} onChange={e => set('fullName', e.target.value)} style={inputStyle} />
            </Field>

            <Field label="Investor reference">
              <div style={{ ...inputStyle, background: '#f5f5f2', color: '#aaa', cursor: 'not-allowed' }}>
                {lead.investor_reference ?? '—'}
              </div>
              <SubLabel>Used in URLs and document file names — contact admin to change.</SubLabel>
            </Field>

            <Field label="Date joined">
              <div style={{ ...inputStyle, background: '#f5f5f2', color: '#aaa', cursor: 'not-allowed' }}>
                {lead.date_joined
                  ? new Date(lead.date_joined).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—'}
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Email">
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} style={inputStyle} />
              </Field>
            </div>

            <Field label="Address line 1">
              <input type="text" value={form.address1} onChange={e => set('address1', e.target.value)} style={inputStyle} />
            </Field>

            <Field label="Address line 2">
              <input type="text" value={form.address2} onChange={e => set('address2', e.target.value)} style={inputStyle} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="City">
                <input type="text" value={form.city} onChange={e => set('city', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Postcode">
                <input type="text" value={form.postcode} onChange={e => set('postcode', e.target.value)} style={inputStyle} />
              </Field>
            </div>

            <Field label="Tax status">
              <select value={form.taxStatus} onChange={e => set('taxStatus', e.target.value)} style={inputStyle}>
                <option value="eis">EIS qualifying</option>
                <option value="seis">SEIS qualifying</option>
                <option value="both">EIS &amp; SEIS qualifying</option>
                <option value="neither">Non-EIS</option>
              </select>
            </Field>

            <Field label="Fee schedule">
              <select value={form.feeScheduleId} onChange={e => set('feeScheduleId', e.target.value)} style={inputStyle}>
                <option value="">— No fee schedule (use default fee rate)</option>
                {feeSchedules.map(fs => (
                  <option key={fs.id} value={fs.id}>{fs.name}</option>
                ))}
              </select>
              <SubLabel>Changing this updates clients.fee_schedule_id only; the legacy default fee rate column is unchanged.</SubLabel>
            </Field>

            {saveError && (
              <div style={{
                padding: '10px 14px', background: '#fff0f0',
                border: '0.5px solid #f0c0c0', borderRadius: 6,
                fontSize: 12, color: '#a32d2d',
              }}>
                {saveError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            padding: '14px 24px',
            borderTop: '0.5px solid #e8e7e0',
            position: 'sticky', bottom: 0, background: '#fff',
          }}>
            <button onClick={handleCancel} className="btn btn-secondary" style={{ fontSize: 13 }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn btn-primary"
              style={{ fontSize: 13, opacity: isSaving ? 0.6 : 1 }}
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SubLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{children}</div>
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
  background: '#fff', color: '#0f2744', fontFamily: 'inherit',
}
