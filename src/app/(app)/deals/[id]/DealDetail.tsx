'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPrice, formatDate } from '@/lib/utils'
import type { DealInvestor, InvestorData, CompletionChecklist } from './dealDetailTypes'
import { SignatureTracking } from './SignatureTracking'
import { CompletionChecklist as CompletionChecklistComponent } from './CompletionChecklist'
import { GenericChecklist } from './GenericChecklist'

// ─── Types ────────────────────────────────────────────────────────────────────

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

const BUY_ITEMS = [
  { key: 'app_form_received', label: 'App form received' },
  { key: 'agreement_signed',  label: 'Agreement signed' },
  { key: 'cash_received',     label: 'Cash received' },
]
const SALE_ITEMS = [
  { key: 'poa_confirmed',         label: 'PoA confirmed' },
  { key: 'bank_details_received', label: 'Bank details received' },
]
const GENERIC_ITEMS = [
  { key: 'funds_received',       label: 'Funds received' },
  { key: 'shares_issued',        label: 'Shares issued / register updated' },
  { key: 'statement_sent',       label: 'Transaction statement sent' },
  { key: 'eis_applied',          label: 'EIS / SEIS applied for' },
  { key: 'eis_certificate_sent', label: 'EIS certificate sent to investors' },
  { key: 'invoice_raised',       label: 'Invoice raised' },
]

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

  const isBuyDeal       = deal.deal_type === 'new_investment' || deal.deal_type === 'follow_on'
  const isSaleDeal      = deal.deal_type === 'full_exit' || deal.deal_type === 'partial_exit'
  const isNewDealFormat = !!(deal.completion_checklist?.investor_data)

  const perInvestorItems = isBuyDeal ? BUY_ITEMS : isSaleDeal ? SALE_ITEMS : []

  const [signingStatuses, setSigningStatuses] = useState<Record<string, string>>(
    () => Object.fromEntries((deal.deal_investors ?? []).map(di => [di.id, di.signing_status ?? 'not_sent']))
  )

  const [perInvestor, setPerInvestor] = useState<Record<string, Record<string, boolean>>>(
    () => (deal.completion_checklist?.per_investor as Record<string, Record<string, boolean>>) ?? {}
  )

  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    const cc = deal.completion_checklist
    if (!cc) return {}
    const result: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(cc)) {
      if (k !== 'investor_data' && k !== 'per_investor' && typeof v === 'boolean') {
        result[k] = v
      }
    }
    return result
  })

  const [saving,          setSaving]          = useState(false)
  const [saved,           setSaved]           = useState(false)
  const [completing,      setCompleting]      = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [activeTab,       setActiveTab]       = useState<'overview' | 'documents' | 'invoices'>('overview')

  const status    = STATUS_CONFIG[deal.status] ?? { label: deal.status, cls: 'pill-grey' }
  const investors = deal.deal_investors ?? []

  const investorData = (deal.completion_checklist?.investor_data ?? {}) as Record<string, InvestorData>

  const allPerInvestorDone = useCallback(() => {
    if (perInvestorItems.length === 0) {
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
              onClick={() => setConfirmComplete(true)}
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
          <SignatureTracking
            investors={investors}
            dealStatus={deal.status}
            signingStatuses={signingStatuses}
            setSigningStatuses={setSigningStatuses}
            saving={saving}
            saved={saved}
            onSave={saveSigningStatuses}
          />

          {(isBuyDeal || isSaleDeal) && investors.length > 0 && (
            <CompletionChecklistComponent
              investors={investors}
              isBuyDeal={isBuyDeal}
              isSaleDeal={isSaleDeal}
              isNewDealFormat={isNewDealFormat}
              investorData={investorData}
              perInvestor={perInvestor}
              perInvestorItems={perInvestorItems}
              onSetInvestorItem={setInvestorItem}
              dealStatus={deal.status}
              saving={saving}
              saved={saved}
              canComplete={canComplete}
              onSave={saveChecklist}
            />
          )}

          {!isBuyDeal && !isSaleDeal && (
            <GenericChecklist
              items={GENERIC_ITEMS}
              checklist={checklist}
              setChecklist={setChecklist}
              dealStatus={deal.status}
              saving={saving}
              saved={saved}
              onSave={saveChecklist}
            />
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

      {/* Mark complete confirmation modal */}
      {confirmComplete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 400, padding: '28px 24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', margin: '0 0 8px' }}>
              Mark this deal as complete?
            </h2>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 6px' }}>
              {isBuyDeal
                ? 'This will activate all pending investments for the investors in this deal.'
                : isSaleDeal
                ? 'This will process the exit and update all investor holdings accordingly.'
                : 'This will mark the deal as complete.'}
            </p>
            <p style={{ fontSize: 11, color: '#a32d2d', margin: '0 0 24px' }}>
              This action cannot be easily undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmComplete(false)}
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmComplete(false); markComplete() }}
                className="btn btn-primary"
                style={{ fontSize: 12 }}
                disabled={completing}
              >
                Mark complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── File-local sub-components ────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function InvoiceStatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    draft:     { label: 'Draft',      cls: 'pill-grey'  },
    sent:      { label: 'Sent',       cls: 'pill-blue'  },
    paid:      { label: 'Paid',       cls: 'pill-green' },
    overdue:   { label: 'Overdue',    cls: 'pill-red'   },
    cancelled: { label: 'Cancelled',  cls: 'pill-grey'  },
  }
  const c = config[status] ?? { label: status, cls: 'pill-grey' }
  return <span className={`pill ${c.cls}`}>{c.label}</span>
}
