'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DealInvestor {
  id: string
  amount: number | null
  signing_status: string
  poa_held: boolean
  clients: { id: string; full_name: string; email: string | null } | null
}

interface Deal {
  id: string
  deal_type: string
  status: string
  created_at: string
  investment_amount: number | null
  share_price: number | null
  share_class: string | null
  completion_checklist: Record<string, boolean> | null
  companies: { id: string; name: string } | null
  deal_investors: DealInvestor[]
}

interface Document {
  id: string
  filename: string
  type: string
  storage_url: string | null
  document_date: string | null
}

interface Invoice {
  id: string
  client_id: string
  amount: number
  status: string
  issued_at: string
  clients: { full_name: string } | null
}

// ─── Config ───────────────────────────────────────────────────────────────────

const DEAL_TYPE_LABELS: Record<string, string> = {
  new_investment: 'New investment',
  follow_on:      'Follow-on',
  exit:           'Exit',
  kyc:            'KYC / Onboarding',
  side_letter:    'Side letter',
  membership:     'Membership',
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:            { label: 'Draft',            cls: 'pill-grey'  },
  sent:             { label: 'Sent',              cls: 'pill-blue'  },
  partially_signed: { label: 'Partially signed',  cls: 'pill-amber' },
  fully_signed:     { label: 'Fully signed',       cls: 'pill-teal'  },
  complete:         { label: 'Complete',           cls: 'pill-green' },
}

const SIGNING_OPTIONS = ['not_sent', 'sent', 'viewed', 'signed', 'declined']
const SIGNING_LABELS: Record<string, string> = {
  not_sent: 'Not sent',
  sent:     'Sent',
  viewed:   'Viewed',
  signed:   'Signed',
  declined: 'Declined',
}

const COMPLETION_ITEMS = [
  { key: 'funds_received',       label: 'Funds received' },
  { key: 'shares_issued',        label: 'Shares issued / register updated' },
  { key: 'statement_sent',       label: 'Transaction statement sent' },
  { key: 'eis_applied',          label: 'EIS / SEIS applied for' },
  { key: 'eis_certificate_sent', label: 'EIS certificate sent to investors' },
  { key: 'invoice_raised',       label: 'Invoice raised' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DealDetail({
  deal: dealRaw,
  documents: documentsRaw,
  invoices: invoicesRaw,
}: {
  deal: Record<string, unknown>
  documents: Record<string, unknown>[]
  invoices: Record<string, unknown>[]
}) {
  const deal = dealRaw as unknown as Deal
  const documents = documentsRaw as unknown as Document[]
  const invoices = invoicesRaw as unknown as Invoice[]

  const router = useRouter()
  const supabase = createClient()

  const [signingStatuses, setSigningStatuses] = useState<Record<string, string>>(
    () => Object.fromEntries((deal.deal_investors ?? []).map(di => [di.id, di.signing_status ?? 'not_sent']))
  )
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    () => deal.completion_checklist ?? {}
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'invoices'>('overview')

  const status = STATUS_CONFIG[deal.status] ?? { label: deal.status, cls: 'pill-grey' }
  const investors = deal.deal_investors ?? []

  // Derived status from signing
  function deriveStatus(): string {
    if (deal.status === 'complete') return 'complete'
    const statuses = investors.map(di => signingStatuses[di.id] ?? di.signing_status)
    const allSigned = statuses.length > 0 && statuses.every(s => s === 'signed')
    const anySigned = statuses.some(s => s === 'signed')
    if (allSigned) return 'fully_signed'
    if (anySigned) return 'partially_signed'
    const anySent = statuses.some(s => ['sent', 'viewed'].includes(s))
    if (anySent) return 'sent'
    return deal.status
  }

  async function saveSigningStatuses() {
    setSaving(true)
    const derived = deriveStatus()
    // Update each deal_investor
    for (const [diId, status] of Object.entries(signingStatuses)) {
      await supabase.from('deal_investors').update({ signing_status: status }).eq('id', diId)
    }
    // Update deal status
    await supabase.from('deals').update({ status: derived }).eq('id', deal.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function saveChecklist() {
    setSaving(true)
    await supabase.from('deals').update({
      completion_checklist: checklist,
    }).eq('id', deal.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function markComplete() {
    setCompleting(true)
    const companyId = deal.companies?.id
    // Mark pending investments active — filter by client + company since there's no deal_id on investments
    for (const di of investors) {
      if (di.clients?.id) {
        let q = supabase.from('investments')
          .update({ status: 'active' })
          .eq('client_id', di.clients.id)
          .eq('status', 'pending')
        if (companyId) q = q.eq('company_id', companyId)
        await q
      }
    }
    await supabase.from('deals').update({
      status: 'complete',
      completion_checklist: checklist,
      updated_at: new Date().toISOString(),
    }).eq('id', deal.id)
    setCompleting(false)
    router.refresh()
  }

  const checklistDone = COMPLETION_ITEMS.filter(i => checklist[i.key]).length
  const allChecklistDone = checklistDone === COMPLETION_ITEMS.length

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
            <Link href="/deals" style={{ color: '#aaa', textDecoration: 'none' }}>Deals</Link>
            {' / '}
            {deal.companies?.name ?? 'No company'}
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            {DEAL_TYPE_LABELS[deal.deal_type] ?? deal.deal_type}
            {deal.companies && (
              <span style={{ fontWeight: 400, color: '#555' }}> — {deal.companies.name}</span>
            )}
          </h1>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`pill ${status.cls}`}>{status.label}</span>
            <span style={{ fontSize: 12, color: '#aaa' }}>Started {formatDate(deal.created_at)}</span>
          </div>
        </div>
        {deal.status !== 'complete' && (
          <button
            className="btn btn-primary"
            onClick={markComplete}
            disabled={completing || !allChecklistDone}
            title={!allChecklistDone ? 'Complete all checklist items first' : undefined}
          >
            {completing ? 'Completing…' : 'Mark complete'}
          </button>
        )}
        {deal.status === 'complete' && (
          <span className="pill pill-green">✓ Completed</span>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Investors</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{investors.length}</div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total amount</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
            {deal.investment_amount ? formatCurrency(deal.investment_amount) : '—'}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Share class</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{deal.share_class ?? '—'}</div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Price / share</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>
            {deal.share_price ? formatCurrency(deal.share_price) : '—'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e8e8e4', marginBottom: 20 }}>
        {(['overview', 'documents', 'invoices'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid #0f2744' : '2px solid transparent',
              color: activeTab === tab ? '#0f2744' : '#888',
              textTransform: 'capitalize',
            }}
          >
            {tab}{tab === 'documents' && documents.length > 0 ? ` (${documents.length})` : ''}
            {tab === 'invoices' && invoices.length > 0 ? ` (${invoices.length})` : ''}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Signature tracking */}
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Signature tracking</div>
            {investors.length === 0 ? (
              <p style={{ fontSize: 12, color: '#888' }}>No investors added</p>
            ) : (
              <>
                <table style={{ marginBottom: 14 }}>
                  <thead>
                    <tr>
                      <th>Investor</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investors.map(di => (
                      <tr key={di.id}>
                        <td style={{ fontSize: 12 }}>
                          <div style={{ fontWeight: 500 }}>{di.clients?.full_name ?? '—'}</div>
                          {di.poa_held && (
                            <div style={{ fontSize: 10, color: '#888' }}>POA held</div>
                          )}
                        </td>
                        <td style={{ fontSize: 12 }}>{di.amount ? formatCurrency(di.amount) : '—'}</td>
                        <td>
                          {deal.status === 'complete' ? (
                            <span className="pill pill-green" style={{ fontSize: 10 }}>Signed</span>
                          ) : (
                            <select
                              value={signingStatuses[di.id] ?? 'not_sent'}
                              onChange={e => setSigningStatuses(prev => ({ ...prev, [di.id]: e.target.value }))}
                              style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '4px 6px' }}
                            >
                              {SIGNING_OPTIONS.map(o => (
                                <option key={o} value={o}>{SIGNING_LABELS[o]}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Suggested next step */}
                <SuggestedNextStep investors={investors} statuses={signingStatuses} />

                {deal.status !== 'complete' && (
                  <button
                    className="btn btn-primary"
                    onClick={saveSigningStatuses}
                    disabled={saving}
                    style={{ fontSize: 12, padding: '6px 14px' }}
                  >
                    {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save status'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Completion checklist */}
          <div>
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Completion checklist</div>
                <div style={{ fontSize: 11, color: '#888' }}>{checklistDone} / {COMPLETION_ITEMS.length}</div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 4, background: '#f0f0ec', borderRadius: 2, marginBottom: 14, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: '#1d9e75',
                  width: `${(checklistDone / COMPLETION_ITEMS.length) * 100}%`,
                  transition: 'width 0.2s',
                }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {COMPLETION_ITEMS.map(item => (
                  <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={checklist[item.key] ?? false}
                      onChange={e => setChecklist(prev => ({ ...prev, [item.key]: e.target.checked }))}
                      disabled={deal.status === 'complete'}
                      style={{ accentColor: '#1d9e75' }}
                    />
                    <span style={{
                      textDecoration: checklist[item.key] ? 'line-through' : 'none',
                      color: checklist[item.key] ? '#aaa' : '#333',
                    }}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
              {deal.status !== 'complete' && (
                <button
                  className="btn"
                  onClick={saveChecklist}
                  disabled={saving}
                  style={{ marginTop: 14, fontSize: 12, padding: '6px 14px' }}
                >
                  {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Documents tab */}
      {activeTab === 'documents' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {documents.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 13 }}>
              No documents uploaded yet
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{doc.filename}</td>
                    <td style={{ fontSize: 11, color: '#888' }}>{doc.type.replace(/_/g, ' ')}</td>
                    <td style={{ fontSize: 11, color: '#888' }}>{doc.document_date ? formatDate(doc.document_date) : '—'}</td>
                    <td>
                      {doc.storage_url ? (
                        <a href={doc.storage_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: '#185fa5', textDecoration: 'none' }}>
                          View
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Invoices tab */}
      {activeTab === 'invoices' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {invoices.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 13 }}>
              No invoices raised for this deal
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Issued</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>
                      {inv.clients?.full_name ?? '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{formatCurrency(inv.amount)}</td>
                    <td>
                      <InvoiceStatusPill status={inv.status} />
                    </td>
                    <td style={{ fontSize: 11, color: '#888' }}>{formatDate(inv.issued_at)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 600, fontSize: 12 }}>Total</td>
                  <td style={{ fontWeight: 600, fontSize: 12 }}>
                    {formatCurrency(invoices.reduce((s, i) => s + Number(i.amount), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SuggestedNextStep({
  investors,
  statuses,
}: {
  investors: DealInvestor[]
  statuses: Record<string, string>
}) {
  const statusValues = investors.map(di => statuses[di.id] ?? di.signing_status ?? 'not_sent')
  const allSigned   = statusValues.every(s => s === 'signed')
  const noneSent    = statusValues.every(s => s === 'not_sent')
  const anyDeclined = statusValues.some(s => s === 'declined')
  const unsignedInvestors = investors.filter(di => {
    const s = statuses[di.id] ?? di.signing_status
    return s !== 'signed'
  })

  if (allSigned || investors.length === 0) return null

  let message = ''
  if (noneSent) {
    message = 'Documents not yet sent — send to all investors to proceed.'
  } else if (anyDeclined) {
    const names = investors
      .filter(di => statuses[di.id] === 'declined')
      .map(di => di.clients?.full_name ?? 'Unknown')
      .join(', ')
    message = `${names} declined — follow up or re-send documents.`
  } else if (unsignedInvestors.length > 0) {
    const names = unsignedInvestors
      .slice(0, 2)
      .map(di => di.clients?.full_name ?? 'Unknown')
      .join(', ')
    const more = unsignedInvestors.length > 2 ? ` +${unsignedInvestors.length - 2} more` : ''
    message = `Awaiting signatures from: ${names}${more}.`
  }

  if (!message) return null

  return (
    <div style={{
      background: '#fffbf0', border: '0.5px solid #f5d87a', borderRadius: 6,
      padding: '8px 12px', fontSize: 11, color: '#7a5a00', marginBottom: 12,
    }}>
      <strong>Next step:</strong> {message}
    </div>
  )
}

function InvoiceStatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    draft:     { label: 'Draft',    cls: 'pill-grey'  },
    sent:      { label: 'Sent',     cls: 'pill-blue'  },
    paid:      { label: 'Paid',     cls: 'pill-green' },
    overdue:   { label: 'Overdue',  cls: 'pill-red'   },
    cancelled: { label: 'Cancelled', cls: 'pill-grey' },
  }
  const c = config[status] ?? { label: status, cls: 'pill-grey' }
  return <span className={`pill ${c.cls}`}>{c.label}</span>
}
