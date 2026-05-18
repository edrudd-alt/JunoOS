'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/types'

interface Props {
  lead: Client
  allEntities: Client[]   // [lead, ...linkedEntities] in display order
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  selectedIds: string[]
  deliveryMethod: string
  frequency: string
}

export default function EditReportingDefaultsModal({ lead, allEntities, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>({
    selectedIds:    lead.reporting_entity_defaults ?? [],
    deliveryMethod: lead.report_delivery_method ?? 'email',
    frequency:      lead.report_delivery_frequency ?? 'quarterly',
  })
  const [isSaving, setSaving] = useState(false)
  const [saveError, setError] = useState<string | null>(null)

  function toggleEntity(id: string) {
    setForm(f => ({
      ...f,
      selectedIds: f.selectedIds.includes(id)
        ? f.selectedIds.filter(x => x !== id)
        : [...f.selectedIds, id],
    }))
  }

  async function handleSave() {
    if (isSaving) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase
      .from('clients')
      .update({
        reporting_entity_defaults: form.selectedIds,
        report_delivery_method:    form.deliveryMethod,
        report_delivery_frequency: form.frequency,
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

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 39, 68, 0.45)', zIndex: 1000 }} />
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1001, padding: 20,
      }}>
        <div style={{
          background: '#fff', borderRadius: 12, border: '0.5px solid #e8e7e0',
          width: '100%', maxWidth: 480,
          maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 24px 16px', borderBottom: '0.5px solid #e8e7e0',
            position: 'sticky', top: 0, background: '#fff', zIndex: 1,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744' }}>Edit reporting defaults</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', lineHeight: 1, padding: '0 4px' }} aria-label="Close">×</button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Section A — Entities */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                Entities included
              </div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>
                Entities included in routine portfolio statements:
              </div>
              {allEntities.map(entity => {
                const checked = form.selectedIds.includes(entity.id)
                const locationLabel = entity.holding_location === 'nominee' ? 'Nominee' : 'Direct'
                return (
                  <div
                    key={entity.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 8px', borderRadius: 5, cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafaf8')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => toggleEntity(entity.id)}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: '#333', flex: 1 }}>
                      <span style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        border: checked ? '1px solid #0f2744' : '1px solid #c8c7c0',
                        background: checked ? '#0f2744' : '#fff',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 9,
                      }}>
                        {checked ? '✓' : ''}
                      </span>
                      {entity.full_name}
                    </label>
                    <span style={{ fontSize: 11, color: '#aaa' }}>{locationLabel}</span>
                  </div>
                )
              })}
            </div>

            {/* Section B — Delivery method */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                Delivery method
              </div>
              {[
                { value: 'email', label: 'Email' },
                { value: 'download_only', label: 'Download only' },
              ].map(opt => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 12, color: '#333' }}>
                  <input
                    type="radio"
                    name="delivery_method"
                    value={opt.value}
                    checked={form.deliveryMethod === opt.value}
                    onChange={() => setForm(f => ({ ...f, deliveryMethod: opt.value }))}
                    style={{ margin: 0 }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {/* Section C — Frequency */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                Delivery frequency
              </div>
              {[
                { value: 'quarterly',   label: 'Quarterly' },
                { value: 'half_yearly', label: 'Half-yearly' },
                { value: 'annual',      label: 'Annual' },
                { value: 'manual',      label: 'Manual' },
              ].map(opt => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 12, color: '#333' }}>
                  <input
                    type="radio"
                    name="frequency"
                    value={opt.value}
                    checked={form.frequency === opt.value}
                    onChange={() => setForm(f => ({ ...f, frequency: opt.value }))}
                    style={{ margin: 0 }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

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
            padding: '14px 24px', borderTop: '0.5px solid #e8e7e0',
            position: 'sticky', bottom: 0, background: '#fff',
          }}>
            <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
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
