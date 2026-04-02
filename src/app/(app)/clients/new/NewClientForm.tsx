'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Lead {
  id: string
  full_name: string
}

interface Props {
  leads: Lead[]
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
  background: '#fff',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4,
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: '#a32d2d' }}> *</span>}</label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function NewClientForm({ leads }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isLinked, setIsLinked] = useState(false)

  const [form, setForm] = useState({
    full_name: '',
    investor_reference: '',
    email: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    postcode: '',
    date_joined: new Date().toISOString().slice(0, 10),
    tax_status: 'neither',
    kyc_status: 'outstanding',
    kyc_expiry: '',
    default_fee_rate: '5',
    report_delivery_email: '',
    entity_type: 'own_name',
    holding_location: 'direct',
    lead_investor_id: '',
    notes: '',
    fund_type: 'syndicate',
  })

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const supabase = createClient()

    const payload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      investor_reference: form.investor_reference.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      postcode: form.postcode.trim() || null,
      date_joined: form.date_joined || null,
      tax_status: form.tax_status,
      kyc_status: form.kyc_status,
      kyc_expiry: form.kyc_expiry || null,
      default_fee_rate: parseFloat(form.default_fee_rate) || 5,
      report_delivery_email: form.report_delivery_email.trim() || form.email.trim() || null,
      entity_type: form.entity_type,
      holding_location: form.holding_location,
      lead_investor_id: isLinked && form.lead_investor_id ? form.lead_investor_id : null,
      notes: form.notes.trim() || null,
      fund_type: 'syndicate',
    }

    const { data, error: dbError } = await supabase
      .from('clients')
      .insert(payload)
      .select('id')
      .single()

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    // Log activity
    await supabase.from('internal_updates').insert({
      client_id: data.id,
      update_type: 'client',
      description: `New client added: ${form.full_name.trim()}`,
    })

    router.push(`/clients/${data.id}`)
  }

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/clients" style={{ color: '#888', textDecoration: 'none' }}>Clients</Link>
        {' › '}New client
      </div>

      <h1 style={{ fontSize: 17, fontWeight: 500, marginBottom: 24 }}>Add client</h1>

      <form onSubmit={handleSubmit}>
        {/* Entity type */}
        <div className="card" style={{ marginBottom: 16 }}>
          <Section title="Entity">
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              {[
                { value: 'false', label: 'Lead investor / Individual' },
                { value: 'true', label: 'Linked entity' },
              ].map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    padding: '8px 14px', borderRadius: 6, fontSize: 12,
                    border: `0.5px solid ${isLinked.toString() === opt.value ? '#0f2744' : '#e0e0d8'}`,
                    fontWeight: isLinked.toString() === opt.value ? 600 : 400,
                    background: isLinked.toString() === opt.value ? '#f0f3f7' : '#fff',
                  }}
                >
                  <input
                    type="radio"
                    name="is_linked"
                    value={opt.value}
                    checked={isLinked.toString() === opt.value}
                    onChange={() => setIsLinked(opt.value === 'true')}
                    style={{ margin: 0 }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {isLinked ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Lead investor" required>
                  <select
                    value={form.lead_investor_id}
                    onChange={e => set('lead_investor_id', e.target.value)}
                    required
                    style={inputStyle}
                  >
                    <option value="">Select lead investor…</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.id}>{l.full_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Entity type">
                  <select value={form.entity_type} onChange={e => set('entity_type', e.target.value)} style={inputStyle}>
                    <option value="own_name">Own name</option>
                    <option value="family">Family member</option>
                    <option value="corporate">Corporate vehicle</option>
                  </select>
                </Field>
              </div>
            ) : (
              <Field label="Entity type">
                <select value={form.entity_type} onChange={e => set('entity_type', e.target.value)} style={inputStyle}>
                  <option value="own_name">Own name / Individual</option>
                  <option value="corporate">Corporate vehicle</option>
                </select>
              </Field>
            )}

            <Field label="Holding location">
              <select value={form.holding_location} onChange={e => set('holding_location', e.target.value)} style={inputStyle}>
                <option value="direct">Direct</option>
                <option value="nominee">Nominee</option>
                <option value="both">Direct & Nominee</option>
              </select>
            </Field>
            <Field label="Fund type">
              <select value={form.fund_type} disabled style={{ ...inputStyle, background: '#f5f5f2', color: '#888' }}>
                <option value="syndicate">Syndicate</option>
              </select>
              <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                Multi Manager is closed to new clients. All new clients are onboarded as Syndicate.
              </div>
            </Field>
          </Section>
        </div>

        {/* Personal details */}
        <div className="card" style={{ marginBottom: 16 }}>
          <Section title="Details">
            <Field label="Full name" required>
              <input
                type="text"
                value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                required
                placeholder="e.g. Barry O'Brien"
                style={inputStyle}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Investor reference">
                <input
                  type="text"
                  value={form.investor_reference}
                  onChange={e => set('investor_reference', e.target.value)}
                  placeholder="e.g. JC-001"
                  style={inputStyle}
                />
              </Field>
              <Field label="Date joined">
                <input type="date" value={form.date_joined} onChange={e => set('date_joined', e.target.value)} style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Email">
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="barry@example.com" style={inputStyle} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+44 7700 000000" style={inputStyle} />
              </Field>
            </div>

            <Field label="Address line 1">
              <input type="text" value={form.address_line1} onChange={e => set('address_line1', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Address line 2">
              <input type="text" value={form.address_line2} onChange={e => set('address_line2', e.target.value)} style={inputStyle} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="City">
                <input type="text" value={form.city} onChange={e => set('city', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Postcode">
                <input type="text" value={form.postcode} onChange={e => set('postcode', e.target.value)} style={inputStyle} />
              </Field>
            </div>
          </Section>
        </div>

        {/* Tax & compliance */}
        <div className="card" style={{ marginBottom: 16 }}>
          <Section title="Tax & compliance">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Tax status">
                <select value={form.tax_status} onChange={e => set('tax_status', e.target.value)} style={inputStyle}>
                  <option value="neither">No EIS/SEIS</option>
                  <option value="eis">EIS</option>
                  <option value="seis">SEIS</option>
                  <option value="both">EIS & SEIS</option>
                </select>
              </Field>
              <Field label="KYC status">
                <select value={form.kyc_status} onChange={e => set('kyc_status', e.target.value)} style={inputStyle}>
                  <option value="outstanding">Outstanding</option>
                  <option value="verified">Verified</option>
                  <option value="renewal_due">Renewal due</option>
                </select>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="KYC expiry date">
                <input type="date" value={form.kyc_expiry} onChange={e => set('kyc_expiry', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Default fee rate (%)">
                <input
                  type="number" step="0.1" min="0" max="100"
                  value={form.default_fee_rate}
                  onChange={e => set('default_fee_rate', e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
          </Section>
        </div>

        {/* Reporting */}
        <div className="card" style={{ marginBottom: 16 }}>
          <Section title="Reporting">
            <Field label="Report delivery email">
              <input
                type="email"
                value={form.report_delivery_email}
                onChange={e => set('report_delivery_email', e.target.value)}
                placeholder="Defaults to contact email if blank"
                style={inputStyle}
              />
            </Field>
          </Section>
        </div>

        {/* Notes */}
        <div className="card" style={{ marginBottom: 24 }}>
          <Section title="Notes">
            <Field label="Initial note (optional)">
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Any initial notes about this client…"
              />
            </Field>
          </Section>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '8px 20px' }}>
            {saving ? 'Saving…' : 'Add client'}
          </button>
          <Link href="/clients" className="btn btn-secondary" style={{ padding: '8px 16px' }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
