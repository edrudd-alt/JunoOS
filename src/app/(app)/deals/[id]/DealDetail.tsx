'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPrice, formatDate } from '@/lib/utils'
import type { DealInvestor, InvestorData, CompletionChecklist } from './dealDetailTypes'
import { SignatureTracking } from './SignatureTracking'
import { CompletionChecklist as CompletionChecklistComponent } from './CompletionChecklist'
import { GenericChecklist } from './GenericChecklist'
import { BookbuildSection } from './BookbuildSection'
import type { Bookbuild }   from './BookbuildSection'
import { PostDealTab }      from './PostDealTab'
import type { DealInvestmentRow } from './PostDealTab'
import { StepBar }     from '../new/buy/StepBar'
import { SellStepBar } from '../new/sell/SellStepBar'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Deal {
  id: string
  deal_type: string
  status: string
  created_at: string
  investment_amount: number | null
  share_price: number | null
  share_class: string | null
  share_class_id: string | null
  investment_date: string | null
  eis_qualifying: string | null
  completion_checklist: CompletionChecklist | null
  companies: { id: string; name: string } | null
  deal_investors: DealInvestor[]
}

export interface DealInfo {
  id:             string
  companyId:      string
  shareClassId:   string | null
  shareClass:     string | null
  sharePrice:     number | null
  investmentDate: string | null
  eisQualifying:  string | null
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
  { key: 'cash_received', label: 'Cash received'   },
  { key: 'docs_signed',   label: 'Documents signed' },
]

const EIS_ITEMS = [
  { key: 'eis_cert_received', label: 'EIS certificate received' },
  { key: 'eis_cert_sent',     label: 'EIS certificate sent to investor' },
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
  bookbuild: bookbuildRaw,
  allClients: allClientsRaw,
  dealInvestments: dealInvestmentsRaw,
}: {
  deal:            Record<string, unknown>
  documents:       Record<string, unknown>[]
  invoices:        Record<string, unknown>[]
  bookbuild:       Record<string, unknown> | null
  allClients:      Record<string, unknown>[]
  dealInvestments: Record<string, unknown>[]
}) {
  const deal            = dealRaw           as unknown as Deal
  const documents       = documentsRaw      as unknown as Document[]
  const invoices        = invoicesRaw       as unknown as Invoice[]
  const bookbuild       = bookbuildRaw      as unknown as Bookbuild | null
  const allClients      = allClientsRaw     as unknown as { id: string; full_name: string; email: string | null; default_fee_rate: number | null; fund_type: string | null }[]
  const dealInvestments = dealInvestmentsRaw as unknown as DealInvestmentRow[]

  const router   = useRouter()
  const supabase = createClient()

  const isBuyDeal       = deal.deal_type === 'new_investment' || deal.deal_type === 'follow_on'
  const isSaleDeal      = deal.deal_type === 'full_exit' || deal.deal_type === 'partial_exit'
  const isNewDealFormat = !!(deal.completion_checklist?.investor_data)

  // Map deal status to step bar index (steps 0–1 are wizard-only; step 2 = Bookbuild; DealDetail starts at step 2)
  const buyStepIndex = (() => {
    switch (deal.status) {
      case 'draft':            return 2
      case 'sent':             return 4
      case 'partially_signed': return 5
      case 'fully_signed':     return 6
      case 'complete':         return 7
      default:                 return 2
    }
  })()

  // Sell deal: steps 0–1 in SellDealWizard; DealDetail shows steps 2–8
  const sellStepIndex = (() => {
    switch (deal.status) {
      case 'draft':            return 2  // Consent
      case 'sent':             return 3  // PoA
      case 'partially_signed': return 4  // Bank details
      case 'fully_signed':     return 5  // Review
      case 'complete':         return 8  // Post-deal
      default:                 return 2
    }
  })()

  const perInvestorItems = isBuyDeal ? BUY_ITEMS : isSaleDeal ? SALE_ITEMS : []

  const [signingStatuses, setSigningStatuses] = useState<Record<string, string>>(
    () => Object.fromEntries((deal.deal_investors ?? []).map(di => [di.id, di.signing_status ?? 'not_sent']))
  )

  useEffect(() => {
    setSigningStatuses(prev => {
      const updated = { ...prev }
      for (const di of deal.deal_investors ?? []) {
        if (!(di.id in updated)) {
          updated[di.id] = di.signing_status ?? 'not_sent'
        }
      }
      return updated
    })
  }, [deal.deal_investors])

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

  const [saving,             setSaving]             = useState(false)
  const [saved,              setSaved]              = useState(false)
  const [completing,         setCompleting]         = useState(false)
  const [confirmComplete,    setConfirmComplete]    = useState(false)
  const [completingInvestor, setCompletingInvestor] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const [activeTab,          setActiveTab]          = useState<'overview' | 'documents' | 'invoices' | 'post_deal'>(() => {
    const tabParam            = searchParams.get('tab')
    const initialCompleted    = (deal.completion_checklist?.completed_investors as Record<string, string>) ?? {}
    const postDealAvailable   = Object.keys(initialCompleted).length > 0
    if (tabParam === 'post_deal' && postDealAvailable) return 'post_deal'
    return 'overview'
  })

  const [completedInvestors, setCompletedInvestors] = useState<Record<string, string>>(
    () => (deal.completion_checklist?.completed_investors as Record<string, string>) ?? {},
  )

  const status    = STATUS_CONFIG[deal.status] ?? { label: deal.status, cls: 'pill-grey' }
  const investors = deal.deal_investors ?? []

  const investorData = (deal.completion_checklist?.investor_data ?? {}) as Record<string, InvestorData>

  // Per-investor EIS check: show EIS columns if any buy deal investor is EIS qualifying
  const showEisItems = isBuyDeal && dealInvestments.some(inv =>
    inv.eis_status === 'yes' || inv.eis_status === 'tbc'
  )

  // Whether a given investor has all required checklist items ticked
  const clientToSigningStatus = new Map<string, string>(
    investors.map(di => [
      di.clients?.id ?? '',
      signingStatuses[di.id] ?? di.signing_status ?? 'not_sent',
    ])
  )

  function isInvestorDone(clientId: string): boolean {
    const checks    = perInvestor[clientId] ?? {}
    const appSigned = clientToSigningStatus.get(clientId) === 'signed'
    return appSigned && perInvestorItems.every(i => checks[i.key])
  }

  // Whether at least one investor has been individually completed
  const anyInvestorCompleted = investors.some(di => !!completedInvestors[di.clients?.id ?? ''])

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

  // Per-investor completion (buy deals)
  async function completeInvestor(clientId: string) {
    setCompletingInvestor(clientId)
    const companyId   = deal.companies?.id
    const today       = new Date().toISOString().split('T')[0]
    const bookbuildId = bookbuild?.id ?? null

    if (companyId) {
      await supabase.from('investments')
        .update({
          status:          'active',
          deal_id:         deal.id,
          completion_date: today,
          bookbuild_id:    bookbuildId,
        })
        .eq('client_id', clientId)
        .eq('company_id', companyId)
        .eq('status', 'pending')
    }

    const newCompleted = { ...completedInvestors, [clientId]: today }
    const allDone = investors.every(di => {
      const cid = di.clients?.id
      if (!cid) return false
      return !!newCompleted[cid]
    })

    const updated = {
      ...deal.completion_checklist,
      per_investor:        perInvestor,
      completed_investors: newCompleted,
    }
    await supabase.from('deals').update({
      completion_checklist: updated,
      ...(allDone ? { status: 'complete', updated_at: new Date().toISOString() } : {}),
    }).eq('id', deal.id)

    setCompletedInvestors(newCompleted)
    setCompletingInvestor(null)
    router.refresh()
  }

  // Bulk completion fallback — completes all remaining uncompleted investors (buy deals)
  async function markAllComplete() {
    setCompleting(true)
    const companyId   = deal.companies?.id
    const today       = new Date().toISOString().split('T')[0]
    const bookbuildId = bookbuild?.id ?? null

    const newCompleted = { ...completedInvestors }

    for (const di of investors) {
      const clientId = di.clients?.id
      if (!clientId || newCompleted[clientId]) continue
      if (companyId) {
        await supabase.from('investments')
          .update({
            status:          'active',
            deal_id:         deal.id,
            completion_date: today,
            bookbuild_id:    bookbuildId,
          })
          .eq('client_id', clientId)
          .eq('company_id', companyId)
          .eq('status', 'pending')
      }
      newCompleted[clientId] = today
    }

    const updated = {
      ...deal.completion_checklist,
      per_investor:        perInvestor,
      completed_investors: newCompleted,
    }
    await supabase.from('deals').update({
      status:               'complete',
      completion_checklist: updated,
      updated_at:           new Date().toISOString(),
    }).eq('id', deal.id)

    setCompleting(false)
    router.refresh()
  }

  async function markComplete() {
    setCompleting(true)
    const companyId = deal.companies?.id

    if (isSaleDeal) {
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

        // Insert a sell transaction record so the ledger can show the exit
        const sharesSold = iData.sharesSold ?? 0
        const salePrice  = deal.share_price ?? 0
        if (sharesSold > 0) {
          await supabase.from('investments').insert({
            client_id:            di.clients.id,
            company_id:           companyId,
            share_class:          deal.share_class ?? iData.shareClass ?? 'Ordinary',
            investment_date:      deal.created_at?.split('T')[0] ?? new Date().toISOString().split('T')[0],
            original_share_price: salePrice,
            shares_purchased:     sharesSold,
            sum_subscribed:       sharesSold * salePrice,
            eis_status:           'no',
            holding_location:     'direct',
            status:               'active',
            transaction_type:     'sell',
            notes:                `Exit deal — ${deal.deal_type === 'full_exit' ? 'Full exit' : 'Partial exit'}`,
          })
        }

        let sharesToDeduct = sharesSold
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
      {/* Step bars */}
      {isBuyDeal  && <StepBar     activeStep={buyStepIndex}  />}
      {isSaleDeal && <SellStepBar activeStep={sellStepIndex} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <Breadcrumb items={[{ label: 'Deals', href: '/deals' }, { label: deal.companies?.name ?? 'No company' }]} />
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
                Edit setup
              </Link>
            )}
            {/* Buy deals: fallback bulk button — only after first per-investor completion */}
            {isBuyDeal && anyInvestorCompleted && (
              <button
                className="btn btn-primary"
                onClick={() => setConfirmComplete(true)}
                disabled={completing}
              >
                {completing ? 'Completing…' : 'Mark all complete'}
              </button>
            )}
            {/* Sell / generic deals: deal-level complete button */}
            {!isBuyDeal && (
              <button
                className="btn btn-primary"
                onClick={() => setConfirmComplete(true)}
                disabled={completing || !canComplete}
                title={!canComplete ? 'Complete all checklist items first' : undefined}
              >
                {completing ? 'Completing…' : 'Mark complete'}
              </button>
            )}
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
        {(['overview', 'documents', 'invoices', ...(isBuyDeal ? ['post_deal'] : [])] as ('overview' | 'documents' | 'invoices' | 'post_deal')[]).map(tab => (
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
            {tab === 'post_deal' ? 'Post-deal' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'documents' && documents.length > 0 ? ` (${documents.length})` : ''}
            {tab === 'invoices'  && invoices.length  > 0 ? ` (${invoices.length})`  : ''}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isBuyDeal && (
            <BookbuildSection
              dealId={deal.id}
              companyId={deal.companies?.id ?? ''}
              bookbuild={bookbuild}
              allClients={allClients}
              dealInfo={{
                id:             deal.id,
                companyId:      deal.companies?.id ?? '',
                shareClassId:   deal.share_class_id ?? null,
                shareClass:     deal.share_class ?? null,
                sharePrice:     deal.share_price ?? null,
                investmentDate: deal.investment_date ?? null,
                eisQualifying:  deal.eis_qualifying ?? null,
              }}
              completionChecklist={deal.completion_checklist}
            />
          )}

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
              onSave={saveChecklist}
              signingStatuses={clientToSigningStatus}
              completedInvestors={completedInvestors}
              onCompleteInvestor={completeInvestor}
              completingInvestor={completingInvestor}
              isInvestorDone={isInvestorDone}
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

      {/* Post-deal tab */}
      {activeTab === 'post_deal' && (
        <PostDealTab
          investors={investors}
          investorData={investorData}
          perInvestor={perInvestor}
          completedInvestors={completedInvestors}
          dealInvestments={dealInvestments}
          showEisItems={showEisItems}
        />
      )}

      {/* Mark complete confirmation modal */}
      {confirmComplete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 400, padding: '28px 24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', margin: '0 0 8px' }}>
              {isBuyDeal ? 'Mark all remaining investors complete?' : 'Mark this deal as complete?'}
            </h2>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 6px' }}>
              {isBuyDeal
                ? 'This will activate pending investments for all investors not yet individually completed.'
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
                onClick={() => { setConfirmComplete(false); isBuyDeal ? markAllComplete() : markComplete() }}
                className="btn btn-primary"
                style={{ fontSize: 12 }}
                disabled={completing}
              >
                {isBuyDeal ? 'Mark all complete' : 'Mark complete'}
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
