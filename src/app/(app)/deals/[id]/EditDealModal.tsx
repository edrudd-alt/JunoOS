'use client'

import { useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShareClassOption { id: string; name: string }

interface DealProps {
  id: string
  status: string
  title: string | null
  share_class: string | null
  share_class_id: string | null
  share_price: number | null
  eis_qualifying: string | null
  notes: string | null
  company_id: string | null
}

interface Props {
  deal: DealProps
  bookbuild: { id: string; target_raise: number | null } | null
  shareClasses: ShareClassOption[]
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  title: string
  shareClassId: string
  shareClassText: string
  useCustomShareClass: boolean
  sharePrice: string
  targetRaise: string
  eisQualifying: 'yes' | 'no' | 'tbc'
  notes: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInitialState(
  deal: DealProps,
  bookbuild: { target_raise: number | null } | null,
  shareClasses: ShareClassOption[],
): FormState {
  const hasDropdown = shareClasses.length > 0
  let shareClassId = ''
  let shareClassText = ''
  let useCustomShareClass = false

  if (deal.share_class_id) {
    const match = shareClasses.find(sc => sc.id === deal.share_class_id)
    if (match) {
      shareClassId = deal.share_class_id
    } else {
      // ID set but no longer in the list — fall back to custom text
      shareClassText = deal.share_class ?? ''
      useCustomShareClass = hasDropdown
    }
  } else if (deal.share_class) {
    const match = hasDropdown ? shareClasses.find(sc => sc.name === deal.share_class) : null
    if (match) {
      shareClassId = match.id
    } else {
      shareClassText = deal.share_class
      useCustomShareClass = hasDropdown
    }
  }

  return {
    title:               deal.title ?? '',
    shareClassId,
    shareClassText,
    useCustomShareClass,
    sharePrice:          deal.share_price != null ? String(deal.share_price) : '',
    targetRaise:         bookbuild?.target_raise != null ? String(bookbuild.target_raise) : '',
    eisQualifying:       (deal.eis_qualifying as 'yes' | 'no' | 'tbc') ?? 'tbc',
    notes:               deal.notes ?? '',
  }
}

function statesEqual(a: FormState, b: FormState): boolean {
  return (
    a.title              === b.title &&
    a.shareClassId       === b.shareClassId &&
    a.shareClassText     === b.shareClassText &&
    a.useCustomShareClass === b.useCustomShareClass &&
    a.sharePrice         === b.sharePrice &&
    a.targetRaise        === b.targetRaise &&
    a.eisQualifying      === b.eisQualifying &&
    a.notes              === b.notes
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EditDealModal({ deal, bookbuild, shareClasses, onClose, onSaved }: Props) {
  const [initial]  = useState<FormState>(() => buildInitialState(deal, bookbuild, shareClasses))
  const [form, setForm] = useState<FormState>(initial)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isDirty    = !statesEqual(form, initial)
  const isComplete = deal.status === 'complete'
  const hasDropdown = shareClasses.length > 0

  // ── Validation ──────────────────────────────────────────────────────────────
  const activeShareClass = (form.useCustomShareClass || !hasDropdown)
    ? form.shareClassText.trim()
    : form.shareClassId

  const sharePriceNum  = parseFloat(form.sharePrice)
  const targetRaiseNum = form.targetRaise ? parseFloat(form.targetRaise) : null

  const fieldErrors: Record<string, string> = {}
  if (!activeShareClass)
    fieldErrors.shareClass = 'Share class is required'
  if (!form.sharePrice || isNaN(sharePriceNum) || sharePriceNum <= 0)
    fieldErrors.sharePrice = 'Share price must be greater than 0'
  if (!form.targetRaise)
    fieldErrors.targetRaise = 'Target raise is required'
  else if (targetRaiseNum == null || isNaN(targetRaiseNum) || targetRaiseNum <= 0)
    fieldErrors.targetRaise = 'Target raise must be greater than 0'
  if (form.title.length > 200)
    fieldErrors.title = 'Title must be 200 characters or fewer'
  if (form.notes.length > 2000)
    fieldErrors.notes = 'Notes must be 2000 characters or fewer'

  const isValid = Object.keys(fieldErrors).length === 0

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleCancel() {
    if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return
    onClose()
  }

  async function handleSave() {
    if (!isDirty || !isValid || isSaving) return
    setIsSaving(true)
    setSaveError(null)

    const supabase = createClient()

    // Resolve share class values
    const useCustom      = form.useCustomShareClass || !hasDropdown
    const saveShareClassId  = useCustom ? null : (form.shareClassId || null)
    const saveShareClass    = useCustom
      ? (form.shareClassText.trim() || null)
      : (shareClasses.find(sc => sc.id === form.shareClassId)?.name ?? null)

    // Build deals update — share_price excluded when deal is complete
    const dealUpdate: Record<string, unknown> = {
      title:          form.title.trim() || null,
      share_class_id: saveShareClassId,
      share_class:    saveShareClass,
      eis_qualifying: form.eisQualifying,
      notes:          form.notes.trim() || null,
    }
    if (!isComplete) {
      dealUpdate.share_price = sharePriceNum
    }

    const { error: dealError } = await supabase
      .from('deals')
      .update(dealUpdate)
      .eq('id', deal.id)

    if (dealError) {
      setSaveError(dealError.message)
      setIsSaving(false)
      return
    }

    // Update or create bookbuild target_raise
    const newTargetRaise = targetRaiseNum ?? null
    if (bookbuild) {
      const { error: bbError } = await supabase
        .from('bookbuilds')
        .update({ target_raise: newTargetRaise })
        .eq('id', bookbuild.id)
      if (bbError) {
        setSaveError(bbError.message)
        setIsSaving(false)
        return
      }
    } else if (newTargetRaise !== null && deal.company_id) {
      const { error: bbError } = await supabase
        .from('bookbuilds')
        .insert({ deal_id: deal.id, company_id: deal.company_id, target_raise: newTargetRaise, status: 'open' })
      if (bbError) {
        setSaveError(bbError.message)
        setIsSaving(false)
        return
      }
    }

    setIsSaving(false)
    onSaved()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop — intentionally does NOT close modal on click */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 39, 68, 0.45)',
        zIndex: 1000,
      }} />

      {/* Modal container */}
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1001, padding: 20,
      }}>
        <div style={{
          background: '#fff', borderRadius: 12,
          border: '0.5px solid var(--card-border)',
          width: '100%', maxWidth: 560,
          maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 24px 16px',
            borderBottom: '0.5px solid var(--card-border)',
            position: 'sticky', top: 0, background: '#fff', zIndex: 1,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744' }}>Edit deal details</div>
            <button
              onClick={handleCancel}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', lineHeight: 1, padding: '0 4px' }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* 1. Title */}
            <Field label="Title" error={fieldErrors.title}>
              <input
                type="text"
                value={form.title}
                maxLength={200}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Cyclr Q2 Top-Up"
                style={inputStyle}
              />
              <SubLabel>Internal use only — not shown on documents to investors.</SubLabel>
            </Field>

            {/* 2. Share class */}
            <Field label="Share class" error={fieldErrors.shareClass}>
              {hasDropdown ? (
                <>
                  <select
                    value={form.useCustomShareClass ? '__custom__' : form.shareClassId}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setForm(f => ({ ...f, useCustomShareClass: true, shareClassId: '' }))
                      } else {
                        setForm(f => ({ ...f, useCustomShareClass: false, shareClassId: e.target.value, shareClassText: '' }))
                      }
                    }}
                    style={inputStyle}
                  >
                    <option value="">Select share class…</option>
                    {shareClasses.map(sc => (
                      <option key={sc.id} value={sc.id}>{sc.name}</option>
                    ))}
                    <option value="__custom__">Use custom (text)…</option>
                  </select>
                  {form.useCustomShareClass && (
                    <input
                      type="text"
                      value={form.shareClassText}
                      onChange={e => setForm(f => ({ ...f, shareClassText: e.target.value }))}
                      placeholder="e.g. Ordinary A"
                      style={{ ...inputStyle, marginTop: 8 }}
                    />
                  )}
                </>
              ) : (
                <input
                  type="text"
                  value={form.shareClassText}
                  onChange={e => setForm(f => ({ ...f, shareClassText: e.target.value }))}
                  placeholder="e.g. Ordinary A"
                  style={inputStyle}
                />
              )}
            </Field>

            {/* 3. Share price */}
            <Field
              label={isComplete ? 'Share price 🔒' : 'Share price'}
              error={isComplete ? undefined : fieldErrors.sharePrice}
            >
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 13, color: isComplete ? '#bbb' : '#555', pointerEvents: 'none',
                }}>
                  £
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.sharePrice}
                  disabled={isComplete}
                  onChange={e => setForm(f => ({ ...f, sharePrice: e.target.value }))}
                  style={{ ...inputStyle, paddingLeft: 22, opacity: isComplete ? 0.6 : 1, cursor: isComplete ? 'not-allowed' : undefined }}
                />
              </div>
              {isComplete && (
                <SubLabel>
                  Share price locked: deal is complete and price is part of historical investment records. Contact admin to override if needed.
                </SubLabel>
              )}
            </Field>

            {/* 4. Target raise */}
            <Field label="Target raise" error={fieldErrors.targetRaise}>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 13, color: '#555', pointerEvents: 'none',
                }}>
                  £
                </span>
                <input
                  type="number"
                  min="1"
                  step="1000"
                  value={form.targetRaise}
                  onChange={e => setForm(f => ({ ...f, targetRaise: e.target.value }))}
                  placeholder="e.g. 500000"
                  style={{ ...inputStyle, paddingLeft: 22 }}
                />
              </div>
            </Field>

            {/* 5. EIS qualifying */}
            <Field label="EIS qualifying">
              <div style={{ display: 'flex' }}>
                {(['yes', 'no', 'tbc'] as const).map((opt, i) => {
                  const label  = opt === 'yes' ? 'Yes' : opt === 'no' ? 'No' : 'TBC'
                  const active = form.eisQualifying === opt
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, eisQualifying: opt }))}
                      style={{
                        flex: 1, padding: '7px 0', fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        background: active ? '#0f2744' : '#fff',
                        color: active ? '#fff' : '#555',
                        border: '0.5px solid #d0d0c8',
                        borderLeft: i === 0 ? '0.5px solid #d0d0c8' : 'none',
                        borderRadius: i === 0 ? '5px 0 0 5px' : i === 2 ? '0 5px 5px 0' : 0,
                        cursor: 'pointer',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </Field>

            {/* 6. Notes */}
            <Field label="Notes" error={fieldErrors.notes}>
              <textarea
                value={form.notes}
                maxLength={2000}
                rows={4}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Bridge round ahead of Series B. Cyclr have confirmed 30-day exclusivity."
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
              <SubLabel>Operational context for the team.</SubLabel>
            </Field>

            {/* Save error */}
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
            borderTop: '0.5px solid var(--card-border)',
            position: 'sticky', bottom: 0, background: '#fff',
          }}>
            <button onClick={handleCancel} className="btn btn-secondary" style={{ fontSize: 13 }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty || !isValid || isSaving}
              className="btn btn-primary"
              style={{ fontSize: 13, opacity: (!isDirty || !isValid || isSaving) ? 0.5 : 1 }}
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children, error }: { label: ReactNode; children: ReactNode; error?: string }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 600, color: '#555',
        marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        {label}
      </label>
      {children}
      {error && (
        <div style={{ fontSize: 11, color: '#a32d2d', marginTop: 4 }}>{error}</div>
      )}
    </div>
  )
}

function SubLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{children}</div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  border: '0.5px solid #d0d0c8',
  borderRadius: 5,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#0f2744',
  fontFamily: 'inherit',
}
