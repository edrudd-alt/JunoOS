'use client'

import Link from 'next/link'
import { formatDate } from '@/lib/utils'

interface PendingInvestment {
  id: string
  share_class: string
  company_id: string | null
  companies: { id: string; name: string } | null
}

interface ActiveDeal {
  id: string
  deal_type: string | null
  status: string
  companies: { id: string; name: string } | null
}

interface FollowUpNote {
  id: string
  note_text: string
  created_at: string
}

interface Props {
  clientId: string
  kycExpiry: string | null
  pendingInvestments: PendingInvestment[]
  activeDeals: ActiveDeal[]
  followUpNotes: FollowUpNote[]
  investments: Record<string, unknown>[]
  documents: Record<string, unknown>[]
}

export default function PendingActionsTab({
  clientId, kycExpiry,
  pendingInvestments, activeDeals, followUpNotes,
  investments, documents,
}: Props) {
  // Map company_id → deal_id for pending investment links
  const dealByCompany = new Map<string, string>()
  for (const deal of activeDeals) {
    const cid = deal.companies?.id
    if (cid && !dealByCompany.has(cid)) dealByCompany.set(cid, deal.id)
  }
  // EIS certificates outstanding
  const eisCompanyMap = new Map<string, string>()
  for (const inv of investments) {
    const eis = inv.eis_status as string
    const company = inv.companies as { id: string; name: string } | null
    if ((eis === 'yes' || eis === 'tbc') && company?.id) {
      eisCompanyMap.set(company.id, company.name)
    }
  }
  const eisDocCompanyIds = new Set(
    documents
      .filter(d => (d.type as string)?.toLowerCase().includes('eis') && d.company_id)
      .map(d => d.company_id as string)
  )
  const missingEis = [...eisCompanyMap.entries()].filter(([cid]) => !eisDocCompanyIds.has(cid))

  // KYC
  let kycOverdue = false
  let kycDaysLeft = 0
  let showKyc = false
  if (kycExpiry) {
    kycDaysLeft = Math.floor((new Date(kycExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (kycDaysLeft <= 60) { showKyc = true; kycOverdue = kycDaysLeft < 0 }
  }

  const totalCount =
    pendingInvestments.length + activeDeals.length + followUpNotes.length +
    missingEis.length + (showKyc ? 1 : 0)

  if (totalCount === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1d9e75' }}>All clear — no pending actions</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Nothing requires attention for this client.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Pending investments */}
      {pendingInvestments.map(inv => {
        const dealId = inv.company_id ? dealByCompany.get(inv.company_id) : undefined
        return (
          <ActionCard
            key={`inv-${inv.id}`}
            dot="#e8a820"
            title={`Investment pending completion — ${inv.companies?.name ?? '—'} ${inv.share_class}`}
            subtitle="Awaiting deal completion"
            actionLabel={dealId ? 'Continue deal' : 'View deals'}
            href={dealId ? `/deals/${dealId}` : '/deals'}
          />
        )
      })}

      {/* Active deals */}
      {activeDeals.map(deal => {
        const compName = deal.companies?.name ?? '—'
        const typeLabel = deal.deal_type
          ? deal.deal_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          : 'Deal'
        return (
          <ActionCard
            key={`deal-${deal.id}`}
            dot="#e8a820"
            title={`Deal in progress — ${compName}`}
            subtitle={`${typeLabel} · Status: ${deal.status}`}
            actionLabel="View deal"
            href={`/deals/${deal.id}`}
          />
        )
      })}

      {/* KYC renewal */}
      {showKyc && (
        <ActionCard
          dot={kycOverdue ? '#a32d2d' : '#e8a820'}
          title={`KYC renewal ${kycOverdue ? 'overdue' : 'due soon'} — expires ${formatDate(kycExpiry!)}`}
          subtitle={kycOverdue
            ? `Expired ${Math.abs(kycDaysLeft)} day${Math.abs(kycDaysLeft) !== 1 ? 's' : ''} ago`
            : `${kycDaysLeft} day${kycDaysLeft !== 1 ? 's' : ''} remaining`}
          actionLabel="Renew KYC"
          href={`/clients/${clientId}/edit`}
        />
      )}

      {/* Follow-up notes */}
      {followUpNotes.map(note => {
        const excerpt = note.note_text.slice(0, 60) + (note.note_text.length > 60 ? '…' : '')
        return (
          <ActionCard
            key={`note-${note.id}`}
            dot="#aaa"
            title="Follow-up note"
            subtitle={`"${excerpt}" · ${formatDate(note.created_at)}`}
            actionLabel="View notes"
            href={`/clients/${clientId}?tab=notes`}
          />
        )
      })}

      {/* EIS certificates */}
      {missingEis.map(([compId, compName]) => (
        <ActionCard
          key={`eis-${compId}`}
          dot="#185fa5"
          title={`EIS certificate outstanding — ${compName}`}
          subtitle="No EIS3 or compliance certificate on record"
          actionLabel="Upload"
          href={`/clients/${clientId}?tab=investment_docs`}
        />
      ))}
    </div>
  )
}

function ActionCard({
  dot, title, subtitle, actionLabel, href,
}: {
  dot: string
  title: string
  subtitle: string
  actionLabel?: string
  href?: string
}) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0f2744' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{subtitle}</div>
      </div>
      {actionLabel && href && (
        <Link
          href={href}
          style={{
            padding: '5px 12px', fontSize: 11, fontWeight: 500,
            background: '#fff', color: '#0f2744',
            border: '0.5px solid #d0d0c8', borderRadius: 5,
            textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
