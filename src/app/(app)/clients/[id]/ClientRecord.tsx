'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatCurrency, formatPercent, formatDate, getInitials, calcGainLoss } from '@/lib/utils'
import OverviewTab from './tabs/OverviewTab'
import InvestmentsTab from './tabs/InvestmentsTab'
import InvestmentDocsTab from './tabs/InvestmentDocsTab'
import UpdatesSentTab from './tabs/UpdatesSentTab'
import NotesTab from './tabs/NotesTab'

type Tab = 'overview' | 'investments' | 'investment_docs' | 'updates_sent' | 'notes'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'investments', label: 'Investments' },
  { key: 'investment_docs', label: 'Investment docs' },
  { key: 'updates_sent', label: 'Updates sent' },
  { key: 'notes', label: 'Notes' },
]

function KycBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    verified: { label: 'KYC verified', cls: 'pill-green' },
    renewal_due: { label: 'KYC renewal due', cls: 'pill-amber' },
    outstanding: { label: 'KYC outstanding', cls: 'pill-red' },
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

export interface ClientRow {
  id: string
  full_name: string
  investor_reference: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postcode: string | null
  date_joined: string | null
  tax_status: string
  kyc_status: string
  kyc_expiry: string | null
  default_fee_rate: number
  report_delivery_email: string | null
  lead_investor_id: string | null
  entity_type: string
  holding_location: string
  reporting_entity_defaults: string[]
  report_delivery_method: string
  notes: string | null
}

interface PortfolioRow {
  client_id: string
  company_id: string
  total_invested: number
  current_value: number
  gain_loss: number
}

interface MembershipDoc {
  id: string
  type: string
  filename: string
  storage_url: string | null
  document_date: string | null
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
  membershipDocs: MembershipDoc[]
}

export default function ClientRecord({
  client, lead, linkedEntities, portfolioRows, investments,
  valuations, documents, updateRecipients, notes, membershipDocs,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [actionsOpen, setActionsOpen] = useState(false)

  const clientId = client.id
  const fullName = client.full_name

  // Aggregate portfolio across all entities in group
  const groupPortfolio = portfolioRows.reduce<{ totalInvested: number; currentValue: number; gainLoss: number }>(
    (acc, row) => {
      acc.totalInvested += Number(row.total_invested ?? 0)
      acc.currentValue += Number(row.current_value ?? 0)
      acc.gainLoss += Number(row.gain_loss ?? 0)
      return acc
    },
    { totalInvested: 0, currentValue: 0, gainLoss: 0 }
  )

  const companySet = new Set(portfolioRows.map(r => r.company_id as string))
  const holdingsCount = investments.length

  const { pct } = calcGainLoss(groupPortfolio.totalInvested, groupPortfolio.currentValue)
  const gainLossAbs = groupPortfolio.gainLoss
  const initials = getInitials(fullName)

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/clients" style={{ color: '#888', textDecoration: 'none' }}>Clients</Link>
        {' › '}
        <span>{fullName}</span>
      </div>

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
                <span className="pill pill-grey">{entityTypeLabel(client.entity_type)}</span>
                <KycBadge status={client.kyc_status} />
                <TaxBadge status={client.tax_status} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Actions dropdown */}
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
                    <ActionItem label="Generate portfolio statement" />
                    <ActionItem label="Generate investor update letter" />
                    <ActionItem label="Generate EIS confirmation" />
                  </ActionGroup>
                  <ActionDivider />
                  <ActionGroup label="Investments">
                    <ActionItem label="Add new investment" />
                  </ActionGroup>
                  <ActionDivider />
                  <ActionGroup label="Documents & signatures">
                    <ActionItem label="Send document for signature" />
                    <ActionItem label="Upload document" />
                  </ActionGroup>
                  <ActionDivider />
                  <ActionGroup label="Client">
                    <ActionItem label="Add note" onClick={() => { setTab('notes'); setActionsOpen(false) }} />
                    <ActionItem label="Edit client details" />
                  </ActionGroup>
                </div>
              )}
            </div>

            <button className="btn btn-primary">Generate report</button>
          </div>
        </div>
      </div>

      {/* Headline stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatCard
          label="Total invested"
          value={formatCurrency(groupPortfolio.totalInvested)}
        />
        <StatCard
          label="Current valuation"
          value={formatCurrency(groupPortfolio.currentValue)}
          sub={
            <span className={gainLossAbs >= 0 ? 'text-positive' : 'text-negative'}>
              {gainLossAbs >= 0 ? '+' : ''}{formatCurrency(gainLossAbs)} ({formatPercent(pct)})
            </span>
          }
        />
        <StatCard
          label="Companies invested"
          value={`${companySet.size}`}
          sub={<span style={{ color: '#888' }}>{holdingsCount} holding{holdingsCount !== 1 ? 's' : ''}</span>}
        />
        <StatCard
          label="Pending actions"
          value="0"
        />
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '0.5px solid #e8e7e0', marginBottom: 0 }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
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
            linkedEntities={linkedEntities}
            portfolioRows={portfolioRows}
            membershipDocs={membershipDocs}
          />
        )}
        {tab === 'investments' && (
          <InvestmentsTab
            investments={investments}
            valuations={valuations}
            linkedEntities={linkedEntities}
          />
        )}
        {tab === 'investment_docs' && (
          <InvestmentDocsTab documents={documents} />
        )}
        {tab === 'updates_sent' && (
          <UpdatesSentTab updateRecipients={updateRecipients} />
        )}
        {tab === 'notes' && (
          <NotesTab notes={notes} clientId={clientId} />
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#0f2744' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, marginTop: 3 }}>{sub}</div>}
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

function ActionItem({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '6px 14px', fontSize: 12, color: '#333',
        background: 'none', border: 'none', cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f2')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {label}
    </button>
  )
}

function entityTypeLabel(type: string) {
  const map: Record<string, string> = {
    own_name: 'Own name', family: 'Family', corporate: 'Corporate',
  }
  return map[type] ?? type
}
