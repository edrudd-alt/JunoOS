'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { createClient } from '@/lib/supabase/client'

interface Lead {
  id: string
  full_name: string
  fee_schedule_id: string | null
  fund_type: string
}

interface FeeSchedule {
  id: string
  name: string
}

interface FundType {
  id: string
  name: string
  code: string
  default_fee_schedule_id: string | null
}

interface Props {
  leads: Lead[]
  feeSchedules: FeeSchedule[]
  fundTypes: FundType[]
  nominees: { id: string; name: string }[]
}

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
      <label style={labelStyle}>
        {label}{required && <span style={{ color: '#a32d2d' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

export default function NewClientForm({ leads, feeSchedules, fundTypes, nominees }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [isLinked, setIsLinked] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const [form, setForm] = useState({
    full_name:              '',
    email:                  '',
    phone:                  '',
    address_line1:          '',
    address_line2:          '',
    city:                   '',
    postcode:               '',
    fund_type:              fundTypes[0]?.code ?? 'syndicate',
    fee_schedule_id:        '',
    report_delivery_method: 'email',
    lead_investor_id:       '',
    vehicle_type:           '',
    nominee_id:             '',
  })

  // Typeahead state for lead investor picker
  const [leadSearch,   setLeadSearch]   = useState('')
  const [leadDropOpen, setLeadDropOpen] = useState(false)

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function switchMode(linked: boolean) {
    setIsLinked(linked)
    if (!linked) {
      setForm(f => ({ ...f, lead_investor_id: '', vehicle_type: '' }))
      setLeadSearch('')
    } else {
      setForm(f => ({ ...f, fund_type: fundTypes[0]?.code ?? 'syndicate', fee_schedule_id: '', report_delivery_method: 'email' }))
    }
  }

  function handleVehicleTypeChange(value: string) {
    setForm(f => ({ ...f, vehicle_type: value, nominee_id: value === 'nominee' ? f.nominee_id : '' }))
  }

  function handleFundTypeChange(value: string) {
    const defaultScheduleId = fundTypes.find(ft => ft.code === value)?.default_fee_schedule_id ?? ''
    setForm(f => ({ ...f, fund_type: value, fee_schedule_id: defaultScheduleId }))
  }

  function selectLead(lead: Lead) {
    setForm(f => ({
      ...f,
      lead_investor_id: lead.id,
      fund_type:        lead.fund_type || 'syndicate',
      fee_schedule_id:  f.fee_schedule_id || lead.fee_schedule_id || '',
    }))
    setLeadSearch(lead.full_name)
    setLeadDropOpen(false)
  }

  const filteredLeads = leads.filter(l =>
    l.full_name.toLowerCase().includes(leadSearch.toLowerCase())
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const base = {
      full_name:       form.full_name.trim(),
      fee_schedule_id: form.fee_schedule_id || null,
      entity_type:     null,
    }

    const payload: Record<string, unknown> = isLinked
      ? {
          ...base,
          lead_investor_id:       form.lead_investor_id,
          vehicle_type:           form.vehicle_type,
          nominee_id:             form.vehicle_type === 'nominee' ? form.nominee_id || null : null,
          fund_type:              form.fund_type,
          report_delivery_method: 'email',
        }
      : {
          ...base,
          email:                  form.email.trim() || null,
          phone:                  form.phone.trim() || null,
          address_line1:          form.address_line1.trim() || null,
          address_line2:          form.address_line2.trim() || null,
          city:                   form.city.trim() || null,
          postcode:               form.postcode.trim() || null,
          fund_type:              form.fund_type,
          report_delivery_method: form.report_delivery_method,
          report_delivery_email:  form.email.trim() || null,
          lead_investor_id:       null,
          vehicle_type:           null,
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

    await supabase.from('internal_updates').insert({
      client_id:   data.id,
      update_type: 'client',
      description: `New client added: ${form.full_name.trim()}`,
    })

    router.push(`/clients/${data.id}`)
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <Breadcrumb items={[{ label: 'Clients', href: '/clients' }, { label: 'New client' }]} />
      <h1 style={{ fontSize: 17, fontWeight: 500, marginBottom: 24 }}>Add client</h1>

      <form onSubmit={handleSubmit}>

        {/* Client type selector */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Client type
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { value: false, label: 'Primary client' },
              { value: true,  label: 'Linked entity' },
            ].map(opt => (
              <label
                key={String(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  padding: '8px 14px', borderRadius: 6, fontSize: 12,
                  border: `0.5px solid ${isLinked === opt.value ? '#0f2744' : '#e0e0d8'}`,
                  fontWeight: isLinked === opt.value ? 600 : 400,
                  background: isLinked === opt.value ? '#f0f3f7' : '#fff',
                }}
              >
                <input
                  type="radio"
                  name="client_type"
                  checked={isLinked === opt.value}
                  onChange={() => switchMode(opt.value)}
                  style={{ margin: 0 }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Details card */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Details
          </div>

          <Field label="Full name" required>
            <input
              type="text"
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              required
              placeholder={isLinked ? "e.g. Barry O'Brien Family Trust" : "e.g. Barry O'Brien"}
              style={inputStyle}
            />
          </Field>

          {!isLinked && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="barry@example.com"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="+44 7700 000000"
                    style={inputStyle}
                  />
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Fund type" required>
                  <select
                    value={form.fund_type}
                    onChange={e => handleFundTypeChange(e.target.value)}
                    required
                    style={inputStyle}
                  >
                    {fundTypes.length > 0
                      ? fundTypes.map(ft => (
                          <option key={ft.id} value={ft.code}>{ft.name}</option>
                        ))
                      : (
                        <>
                          <option value="syndicate">Syndicate</option>
                          <option value="multi_manager">Multi Manager</option>
                          <option value="eis_fund">EIS Fund</option>
                        </>
                      )}
                  </select>
                </Field>
                <Field label="Fee schedule">
                  <select
                    value={form.fee_schedule_id}
                    onChange={e => set('fee_schedule_id', e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">None</option>
                    {feeSchedules.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Report delivery method" required>
                <select
                  value={form.report_delivery_method}
                  onChange={e => set('report_delivery_method', e.target.value)}
                  required
                  style={inputStyle}
                >
                  <option value="email">Email</option>
                  <option value="download_only">Download only</option>
                </select>
              </Field>
            </>
          )}

          {isLinked && (
            <>
              <Field label="Vehicle type" required>
                <select
                  value={form.vehicle_type}
                  onChange={e => handleVehicleTypeChange(e.target.value)}
                  required
                  style={inputStyle}
                >
                  <option value="">Select vehicle type…</option>
                  <option value="nominee">Nominee</option>
                  <option value="corporate">Corporate vehicle</option>
                  <option value="trust">Trust</option>
                  <option value="estate">Estate</option>
                  <option value="pension">Pension</option>
                </select>
              </Field>

              {form.vehicle_type === 'nominee' && (
                <Field label="Nominee" required>
                  <select
                    value={form.nominee_id}
                    onChange={e => set('nominee_id', e.target.value)}
                    required
                    style={inputStyle}
                  >
                    <option value="">Select nominee…</option>
                    {nominees.map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Lead investor" required>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={leadSearch}
                    onChange={e => { setLeadSearch(e.target.value); setLeadDropOpen(true); if (!e.target.value) set('lead_investor_id', '') }}
                    onFocus={() => setLeadDropOpen(true)}
                    onBlur={() => setTimeout(() => setLeadDropOpen(false), 150)}
                    placeholder="Search clients…"
                    required={!form.lead_investor_id}
                    style={inputStyle}
                  />
                  {/* Hidden input to enforce required validation */}
                  <input type="text" value={form.lead_investor_id} required readOnly style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} tabIndex={-1} />
                  {leadDropOpen && filteredLeads.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '0.5px solid #e0e0d8', borderRadius: 5, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                      {filteredLeads.slice(0, 25).map(l => (
                        <button
                          key={l.id}
                          type="button"
                          onMouseDown={() => selectLead(l)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {l.full_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Fee schedule">
                <select
                  value={form.fee_schedule_id}
                  onChange={e => set('fee_schedule_id', e.target.value)}
                  style={inputStyle}
                >
                  <option value="">None (inherit from lead)</option>
                  {feeSchedules.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
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
