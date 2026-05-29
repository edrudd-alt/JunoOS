'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface CompanyData {
  id: string
  name: string
  sector: string | null
  stage: string | null
  eis_eligible: boolean
  website: string | null
  description: string | null
  bank_account_name: string | null
  bank_sort_code: string | null
  bank_account_number: string | null
  bank_iban: string | null
  bank_swift_bic: string | null
}

const SECTORS = ['Fintech', 'Healthtech', 'SaaS', 'Consumer', 'Deep Tech', 'Climate Tech', 'Proptech', 'Edtech', 'Other']
const STAGES  = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth', 'Pre-IPO']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
  background: '#fff', fontFamily: 'inherit',
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
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function CompanySettingsForm({ company: raw }: { company: Record<string, unknown> }) {
  const company  = raw as unknown as CompanyData
  const router   = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    name:                company.name,
    sector:              company.sector ?? '',
    stage:               company.stage ?? '',
    eis_eligible:        company.eis_eligible,
    website:             company.website ?? '',
    description:         company.description ?? '',
    bank_account_name:   company.bank_account_name ?? '',
    bank_sort_code:      company.bank_sort_code ?? '',
    bank_account_number: company.bank_account_number ?? '',
    bank_iban:           company.bank_iban ?? '',
    bank_swift_bic:      company.bank_swift_bic ?? '',
  })

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [saved,  setSaved]  = useState(false)

  function set(key: string, value: string | boolean) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    setSaved(false)

    const { error: dbError } = await supabase
      .from('companies')
      .update({
        name:                form.name.trim(),
        sector:              form.sector || null,
        stage:               form.stage || null,
        eis_eligible:        form.eis_eligible,
        website:             form.website.trim() || null,
        description:         form.description.trim() || null,
        bank_account_name:   form.bank_account_name.trim() || null,
        bank_sort_code:      form.bank_sort_code.trim() || null,
        bank_account_number: form.bank_account_number.trim() || null,
        bank_iban:           form.bank_iban.trim() || null,
        bank_swift_bic:      form.bank_swift_bic.trim() || null,
      })
      .eq('id', company.id)

    setSaving(false)
    if (dbError) { setError(dbError.message); return }
    setSaved(true)
    router.refresh()
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href={`/portfolio/${company.id}`} style={{ color: '#888', textDecoration: 'none' }}>
          {company.name}
        </Link>
        {' › '}Settings
      </div>
      <h1 style={{ fontSize: 17, fontWeight: 500, marginBottom: 24 }}>Company settings</h1>

      <form onSubmit={handleSubmit}>
        <Section title="General">
          <Field label="Company name" required>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Sector">
              <select value={form.sector} onChange={e => set('sector', e.target.value)} style={inputStyle}>
                <option value="">— none —</option>
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Stage">
              <select value={form.stage} onChange={e => set('stage', e.target.value)} style={inputStyle}>
                <option value="">— none —</option>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Website">
            <input type="url" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://example.com" style={inputStyle} />
          </Field>

          <Field label="Description">
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
              <input type="checkbox" checked={form.eis_eligible} onChange={e => set('eis_eligible', e.target.checked)} />
              EIS eligible
            </label>
          </div>
        </Section>

        <Section title="Bank details">
          <p style={{ fontSize: 11, color: '#888', margin: '0 0 14px' }}>
            Used on application forms. Leave blank if not applicable.
          </p>

          <Field label="Account name">
            <input type="text" value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} placeholder="Juno Syndicate Ltd" style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Sort code">
              <input type="text" value={form.bank_sort_code} onChange={e => set('bank_sort_code', e.target.value)} placeholder="00-00-00" style={inputStyle} />
            </Field>
            <Field label="Account number">
              <input type="text" value={form.bank_account_number} onChange={e => set('bank_account_number', e.target.value)} placeholder="00000000" style={inputStyle} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="IBAN">
              <input type="text" value={form.bank_iban} onChange={e => set('bank_iban', e.target.value)} placeholder="GB00 XXXX 0000 0000 0000 00" style={inputStyle} />
            </Field>
            <Field label="SWIFT / BIC">
              <input type="text" value={form.bank_swift_bic} onChange={e => set('bank_swift_bic', e.target.value)} placeholder="XXXXGB2L" style={inputStyle} />
            </Field>
          </div>
        </Section>

        {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>}
        {saved && <p style={{ fontSize: 12, color: '#1d9e75', marginBottom: 14 }}>Saved.</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '8px 20px' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <Link href={`/portfolio/${company.id}`} className="btn btn-secondary" style={{ padding: '8px 16px' }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
