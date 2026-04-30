'use client'

import Link from 'next/link'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'

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

interface DealRow {
  id: string
  deal_type: string
  status: string
  created_at: string
  share_class: string | null
  share_class_id: string | null
  share_price: number | null
  eis_qualifying: string | null
  company_id: string | null
}

interface ShareClassRow { id: string; name: string }
interface DealInvestorRow {
  id: string
  client_id: string
  soft_circle_amount: number | null
  confirmed_amount: number | null
  lifecycle_status: string
}
interface InvestorClientRow { id: string; fund_type: string | null }
interface FundTypeRow { id: string; name: string; exit_fee_default_pct: string | null }

interface Props {
  deal:             DealRow
  company:          { id: string; name: string; logo_url: string | null } | null
  bookbuild:        { target_raise: number | null } | null
  shareClasses:     ShareClassRow[]
  dealInvestors:    DealInvestorRow[]
  investorClients:  InvestorClientRow[]
  fundTypes:        FundTypeRow[]
}

export default function BuyDealPage({
  deal, company, bookbuild, shareClasses, dealInvestors, investorClients, fundTypes,
}: Props) {
  const dealTitle = company
    ? `${company.name} — ${DEAL_TYPE_LABELS[deal.deal_type] ?? deal.deal_type}`
    : (DEAL_TYPE_LABELS[deal.deal_type] ?? deal.deal_type)

  const status  = STATUS_CONFIG[deal.status] ?? { label: deal.status, cls: 'pill-grey' }
  const initials = company ? getInitials(company.name) : '?'

  // Cell 1: Share class
  const shareClassRow  = shareClasses.find(sc => sc.id === deal.share_class_id)
  const shareClassName = shareClassRow?.name ?? deal.share_class ?? '—'
  const eisLabel       = deal.eis_qualifying === 'yes' ? 'EIS qualifying'
                       : deal.eis_qualifying === 'no'  ? 'Non-EIS'
                       : 'EIS status TBC'

  // Cell 3: Target raise + estimated shares
  const targetRaise     = bookbuild?.target_raise ?? null
  const sharesFromTarget = targetRaise != null && deal.share_price
    ? Math.round(targetRaise / deal.share_price)
    : null

  // Cells 4-5: Aggregate deal_investors
  const activeInvestors = dealInvestors.filter(
    di => !['declined', 'superseded'].includes(di.lifecycle_status),
  )
  const softCircledTotal = activeInvestors.reduce((s, di) => s + (di.soft_circle_amount ?? 0), 0)
  const confirmedTotal   = activeInvestors.reduce((s, di) => s + (di.confirmed_amount ?? 0), 0)
  const totalInvestors   = activeInvestors.length
  const confirmedCount   = activeInvestors.filter(di =>
    ['confirmed', 'app_form_sent', 'signed', 'paid', 'complete'].includes(di.lifecycle_status),
  ).length
  const softCircledPct = targetRaise && targetRaise > 0
    ? `${Math.round((softCircledTotal / targetRaise) * 100)}% of target`
    : '0% of target'

  // Cell 6: Fund type derived from investor clients
  const clientMap = new Map(investorClients.map(c => [c.id, c]))
  const fundTypeValues = activeInvestors
    .map(di => clientMap.get(di.client_id)?.fund_type)
    .filter((ft): ft is string => !!ft)

  let resolvedFundType: FundTypeRow | null = null
  let fundTypeMixed = false

  if (fundTypeValues.length > 0) {
    const counts = new Map<string, number>()
    for (const ft of fundTypeValues) counts.set(ft, (counts.get(ft) ?? 0) + 1)
    fundTypeMixed = counts.size > 1
    const mostCommon = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const mappedName = FUND_TYPE_NAME_MAP[mostCommon]
    resolvedFundType = fundTypes.find(ft => ft.name === mappedName) ?? null
  }

  return (
    <div>
      {/* ── Persistent header ─────────────────────────────────────────────── */}
      <div style={{
        background: '#fff',
        border: '0.5px solid var(--card-border)',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 16,
      }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          {/* Company logo / initials */}
          {company?.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name}
              style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: '#e8f0fb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#185fa5',
            }}>
              {initials}
            </div>
          )}

          {/* Title + subtitle */}
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

          {/* Status + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span className={`pill ${status.cls}`} style={{ fontSize: 11 }}>
              {status.label}
            </span>
            <Link
              href={`/deals/${deal.id}/edit`}
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
            >
              Edit deal details
            </Link>
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
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          borderTop: '0.5px solid var(--card-border)',
          paddingTop: 12,
        }}>
          <MetaCell
            label="Share class"
            value={shareClassName}
            sub={eisLabel}
            first
          />
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
            sub={softCircledPct}
          />
          <MetaCell
            label="Confirmed"
            value={formatCurrency(confirmedTotal)}
            sub={`${confirmedCount} of ${totalInvestors} investors`}
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
            <MetaCell
              label="Fund type"
              value="—"
              sub="No investors yet"
            />
          )}
        </div>
      </div>

      {/* ── Stage 2b placeholder ───────────────────────────────────────────── */}
      <div style={{
        background: '#fff',
        border: '0.5px solid var(--card-border)',
        borderRadius: 10,
        padding: '28px 24px',
        textAlign: 'center',
        color: '#aaa',
        fontSize: 13,
      }}>
        Tab strip coming in Stage 2b — Bookbuild · Closing · Completion · Documents · Invoices
      </div>
    </div>
  )
}

function MetaCell({
  label, value, sub, first = false,
}: {
  label: string
  value: string
  sub?: string
  first?: boolean
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
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f2744' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}
