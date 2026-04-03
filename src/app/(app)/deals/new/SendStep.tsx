'use client'

import type { DealInvestor, WizardDocument } from './wizardTypes'
import { inputStyle } from './wizardTypes'
import { Field } from './wizardHelpers'

interface Props {
  documents: WizardDocument[]
  investors: DealInvestor[]
  emailSubject: string
  setEmailSubject: (v: string) => void
  emailMessage: string
  setEmailMessage: (v: string) => void
  signingOrder: 'sequential' | 'parallel'
  reminderDays: string
  error: string
  saving: boolean
  onSend: () => void
  onBack: () => void
  onEditDocs: () => void
}

export function SendStep({
  documents, investors, emailSubject, setEmailSubject, emailMessage, setEmailMessage,
  signingOrder, reminderDays, error, saving, onSend, onBack, onEditDocs,
}: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
      {/* Left panel */}
      <div>
        {/* Document list (read-only) */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Documents
          </div>
          {documents.map(doc => (
            <div key={doc.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '0.5px solid #f0f0ec',
            }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{doc.name}</span>
                <span className={`pill ${doc.bespoke ? 'pill-amber' : 'pill-grey'}`} style={{ fontSize: 10, marginLeft: 8 }}>
                  {doc.bespoke ? 'Bespoke' : 'Template'}
                </span>
                {doc.signingRequired && (
                  <span className="pill pill-blue" style={{ fontSize: 10, marginLeft: 4 }}>Signature required</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-secondary"
                  disabled
                  title="Document preview coming soon"
                  style={{ fontSize: 10, padding: '2px 8px', opacity: 0.45, cursor: 'not-allowed' }}
                >
                  Preview
                </button>
                <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={onEditDocs}>Edit</button>
              </div>
            </div>
          ))}
        </div>

        {/* Email panel */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Email to investors
          </div>

          <Field label="To">
            <input
              type="text"
              readOnly
              value={investors.map(i => i.email || i.name).join(', ') || '—'}
              style={{ ...inputStyle, background: '#f9f9f7', color: '#555' }}
            />
          </Field>

          <Field label="Subject">
            <input
              type="text"
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Message (optional)">
            <textarea
              value={emailMessage}
              onChange={e => setEmailMessage(e.target.value)}
              placeholder="Add a personal note to the email…"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </Field>
        </div>

        {/* Amber warning */}
        <div style={{
          background: '#fffbeb', border: '0.5px solid #f0c674',
          borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>⚠</span>
          <div style={{ fontSize: 12, color: '#78500a', lineHeight: 1.5 }}>
            Once sent, this deal will appear as active. The investment will be added to the portfolio as pending.
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
          <button
            className="btn btn-primary"
            onClick={onSend}
            disabled={saving}
            style={{ padding: '8px 24px' }}
          >
            {saving ? 'Sending…' : 'Send documents →'}
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div>
        <div className="card" style={{ background: '#f9f9f7', fontSize: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Summary</div>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', alignItems: 'start' }}>
            <dt style={{ color: '#888' }}>Recipients</dt>
            <dd style={{ margin: 0 }}>
              {investors.length > 0
                ? investors.map(i => (
                    <div key={i.clientId}>{i.name}{i.poaHeld && <span className="pill pill-blue" style={{ fontSize: 9, marginLeft: 4 }}>POA</span>}</div>
                  ))
                : '—'}
            </dd>
            <dt style={{ color: '#888' }}>Documents</dt>
            <dd style={{ margin: 0 }}>{documents.length} ({documents.filter(d => d.signingRequired).length} for signing)</dd>
            <dt style={{ color: '#888' }}>Order</dt>
            <dd style={{ margin: 0 }}>{signingOrder === 'sequential' ? 'Sequential' : 'Parallel'}</dd>
            <dt style={{ color: '#888' }}>Reminder</dt>
            <dd style={{ margin: 0 }}>{reminderDays === '0' ? 'None' : `After ${reminderDays} day${reminderDays === '1' ? '' : 's'}`}</dd>
          </dl>
        </div>
      </div>
    </div>
  )
}
