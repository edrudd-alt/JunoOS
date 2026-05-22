'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_LABELS, SENDABLE_DOCUMENT_TYPES } from '@/lib/documentTypes'
import { saveTemplate, resetTemplateToDefault } from './emailTemplateActions'

export interface EmailTemplate {
  id: string
  document_type: string
  subject: string
  body: string
  is_default: boolean
  updated_at: string
  updated_by: string | null
}

// Placeholders available per document type
const PERIOD_TYPES = new Set(['portfolio_statement', 'transaction_statement'])
const COMPANY_TYPES = new Set([
  'application_form', 'eis_certificate', 'investment_agreement', 'side_letter',
  'ceo_update', 'press_release', 'company_update', 'exit_statement',
  'board_minutes', 'management_accounts', 'kpi_spreadsheet',
])
const REFERENCE_TYPES = new Set(['invoice'])

function getPlaceholderHints(documentType: string): string[] {
  const hints = ['{{client_first_name}}', '{{client_full_name}}', '{{sender_first_name}}', '{{sender_full_name}}', '{{filename}}']
  if (PERIOD_TYPES.has(documentType))    hints.push('{{period}}')
  if (COMPANY_TYPES.has(documentType))   hints.push('{{company_name}}')
  if (REFERENCE_TYPES.has(documentType)) hints.push('{{reference}}')
  return hints
}

// Client-side substitution for preview only
const PREVIEW_CONTEXT: Record<string, string> = {
  client_first_name: 'Bob',
  client_full_name:  'Bob Bigballs',
  sender_first_name: 'Ed',
  sender_full_name:  'Ed Rudd',
  period:            '31 March 2026',
  company_name:      'Acme Ventures',
  filename:          '2026-03-31 — Bob Bigballs — Sample Document.pdf',
  reference:         'INV-001',
}

function substitutePreview(template: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => PREVIEW_CONTEXT[key] ?? '')
}

function truncate(str: string, max = 60): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── EditModal ─────────────────────────────────────────────────────────────────

function EditModal({
  template,
  onClose,
  onSaved,
}: {
  template: EmailTemplate
  onClose: () => void
  onSaved: () => void
}) {
  const [subject, setSubject] = useState(template.subject)
  const [body,    setBody]    = useState(template.body)
  const [showPreview, setShowPreview] = useState(false)
  const [saving,  startSave]  = useTransition()
  const [resetting, startReset] = useTransition()
  const [error,   setError]   = useState<string | null>(null)

  const hints = getPlaceholderHints(template.document_type)
  const label = DOCUMENT_TYPE_LABELS[template.document_type] ?? template.document_type

  async function handleSave() {
    if (!subject.trim()) { setError('Subject cannot be empty'); return }
    if (!body.trim())    { setError('Body cannot be empty');    return }
    setError(null)
    startSave(async () => {
      const result = await saveTemplate(template.id, subject.trim(), body.trim())
      if ('error' in result) { setError(result.error); return }
      onSaved()
    })
  }

  async function handleReset() {
    setError(null)
    startReset(async () => {
      const result = await resetTemplateToDefault(template.id, template.document_type)
      if ('error' in result) { setError(result.error); return }
      onSaved()
    })
  }

  const inputSt: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    border: '0.5px solid #e8e7e0', borderRadius: 5,
    fontSize: 12, outline: 'none', boxSizing: 'border-box',
    background: '#fafaf8', color: '#0f2744', fontFamily: 'inherit',
  }
  const labelSt: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: '#888', marginBottom: 4, display: 'block',
  }

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 300,
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          className="card"
          style={{ width: 760, maxWidth: '94vw', padding: '24px 28px', maxHeight: '90vh', overflowY: 'auto' }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#0f2744' }}>
                Edit template — {label}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', lineHeight: 1, padding: '0 2px' }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', gap: 20 }}>
            {/* Left: fields */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelSt}>Subject</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={inputSt}
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelSt}>Body</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  style={{ ...inputSt, resize: 'vertical', minHeight: 200, lineHeight: 1.6 }}
                />
              </div>

              {error && (
                <div style={{
                  background: '#fef2f2', border: '0.5px solid #fca5a5',
                  borderRadius: 6, padding: '8px 12px', fontSize: 11,
                  color: '#991b1b', marginBottom: 12,
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '0.5px solid #f0f0ea', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowPreview(true)}
                    style={{ fontSize: 12 }}
                  >
                    Preview
                  </button>
                  {!template.is_default && (
                    <button
                      className="btn btn-secondary"
                      disabled={resetting}
                      onClick={handleReset}
                      style={{ fontSize: 12, color: '#ba7517' }}
                    >
                      {resetting ? 'Resetting…' : 'Reset to default'}
                    </button>
                  )}
                </div>
                <button
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={handleSave}
                  style={{ fontSize: 12 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            {/* Right: placeholder hints */}
            <div style={{
              width: 180, flexShrink: 0,
              background: '#f9f9f7', border: '0.5px solid #e8e7e0',
              borderRadius: 6, padding: '12px 14px', alignSelf: 'flex-start',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888', marginBottom: 10 }}>
                Available placeholders
              </div>
              {hints.map(h => (
                <div key={h} style={{ marginBottom: 6 }}>
                  <code style={{
                    fontSize: 10, background: '#e8f0fb', color: '#185fa5',
                    borderRadius: 3, padding: '2px 5px',
                    display: 'inline-block',
                  }}>
                    {h}
                  </code>
                </div>
              ))}
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 10, lineHeight: 1.5 }}>
                Missing values substitute to an empty string.
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPreview && (
        <PreviewModal
          subject={subject}
          body={body}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  )
}

// ── PreviewModal ──────────────────────────────────────────────────────────────

function PreviewModal({ subject, body, onClose }: { subject: string; body: string; onClose: () => void }) {
  const resolvedSubject = substitutePreview(subject)
  const resolvedBody    = substitutePreview(body)

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 400,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="card"
        style={{ width: 600, maxWidth: '92vw', padding: '24px 28px', maxHeight: '88vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#0f2744' }}>Preview</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', lineHeight: 1, padding: '0 2px' }}>
            ×
          </button>
        </div>

        <div style={{ fontSize: 10, color: '#aaa', marginBottom: 12 }}>
          Sample substitution using Bob Bigballs as test client
        </div>

        {/* Email shell */}
        <div style={{ border: '0.5px solid #e8e7e0', borderRadius: 8, overflow: 'hidden' }}>
          {[
            { label: 'From',    value: 'Ed Rudd <ed.rudd@junocapital.co.uk>' },
            { label: 'To',      value: 'Bob Bigballs <bob@bigballs.com>' },
            { label: 'Date',    value: '22 May 2026, 09:00' },
            { label: 'Subject', value: resolvedSubject },
          ].map(row => (
            <div key={row.label} style={{
              display: 'flex', gap: 12, padding: '7px 14px',
              borderBottom: '0.5px solid #f0f0ea', alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#888', width: 52, flexShrink: 0 }}>{row.label}</span>
              <span style={{ fontSize: 12, color: '#0f2744' }}>{row.value}</span>
            </div>
          ))}
          <div style={{ padding: '16px 14px' }}>
            <pre style={{
              margin: 0, fontSize: 12, color: '#0f2744',
              fontFamily: 'inherit', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {resolvedBody}
            </pre>
          </div>
          <div style={{ padding: '8px 14px', borderTop: '0.5px solid #f0f0ea', background: '#f9f9f7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 500, background: '#e8e7e0', color: '#555', borderRadius: 3, padding: '1px 5px' }}>PDF</span>
              <span style={{ fontSize: 11, color: '#666' }}>2026-03-31 — Bob Bigballs — Sample Document.pdf</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── EmailTemplatesList (main export) ─────────────────────────────────────────

export function EmailTemplatesList({ templates }: { templates: EmailTemplate[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<EmailTemplate | null>(null)

  // Build a map for easy lookup; maintain display order from SENDABLE_DOCUMENT_TYPES
  const byType = new Map(templates.map(t => [t.document_type, t]))

  const labelColSt: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: '#888',
    padding: '8px 16px',
    borderBottom: '0.5px solid #e8e7e0',
    display: 'flex', gap: 0,
  }

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
        {/* Column headers */}
        <div style={{ ...labelColSt, display: 'grid', gridTemplateColumns: '200px 1fr 100px 80px', gap: 0 }}>
          <span>Document type</span>
          <span>Subject</span>
          <span>Status</span>
          <span />
        </div>

        {SENDABLE_DOCUMENT_TYPES.map((type, i) => {
          const t = byType.get(type)
          if (!t) return null
          return (
            <div
              key={type}
              style={{
                display: 'grid', gridTemplateColumns: '200px 1fr 100px 80px',
                alignItems: 'center',
                padding: '10px 16px',
                borderTop: i === 0 ? undefined : '0.5px solid #f0f0ea',
                background: '#fff',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>
                {DOCUMENT_TYPE_LABELS[type] ?? type}
              </span>
              <span style={{ fontSize: 12, color: '#555', paddingRight: 16 }}>
                {truncate(t.subject)}
              </span>
              <span>
                {t.is_default ? (
                  <span style={{
                    fontSize: 10, fontWeight: 500, background: '#e1f5ee',
                    color: '#085041', borderRadius: 4, padding: '2px 7px',
                  }}>
                    Default
                  </span>
                ) : (
                  <span style={{
                    fontSize: 10, fontWeight: 500, background: '#fff4e0',
                    color: '#8b5c00', borderRadius: 4, padding: '2px 7px',
                  }}>
                    Edited {fmtDate(t.updated_at)}
                  </span>
                )}
              </span>
              <span style={{ textAlign: 'right' }}>
                <button
                  onClick={() => setEditing(t)}
                  style={{
                    fontSize: 12, background: 'none', border: 'none',
                    cursor: 'pointer', color: '#185fa5', padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  Edit
                </button>
              </span>
            </div>
          )
        })}
      </div>

      {editing && (
        <EditModal
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh() }}
        />
      )}
    </>
  )
}
