'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Lead {
  id: string
  full_name: string
}

interface ClientData {
  id: string
  full_name: string
  investor_reference: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postcode: string | null
  date_joined: string | null
  tax_status: string
  kyc_status: string
  kyc_expiry: string | null
  default_fee_rate: number
  report_delivery_email: string | null
  entity_type: string
  holding_location: string
  lead_investor_id: string | null
  notes: string | null
  fund_type: string
}

interface Props {
  client: ClientData
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

export default function EditClientForm({ client, leads }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [isLinked, setIsLinked] = useState(!!client.lead_investor_id)

  const [form, setForm] = useState({
    full_name:            client.full_name,
    investor_reference:   client.investor_reference ?? '',
    email:                client.email ?? '',
    phone:                client.phone ?? '',
    address_line1:        client.address_line1 ?? '',
    address_line2:        client.address_line2 ?? '',
    city:                 client.city ?? '',
    postcode:             client.postcode ?? '',
    date_joined:          client.date_joined ?? '',
    tax_status:           client.tax_status,
    kyc_status:           client.kyc_status,
    kyc_expiry:           client.kyc_expiry ?? '',
    default_fee_rate:     String(client.default_fee_rate),
    report_delivery_email: client.report_delivery_email ?? '',
    entity_type:          client.entity_type,
    holding_location:     client.holding_location,
    lead_investor_id:     client.lead_investor_id ?? '',
    notes:                client.notes ?? '',
    fund_type:            client.fund_type,
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
      full_name:             form.full_name.trim(),
      investor_reference:    form.investor_reference.trim() || null,
      email:                 form.email.trim() || null,
      phone:                 form.phone.trim() || null,
      address_line1:         form.address_line1.trim() || null,
      address_line2:         form.address_line2.trim() || null,
      city:                  form.city.trim() || null,
      postcode:              form.postcode.trim() || null,
      date_joined:           form.date_joined || null,
      tax_status:            form.tax_status,
      kyc_status:            form.kyc_status,
      kyc_expiry:            form.kyc_expiry || null,
      default_fee_rate:      parseFloat(form.default_fee_rate) || 5,
      report_delivery_email: form.report_delivery_email.trim() || form.email.trim() || null,
      entity_type:           form.entity_type,
      holding_location:      form.holding_location,
      lead_investor_id:      isLinked && form.lead_investor_id ? form.lead_investor_id : null,
      notes:                 form.notes.trim() || null,
      fund_type:             form.fund_type,
    }

    const { error: dbError } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', client.id)

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    await supabase.from('internal_updates').insert({
      client_id:   client.id,
      update_type: 'client',
      description: `Client details updated: ${form.full_name.trim()}`,
    })

    router.push(`/clients/${client.id}`)
  }

  async function handleDelete() {
    setDeleting(true)
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('clients')
      .delete()
      .eq('id', client.id)

    if (dbError) {
      setError(dbError.message)
      setDeleting(false)
      setConfirmDelete(false)
      return
    }

    router.push('/clients')
  }

  return (
    <>
      <div style={{ maxWidth: 680 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
          <Link href="/clients" style={{ color: '#888', textDecoration: 'none' }}>Clients</Link>
          {' › '}
          <Link href={`/clients/${client.id}`} style={{ color: '#888', textDecoration: 'none' }}>{client.full_name}</Link>
          {' › '}Edit
        </div>

        <h1 style={{ fontSize: 17, fontWeight: 500, marginBottom: 24 }}>Edit client</h1>

        <form onSubmit={handleSubmit}>
          {/* Entity */}
          <div className="card" style={{ marginBottom: 16 }}>
            <Section title="Entity">
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                {[
                  { value: 'false', label: 'Lead investor / Individual' },
                  { value: 'true',  label: 'Linked entity' },
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
                      {leads.filter(l => l.id !== client.id).map(l => (
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
                  <option value="both">Direct &amp; Nominee</option>
                </select>
              </Field>

              <Field label="Fund type">
                <select value={form.fund_type} onChange={e => set('fund_type', e.target.value)} style={inputStyle}>
                  <option value="syndicate">Syndicate</option>
                  <option value="multi_manager">Multi Manager</option>
                  <option value="both">Both</option>
                </select>
              </Field>
            </Section>
          </div>

          {/* Details */}
          <div className="card" style={{ marginBottom: 16 }}>
            <Section title="Details">
              <Field label="Full name" required>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => set('full_name', e.target.value)}
                  required
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
            <Section title="Tax &amp; compliance">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Tax status">
                  <select value={form.tax_status} onChange={e => set('tax_status', e.target.value)} style={inputStyle}>
                    <option value="neither">No EIS/SEIS</option>
                    <option value="eis">EIS</option>
                    <option value="seis">SEIS</option>
                    <option value="both">EIS &amp; SEIS</option>
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
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="Notes about this client…"
                />
              </Field>
            </Section>
          </div>

          {error && (
            <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>
          )}

          {/* Actions row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '8px 20px' }}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <Link href={`/clients/${client.id}`} className="btn btn-secondary" style={{ padding: '8px 16px' }}>
                Cancel
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              style={{
                fontSize: 12, color: '#a32d2d', background: 'none',
                border: '0.5px solid #fca5a5', borderRadius: 5,
                padding: '7px 14px', cursor: 'pointer',
              }}
            >
              Delete client
            </button>
          </div>
        </form>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 400, padding: '28px 24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', margin: '0 0 8px' }}>
              Delete client?
            </h2>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 6px' }}>
              This will permanently delete <strong>{client.full_name}</strong> and all associated records.
            </p>
            <p style={{ fontSize: 11, color: '#a32d2d', margin: '0 0 24px' }}>
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  fontSize: 12, fontWeight: 500, padding: '7px 16px', borderRadius: 5,
                  background: '#a32d2d', color: '#fff', border: 'none', cursor: deleting ? 'default' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
