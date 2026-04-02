'use client'

import { useState, useRef } from 'react'
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
  bespoke?: boolean
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
  { type: 'application_form',        name: 'Application form',            signingRequired: true  },
  { type: 'investment_agreement',    name: 'Investment agreement',         signingRequired: true  },
  { type: 'transaction_statement',   name: 'Transaction statement',        signingRequired: false },
  { type: 'eis_certificate',         name: 'EIS certificate',              signingRequired: false },
  { type: 'side_letter',             name: 'Side letter',                  signingRequired: true  },
  { type: 'kyc',                     name: 'KYC form',                     signingRequired: true  },
  { type: 'share_subscription',      name: 'Share subscription agreement', signingRequired: true  },
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
        const done   = i < current
        const active = i === current
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
  initialDealType,
}: {
  companies: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  initialDealType?: string
}) {
  const companies = companiesRaw as unknown as Company[]
  const clients   = clientsRaw  as unknown as Client[]
  const router    = useRouter()

  const [step, setStep]     = useState(0)
  const [dealId, setDealId] = useState<string | null>(null)
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  // ── Step 1 state ──
  const [dealType,       setDealType]       = useState(initialDealType ?? 'kyc')
  const [companyId,      setCompanyId]      = useState('')
  const [shareClass,     setShareClass]     = useState('')
  const [amount,         setAmount]         = useState('')
  const [sharePrice,     setSharePrice]     = useState('')
  const [investmentDate, setInvestmentDate] = useState(new Date().toISOString().slice(0, 10))
  const [eisQualifying,  setEisQualifying]  = useState<'yes' | 'no' | 'tbc'>('tbc')
  const [investors,      setInvestors]      = useState<DealInvestor[]>([])
  const [clientSearch,   setClientSearch]   = useState('')

  const [checklist, setChecklist] = useState({
    signed_application:    true,
    signed_agreement:      true,
    share_certificate:     true,
    eis_certificate:       false,
    transaction_statement: true,
  })

  // ── Step 2 state ──
  const [documents, setDocuments] = useState<Document[]>([
    { id: 'app',  name: 'Application form',     type: 'application_form',     signingRequired: true  },
    { id: 'agr',  name: 'Investment agreement',  type: 'investment_agreement',  signingRequired: true  },
    { id: 'stmt', name: 'Transaction statement', type: 'transaction_statement', signingRequired: false },
  ])
  const [reminderDays, setReminderDays] = useState('3')
  const [signingOrder, setSigningOrder] = useState<'sequential' | 'parallel'>('parallel')

  // ── Step 3 state ──
  const [emailSubject, setEmailSubject] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [sentDate,     setSentDate]     = useState<string | null>(null)

  // ── Step 4 invoice state ──
  const [showInvoiceCard,    setShowInvoiceCard]    = useState(false)
  const [invoiceInvestorIdx, setInvoiceInvestorIdx] = useState(0)
  const [invoiceFeeRate,     setInvoiceFeeRate]     = useState('')
  const [invoicesSaved,      setInvoicesSaved]      = useState<string[]>([])

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

  const isInvestmentDeal = dealType === 'new_investment' || dealType === 'follow_on'

  function addInvestor(client: Client) {
    setInvestors(prev => [...prev, {
      clientId: client.id,
      name:     client.full_name,
      email:    client.email ?? '',
      feeRate:  client.default_fee_rate,
      poaHeld:  false,
    }])
    setClientSearch('')
  }

  function removeInvestor(clientId: string) {
    setInvestors(prev => prev.filter(i => i.clientId !== clientId))
  }

  function addDocTemplate(tpl: typeof DOC_TEMPLATES[0]) {
    if (documents.find(d => d.type === tpl.type)) return
    setDocuments(prev => [...prev, { id: tpl.type, ...tpl }])
  }

  function removeDoc(id: string) {
    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  // ── Create deal in DB at end of step 1 ──
  async function createDeal(): Promise<string | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: deal, error: insertError } = await supabase
      .from('deals')
      .insert({
        deal_type:          dealType,
        company_id:         companyId || null,
        share_class:        shareClass || null,
        investment_amount:  parseFloat(amount) || null,
        share_price:        sharePrice ? parseFloat(sharePrice) : null,
        shares_calculated:  sharesCalc ? parseFloat(sharesCalc) : null,
        investment_date:    investmentDate,
        eis_qualifying:     eisQualifying,
        status:             'draft',
        completion_checklist: {
          signed_application:    checklist.signed_application,
          signed_agreement:      checklist.signed_agreement,
          share_certificate:     checklist.share_certificate,
          eis_certificate:       checklist.eis_certificate,
          transaction_statement: checklist.transaction_statement,
        },
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()

    if (insertError || !deal) return null

    if (investors.length > 0) {
      await supabase.from('deal_investors').insert(
        investors.map(inv => ({
          deal_id:        deal.id,
          client_id:      inv.clientId,
          amount:         parseFloat(amount) || null,
          poa_held:       inv.poaHeld,
          signing_status: 'pending',
        }))
      )
    }

    await supabase.from('internal_updates').insert({
      company_id:   companyId || null,
      update_type:  'deal',
      description:  `Deal created: ${DEAL_TYPES.find(t => t.value === dealType)?.label} — ${selectedCompany?.name ?? ''}`,
      created_by:   user?.id ?? null,
    })

    return deal.id
  }

  // ── Save invoice ──
  async function saveInvoice(inv: DealInvestor, feeRate: number, dId: string) {
    const supabase = createClient()
    const investmentAmount = parseFloat(amount) || 0
    await supabase.from('invoices').insert({
      deal_id:           dId,
      client_id:         inv.clientId,
      company_id:        companyId || null,
      investment_amount: investmentAmount,
      fee_percentage:    feeRate,
      fee_amount:        investmentAmount * (feeRate / 100),
      vat_amount:        0,
      status:            'draft',
    })
    setInvoicesSaved(prev => [...prev, inv.clientId])
  }

  // ── Step handlers ──
  async function handleStep1Next() {
    if (!dealType) return
    if (isInvestmentDeal && !companyId) {
      setError('Please select a company'); return
    }
    setError('')

    if (dealId) {
      setStep(1); return
    }

    setSaving(true)
    const id = await createDeal()
    if (!id) { setError('Failed to create deal'); setSaving(false); return }
    setDealId(id)
    setSaving(false)
    setStep(1)
  }

  function handleStep2Next() {
    if (!emailSubject && selectedCompany) {
      setEmailSubject(`${selectedCompany.name} — documents for your review`)
    }
    setStep(2)
  }

  async function handleSend() {
    if (!dealId) return
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('deals').update({ status: 'sent' }).eq('id', dealId)

    if (isInvestmentDeal) {
      for (const inv of investors) {
        await supabase.from('investments').insert({
          client_id:            inv.clientId,
          company_id:           companyId,
          share_class:          shareClass,
          investment_date:      investmentDate,
          original_share_price: parseFloat(sharePrice) || 0,
          shares_purchased:     parseFloat(sharesCalc ?? '0') || 0,
          sum_subscribed:       parseFloat(amount) || 0,
          eis_status:           eisQualifying,
          holding_location:     'direct',
          status:               'pending',
        })
      }
    }

    await supabase.from('internal_updates').insert({
      company_id:  companyId || null,
      update_type: 'deal',
      description: `Documents sent: ${selectedCompany?.name ?? ''} — ${investors.map(i => i.name).join(', ')}`,
      created_by:  user?.id ?? null,
    })

    const today = new Date().toISOString().slice(0, 10)
    setSentDate(today)
    setSaving(false)
    setStep(3)

    if (isInvestmentDeal && investors.length > 0) {
      setInvoiceInvestorIdx(0)
      setInvoiceFeeRate(String(investors[0].feeRate || 5))
      setShowInvoiceCard(true)
    }
  }

  async function handleInvoiceConfirm() {
    if (!dealId) return
    const supabase = createClient()
    await saveInvoice(investors[invoiceInvestorIdx], parseFloat(invoiceFeeRate), dealId)
    await supabase.from('internal_updates').insert({
      company_id:  companyId || null,
      update_type: 'invoice',
      description: `Invoice generated: ${investors[invoiceInvestorIdx].name} — ${formatCurrency(parseFloat(amount) * (parseFloat(invoiceFeeRate) / 100))}`,
      created_by:  null,
    })
    const next = invoiceInvestorIdx + 1
    if (next < investors.length) {
      setInvoiceInvestorIdx(next)
      setInvoiceFeeRate(String(investors[next].feeRate || 5))
    } else {
      setShowInvoiceCard(false)
    }
  }

  // ── Render ──
  const wideLayout = step >= 1 && step <= 3

  return (
    <div style={{ maxWidth: wideLayout ? 960 : 720 }}>
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
                <span style={{ fontSize: 10, fontWeight: 400, color: '#888', marginLeft: 8 }}>Select what&apos;s required for this deal</span>
              </div>
              {[
                { key: 'signed_application',   label: 'Signed application form'     },
                { key: 'signed_agreement',      label: 'Signed investment agreement' },
                { key: 'share_certificate',     label: 'Share certificate'           },
                { key: 'eis_certificate',       label: 'EIS certificate'             },
                { key: 'transaction_statement', label: 'Transaction statement'       },
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
            <button className="btn btn-primary" onClick={handleStep1Next} disabled={saving} style={{ padding: '8px 20px' }}>
              {saving ? 'Saving…' : 'Next: Documents →'}
            </button>
            <Link href="/deals" className="btn btn-secondary">Cancel</Link>
          </div>
        </div>
      )}

      {/* ── STEP 2: Documents ── */}
      {step === 1 && (
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
              <button className="btn btn-secondary" onClick={() => setStep(0)}>← Back</button>
              <button className="btn btn-primary" onClick={handleStep2Next} style={{ padding: '8px 20px' }}>
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
      )}

      {/* ── STEP 3: Send for signature ── */}
      {step === 2 && (
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
                    <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }}>Preview</button>
                    <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setStep(1)}>Edit</button>
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
              <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button
                className="btn btn-primary"
                onClick={handleSend}
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
      )}

      {/* ── STEP 4: Track signatures ── */}
      {step === 3 && dealId && (
        <TrackStep
          dealId={dealId}
          investors={investors}
          documents={documents}
          sentDate={sentDate}
          companyId={companyId}
          companyName={selectedCompany?.name ?? ''}
          amount={amount}
          isInvestmentDeal={isInvestmentDeal}
          showInvoiceCard={showInvoiceCard}
          invoiceInvestorIdx={invoiceInvestorIdx}
          invoiceFeeRate={invoiceFeeRate}
          invoicesSaved={invoicesSaved}
          onInvoiceRateChange={setInvoiceFeeRate}
          onInvoiceConfirm={handleInvoiceConfirm}
          onInvoiceSkip={() => {
            const next = invoiceInvestorIdx + 1
            if (next < investors.length) {
              setInvoiceInvestorIdx(next)
              setInvoiceFeeRate(String(investors[next].feeRate || 5))
            } else {
              setShowInvoiceCard(false)
            }
          }}
          onNext={() => setStep(4)}
        />
      )}

      {/* ── STEP 5: Completion ── */}
      {step === 4 && dealId && (
        <CompleteStep
          dealId={dealId}
          investors={investors}
          checklist={checklist}
          companyId={companyId}
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
  dealId, investors, documents, sentDate,
  companyId, companyName, amount, isInvestmentDeal,
  showInvoiceCard, invoiceInvestorIdx, invoiceFeeRate, invoicesSaved,
  onInvoiceRateChange, onInvoiceConfirm, onInvoiceSkip, onNext,
}: {
  dealId: string
  investors: DealInvestor[]
  documents: Document[]
  sentDate: string | null
  companyId: string
  companyName: string
  amount: string
  isInvestmentDeal: boolean
  showInvoiceCard: boolean
  invoiceInvestorIdx: number
  invoiceFeeRate: string
  invoicesSaved: string[]
  onInvoiceRateChange: (v: string) => void
  onInvoiceConfirm: () => void
  onInvoiceSkip: () => void
  onNext: () => void
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const inv of investors) {
      for (const doc of documents) {
        if (doc.signingRequired) init[`${inv.clientId}::${doc.id}`] = 'pending'
      }
    }
    return init
  })

  const signingDocs = documents.filter(d => d.signingRequired)
  const allSigned = signingDocs.length > 0 && Object.values(statuses).every(s => s === 'signed' || s === 'not_required')
  const anySigned = Object.values(statuses).some(s => s === 'signed')

  const statusPill = (s: string) => {
    if (s === 'signed')        return <span className="pill pill-green"  style={{ fontSize: 10 }}>Signed</span>
    if (s === 'reviewed')      return <span className="pill pill-blue"   style={{ fontSize: 10 }}>Reviewed</span>
    if (s === 'not_required')  return <span className="pill pill-grey"   style={{ fontSize: 10 }}>N/A</span>
    return                            <span className="pill pill-amber"  style={{ fontSize: 10 }}>Pending</span>
  }

  const currentInvoiceInvestor = investors[invoiceInvestorIdx]
  const investmentAmount = parseFloat(amount) || 0
  const feeAmount = invoiceFeeRate ? investmentAmount * (parseFloat(invoiceFeeRate) / 100) : 0

  return (
    <div>
      {/* Sent confirmation */}
      <div style={{
        background: '#f0faf5', border: '0.5px solid #a8dfc5',
        borderRadius: 8, padding: '12px 16px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>✓</span>
        <div style={{ fontSize: 12, color: '#0f5c38' }}>
          Documents sent{sentDate ? ` on ${sentDate}` : ''}. Investment added to portfolio as pending.
        </div>
      </div>

      {/* Invoice card */}
      {showInvoiceCard && currentInvoiceInvestor && !invoicesSaved.includes(currentInvoiceInvestor.clientId) && (
        <div className="card" style={{ marginBottom: 16, border: '0.5px solid #d0d0c8' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 10, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Generate invoice — {currentInvoiceInvestor.name}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Fee rate (%)</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={invoiceFeeRate}
                onChange={e => onInvoiceRateChange(e.target.value)}
                style={{ ...{ width: '100%', padding: '7px 10px', border: '0.5px solid #d0d0c8', borderRadius: 5, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, background: '#fff' } }}
              />
            </div>
            <div style={{ fontSize: 12, color: '#555', paddingBottom: 8 }}>
              Fee: <strong>{formatCurrency(feeAmount)}</strong>
              <span style={{ color: '#888', marginLeft: 8 }}>VAT exempt · due immediately</span>
            </div>
            <div style={{ display: 'flex', gap: 6, paddingBottom: 6 }}>
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={onInvoiceConfirm}>
                Generate &amp; push to Xero
              </button>
              <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={onInvoiceSkip}>
                Do this later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suggested next step */}
      {anySigned && !allSigned && (
        <div style={{
          background: '#f0f7ff', border: '0.5px solid #c0d8f0',
          borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>Suggested next step</div>
            <div style={{ fontSize: 11, color: '#555' }}>An investor has reviewed — consider countersigning now</div>
          </div>
          <button className="btn btn-primary" style={{ marginLeft: 'auto', fontSize: 11 }}>Sign now</button>
        </div>
      )}

      {/* Signature tracking — per document */}
      {signingDocs.map(doc => (
        <div key={doc.id} className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '10px 16px', background: '#f9f9f7',
            borderBottom: '0.5px solid #e8e7e0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0f2744' }}>{doc.name}</span>
            {sentDate && <span style={{ fontSize: 11, color: '#888' }}>Sent {sentDate}</span>}
          </div>
          <table>
            <thead>
              <tr>
                <th>Investor</th>
                <th style={{ width: 100 }}>Method</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {investors.map(inv => {
                const key = `${inv.clientId}::${doc.id}`
                const status = statuses[key] ?? 'pending'
                return (
                  <tr key={inv.clientId}>
                    <td style={{ fontWeight: 500, fontSize: 12 }}>{inv.name}</td>
                    <td style={{ fontSize: 11, color: '#888' }}>
                      {inv.poaHeld ? 'POA — Juno signs' : 'Electronic'}
                    </td>
                    <td>
                      <select
                        value={status}
                        onChange={e => setStatuses(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{
                          padding: '3px 6px', border: '0.5px solid #d0d0c8',
                          borderRadius: 4, fontSize: 11, outline: 'none', background: '#fff',
                        }}
                      >
                        <option value="pending">Pending</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="signed">Signed</option>
                        <option value="not_required">Not required</option>
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }}>
                          Send reminder
                        </button>
                        {inv.poaHeld && (
                          <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }}>
                            Sign now
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ marginTop: 20 }}>
        <button
          className="btn btn-primary"
          onClick={onNext}
          style={{ padding: '8px 20px' }}
        >
          View completion checklist →
        </button>
      </div>
    </div>
  )
}

// ─── Step 5: Complete ─────────────────────────────────────────────────────────

function CompleteStep({
  dealId, investors, checklist, companyId, companyName, eisQualifying, onDone,
}: {
  dealId: string
  investors: DealInvestor[]
  checklist: Record<string, boolean>
  companyId: string
  companyName: string
  eisQualifying: string
  onDone: () => void
}) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({
    signed_application:    false,
    signed_agreement:      false,
    share_certificate:     false,
    eis_certificate:       false,
    transaction_statement: false,
  })
  const [uploading, setUploading] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const CHECKLIST_LABELS: Record<string, string> = {
    signed_application:    'Signed application form',
    signed_agreement:      'Signed investment agreement',
    share_certificate:     'Share certificate',
    eis_certificate:       'EIS certificate',
    transaction_statement: 'Transaction statement',
  }

  // Include EIS only if qualifying
  const requiredItems = Object.entries(checklist)
    .filter(([key, required]) => {
      if (!required) return false
      if (key === 'eis_certificate' && eisQualifying === 'no') return false
      return true
    })

  const allTicked = requiredItems.every(([key]) => ticked[key])

  async function handleGenerate(key: string) {
    const supabase = createClient()
    await supabase.from('internal_updates').insert({
      company_id:  companyId || null,
      update_type: 'document',
      description: `Generated: ${CHECKLIST_LABELS[key]} — ${companyName}`,
      created_by:  null,
    })
    setTicked(prev => ({ ...prev, [key]: true }))
  }

  async function handleUpload(key: string, file: File) {
    setUploading(key)
    const supabase = createClient()

    const companySlug  = companyName.toLowerCase().replace(/\s+/g, '-')
    const investorName = investors[0]?.name ?? 'unknown'
    const investorSlug = investorName.toLowerCase().replace(/\s+/g, '-')
    const path = `${companySlug}/${investorSlug}/${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: true })

    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
      await supabase.from('documents').insert({
        deal_id:       dealId,
        filename:      file.name,
        type:          key as 'share_certificate',
        storage_url:   publicUrl,
        document_date: new Date().toISOString().slice(0, 10),
      })
      setTicked(prev => ({ ...prev, [key]: true }))
    }

    setUploading(null)
  }

  async function markComplete() {
    setCompleting(true)
    const supabase = createClient()

    await supabase.from('deals').update({ status: 'complete', updated_at: new Date().toISOString() }).eq('id', dealId)

    for (const inv of investors) {
      await supabase
        .from('investments')
        .update({ status: 'active' })
        .eq('client_id', inv.clientId)
        .eq('status', 'pending')
    }

    await supabase.from('internal_updates').insert({
      company_id:  companyId || null,
      update_type: 'deal',
      description: `Deal completed: ${companyName}`,
      created_by:  null,
    })

    setCompleting(false)
    onDone()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
      {/* Left: checklist */}
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Completion checklist
          </div>

          {requiredItems.map(([key]) => {
            const done  = ticked[key]
            const isEis = key === 'eis_certificate'
            const isStmt = key === 'transaction_statement'
            const canUpload = key === 'share_certificate' || isEis || key === 'signed_application' || key === 'signed_agreement'

            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: '0.5px solid #f0f0ec',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Status icon */}
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: done ? '#1d9e75' : isEis && !done ? 'transparent' : '#e8e7e0',
                    border: isEis && !done ? '1.5px dashed #ba7517' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {done && <span style={{ fontSize: 11, color: '#fff', fontWeight: 700 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{
                      fontSize: 12, fontWeight: done ? 400 : 500,
                      color: done ? '#888' : '#333',
                      textDecoration: done ? 'line-through' : 'none',
                    }}>
                      {CHECKLIST_LABELS[key]}
                    </div>
                    {isEis && !done && (
                      <div style={{ fontSize: 10, color: '#ba7517', marginTop: 2 }}>Awaiting HMRC (typically 3–6 months)</div>
                    )}
                  </div>
                </div>

                {!done && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {done ? (
                      <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 10px' }}>View</button>
                    ) : null}
                    {isStmt && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 10, padding: '3px 10px' }}
                        onClick={() => handleGenerate(key)}
                      >
                        Generate
                      </button>
                    )}
                    {canUpload && (
                      <>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 10, padding: '3px 10px' }}
                          disabled={uploading === key}
                          onClick={() => fileInputRefs.current[key]?.click()}
                        >
                          {uploading === key ? 'Uploading…' : 'Upload'}
                        </button>
                        <input
                          ref={el => { fileInputRefs.current[key] = el }}
                          type="file"
                          style={{ display: 'none' }}
                          accept=".pdf,.doc,.docx"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) handleUpload(key, file)
                          }}
                        />
                      </>
                    )}
                  </div>
                )}

                {done && (
                  <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 10px' }}>View</button>
                )}
              </div>
            )
          })}
        </div>

        {allTicked && (
          <div style={{
            background: '#f0faf5', border: '0.5px solid #a8dfc5',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            fontSize: 12, color: '#0f5c38',
          }}>
            All required items complete. Mark the deal as complete to activate the investment.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={markComplete}
            disabled={!allTicked || completing}
            style={{ padding: '8px 24px', opacity: allTicked ? 1 : 0.5 }}
          >
            {completing ? 'Completing…' : 'Mark deal complete ✓'}
          </button>
          <button className="btn btn-secondary" onClick={onDone}>
            Save &amp; finish later
          </button>
        </div>
        {!allTicked && (
          <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
            Complete all required items to mark the deal as complete.
          </p>
        )}
      </div>

      {/* Right: deal summary + OneDrive preview */}
      <div>
        <div className="card" style={{ background: '#f9f9f7', fontSize: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deal summary</div>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
            <dt style={{ color: '#888' }}>Company</dt>
            <dd style={{ margin: 0, fontWeight: 500 }}>{companyName || '—'}</dd>
            <dt style={{ color: '#888' }}>Investors</dt>
            <dd style={{ margin: 0 }}>{investors.map(i => i.name).join(', ') || '—'}</dd>
            <dt style={{ color: '#888' }}>Status</dt>
            <dd style={{ margin: 0 }}><span className="pill pill-amber" style={{ fontSize: 10 }}>Completing</span></dd>
          </dl>
        </div>

        <div className="card" style={{ background: '#f9f9f7', fontSize: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>OneDrive filing</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Documents will be filed at:</div>
          {investors.slice(0, 2).map(inv => (
            <div key={inv.clientId} style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', marginBottom: 4, wordBreak: 'break-all' }}>
              Deals / {companyName} / {inv.name} /
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
