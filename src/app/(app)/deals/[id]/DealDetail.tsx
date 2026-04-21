'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPrice, formatDate } from '@/lib/utils'
import type { DealInvestor, InvestorData, CompletionChecklist, CompanyInvestmentRow, FifoLot, TrancheScheduleItem, DeferredPaymentRow, DeferredNoteRow } from './dealDetailTypes'
import { TrancheSchedule } from './TrancheSchedule'
import { SignatureTracking } from './SignatureTracking'
import { CompletionChecklist as CompletionChecklistComponent } from './CompletionChecklist'
import { GenericChecklist } from './GenericChecklist'
import { PreCloseTab } from './PreCloseTab'
import { BookbuildSection } from './BookbuildSection'
import type { Bookbuild }   from './BookbuildSection'
import { PostDealTab }      from './PostDealTab'
import type { DealInvestmentRow } from './PostDealTab'

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
  deferred_consideration: boolean | null
  total_proceeds_cap: number | null
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
  dealType:       string
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
  companyInvestments: companyInvestmentsRaw,
  deferredPayments: deferredPaymentsRaw,
  deferredNotes: deferredNotesRaw,
}: {
  deal:                Record<string, unknown>
  documents:           Record<string, unknown>[]
  invoices:            Record<string, unknown>[]
  bookbuild:           Record<string, unknown> | null
  allClients:          Record<string, unknown>[]
  dealInvestments:     Record<string, unknown>[]
  companyInvestments:  Record<string, unknown>[]
  deferredPayments:    Record<string, unknown>[]
  deferredNotes:       Record<string, unknown>[]
}) {
  const deal               = dealRaw              as unknown as Deal
  const documents          = documentsRaw         as unknown as Document[]
  const invoices           = invoicesRaw          as unknown as Invoice[]
  const bookbuild          = bookbuildRaw         as unknown as Bookbuild | null
  const allClients         = allClientsRaw        as unknown as { id: string; full_name: string; email: string | null; default_fee_rate: number | null; fund_type: string | null; lead_investor_id: string | null }[]
  const primaryClients     = allClients.filter(c => !c.lead_investor_id)
  const dealInvestments    = dealInvestmentsRaw    as unknown as DealInvestmentRow[]
  const companyInvestments = companyInvestmentsRaw as unknown as CompanyInvestmentRow[]
  const deferredPayments   = deferredPaymentsRaw   as unknown as DeferredPaymentRow[]
  const deferredNotes      = deferredNotesRaw      as unknown as DeferredNoteRow[]

  const router   = useRouter()
  const supabase = createClient()

  const isBuyDeal       = deal.deal_type === 'new_investment' || deal.deal_type === 'follow_on'
  const isSaleDeal      = deal.deal_type === 'full_exit' || deal.deal_type === 'partial_exit'
  const isNewDealFormat = !!(deal.completion_checklist?.investor_data)

  const perInvestorItems = isBuyDeal ? BUY_ITEMS : isSaleDeal ? SALE_ITEMS : []

  const signingStatuses = Object.fromEntries(
    (deal.deal_investors ?? []).map(di => [di.id, di.signing_status ?? 'not_sent'])
  )
const [pendingStatuses, setPendingStatuses] = useState<Record<string, string>>({})

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
  const [activeTab,          setActiveTab]          = useState<'bookbuild' | 'pre_close' | 'post_close' | 'documents' | 'invoices'>(() => {
    const tabParam            = searchParams.get('tab')
    const initialCompleted    = (deal.completion_checklist?.completed_investors as Record<string, string>) ?? {}
    const postCloseAvailable  = Object.keys(initialCompleted).length > 0
    if (tabParam === 'post_close' && postCloseAvailable) return 'post_close'
    return 'bookbuild'
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

  const mergedStatuses = { ...signingStatuses, ...pendingStatuses }

  // Whether a given investor has all required checklist items ticked
  const clientToSigningStatus = new Map<string, string>(
    investors.map(di => [
      di.clients?.id ?? '',
      mergedStatuses[di.id] ?? 'not_sent',
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

  function deriveStatus(merged: Record<string, string>): string {
    if (deal.status === 'complete') return 'complete'
    const statuses = investors.map(di => merged[di.id] ?? 'not_sent')
    const allSigned = statuses.length > 0 && statuses.every(s => s === 'signed')
    const anySigned = statuses.some(s => s === 'signed')
    if (allSigned) return 'fully_signed'
    if (anySigned) return 'partially_signed'
    const anySent = statuses.some(s => ['sent', 'viewed'].includes(s))
    if (anySent) return 'sent'
    return deal.status
  }

  async function handleStatusChange(diId: string, newStatus: string) {
    setPendingStatuses(prev => ({ ...prev, [diId]: newStatus }))
    const merged  = { ...signingStatuses, ...pendingStatuses, [diId]: newStatus }
    const derived = deriveStatus(merged)
    const { error: diError } = await supabase.from('deal_investors')
      .update({ signing_status: newStatus }).eq('id', diId)
    if (diError) console.error('deal_investors update failed:', diError)

    const { error: dealError } = await supabase.from('deals')
      .update({ status: derived }).eq('id', deal.id)
    if (dealError) console.error('deals update failed:', dealError)

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

  // Per-investor completion (sell deals) — uses pre-computed FIFO lots from PreCloseTab
  async function completeSellInvestor(clientId: string, lots: FifoLot[]) {
    setCompletingInvestor(clientId)
    const today     = new Date().toISOString().split('T')[0]
    const companyId = deal.companies?.id

    // Remove the placeholder pending sell investment created at bookbuild confirm
    await supabase.from('investments').delete()
      .eq('deal_id', deal.id)
      .eq('client_id', clientId)
      .eq('status', 'pending')
      .eq('transaction_type', 'sell')

    // Insert one sell row per FIFO lot, capture IDs for deferred_payments linkage
    const sellInvestmentIds: string[] = []
    for (const lot of lots) {
      const sourceLot = companyInvestments.find(inv => inv.id === lot.investmentId)
      if (!sourceLot) continue

      const { data: newInv } = await supabase.from('investments').insert({
        client_id:            clientId,
        company_id:           companyId,
        deal_id:              deal.id,
        bookbuild_id:         bookbuild?.id ?? null,
        share_class:          sourceLot.share_class ?? deal.share_class ?? null,
        investment_date:      deal.investment_date ?? today,
        original_share_price: deal.share_price ?? 0,
        shares_purchased:     lot.sharesConsumed,
        sum_subscribed:       lot.lotProceeds,
        cost_basis:           lot.lotCostBasis,
        gain_loss:            lot.gainLoss,
        eis_status:           'no',
        transaction_type:     'sell',
        status:               'active',
        completion_date:      today,
        holding_location:     'direct',
      }).select('id').single()
      if (newInv?.id) sellInvestmentIds.push(newInv.id)

      const remaining = sourceLot.shares_purchased - lot.sharesConsumed
      if (remaining <= 0) {
        await supabase.from('investments').update({ status: 'exited' }).eq('id', lot.investmentId)
      } else {
        await supabase.from('investments').update({ shares_purchased: remaining }).eq('id', lot.investmentId)
      }
    }

    // Deferred consideration — insert deferred_payments from stored tranche schedule
    if (deal.deferred_consideration === true && sellInvestmentIds.length > 0) {
      const storedTranches = (deal.completion_checklist?.tranches ?? []) as TrancheScheduleItem[]
      const cap            = deal.total_proceeds_cap

      if (storedTranches.length > 0 && cap) {
        const investorShares  = lots.reduce((s, l) => s + l.sharesConsumed, 0)
        const totalSharesSold = (bookbuild?.entries ?? [])
          .filter(e => e.status === 'selling')
          .reduce((s, e) => s + (e.indicative_shares ?? 0), 0)
        const proportion   = totalSharesSold > 0 ? investorShares / totalSharesSold : 0
        const primaryInvId = sellInvestmentIds[0]

        for (const tranche of storedTranches) {
          await supabase.from('deferred_payments').insert({
            investment_id:           primaryInvId,
            deal_id:                 deal.id,
            client_id:               clientId,
            expected_amount:         parseFloat((cap * tranche.percentage / 100 * proportion).toFixed(2)),
            expected_date:           null,
            contingency_description: tranche.contingency_description || null,
            tranche_number:          tranche.tranche_number,
            is_final_tranche:        tranche.is_final_tranche,
            payment_route:           'direct',
            status:                  'expected',
          })
        }
      }
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

  async function handleFeeOverride(investmentId: string, feeRate: number, feeAmount: number) {
    await supabase.from('investments')
      .update({ fee_rate: feeRate, fee_amount: feeAmount })
      .eq('id', investmentId)
  }

  async function handleCloseOut() {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('deals').update({
      deferred_closed_out:    true,
      deferred_closed_out_at: new Date().toISOString(),
      deferred_closed_out_by: user?.id ?? null,
    }).eq('id', deal.id)
    router.refresh()
  }

  const canComplete = allPerInvestorDone()

  // ── Summary card computations ──────────────────────────────────────────────
  const bbEntries = bookbuild?.entries ?? []

  const confirmedEntries = bbEntries.filter(e => e.status === 'confirmed')
  const confirmedCount   = confirmedEntries.length
  const totalConfirmed   = confirmedEntries.reduce((s, e) => s + (e.indicative_amount ?? 0), 0)
  const targetRaise      = bookbuild?.target_raise ?? null
  const targetPct        = targetRaise && targetRaise > 0 ? (totalConfirmed / targetRaise) * 100 : null

  const sellingEntries   = bbEntries.filter(e => e.status === 'selling')
  const sellersCount     = sellingEntries.length
  const grossProceedsSum = sellingEntries.reduce((s, e) => s + (e.indicative_amount ?? 0), 0)
  const sharesBeingSold  = sellingEntries.reduce((s, e) => s + (e.indicative_shares ?? 0), 0)

  const storedTranches   = (deal.completion_checklist?.tranches ?? []) as TrancheScheduleItem[]
  const upfrontTranche   = storedTranches.find(t => t.is_upfront)
  const upfrontProceeds  = deal.total_proceeds_cap && upfrontTranche
    ? deal.total_proceeds_cap * upfrontTranche.percentage / 100
    : null
  const deferredProceeds = deal.total_proceeds_cap && upfrontProceeds !== null
    ? deal.total_proceeds_cap - upfrontProceeds
    : null

  const feesReceivable = dealInvestments
    .filter(inv => clientToSigningStatus.get(inv.client_id) === 'signed')
    .reduce((s, inv) => s + (inv.fee_amount ?? 0), 0)

  const activeEntries  = isBuyDeal ? confirmedEntries : sellingEntries
  const activeClientIds = new Set(activeEntries.map(e => e.client_id))
  const feesAllSigned  = activeClientIds.size > 0
    && [...activeClientIds].every(cid => clientToSigningStatus.get(cid) === 'signed')
  const feesBg = activeClientIds.size === 0 ? undefined
    : feesAllSigned ? '#f0faf6' : '#fffbf0'

  const shareClasses     = (deal.share_class ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const shareClassPrices = deal.completion_checklist?.['share_class_prices'] as Record<string, number> | undefined

  const shareClassValue: React.ReactNode = shareClasses.length > 1
    ? (
      <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
        {shareClasses.map(cls => {
          const price = shareClassPrices?.[cls] ?? deal.share_price
          return (
            <div key={cls}>
              {cls}{price != null ? `: £${price.toFixed(2)}` : ''}
            </div>
          )
        })}
      </div>
    )
    : (deal.share_class ?? '—')

  const shareClassSubValue: React.ReactNode = shareClasses.length <= 1 && deal.share_price != null
    ? `£${deal.share_price.toFixed(2)}`
    : undefined

  return (
    <div style={{ maxWidth: 1100 }}>
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
      {isBuyDeal && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${targetRaise ? 5 : 4}, 1fr)`, gap: 12, marginBottom: 24 }}>
          <SummaryCard label="Confirmed investors" value={String(confirmedCount)} />
          <SummaryCard
            label="Total confirmed"
            value={confirmedCount > 0 ? formatCurrency(totalConfirmed) : '—'}
          />
          {targetRaise && (
            <SummaryCard
              label="Target raise"
              value={formatCurrency(targetRaise)}
              subValue={targetPct !== null ? `${targetPct.toFixed(0)}% confirmed` : undefined}
              bg={targetPct !== null && targetPct >= 100 ? '#f0faf6' : undefined}
            />
          )}
          <SummaryCard
            label="Fees receivable"
            value={feesReceivable > 0 ? formatCurrency(feesReceivable) : '—'}
            bg={feesBg}
          />
          <SummaryCard
            label="Share class / Price per share"
            value={shareClassValue}
            subValue={shareClassSubValue}
          />
        </div>
      )}

      {isSaleDeal && deal.deferred_consideration === true && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          <SummaryCard
            label="Total proceeds cap"
            value={deal.total_proceeds_cap ? formatCurrency(deal.total_proceeds_cap) : <span style={{ color: '#aaa', fontWeight: 400 }}>Not set</span>}
          />
          <SummaryCard
            label="Upfront proceeds"
            value={upfrontProceeds !== null ? formatCurrency(upfrontProceeds) : <span style={{ color: '#aaa', fontWeight: 400, fontSize: 13 }}>Tranche schedule not set</span>}
          />
          <SummaryCard
            label="Deferred proceeds (max)"
            value={deferredProceeds !== null ? formatCurrency(deferredProceeds) : '—'}
          />
          <SummaryCard
            label="Fees receivable"
            value={feesReceivable > 0 ? formatCurrency(feesReceivable) : '—'}
            bg={feesBg}
          />
          <SummaryCard
            label="Share class / Price per share"
            value={shareClassValue}
            subValue={shareClassSubValue}
          />
        </div>
      )}

      {isSaleDeal && !deal.deferred_consideration && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          <SummaryCard label="Sellers confirmed" value={String(sellersCount)} />
          <SummaryCard
            label="Gross proceeds"
            value={sellersCount > 0 ? formatCurrency(grossProceedsSum) : '—'}
          />
          <SummaryCard
            label="Shares being sold"
            value={sharesBeingSold > 0 ? sharesBeingSold.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
          />
          <SummaryCard
            label="Fees receivable"
            value={feesReceivable > 0 ? formatCurrency(feesReceivable) : '—'}
            bg={feesBg}
          />
          <SummaryCard
            label="Share class / Price per share"
            value={shareClassValue}
            subValue={shareClassSubValue}
          />
        </div>
      )}

      {!isBuyDeal && !isSaleDeal && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
          <SummaryCard label="Investors" value={String(investors.length)} />
          <SummaryCard label="Started" value={formatDate(deal.created_at)} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e8e8e4', marginBottom: 20 }}>
        {([
          { key: 'bookbuild',  label: 'Bookbuild',  show: true },
          { key: 'pre_close',  label: 'Pre-close',  show: isBuyDeal || isSaleDeal },
          { key: 'post_close', label: 'Post-close', show: isBuyDeal || isSaleDeal },
          { key: 'documents',  label: documents.length > 0 ? `Documents (${documents.length})` : 'Documents', show: true },
          { key: 'invoices',   label: invoices.length  > 0 ? `Invoices (${invoices.length})`   : 'Invoices',  show: true },
        ] as { key: typeof activeTab; label: string; show: boolean }[])
          .filter(t => t.show)
          .map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === t.key ? '2px solid #0f2744' : '2px solid transparent',
                color: activeTab === t.key ? '#0f2744' : '#888',
              }}
            >
              {t.label}
            </button>
          ))}
      </div>

      {/* ── Bookbuild tab ── */}
      {activeTab === 'bookbuild' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(isBuyDeal || isSaleDeal) && (
            <BookbuildSection
              dealId={deal.id}
              companyId={deal.companies?.id ?? ''}
              bookbuild={bookbuild}
              allClients={primaryClients}
              dealInfo={{
                id:             deal.id,
                companyId:      deal.companies?.id ?? '',
                shareClassId:   deal.share_class_id ?? null,
                shareClass:     deal.share_class ?? null,
                sharePrice:     deal.share_price ?? null,
                investmentDate: deal.investment_date ?? null,
                eisQualifying:  deal.eis_qualifying ?? null,
                dealType:       deal.deal_type,
              }}
              completionChecklist={deal.completion_checklist}
            />
          )}

          {isSaleDeal && deal.deferred_consideration === true && (
            <TrancheSchedule
              deal={deal}
              onUpdate={() => router.refresh()}
            />
          )}

          <SignatureTracking
            investors={investors}
            dealStatus={deal.status}
            signingStatuses={mergedStatuses}
            onStatusChange={handleStatusChange}
          />

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

      {/* ── Pre-close tab ── */}
      {activeTab === 'pre_close' && (
        <PreCloseTab
          investors={investors}
          dealInvestments={dealInvestments}
          perInvestor={perInvestor}
          completedInvestors={completedInvestors}
          clientToSigningStatus={clientToSigningStatus}
          isBuyDeal={isBuyDeal}
          isSaleDeal={isSaleDeal}
          onSetInvestorItem={setInvestorItem}
          onCompleteInvestor={completeInvestor}
          onCompleteSellInvestor={completeSellInvestor}
          completingInvestor={completingInvestor}
          dealStatus={deal.status}
          saving={saving}
          saved={saved}
          onSave={saveChecklist}
          onFeeOverride={handleFeeOverride}
          bookbuild={bookbuild}
          companyInvestments={companyInvestments}
          dealSharePrice={deal.share_price}
        />
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

      {/* ── Post-close tab ── */}
      {activeTab === 'post_close' && (
        <PostDealTab
          investors={investors}
          investorData={investorData}
          perInvestor={perInvestor}
          completedInvestors={completedInvestors}
          dealInvestments={dealInvestments}
          showEisItems={showEisItems}
          isSaleDeal={isSaleDeal}
          deferredConsideration={deal.deferred_consideration ?? false}
          deferredPayments={deferredPayments}
          deferredNotes={deferredNotes}
          completionChecklist={deal.completion_checklist as Record<string, unknown> | null}
          dealId={deal.id}
          onCloseOut={handleCloseOut}
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

function SummaryCard({ label, value, subValue, bg }: {
  label:     string
  value:     React.ReactNode
  subValue?: React.ReactNode
  bg?:       string
}) {
  return (
    <div className="card" style={{ padding: '12px 16px', background: bg }}>
      <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{value}</div>
      {subValue && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{subValue}</div>}
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
