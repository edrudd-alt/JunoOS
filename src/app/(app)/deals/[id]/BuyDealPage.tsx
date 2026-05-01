'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'
import EditDealModal from './EditDealModal'
import { DealInvestorFull, ClientFull, NomineeRow, getDisplayedStatus, ACTIVE_STATUSES } from './dealUtils'
import BookbuildTab from './BookbuildTab'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLongDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatWholeNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEAL_TYPE_LABELS: Record<string, string> = {
  new_investment: 'New investment',
  follow_on:      'Follow-on investment',
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:            { label: 'Draft',           cls: 'pill-grey'  },
  sent:             { label: 'In bookbuild',    cls: 'pill-blue'  },
  partially_signed: { label: 'Closing',         cls: 'pill-amber' },
  fully_signed:     { label: 'Closing',         cls: 'pill-amber' },
  complete:         { label: 'Complete',        cls: 'pill-green' },
}

const FUND_TYPE_NAME_MAP: Record<string, string> = {
  syndicate:     'Syndicate',
  eis:           'EIS Fund',
  multi_manager: 'Multi Manager',
}

const VALID_TABS = ['bookbuild', 'closing', 'completion', 'documents', 'invoices'] as const
type TabKey = typeof VALID_TABS[number]

// ── Interfaces ────────────────────────────────────────────────────────────────

interface DealRow {
  id: string
  deal_type: string
  status: string
  created_at: string
  title: string | null
  share_class: string | null
  share_class_id: string | null
  share_price: number | null
  eis_qualifying: string | null
  notes: string | null
  company_id: string | null
}

interface ShareClassRow { id: string; name: string }
interface FundTypeRow   { id: string; name: string; exit_fee_default_pct: string | null }

interface Props {
  deal:          DealRow
  company:       { id: string; name: string; logo_url: string | null } | null
  bookbuild:     { id: string; target_raise: number | null } | null
  shareClasses:  ShareClassRow[]
  dealInvestors: DealInvestorFull[]
  allClients:    ClientFull[]
  nominees:      NomineeRow[]
  fundTypes:     FundTypeRow[]
  documentCount: number
  invoiceCount:  number
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BuyDealPage({
  deal, company, bookbuild, shareClasses, dealInvestors,
  allClients, nominees, fundTypes, documentCount, invoiceCount,
}: Props) {
  // ── Modal state ───────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)

  // ── URL state (active tab) ────────────────────────────────────────────────
  const searchParams = useSearchParams()
  const router       = useRouter()

  const rawTab    = searchParams.get('tab')
  const activeTab: TabKey = (VALID_TABS as readonly string[]).includes(rawTab ?? '')
    ? rawTab as TabKey
    : 'bookbuild'

  function handleTabClick(tab: TabKey) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`?${params.toString()}`)
  }

  // ── Client map ────────────────────────────────────────────────────────────
  const clientMap = new Map(allClients.map(c => [c.id, c]))

  // ── Investor aggregations ─────────────────────────────────────────────────
  const nonDeclined = dealInvestors.filter(di => {
    const s = getDisplayedStatus(di)
    return !['declined', 'superseded'].includes(s)
  })
  const totalActive = nonDeclined.length
  const targetRaise = bookbuild?.target_raise ?? null

  // Soft-circled (all non-declined investors carry a soft_circle_amount)
  const softCircledTotal = nonDeclined.reduce((s, di) => s + (di.soft_circle_amount ?? 0), 0)

  // Confirmed (investors who have confirmed an amount)
  const confirmedTotal = nonDeclined
    .filter(di => !['soft_circled', 'chase'].includes(getDisplayedStatus(di)))
    .reduce((s, di) => s + (di.confirmed_amount ?? 0), 0)
  const confirmedCount = nonDeclined.filter(di =>
    ['confirmed', 'app_form_sent', 'signed', 'paid', 'complete'].includes(getDisplayedStatus(di)),
  ).length

  // Card 1: Bookbuild progress
  const bookbuildPct = targetRaise && targetRaise > 0
    ? Math.min(Math.round((softCircledTotal / targetRaise) * 100), 100)
    : 0
  const softCircledPctLabel = targetRaise && targetRaise > 0
    ? `${Math.round((softCircledTotal / targetRaise) * 100)}% of target`
    : '0% of target'

  // Card 2: Signatures
  const signedCount  = nonDeclined.filter(di => ['signed', 'paid', 'complete'].includes(getDisplayedStatus(di))).length
  const chasersCount = nonDeclined.filter(di => getDisplayedStatus(di) === 'chase').length
  const signedPct    = totalActive > 0 ? Math.round((signedCount / totalActive) * 100) : 0

  // Card 3: Cash received
  const paidInvestors     = nonDeclined.filter(di => ['paid', 'complete'].includes(getDisplayedStatus(di)))
  const cashReceivedTotal = paidInvestors.reduce((s, di) => s + (di.confirmed_amount ?? 0), 0)
  const confirmedForCash  = nonDeclined
    .filter(di => !['soft_circled', 'chase'].includes(getDisplayedStatus(di)))
    .reduce((s, di) => s + (di.confirmed_amount ?? 0), 0)
  const cashPct   = confirmedForCash > 0 ? Math.min(Math.round((cashReceivedTotal / confirmedForCash) * 100), 100) : 0
  const paidCount = paidInvestors.length

  // Card 4: Completed
  const completeCount    = nonDeclined.filter(di => getDisplayedStatus(di) === 'complete').length
  const completePct      = totalActive > 0 ? Math.round((completeCount / totalActive) * 100) : 0
  const outstandingCount = totalActive - completeCount

  // ── Tab badge counts ──────────────────────────────────────────────────────
  const bookbuildCount   = dealInvestors.filter(di => ACTIVE_STATUSES.has(getDisplayedStatus(di))).length
  const closingActive    = dealInvestors.filter(di => ['signed', 'paid'].includes(getDisplayedStatus(di))).length
  const closingTotal     = dealInvestors.filter(di => ['signed', 'paid', 'complete'].includes(getDisplayedStatus(di))).length
  const completionActive = dealInvestors.filter(di => getDisplayedStatus(di) === 'paid').length
  const completionTotal  = dealInvestors.filter(di => ['paid', 'complete'].includes(getDisplayedStatus(di))).length

  // ── Header derived values ─────────────────────────────────────────────────
  const constructedTitle = company
    ? `${company.name} — ${DEAL_TYPE_LABELS[deal.deal_type] ?? deal.deal_type}`
    : (DEAL_TYPE_LABELS[deal.deal_type] ?? deal.deal_type)
  const dealTitle  = deal.title?.trim() ? deal.title.trim() : constructedTitle
  const status     = STATUS_CONFIG[deal.status] ?? { label: deal.status, cls: 'pill-grey' }
  const initials   = company ? getInitials(company.name) : '?'
  const shareClassRow  = shareClasses.find(sc => sc.id === deal.share_class_id)
  const shareClassName = shareClassRow?.name ?? deal.share_class ?? '—'
  const eisLabel   = deal.eis_qualifying === 'yes' ? 'EIS qualifying'
                   : deal.eis_qualifying === 'no'  ? 'Non-EIS'
                   : 'EIS status TBC'
  const sharesFromTarget = targetRaise != null && deal.share_price
    ? Math.round(targetRaise / deal.share_price)
    : null

  // Fund type for header cell 6
  const fundTypeValues = nonDeclined
    .map(di => clientMap.get(di.client_id)?.fund_type)
    .filter((ft): ft is string => !!ft)
  let resolvedFundType: FundTypeRow | null = null
  let fundTypeMixed = false
  if (fundTypeValues.length > 0) {
    const counts = new Map<string, number>()
    for (const ft of fundTypeValues) counts.set(ft, (counts.get(ft) ?? 0) + 1)
    fundTypeMixed = counts.size > 1
    const mostCommon = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    resolvedFundType = fundTypes.find(ft => ft.name === FUND_TYPE_NAME_MAP[mostCommon]) ?? null
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Persistent header ─────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '0.5px solid var(--card-border)',
        borderRadius: 10, padding: '16px 20px', marginBottom: 14,
      }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          {company?.logo_url ? (
            <img
              src={company.logo_url} alt={company.name}
              style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: '#e8f0fb', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#185fa5',
            }}>
              {initials}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0f2744', lineHeight: 1.3 }}>
              {dealTitle}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {DEAL_TYPE_LABELS[deal.deal_type] ?? deal.deal_type}
              {' · Created '}
              {formatLongDate(deal.created_at)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span className={`pill ${status.cls}`} style={{ fontSize: 11 }}>{status.label}</span>
            <button
              onClick={() => setModalOpen(true)}
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
            >
              Edit deal details
            </button>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 10px' }}
              title="More actions (coming in Stage 2c)"
            >
              ···
            </button>
          </div>
        </div>

        {/* Metadata grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
          borderTop: '0.5px solid var(--card-border)', paddingTop: 12,
        }}>
          <MetaCell label="Share class"  value={shareClassName} sub={eisLabel} first />
          <MetaCell
            label="Share price"
            value={deal.share_price != null ? `£${deal.share_price.toFixed(2)}` : '—'}
            sub={`Set ${formatDate(deal.created_at)}`}
          />
          <MetaCell
            label="Target raise"
            value={targetRaise != null ? formatCurrency(targetRaise) : '—'}
            sub={sharesFromTarget != null ? `${formatWholeNumber(sharesFromTarget)} shares` : undefined}
          />
          <MetaCell
            label="Soft-circled"
            value={formatCurrency(softCircledTotal)}
            sub={softCircledPctLabel}
          />
          <MetaCell
            label="Confirmed"
            value={formatCurrency(confirmedTotal)}
            sub={`${confirmedCount} of ${totalActive} investors`}
          />
          {resolvedFundType ? (
            <MetaCell
              label="Fund type"
              value={resolvedFundType.name + (fundTypeMixed ? ' (mixed)' : '')}
              sub={resolvedFundType.exit_fee_default_pct
                ? `${resolvedFundType.exit_fee_default_pct}% default fee`
                : 'No default fee set'}
            />
          ) : (
            <MetaCell label="Fund type" value="—" sub="No investors yet" />
          )}
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12, marginBottom: 14,
      }}>
        <SummaryCard
          label="Bookbuild progress"
          value={`${bookbuildPct}%`}
          progressPct={bookbuildPct}
          progressColor="var(--teal)"
          sub={`${formatCurrency(softCircledTotal)} of ${formatCurrency(targetRaise ?? 0)} soft-circled`}
        />
        <SummaryCard
          label="Signatures"
          value={`${signedCount} / ${totalActive}`}
          progressPct={signedPct}
          progressColor="var(--teal)"
          sub={chasersCount > 0 ? `${chasersCount} chaser${chasersCount !== 1 ? 's' : ''} due` : undefined}
          subAmber={chasersCount > 0}
        />
        <SummaryCard
          label="Cash received"
          value={formatCurrency(cashReceivedTotal)}
          progressPct={cashPct}
          progressColor="var(--info)"
          sub={`From ${paidCount} investor${paidCount !== 1 ? 's' : ''}`}
        />
        <SummaryCard
          label="Completed"
          value={`${completeCount} / ${totalActive}`}
          progressPct={completePct}
          progressColor="var(--teal)"
          sub={completeCount > 0 && outstandingCount === 0
            ? 'All docs filed'
            : `${outstandingCount} outstanding`}
        />
      </div>

      {/* ── Edit deal details modal ───────────────────────────────────────── */}
      {modalOpen && (
        <EditDealModal
          deal={deal}
          bookbuild={bookbuild}
          shareClasses={shareClasses}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            router.refresh()
          }}
        />
      )}

      {/* ── Tab strip + content ────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '0.5px solid var(--card-border)', borderRadius: 10,
      }}>
        {/* Tab headers */}
        <div style={{
          display: 'flex', borderBottom: '0.5px solid var(--card-border)',
          padding: '0 4px', overflowX: 'auto',
        }}>
          <TabButton
            label="Bookbuild"
            badge={String(bookbuildCount)}
            active={activeTab === 'bookbuild'}
            onClick={() => handleTabClick('bookbuild')}
          />
          <TabButton
            label="Closing"
            badge={`${closingActive} / ${closingTotal}`}
            active={activeTab === 'closing'}
            onClick={() => handleTabClick('closing')}
          />
          <TabButton
            label="Completion"
            badge={`${completionActive} / ${completionTotal}`}
            active={activeTab === 'completion'}
            onClick={() => handleTabClick('completion')}
          />
          <TabButton
            label="Documents"
            badge={String(documentCount)}
            active={activeTab === 'documents'}
            onClick={() => handleTabClick('documents')}
          />
          <TabButton
            label="Invoices"
            badge={String(invoiceCount)}
            active={activeTab === 'invoices'}
            onClick={() => handleTabClick('invoices')}
          />
        </div>

        {/* Tab body */}
        <div style={{ padding: activeTab === 'bookbuild' ? 0 : '28px 24px' }}>
          {activeTab === 'bookbuild' && (
            <BookbuildTab
              deal={deal}
              dealInvestors={dealInvestors}
              clientMap={clientMap}
              allClients={allClients}
              nominees={nominees}
              onDataRefresh={() => router.refresh()}
            />
          )}
          {activeTab === 'closing' && (
            <TabPlaceholder
              title="Closing — Stage 4"
              description="Signed investors awaiting payment and completion handover."
            />
          )}
          {activeTab === 'completion' && (
            <TabPlaceholder
              title="Completion — Stage 4"
              description="Per-investor checklist for share certs, EIS certs, transaction statements, doc filing."
            />
          )}
          {activeTab === 'documents' && (
            <TabPlaceholder
              title="Documents — Stage 5"
              description="All deal documents with by-investor / by-type / by-date views and superseded filtering."
            />
          )}
          {activeTab === 'invoices' && (
            <TabPlaceholder
              title="Invoices — Stage 5"
              description="Auto-drafted fee invoices, manual push to Xero, paid status."
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaCell({
  label, value, sub, first = false,
}: {
  label: string; value: string; sub?: string; first?: boolean
}) {
  return (
    <div style={{
      padding: '8px 14px',
      borderLeft: first ? undefined : '0.5px solid var(--card-border)',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: '#aaa', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f2744' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function SummaryCard({
  label, value, progressPct, progressColor, sub, subAmber = false,
}: {
  label: string
  value: string
  progressPct: number
  progressColor: string
  sub?: string
  subAmber?: boolean
}) {
  return (
    <div style={{
      background: '#fff', border: '0.5px solid var(--card-border)',
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: '#aaa', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f2744', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{
        height: 4, background: '#f0f0ec', borderRadius: 2, margin: '10px 0 8px',
      }}>
        <div style={{
          width: `${Math.max(0, Math.min(progressPct, 100))}%`,
          height: '100%', background: progressColor, borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
      {sub && (
        <div style={{
          fontSize: 11, color: subAmber ? 'var(--warning)' : '#888', fontWeight: subAmber ? 500 : 400,
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function TabButton({
  label, badge, active, onClick,
}: {
  label: string; badge: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '14px 18px 12px',
        borderBottom: active ? '2px solid var(--teal)' : '2px solid transparent',
        marginBottom: -1,
        color: active ? 'var(--teal)' : '#666',
        fontWeight: active ? 600 : 400,
        fontSize: 13,
        display: 'flex', alignItems: 'center', gap: 7,
        whiteSpace: 'nowrap', flexShrink: 0,
        transition: 'color 0.15s',
      }}
    >
      {label}
      <span style={{
        fontSize: 10, fontWeight: 500,
        background: active ? '#d0f0e6' : '#f0f0ec',
        color: active ? '#0a5a3d' : '#888',
        borderRadius: 10, padding: '1px 7px',
        transition: 'background 0.15s, color 0.15s',
      }}>
        {badge}
      </span>
    </button>
  )
}

function TabPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div style={{
      border: '1.5px dashed #d8d8d0', borderRadius: 8,
      background: '#fafaf8', padding: '32px 24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: '#999', maxWidth: 480, margin: '0 auto' }}>
        {description}
      </div>
    </div>
  )
}
