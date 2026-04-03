'use client'

import type { Company, DealInvestor, WizardDocument } from './wizardTypes'
import { DOC_TEMPLATES, inputStyle } from './wizardTypes'
import { Field } from './wizardHelpers'

interface Props {
  documents: WizardDocument[]
  setDocuments: React.Dispatch<React.SetStateAction<WizardDocument[]>>
  reminderDays: string
  setReminderDays: (v: string) => void
  signingOrder: 'sequential' | 'parallel'
  setSigningOrder: (v: 'sequential' | 'parallel') => void
  investors: DealInvestor[]
  selectedCompany: Company | undefined
  investmentDate: string
  onNext: () => void
  onBack: () => void
}

export function DocumentsStep({
  documents, setDocuments, reminderDays, setReminderDays, signingOrder, setSigningOrder,
  investors, selectedCompany, investmentDate, onNext, onBack,
}: Props) {
  function addDocTemplate(tpl: typeof DOC_TEMPLATES[0]) {
    if (documents.find(d => d.type === tpl.type)) return
    setDocuments(prev => [...prev, { id: tpl.type, ...tpl }])
  }

  function removeDoc(id: string) {
    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
      {/* Left panel */}
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Documents for this deal
          </div>

          <table style={{ marginBottom: 14 }}>
            <thead>
              <tr>
                <th>Document</th>
                <th style={{ width: 80 }}>Type</th>
                <th style={{ width: 110 }}>Sig. required</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id}>
                  <td style={{ fontWeight: 500, fontSize: 12 }}>{doc.name}</td>
                  <td>
                    <span className={`pill ${doc.bespoke ? 'pill-amber' : 'pill-grey'}`} style={{ fontSize: 10 }}>
                      {doc.bespoke ? 'Bespoke' : 'Template'}
                    </span>
                  </td>
                  <td>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={doc.signingRequired}
                        onChange={() => setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, signingRequired: !d.signingRequired } : d))}
                      />
                      {doc.signingRequired ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td>
                    <button type="button" onClick={() => removeDoc(doc.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d', fontSize: 16, lineHeight: 1 }}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 11, fontWeight: 500, color: '#888', marginBottom: 6 }}>Add document</div>
          <select
            value=""
            onChange={e => {
              const val = e.target.value
              if (!val) return
              if (val === 'bespoke') {
                const name = prompt('Document name:')
                if (name) setDocuments(prev => [...prev, { id: `bespoke_${Date.now()}`, name, type: 'bespoke', signingRequired: true, bespoke: true }])
              } else {
                const tpl = DOC_TEMPLATES.find(t => t.type === val)
                if (tpl) addDocTemplate(tpl)
              }
            }}
            style={{ ...inputStyle, maxWidth: 280, color: '#555' }}
          >
            <option value="">Add a document…</option>
            {DOC_TEMPLATES.filter(t => !documents.find(d => d.type === t.type)).map(tpl => (
              <option key={tpl.type} value={tpl.type}>{tpl.name}</option>
            ))}
            <option value="bespoke">Upload bespoke document…</option>
          </select>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Signature settings
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Signing order">
              <select value={signingOrder} onChange={e => setSigningOrder(e.target.value as 'sequential' | 'parallel')} style={inputStyle}>
                <option value="parallel">Parallel (all at once)</option>
                <option value="sequential">Sequential (one by one)</option>
              </select>
            </Field>
            <Field label="Auto-reminder if not signed">
              <select value={reminderDays} onChange={e => setReminderDays(e.target.value)} style={inputStyle}>
                <option value="1">After 1 day</option>
                <option value="3">After 3 days</option>
                <option value="7">After 7 days</option>
                <option value="0">No reminder</option>
              </select>
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
          <button className="btn btn-primary" onClick={onNext} style={{ padding: '8px 20px' }}>
            Next: Send →
          </button>
        </div>
      </div>

      {/* Right panel — summary */}
      <div>
        <div className="card" style={{ background: '#f9f9f7', fontSize: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Summary</div>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', alignItems: 'start' }}>
            <dt style={{ color: '#888', whiteSpace: 'nowrap' }}>Documents</dt>
            <dd style={{ margin: 0, fontWeight: 500 }}>{documents.length}</dd>
            <dt style={{ color: '#888', whiteSpace: 'nowrap' }}>Signing</dt>
            <dd style={{ margin: 0 }}>{documents.filter(d => d.signingRequired).length} require signature</dd>
            <dt style={{ color: '#888', whiteSpace: 'nowrap' }}>Order</dt>
            <dd style={{ margin: 0 }}>{signingOrder === 'sequential' ? 'Sequential' : 'Parallel'}</dd>
            <dt style={{ color: '#888', whiteSpace: 'nowrap' }}>Reminder</dt>
            <dd style={{ margin: 0 }}>{reminderDays === '0' ? 'None' : `After ${reminderDays} day${reminderDays === '1' ? '' : 's'}`}</dd>
          </dl>
          {investors.length > 0 && selectedCompany && (
            <>
              <div style={{ borderTop: '0.5px solid #e8e7e0', margin: '12px 0 10px' }} />
              <div style={{ fontSize: 10, fontWeight: 500, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Naming preview</div>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {investmentDate} — {investors[0].name} — {selectedCompany.name} — Application form.pdf
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
