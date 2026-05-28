'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import type { Client, PortfolioRow, Document } from '@/types'
import OverviewTab from './tabs/OverviewTab'
import DetailsTab from './tabs/DetailsTab'
import InvestmentsTab from './tabs/InvestmentsTab'
import InvestmentDocsTab from './tabs/InvestmentDocsTab'
import UpdatesSentTab from './tabs/UpdatesSentTab'
import NotesTab from './tabs/NotesTab'
import PendingActionsTab from './tabs/PendingActionsTab'
import type { StatementDoc } from './_components/GenerateStatementSection'

// Re-export as ClientRow so existing imports from this file keep working.
export type { ClientRow } from '@/types'
// Local alias used throughout this component.
type ClientRow = Client

type Tab = 'overview' | 'investments' | 'documents' | 'updates_sent' | 'notes' | 'details' | 'pending_actions'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',    label: 'Overview' },
  { key: 'investments', label: 'Investments' },
  { key: 'documents',   label: 'Documents' },
  { key: 'updates_sent', label: 'Updates sent' },
  { key: 'notes',       label: 'Notes' },
  { key: 'details',     label: 'Details' },
]

function KycBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    verified:    { label: 'KYC verified',     cls: 'pill-green' },
    renewal_due: { label: 'KYC renewal due',  cls: 'pill-amber' },
    outstanding: { label: 'KYC outstanding',  cls: 'pill-red'   },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'pill-grey' }
  return <span className={`pill ${cls}`}>{label}</span>
}

function TaxBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    eis: 'EIS', seis: 'SEIS', both: 'EIS/SEIS', neither: 'No EIS/SEIS',
  }
  return <span className="pill pill-blue">{map[status] ?? status}</span>
}

interface Props {
  client: ClientRow
  lead: ClientRow | null
  linkedEntities: ClientRow[]
  portfolioRows: PortfolioRow[]
  investments: Record<string, unknown>[]
  valuations: Record<string, unknown>[]
  documents: Record<string, unknown>[]
  updateRecipients: Record<string, unknown>[]
  notes: Record<string, unknown>[]
  membershipDocs: Document[]
  pendingInvestments: Record<string, unknown>[]
  activeDeals: Record<string, unknown>[]
  followUpNotes: Record<string, unknown>[]
  lastActivity: string | null
  relationships: Record<string, unknown>[]
  feeSchedules: { id: string; name: string }[]
  nominees: { id: string; name: string }[]
  portfolioStatements: StatementDoc[]
  outlookConnected?: boolean
  latestSends?: Record<string, string>
  deferredPayments: Record<string, unknown>[]
}

export default function ClientRecord({
  client, lead, linkedEntities, portfolioRows, investments,
  valuations, documents, updateRecipients, notes, membershipDocs,
  pendingInvestments, activeDeals, followUpNotes, lastActivity, relationships,
  feeSchedules, nominees, portfolioStatements, outlookConnected, latestSends,
  deferredPayments,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('overview')
  const [actionsOpen, setActionsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  function closeActions() { setActionsOpen(false) }

  // Read ?tab= from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('tab') as Tab | null
    if (t && TABS.some(tab => tab.key === t)) setTab(t)
  }, [])

  const switchTab = useCallback((key: Tab) => {
    setTab(key)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', key)
    window.history.replaceState(null, '', url.toString())
  }, [])

  const clientId = client.id
  const fullName = client.full_name
  const initials = getInitials(fullName)

  return (
    <div>
      <Breadcrumb items={[{ label: 'Clients', href: '/clients' }, { label: fullName }]} />

      {/* Header card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Avatar */}
            <div
              style={{
                width: 48, height: 48, borderRadius: '50%',
                background: '#1d9e75', color: '#fff',
                fontSize: 16, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {initials}
            </div>

            {/* Name + badges */}
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{fullName}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                {client.investor_reference && (
                  <span style={{ fontSize: 11, color: '#888' }}>Ref: {client.investor_reference}</span>
                )}
                <KycBadge status={client.kyc_status} />
                <TaxBadge status={client.tax_status} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setActionsOpen(o => !o)}
              >
                Actions ▾
              </button>
              {actionsOpen && (
                <div
                  style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 4,
                    background: '#fff', border: '0.5px solid #e8e7e0',
                    borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    zIndex: 50, minWidth: 220, padding: '6px 0',
                  }}
                  onMouseLeave={() => setActionsOpen(false)}
                >
                  <ActionGroup label="Reporting">
                    <ActionItem label="Generate portfolio statement" href={`/reports/portfolio-statement?client=${clientId}`} />
                    <ActionItem label="Generate investor update letter" href="/reports/investor-update" />
                    <ActionItem label="Generate EIS confirmation" onClick={() => { closeActions(); showToast('EIS confirmation generation coming soon') }} />
                  </ActionGroup>
                  <ActionDivider />
                  <ActionGroup label="Investments">
                    <ActionItem label="Add new investment" href="/deals/new" />
                  </ActionGroup>
                  <ActionDivider />
                  <ActionGroup label="Documents & signatures">
                    <ActionItem label="Send document for signature" onClick={() => { closeActions(); showToast('Document signing coming soon — Documenso integration required') }} />
                    <ActionItem label="Upload document" onClick={() => { closeActions(); showToast('Document upload coming soon') }} />
                  </ActionGroup>
                  <ActionDivider />
                  <ActionGroup label="Client">
                    <ActionItem label="Add note" onClick={() => { switchTab('notes'); setActionsOpen(false) }} />
                    <ActionItem label="Edit client details" href={`/clients/${clientId}/edit`} />
                  </ActionGroup>
                </div>
              )}
            </div>

            <button className="btn btn-primary">Generate report</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '0.5px solid #e8e7e0', marginBottom: 0 }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              style={{
                padding: '9px 16px',
                fontSize: 12,
                fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? '#0f2744' : '#666',
                background: 'none',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid #0f2744' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ paddingTop: 16 }}>
        {tab === 'overview' && (
          <OverviewTab
            client={client}
            investments={investments}
            valuations={valuations}
            pendingDeals={activeDeals}
            membershipDocs={membershipDocs as unknown as { id: string; type: string; company_id: string | null }[]}
            onSwitchToInvestments={() => switchTab('investments')}
            portfolioStatements={portfolioStatements}
            deferredPayments={deferredPayments}
          />
        )}
        {tab === 'investments' && (
          <InvestmentsTab
            investments={investments}
            valuations={valuations}
            linkedEntities={linkedEntities}
            deferredPayments={deferredPayments}
          />
        )}
        {tab === 'details' && (
          <DetailsTab
            client={client}
            linkedEntities={linkedEntities}
            portfolioRows={portfolioRows}
            membershipDocs={membershipDocs}
            lastActivity={lastActivity}
            investments={investments}
            relationships={relationships}
            feeSchedules={feeSchedules}
            nominees={nominees}
          />
        )}
        {tab === 'documents' && (
          <InvestmentDocsTab
            documents={documents}
            clientFullName={client.full_name}
            clientEmail={client.email}
            clientId={clientId}
            outlookConnected={outlookConnected}
            latestSends={latestSends}
          />
        )}
        {tab === 'updates_sent' && (
          <UpdatesSentTab updateRecipients={updateRecipients} />
        )}
        {tab === 'notes' && (
          <NotesTab notes={notes} clientId={clientId} />
        )}
        {tab === 'pending_actions' && (
          <PendingActionsTab
            clientId={clientId}
            kycExpiry={client.kyc_expiry}
            pendingInvestments={pendingInvestments as unknown as Parameters<typeof PendingActionsTab>[0]['pendingInvestments']}
            activeDeals={activeDeals as unknown as Parameters<typeof PendingActionsTab>[0]['activeDeals']}
            followUpNotes={followUpNotes as unknown as Parameters<typeof PendingActionsTab>[0]['followUpNotes']}
            investments={investments}
            documents={documents}
          />
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#0f2744', color: '#fff', fontSize: 12, fontWeight: 500,
          padding: '10px 20px', borderRadius: 6, zIndex: 2000,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}

    </div>
  )
}

function ActionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', padding: '6px 14px 3px' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function ActionDivider() {
  return <div style={{ borderTop: '0.5px solid #e8e7e0', margin: '4px 0' }} />
}

function ActionItem({ label, onClick, href }: { label: string; onClick?: () => void; href?: string }) {
  const itemStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '6px 14px', fontSize: 12, color: '#333',
    background: 'none', border: 'none', cursor: 'pointer',
    textDecoration: 'none',
  }
  if (href) {
    return (
      <Link
        href={href}
        style={itemStyle}
        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f2')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        {label}
      </Link>
    )
  }
  return (
    <button
      onClick={onClick}
      style={itemStyle}
      onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f2')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {label}
    </button>
  )
}

