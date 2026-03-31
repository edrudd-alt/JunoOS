'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string
  name: string
  share_classes: { name: string; type: string }[] | null
}

interface Client {
  id: string
  full_name: string
  email: string | null
  default_fee_rate: number
  lead_investor_id: string | null
}

interface DealInvestor {
  clientId: string
  name: string
  email: string
  feeRate: number
  poaHeld: boolean
}

interface Document {
  id: string
  name: string
  type: string
  signingRequired: boolean
}

const DEAL_TYPES = [
  { value: 'new_investment', label: 'New investment' },
  { value: 'follow_on',      label: 'Follow-on investment' },
  { value: 'exit',           label: 'Exit / sale of shares' },
  { value: 'kyc',            label: 'KYC / Onboarding' },
  { value: 'side_letter',    label: 'Side letter' },
  { value: 'membership',     label: 'Membership joining' },
]

const DOC_TEMPLATES = [
  { type: 'application_form',        name: 'Application form',          signingRequired: true  },
  { type: 'investment_agreement',    name: 'Investment agreement',       signingRequired: true  },
  { type: 'transaction_statement',   name: 'Transaction statement',      signingRequired: false },
  { type: 'eis_certificate',         name: 'EIS certificate',            signingRequired: false },
  { type: 'side_letter',             name: 'Side letter',                signingRequired: true  },
  { type: 'kyc',                     name: 'KYC form',                   signingRequired: true  },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4,
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>
        {label}{required && <span style={{ color: '#a32d2d' }}> *</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Deal setup', 'Documents', 'Send', 'Track', 'Complete']

function StepBar({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {STEPS.map((label, i) => {
        const done    = i < current
        const active  = i === current
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: done ? '#1d9e75' : active ? '#0f2744' : '#e8e7e0',
                color: done || active ? '#fff' : '#aaa',
                fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? '#0f2744' : done ? '#1d9e75' : '#aaa',
              }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 32, height: 1, background: '#e8e7e0', margin: '0 8px' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function NewDealWizard({
  companies: companiesRaw,
  clients: clientsRaw,
}: {
  companies: Record<string, unknown>[]
  clients: Record<string, unknown>[]
}) {
  const companies = companiesRaw as unknown as Company[]
  const clients   = clientsRaw  as unknown as Client[]
  const router    = useRouter()

  const [step, setStep]     = useState(0)
  const [dealId, setDealId] = useState<string | null>(null)
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  // ── Step 1 state ──
  const [dealType,       setDealType]       = useState('new_investment')
  const [companyId,      setCompanyId]      = useState('')
  const [shareClass,     setShareClass]     = useState('')
  const [amount,         setAmount]         = useState('')
  const [sharePrice,     setSharePrice]     = useState('')
  const [investmentDate, setInvestmentDate] = useState(new Date().toISOString().slice(0, 10))
  const [eisQualifying,  setEisQualifying]  = useState<'yes' | 'no' | 'tbc'>('tbc')
  const [investors,      setInvestors]      = useState<DealInvestor[]>([])
  const [clientSearch,   setClientSearch]   = useState('')

  const [checklist, setChecklist] = useState({
    signed_application:  true,
    signed_agreement:    true,
    share_certificate:   true,
    eis_certificate:     false,
    transaction_statement: true,
  })

  // ── Step 2 state ──
  const [documents, setDocuments] = useState<Document[]>([
    { id: 'app',  name: 'Application form',    type: 'application_form',     signingRequired: true  },
    { id: 'agr',  name: 'Investment agreement', type: 'investment_agreement',  signingRequired: true  },
    { id: 'stmt', name: 'Transaction statement',type: 'transaction_statement', signingRequired: false },
  ])
  const [reminderDays, setReminderDays] = useState('3')

  // ── Step 3 state ──
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false)
  const [invoiceInvestorIdx, setInvoiceInvestorIdx] = useState(0)
  const [invoiceFeeRate, setInvoiceFeeRate] = useState('')
  const [invoicesSaved, setInvoicesSaved] = useState<string[]>([])

  // ── Derived ──
  const selectedCompany = companies.find(c => c.id === companyId)
  const shareClasses: { name: string }[] = Array.isArray(selectedCompany?.share_classes)
    ? selectedCompany!.share_classes as { name: string }[]
    : []

  const sharesCalc = amount && sharePrice
    ? (parseFloat(amount) / parseFloat(sharePrice)).toFixed(0)
    : null

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) &&
    !investors.find(i => i.clientId === c.id)
  )

  function addInvestor(client: Client) {
    setInvestors(prev => [...prev, {
      clientId:  client.id,
      name:      client.full_name,
      email:     client.email ?? '',
      feeRate:   client.default_fee_rate,
      poaHeld:   false,
    }])
    setClientSearch('')
  }

  function removeInvestor(clientId: string) {
    setInvestors(prev => prev.filter(i => i.clientId !== clientId))
  }

  function toggleDoc(id: string) {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, signingRequired: !d.signingRequired } : d))
  }

  function addDocTemplate(tpl: typeof DOC_TEMPLATES[0]) {
    if (documents.find(d => d.type === tpl.type)) return
    setDocuments(prev => [...prev, { id: tpl.type, ...tpl }])
  }

  function removeDoc(id: string) {
    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  // ── Save deal to DB ──
  async function saveDeal(): Promise<string | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const completionChecklist = {
      signed_application:    checklist.signed_application,
      signed_agreement:      checklist.signed_agreement,
      share_certificate:     checklist.share_certificate,
      eis_certificate:       checklist.eis_certificate,
      transaction_statement: checklist.transaction_statement,
    }

    const totalAmount = investors.reduce((s, i) => {
      const a = parseFloat(amount)
      return s + (isNaN(a) ? 0 : a)
    }, 0) || parseFloat(amount) || null

    const { data: deal, error } = await supabase
      .from('deals')
      .insert({
        deal_type: dealType,
        company_id: companyId || null,
        share_class: shareClass || null,
        investment_amount: totalAmount,
        share_price: sharePrice ? parseFloat(sharePrice) : null,
        shares_calculated: sharesCalc ? parseFloat(sharesCalc) : null,
        investment_date: investmentDate,
        eis_qualifying: eisQualifying,
        status: 'sent',
        completion_checklist: completionChecklist,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()

    if (error || !deal) return null

    // Insert deal investors
    if (investors.length > 0) {
      await supabase.from('deal_investors').insert(
        investors.map(inv => ({
          deal_id: deal.id,
          client_id: inv.clientId,
          amount: parseFloat(amount) || null,
          poa_held: inv.poaHeld,
          signing_status: 'pending',
        }))
      )
    }

    // Add investments as pending
    if (dealType === 'new_investment' || dealType === 'follow_on') {
      for (const inv of investors) {
        await supabase.from('investments').insert({
          client_id: inv.clientId,
          company_id: companyId,
          share_class: shareClass,
          investment_date: investmentDate,
          original_share_price: parseFloat(sharePrice) || 0,
          shares_purchased: parseFloat(sharesCalc ?? '0') || 0,
          sum_subscribed: parseFloat(amount) || 0,
          eis_status: eisQualifying,
          holding_location: 'direct',
          status: 'pending',
        })
      }
    }

    // Log activity
    await supabase.from('internal_updates').insert({
      company_id: companyId || null,
      update_type: 'deal',
      description: `Deal started: ${DEAL_TYPES.find(t => t.value === dealType)?.label} — ${selectedCompany?.name ?? ''}`,
      created_by: user?.id ?? null,
    })

    return deal.id
  }

  // ── Save invoices ──
  async function saveInvoice(inv: DealInvestor, feeRate: number, dId: string) {
    const supabase = createClient()
    const investmentAmount = parseFloat(amount) || 0
    const feeAmount = investmentAmount * (feeRate / 100)

    await supabase.from('invoices').insert({
      deal_id: dId,
      client_id: inv.clientId,
      company_id: companyId || null,
      investment_amount: investmentAmount,
      fee_percentage: feeRate,
      fee_amount: feeAmount,
      vat_amount: 0,
      status: 'draft',
    })

    setInvoicesSaved(prev => [...prev, inv.clientId])
  }

  // ── Step handlers ──
  async function handleStep1Next() {
    if (!dealType) return
    if ((dealType === 'new_investment' || dealType === 'follow_on') && !companyId) {
      setError('Please select a company'); return
    }
    setError('')
    setStep(1)
  }

  async function handleStep2Next() {
    setStep(2)
  }

  async function handleSend() {
    setSaving(true)
    setError('')
    const id = await saveDeal()
    if (!id) { setError('Failed to save deal'); setSaving(false); return }
    setDealId(id)
    setSaving(false)
    // Show invoice prompt for first investor if investment deal
    if ((dealType === 'new_investment' || dealType === 'follow_on') && investors.length > 0) {
      setInvoiceInvestorIdx(0)
      setInvoiceFeeRate(investors[0].feeRate.toString())
      setShowInvoicePrompt(true)
    } else {
      setStep(3)
    }
  }

  async function handleInvoiceConfirm() {
    if (!dealId) return
    await saveInvoice(investors[invoiceInvestorIdx], parseFloat(invoiceFeeRate), dealId)
    const next = invoiceInvestorIdx + 1
    if (next < investors.length) {
      setInvoiceInvestorIdx(next)
      setInvoiceFeeRate(investors[next].feeRate.toString())
    } else {
      setShowInvoicePrompt(false)
      setStep(3)
    }
  }

  const isInvestmentDeal = dealType === 'new_investment' || dealType === 'follow_on'

  // ── Render ──
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/deals" style={{ color: '#888', textDecoration: 'none' }}>Deals</Link>
        {' › '}New deal
      </div>
      <h1 style={{ fontSize: 17, fontWeight: 500, marginBottom: 24 }}>New deal</h1>
      <StepBar current={step} />

      {/* ── STEP 1: Deal setup ── */}
      {step === 0 && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
              Deal details
            </div>

            <Field label="Deal type" required>
              <select value={dealType} onChange={e => setDealType(e.target.value)} style={inputStyle}>
                {DEAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>

            {isInvestmentDeal && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Company" required>
                    <select value={companyId} onChange={e => { setCompanyId(e.target.value); setShareClass('') }} style={inputStyle}>
                      <option value="">Select company…</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Share class">
                    <select value={shareClass} onChange={e => setShareClass(e.target.value)} style={inputStyle} disabled={!companyId}>
                      <option value="">Select…</option>
                      {shareClasses.map(sc => <option key={sc.name} value={sc.name}>{sc.name}</option>)}
                      <option value="Ordinary">Ordinary</option>
                    </select>
                  </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <Field label="Investment amount (£)" required>
                    <input
                      type="number" min="0" step="0.01"
                      value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="50000" style={inputStyle}
                    />
                  </Field>
                  <Field label="Share price (£)" required>
                    <input
                      type="number" min="0" step="0.0001"
                      value={sharePrice} onChange={e => setSharePrice(e.target.value)}
                      placeholder="1.0000" style={inputStyle}
                    />
                  </Field>
                  <Field label="Shares" hint="Auto-calculated">
                    <input
                      type="text" readOnly
                      value={sharesCalc ? parseInt(sharesCalc).toLocaleString() : '—'}
                      style={{ ...inputStyle, background: '#f9f9f7', color: '#888' }}
                    />
                  </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Investment date">
                    <input type="date" value={investmentDate} onChange={e => setInvestmentDate(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="EIS qualifying">
                    <select value={eisQualifying} onChange={e => setEisQualifying(e.target.value as 'yes' | 'no' | 'tbc')} style={inputStyle}>
                      <option value="tbc">TBC</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </Field>
                </div>
              </>
            )}
          </div>

          {/* Investors */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
              Investors for this deal
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type="text"
                placeholder="Search and add investors…"
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                style={inputStyle}
              />
              {clientSearch && filteredClients.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  background: '#fff', border: '0.5px solid #d0d0c8',
                  borderRadius: 5, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  zIndex: 50, maxHeight: 200, overflowY: 'auto',
                }}>
                  {filteredClients.slice(0, 8).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addInvestor(c)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 12px', fontSize: 12, background: 'none',
                        border: 'none', cursor: 'pointer',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f2')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      {c.full_name}
                      {c.email && <span style={{ color: '#aaa', marginLeft: 8 }}>{c.email}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {investors.length === 0 ? (
              <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>No investors added yet</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Investor</th>
                    <th>Email</th>
                    <th style={{ width: 100 }}>POA held</th>
                    <th style={{ width: 80 }}>Fee rate</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {investors.map((inv, i) => (
                    <tr key={inv.clientId}>
                      <td style={{ fontWeight: 500 }}>{inv.name}</td>
                      <td style={{ color: '#888', fontSize: 11 }}>{inv.email || '—'}</td>
                      <td>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                          <input
                            type="checkbox"
                            checked={inv.poaHeld}
                            onChange={e => setInvestors(prev => prev.map((p, j) => j === i ? { ...p, poaHeld: e.target.checked } : p))}
                          />
                          {inv.poaHeld ? 'Yes' : 'No'}
                        </label>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12 }}>
                          <input
                            type="number" step="0.1" min="0" max="100"
                            value={inv.feeRate}
                            onChange={e => setInvestors(prev => prev.map((p, j) => j === i ? { ...p, feeRate: parseFloat(e.target.value) || 0 } : p))}
                            style={{ width: 50, padding: '4px 6px', border: '0.5px solid #d0d0c8', borderRadius: 4, fontSize: 12, outline: 'none' }}
                          />
                          <span style={{ color: '#888' }}>%</span>
                        </div>
                      </td>
                      <td>
                        <button type="button" onClick={() => removeInvestor(inv.clientId)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d', fontSize: 16 }}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Completion checklist */}
          {isInvestmentDeal && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
                Completion checklist
                <span style={{ fontSize: 10, fontWeight: 400, color: '#888', marginLeft: 8 }}>Select what's required for this deal</span>
              </div>
              {[
                { key: 'signed_application',    label: 'Signed application form'  },
                { key: 'signed_agreement',       label: 'Signed investment agreement' },
                { key: 'share_certificate',      label: 'Share certificate'        },
                { key: 'eis_certificate',        label: 'EIS certificate'          },
                { key: 'transaction_statement',  label: 'Transaction statement'    },
              ].map(item => (
                <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={checklist[item.key as keyof typeof checklist]}
                    onChange={e => setChecklist(prev => ({ ...prev, [item.key]: e.target.checked }))}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          )}

          {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleStep1Next} style={{ padding: '8px 20px' }}>
              Next: Documents →
            </button>
            <Link href="/deals" className="btn btn-secondary">Cancel</Link>
          </div>
        </div>
      )}

      {/* ── STEP 2: Documents ── */}
      {step === 1 && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
              Documents for this deal
            </div>

            <table style={{ marginBottom: 14 }}>
              <thead>
                <tr>
                  <th>Document</th>
                  <th style={{ width: 120 }}>Type</th>
                  <th style={{ width: 120 }}>Signature required</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 500 }}>{doc.name}</td>
                    <td><span className="pill pill-grey" style={{ fontSize: 10 }}>{doc.type.replace(/_/g, ' ')}</span></td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                        <input type="checkbox" checked={doc.signingRequired} onChange={() => toggleDoc(doc.id)} />
                        {doc.signingRequired ? 'Yes' : 'No'}
                      </label>
                    </td>
                    <td>
                      <button type="button" onClick={() => removeDoc(doc.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d', fontSize: 16 }}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Add from templates */}
            <div style={{ fontSize: 11, fontWeight: 500, color: '#888', marginBottom: 6 }}>Add document</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DOC_TEMPLATES.filter(t => !documents.find(d => d.type === t.type)).map(tpl => (
                <button
                  key={tpl.type}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => addDocTemplate(tpl)}
                  style={{ fontSize: 11 }}
                >
                  + {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Naming convention preview */}
          {investors.length > 0 && selectedCompany && (
            <div className="card" style={{ marginBottom: 16, background: '#f9f9f7' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#888', marginBottom: 6 }}>Document naming convention</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#555' }}>
                {investmentDate} — {investors[0].name} — {selectedCompany.name} — Application Form.pdf
              </div>
            </div>
          )}

          {/* Signature settings */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
              Signature settings
            </div>
            <Field label="Send reminder if not signed after (days)">
              <input
                type="number" min="1" max="30"
                value={reminderDays} onChange={e => setReminderDays(e.target.value)}
                style={{ ...inputStyle, maxWidth: 100 }}
              />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(0)}>← Back</button>
            <button className="btn btn-primary" onClick={handleStep2Next} style={{ padding: '8px 20px' }}>
              Next: Review & send →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Send ── */}
      {step === 2 && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
              Summary
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 0', fontSize: 12 }}>
              <dt style={{ color: '#888' }}>Deal type</dt>
              <dd style={{ margin: 0, fontWeight: 500 }}>{DEAL_TYPES.find(t => t.value === dealType)?.label}</dd>
              {selectedCompany && <>
                <dt style={{ color: '#888' }}>Company</dt>
                <dd style={{ margin: 0 }}>{selectedCompany.name}</dd>
              </>}
              {isInvestmentDeal && <>
                {amount && <><dt style={{ color: '#888' }}>Amount</dt><dd style={{ margin: 0 }}>{formatCurrency(parseFloat(amount))}</dd></>}
                {sharePrice && <><dt style={{ color: '#888' }}>Share price</dt><dd style={{ margin: 0 }}>£{parseFloat(sharePrice).toFixed(4)}</dd></>}
                {sharesCalc && <><dt style={{ color: '#888' }}>Shares</dt><dd style={{ margin: 0 }}>{parseInt(sharesCalc).toLocaleString()}</dd></>}
                <dt style={{ color: '#888' }}>EIS qualifying</dt>
                <dd style={{ margin: 0 }}>{eisQualifying === 'yes' ? 'Yes' : eisQualifying === 'no' ? 'No' : 'TBC'}</dd>
              </>}
              <dt style={{ color: '#888' }}>Investors</dt>
              <dd style={{ margin: 0 }}>{investors.map(i => i.name).join(', ') || '—'}</dd>
              <dt style={{ color: '#888' }}>Documents</dt>
              <dd style={{ margin: 0 }}>{documents.length} document{documents.length !== 1 ? 's' : ''}, {documents.filter(d => d.signingRequired).length} requiring signature</dd>
            </dl>
          </div>

          {investors.map(inv => (
            <div key={inv.clientId} className="card" style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{inv.name}</div>
              <div style={{ fontSize: 11, color: '#888' }}>
                Send to: {inv.email || 'No email on file'}
                {inv.poaHeld && <span className="pill pill-blue" style={{ fontSize: 10, marginLeft: 8 }}>POA held — Juno signs</span>}
              </div>
            </div>
          ))}

          {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={saving}
              style={{ padding: '8px 24px' }}
            >
              {saving ? 'Saving…' : `Send to ${investors.length || 1} investor${investors.length !== 1 ? 's' : ''} →`}
            </button>
          </div>
        </div>
      )}

      {/* ── Invoice prompt modal ── */}
      {showInvoicePrompt && investors[invoiceInvestorIdx] && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div className="card" style={{ width: 420, padding: '24px 28px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Generate invoice?</h2>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 20px' }}>
              {investors[invoiceInvestorIdx].name} — {selectedCompany?.name}
            </p>
            <Field label="Fee rate (%)">
              <input
                type="number" step="0.1" min="0" max="100"
                value={invoiceFeeRate}
                onChange={e => setInvoiceFeeRate(e.target.value)}
                style={inputStyle}
              />
            </Field>
            {amount && invoiceFeeRate && (
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
                Fee: {formatCurrency(parseFloat(amount) * (parseFloat(invoiceFeeRate) / 100))} · VAT: exempt · Due immediately
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleInvoiceConfirm}>Generate invoice</button>
              <button className="btn btn-secondary" onClick={() => {
                const next = invoiceInvestorIdx + 1
                if (next < investors.length) { setInvoiceInvestorIdx(next); setInvoiceFeeRate(investors[next].feeRate.toString()) }
                else { setShowInvoicePrompt(false); setStep(3) }
              }}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: Track signatures ── */}
      {step === 3 && dealId && (
        <TrackStep
          dealId={dealId}
          investors={investors}
          documents={documents}
          onNext={() => setStep(4)}
        />
      )}

      {/* ── STEP 5: Completion ── */}
      {step === 4 && dealId && (
        <CompleteStep
          dealId={dealId}
          investors={investors}
          checklist={checklist}
          companyName={selectedCompany?.name ?? ''}
          eisQualifying={eisQualifying}
          onDone={() => router.push(`/deals/${dealId}`)}
        />
      )}
    </div>
  )
}

// ─── Step 4: Track ────────────────────────────────────────────────────────────

function TrackStep({
  dealId, investors, documents, onNext,
}: {
  dealId: string
  investors: DealInvestor[]
  documents: Document[]
  onNext: () => void
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const inv of investors) {
      for (const doc of documents) {
        init[`${inv.clientId}::${doc.id}`] = 'pending'
      }
    }
    return init
  })

  const allSigned = Object.values(statuses).every(s => s === 'signed' || s === 'not_required')
  const anySigned = Object.values(statuses).some(s => s === 'signed')

  return (
    <div>
      {/* Suggested next step */}
      {anySigned && !allSigned && (
        <div style={{
          background: '#f0f7ff', border: '0.5px solid #c0d8f0',
          borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>Suggested next step</div>
            <div style={{ fontSize: 11, color: '#555' }}>An investor has reviewed — consider countersigning now</div>
          </div>
          <button className="btn btn-primary" style={{ marginLeft: 'auto', fontSize: 11 }}>Sign now</button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', fontSize: 12, fontWeight: 500 }}>
          Signature tracking
        </div>
        <table>
          <thead>
            <tr>
              <th>Investor</th>
              {documents.filter(d => d.signingRequired).map(doc => (
                <th key={doc.id}>{doc.name}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {investors.map(inv => (
              <tr key={inv.clientId}>
                <td style={{ fontWeight: 500 }}>{inv.name}</td>
                {documents.filter(d => d.signingRequired).map(doc => {
                  const key = `${inv.clientId}::${doc.id}`
                  const status = statuses[key] ?? 'pending'
                  return (
                    <td key={doc.id}>
                      <select
                        value={status}
                        onChange={e => setStatuses(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{
                          padding: '3px 6px', border: '0.5px solid #d0d0c8',
                          borderRadius: 4, fontSize: 11, outline: 'none',
                          background: '#fff',
                        }}
                      >
                        <option value="pending">Pending</option>
                        <option value="not_reviewed">Not yet reviewed</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="signed">Signed ✓</option>
                      </select>
                    </td>
                  )
                })}
                <td>
                  <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }}>
                    Send reminder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary"
          onClick={onNext}
          style={{ padding: '8px 20px' }}
        >
          {allSigned ? 'All signed — proceed to completion →' : 'Continue to completion →'}
        </button>
      </div>
    </div>
  )
}

// ─── Step 5: Complete ─────────────────────────────────────────────────────────

function CompleteStep({
  dealId, investors, checklist, companyName, eisQualifying, onDone,
}: {
  dealId: string
  investors: DealInvestor[]
  checklist: Record<string, boolean>
  companyName: string
  eisQualifying: string
  onDone: () => void
}) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({
    signed_application:   false,
    signed_agreement:     false,
    share_certificate:    false,
    eis_certificate:      false,
    transaction_statement: false,
  })

  async function markComplete() {
    const supabase = createClient()
    await supabase
      .from('deals')
      .update({ status: 'complete' })
      .eq('id', dealId)

    // Mark pending investments as active
    for (const inv of investors) {
      await supabase
        .from('investments')
        .update({ status: 'active' })
        .eq('client_id', inv.clientId)
        .eq('status', 'pending')
    }

    onDone()
  }

  const requiredItems = Object.entries(checklist).filter(([, required]) => required)
  const allTicked = requiredItems.every(([key]) => ticked[key])

  const CHECKLIST_LABELS: Record<string, string> = {
    signed_application:   'Signed application form',
    signed_agreement:     'Signed investment agreement',
    share_certificate:    'Share certificate',
    eis_certificate:      'EIS certificate',
    transaction_statement: 'Transaction statement',
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
          Completion checklist
        </div>

        {requiredItems.map(([key]) => {
          const done = ticked[key]
          const isEis = key === 'eis_certificate'
          const isStmt = key === 'transaction_statement'

          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: '0.5px solid #f0f0ec',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={done}
                  onChange={e => setTicked(prev => ({ ...prev, [key]: e.target.checked }))}
                />
                <span style={{ fontWeight: done ? 400 : 500, color: done ? '#888' : '#333', textDecoration: done ? 'line-through' : 'none' }}>
                  {CHECKLIST_LABELS[key]}
                </span>
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isEis && !done && (
                  <span style={{ fontSize: 11, color: '#ba7517' }}>Awaiting HMRC (3–6 months)</span>
                )}
                {isStmt && !done && (
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}>
                    Generate
                  </button>
                )}
                {(key === 'share_certificate' || isEis) && !done && (
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}>
                    Upload
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary"
          onClick={markComplete}
          disabled={!allTicked}
          style={{ padding: '8px 24px', opacity: allTicked ? 1 : 0.5 }}
        >
          Mark deal complete ✓
        </button>
        <button className="btn btn-secondary" onClick={onDone}>
          Save & finish later
        </button>
      </div>
      {!allTicked && (
        <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
          Tick all items to mark the deal complete, or save and finish later.
        </p>
      )}
    </div>
  )
}
