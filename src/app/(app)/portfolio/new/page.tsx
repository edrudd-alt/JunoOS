'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff',
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

interface ShareClass {
  name: string
  type: string
}

export default function NewCompanyPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [shareClasses, setShareClasses] = useState<ShareClass[]>([{ name: 'Ordinary', type: 'ordinary' }])

  const [form, setForm] = useState({
    name: '',
    sector: '',
    stage: 'seed',
    eis_eligible: false,
    website: '',
    description: '',
  })

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function addShareClass() {
    setShareClasses(sc => [...sc, { name: '', type: 'ordinary' }])
  }

  function updateShareClass(i: number, key: keyof ShareClass, value: string) {
    setShareClasses(sc => sc.map((c, idx) => idx === i ? { ...c, [key]: value } : c))
  }

  function removeShareClass(i: number) {
    setShareClasses(sc => sc.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const supabase = createClient()

    const { data, error: dbError } = await supabase
      .from('companies')
      .insert({
        name: form.name.trim(),
        sector: form.sector.trim() || null,
        stage: form.stage || null,
        eis_eligible: form.eis_eligible,
        website: form.website.trim() || null,
        description: form.description.trim() || null,
        share_classes: shareClasses.filter(sc => sc.name.trim()),
      })
      .select('id')
      .single()

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    await supabase.from('internal_updates').insert({
      company_id: data.id,
      update_type: 'document',
      description: `Company added: ${form.name.trim()}`,
    })

    router.push(`/portfolio/${data.id}`)
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/portfolio" style={{ color: '#888', textDecoration: 'none' }}>Portfolio</Link>
        {' › '}New company
      </div>

      <h1 style={{ fontSize: 17, fontWeight: 500, marginBottom: 24 }}>Add company</h1>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Company details
          </div>

          <Field label="Company name" required>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              placeholder="e.g. So Purple Group"
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Sector">
              <input
                type="text"
                value={form.sector}
                onChange={e => set('sector', e.target.value)}
                placeholder="e.g. FinTech, HealthTech"
                style={inputStyle}
              />
            </Field>
            <Field label="Stage">
              <select value={form.stage} onChange={e => set('stage', e.target.value)} style={inputStyle}>
                <option value="pre-seed">Pre-seed</option>
                <option value="seed">Seed</option>
                <option value="series_a">Series A</option>
                <option value="series_b">Series B</option>
                <option value="series_c">Series C</option>
                <option value="growth">Growth</option>
                <option value="late_stage">Late stage</option>
              </select>
            </Field>
          </div>

          <Field label="Website">
            <input
              type="url"
              value={form.website}
              onChange={e => set('website', e.target.value)}
              placeholder="https://"
              style={inputStyle}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Brief description of the company…"
            />
          </Field>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="eis_eligible"
              checked={form.eis_eligible}
              onChange={e => set('eis_eligible', e.target.checked)}
            />
            <label htmlFor="eis_eligible" style={{ fontSize: 12, cursor: 'pointer' }}>
              EIS eligible
            </label>
          </div>
        </div>

        {/* Share classes */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744' }}>Share classes</div>
            <button type="button" className="btn btn-secondary" onClick={addShareClass} style={{ fontSize: 11, padding: '3px 10px' }}>
              + Add
            </button>
          </div>

          {shareClasses.map((sc, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, marginBottom: 10, alignItems: 'end' }}>
              <Field label={i === 0 ? 'Name' : ''}>
                <input
                  type="text"
                  value={sc.name}
                  onChange={e => updateShareClass(i, 'name', e.target.value)}
                  placeholder="e.g. Ordinary, Series A Preferred"
                  style={inputStyle}
                />
              </Field>
              <Field label={i === 0 ? 'Type' : ''}>
                <select value={sc.type} onChange={e => updateShareClass(i, 'type', e.target.value)} style={inputStyle}>
                  <option value="ordinary">Ordinary</option>
                  <option value="preferred">Preferred</option>
                  <option value="convertible">Convertible note</option>
                  <option value="a_ordinary">A Ordinary</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              {shareClasses.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeShareClass(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d', fontSize: 16, padding: '7px 4px' }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '8px 20px' }}>
            {saving ? 'Saving…' : 'Add company'}
          </button>
          <Link href="/portfolio" className="btn btn-secondary" style={{ padding: '8px 16px' }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
