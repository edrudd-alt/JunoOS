'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPrice, formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DealInvestor {
  id: string
  amount: number | null
  signing_status: string
  poa_held: boolean
  clients: { id: string; full_name: string; email: string | null } | null
}

// Per-investor computed data stored in completion_checklist.investor_data
interface InvestorData {
  name: string
  shares?: number
  shareClass?: string
  eis?: string
  cost?: number
  feePayable?: number
  totalCost?: number
  currentShares?: number | null
  // Sale deal fields
  totalShares?: number
  sharesSold?: number
  remaining?: number
  avgCostPrice?: number
  grossProceeds?: number
  pnl?: number
  netProceeds?: number
}

interface CompletionChecklist {
  // New format
  investor_data?: Record<string, InvestorData>
  per_investor?: Record<string, Record<string, boolean>>
  // Legacy flat format (old deals / other deal types)
  [key: string]: unknown
}

interface Deal {
  id: string
  deal_type: string
  status: string
  created_at: string
  investment_amount: number | null
  share_price: number | null
  share_class: string | null
  completion_checklist: CompletionChecklist | null
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
  full_exit:      'Full exit',
  partial_exit:   'Partial exit',
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
  not_sent: 'Not sent', sent: 'Sent', viewed: 'Viewed', signed: 'Signed', declined: 'Declined',
}

// Per-investor checklist items by deal type
const BUY_ITEMS = [
  { key: 'app_form_received', label: 'App form received' },
  { key: 'agreement_signed',  label: 'Agreement signed' },
  { key: 'cash_received',     label: 'Cash received' },
]
const SALE_ITEMS = [
  { key: 'poa_confirmed',          label: 'PoA confirmed' },
  { key: 'bank_details_received',  label: 'Bank details received' },
]
// Generic items for other deal types (legacy / KYC / side letter / membership)
const GENERIC_ITEMS = [
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
  const deal      = dealRaw      as unknown as Deal
  const documents = documentsRaw as unknown as Document[]
  const invoices  = invoicesRaw  as unknown as Invoice[]

  const router   = useRouter()
  const supabase = createClient()

  const isBuyDeal  = deal.deal_type === 'new_investment' || deal.deal_type === 'follow_on'
  const isSaleDeal = deal.deal_type === 'full_exit' || deal.deal_type === 'partial_exit'
  const isNewDealFormat = !!(deal.completion_checklist?.investor_data)

  const perInvestorItems = isBuyDeal ? BUY_ITEMS : isSaleDeal ? SALE_ITEMS : []

  const [signingStatuses, setSigningStatuses] = useState<Record<string, string>>(
    () => Object.fromEntries((deal.deal_investors ?? []).map(di => [di.id, di.signing_status ?? 'not_sent']))
  )

  // Per-investor checklist state
  const [perInvestor, setPerInvestor] = useState<Record<string, Record<string, boolean>>>(
    () => (deal.completion_checklist?.per_investor as Record<string, Record<string, boolean>>) ?? {}
  )

  // Legacy / generic checklist
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    const cc = deal.completion_checklist
    if (!cc) return {}
    // Extract only flat boolean keys (ignore investor_data and per_investor)
    const result: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(cc)) {
      if (k !== 'investor_data' && k !== 'per_investor' && typeof v === 'boolean') {
        result[k] = v
      }
    }
    return result
  })

  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [completing, setCompleting] = useState(false)
  const [activeTab,  setActiveTab]  = useState<'overview' | 'documents' | 'invoices'>('overview')

  const status    = STATUS_CONFIG[deal.status] ?? { label: deal.status, cls: 'pill-grey' }
  const investors = deal.deal_investors ?? []

  const investorData = (deal.completion_checklist?.investor_data ?? {}) as Record<string, InvestorData>

  // Check if all per-investor items are done
  const allPerInvestorDone = useCallback(() => {
    if (perInvestorItems.length === 0) {
      // Generic checklist — all items must be checked
      return GENERIC_ITEMS.every(i => checklist[i.key])
    }
    for (const di of investors) {
      const clientId = di.clients?.id
      if (!clientId) continue
      for (const item of perInvestorItems) {
        if (!perInvestor[clientId]?.[item.key]) return false
      }
    }
    return investors.length > 0
  }, [perInvestorItems, perInvestor, investors, checklist])

  function setInvestorItem(clientId: string, itemKey: string, value: boolean) {
    setPerInvestor(prev => ({
      ...prev,
      [clientId]: { ...(prev[clientId] ?? {}), [itemKey]: value },
    }))
  }

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
    for (const [diId, st] of Object.entries(signingStatuses)) {
      await supabase.from('deal_investors').update({ signing_status: st }).eq('id', diId)
    }
    await supabase.from('deals').update({ status: derived }).eq('id', deal.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function saveChecklist() {
    setSaving(true)
    const updated = {
      ...deal.completion_checklist,
      per_investor: perInvestor,
      ...checklist,
    }
    await supabase.from('deals').update({ completion_checklist: updated }).eq('id', deal.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function markComplete() {
    setCompleting(true)
    const companyId = deal.companies?.id

    if (isBuyDeal) {
      // Activate pending investments
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
    } else if (isSaleDeal) {
      // Reduce or remove active investments
      for (const di of investors) {
        if (!di.clients?.id || !companyId) continue
        const iData = di.clients.id ? investorData[di.clients.id] : null
        if (!iData) continue

        const { data: activeInvs } = await supabase
          .from('investments')
          .select('id, shares_purchased')
          .eq('client_id', di.clients.id)
          .eq('company_id', companyId)
          .eq('status', 'active')

        if (!activeInvs?.length) continue

        // Deduct sold shares across their investments
        let sharesToDeduct = iData.sharesSold ?? 0
        for (const inv of activeInvs) {
          if (sharesToDeduct <= 0) break
          if (inv.shares_purchased <= sharesToDeduct) {
            await supabase.from('investments').update({ status: 'exited' }).eq('id', inv.id)
            sharesToDeduct -= inv.shares_purchased
          } else {
            await supabase.from('investments')
              .update({ shares_purchased: inv.shares_purchased - sharesToDeduct })
              .eq('id', inv.id)
            sharesToDeduct = 0
          }
        }
      }
    }

    const updated = {
      ...deal.completion_checklist,
      per_investor: perInvestor,
      ...checklist,
    }
    await supabase.from('deals').update({
      status: 'complete',
      completion_checklist: updated,
      updated_at: new Date().toISOString(),
    }).eq('id', deal.id)

    setCompleting(false)
    router.refresh()
  }

  const canComplete = allPerInvestorDone()

  return (
    <div style={{ maxWidth: 1100 }}>
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
        {deal.status !== 'complete' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {(isBuyDeal || isSaleDeal) && (
              <Link
                href={`/deals/${deal.id}/edit`}
                className="btn btn-secondary"
                style={{ fontSize: 13 }}
              >
                Edit investors
              </Link>
            )}
            <button
              className="btn btn-primary"
              onClick={markComplete}
              disabled={completing || !canComplete}
              title={!canComplete ? 'Complete all checklist items first' : undefined}
            >
              {completing ? 'Completing…' : 'Mark complete'}
            </button>
          </div>
        ) : (
          <span className="pill pill-green">✓ Completed</span>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <SummaryCard label="Investors" value={String(investors.length)} />
        <SummaryCard
          label={isSaleDeal ? 'Gross proceeds' : 'Total amount'}
          value={deal.investment_amount ? formatCurrency(deal.investment_amount) : '—'}
        />
        <SummaryCard label="Share class" value={deal.share_class ?? '—'} />
        <SummaryCard
          label={isSaleDeal ? 'Sale price' : 'Price / share'}
          value={deal.share_price ? formatPrice(deal.share_price) : '—'}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e8e8e4', marginBottom: 20 }}>
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
            {tab}
            {tab === 'documents' && documents.length > 0 ? ` (${documents.length})` : ''}
            {tab === 'invoices'  && invoices.length  > 0 ? ` (${invoices.length})`  : ''}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
                          {di.poa_held && <div style={{ fontSize: 10, color: '#888' }}>POA held</div>}
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

          {/* Per-investor completion checklist (buy/sale deals) */}
          {(isBuyDeal || isSaleDeal) && investors.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Completion checklist</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {perInvestorItems.map(i => i.label).join(' · ')}
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f9f9f7' }}>
                      <th style={thSt}>Investor</th>
                      {/* Investor data columns */}
                      {isBuyDeal && isNewDealFormat && <>
                        <th style={thSt}>Shares</th>
                        <th style={thSt}>Cost</th>
                        <th style={thSt}>EIS</th>
                      </>}
                      {isSaleDeal && isNewDealFormat && <>
                        <th style={thSt}>Shares sold</th>
                        <th style={thSt}>Gross proceeds</th>
                        <th style={thSt}>P&amp;L</th>
                        <th style={thSt}>Net proceeds</th>
                      </>}
                      {/* Checklist items */}
                      {perInvestorItems.map(item => (
                        <th key={item.key} style={{ ...thSt, textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {item.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {investors.map(di => {
                      const clientId = di.clients?.id ?? ''
                      const iData = clientId ? investorData[clientId] : null
                      const rowChecks = perInvestor[clientId] ?? {}
                      const allChecked = perInvestorItems.every(i => rowChecks[i.key])

                      return (
                        <tr key={di.id} style={{ background: allChecked ? '#f0faf6' : undefined }}>
                          <td style={tdSt}>
                            <div style={{ fontWeight: 500 }}>{di.clients?.full_name ?? '—'}</div>
                            {di.clients?.email && <div style={{ fontSize: 10, color: '#aaa' }}>{di.clients.email}</div>}
                          </td>

                          {/* Buy deal investor data */}
                          {isBuyDeal && isNewDealFormat && <>
                            <td style={tdSt}>{iData?.shares != null ? iData.shares.toLocaleString() : '—'}</td>
                            <td style={tdSt}>{iData?.cost != null ? formatCurrency(iData.cost) : '—'}</td>
                            <td style={tdSt}>
                              {iData?.eis ? (
                                <span style={{
                                  fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                                  background: iData.eis === 'yes' ? '#d1fae5' : iData.eis === 'no' ? '#fee2e2' : '#f5f5f2',
                                  color: iData.eis === 'yes' ? '#065f46' : iData.eis === 'no' ? '#991b1b' : '#555',
                                }}>
                                  {iData.eis.toUpperCase()}
                                </span>
                              ) : '—'}
                            </td>
                          </>}

                          {/* Sale deal investor data */}
                          {isSaleDeal && isNewDealFormat && <>
                            <td style={tdSt}>{iData?.sharesSold != null ? iData.sharesSold.toLocaleString() : '—'}</td>
                            <td style={tdSt}>{iData?.grossProceeds != null ? formatCurrency(iData.grossProceeds) : '—'}</td>
                            <td style={tdSt}>
                              {iData?.pnl != null ? (
                                <span style={{ color: iData.pnl >= 0 ? '#1d9e75' : '#a32d2d', fontWeight: 500 }}>
                                  {iData.pnl >= 0 ? '+' : ''}{formatCurrency(iData.pnl)}
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ ...tdSt, fontWeight: 500 }}>
                              {iData?.netProceeds != null ? formatCurrency(iData.netProceeds) : '—'}
                            </td>
                          </>}

                          {/* Checklist checkboxes */}
                          {perInvestorItems.map(item => (
                            <td key={item.key} style={{ ...tdSt, textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={rowChecks[item.key] ?? false}
                                onChange={e => setInvestorItem(clientId, item.key, e.target.checked)}
                                disabled={deal.status === 'complete'}
                                style={{ accentColor: '#1d9e75', width: 15, height: 15, cursor: 'pointer' }}
                              />
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {deal.status !== 'complete' && (
                <div style={{ padding: '10px 16px', borderTop: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    className="btn"
                    onClick={saveChecklist}
                    disabled={saving}
                    style={{ fontSize: 12, padding: '6px 14px' }}
                  >
                    {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
                  </button>
                  {!canComplete && (
                    <span style={{ fontSize: 11, color: '#888' }}>
                      Complete all items above to enable "Mark complete"
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Generic checklist (other deal types or legacy) */}
          {!isBuyDeal && !isSaleDeal && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Completion checklist</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {GENERIC_ITEMS.filter(i => checklist[i.key]).length} / {GENERIC_ITEMS.length}
                </div>
              </div>
              <div style={{ height: 4, background: '#f0f0ec', borderRadius: 2, marginBottom: 14, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: '#1d9e75',
                  width: `${(GENERIC_ITEMS.filter(i => checklist[i.key]).length / GENERIC_ITEMS.length) * 100}%`,
                  transition: 'width 0.2s',
                }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {GENERIC_ITEMS.map(item => (
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
          )}
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
                <tr><th>Name</th><th>Type</th><th>Uploaded</th><th></th></tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{doc.filename}</td>
                    <td style={{ fontSize: 11, color: '#888' }}>{doc.type.replace(/_/g, ' ')}</td>
                    <td style={{ fontSize: 11, color: '#888' }}>{doc.document_date ? formatDate(doc.document_date) : '—'}</td>
                    <td>
                      {doc.storage_url
                        ? <a href={doc.storage_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#185fa5', textDecoration: 'none' }}>View</a>
                        : '—'}
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
                <tr><th>Client</th><th>Amount</th><th>Status</th><th>Issued</th></tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{inv.clients?.full_name ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{formatCurrency(inv.amount)}</td>
                    <td><InvoiceStatusPill status={inv.status} /></td>
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function SuggestedNextStep({ investors, statuses }: { investors: DealInvestor[]; statuses: Record<string, string> }) {
  const statusValues   = investors.map(di => statuses[di.id] ?? di.signing_status ?? 'not_sent')
  const allSigned      = statusValues.every(s => s === 'signed')
  const noneSent       = statusValues.every(s => s === 'not_sent')
  const anyDeclined    = statusValues.some(s => s === 'declined')
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
    const names = unsignedInvestors.slice(0, 2).map(di => di.clients?.full_name ?? 'Unknown').join(', ')
    const more  = unsignedInvestors.length > 2 ? ` +${unsignedInvestors.length - 2} more` : ''
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
    draft: { label: 'Draft', cls: 'pill-grey' }, sent: { label: 'Sent', cls: 'pill-blue' },
    paid:  { label: 'Paid',  cls: 'pill-green' }, overdue: { label: 'Overdue', cls: 'pill-red' },
    cancelled: { label: 'Cancelled', cls: 'pill-grey' },
  }
  const c = config[status] ?? { label: status, cls: 'pill-grey' }
  return <span className={`pill ${c.cls}`}>{c.label}</span>
}

const thSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 500, color: '#888',
  textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e8e7e0',
}
const tdSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 12, borderBottom: '0.5px solid #f0f0ec', verticalAlign: 'middle',
}
