'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPercent, formatDate, getInitials, calcGainLoss } from '@/lib/utils'
import OverviewTab from './tabs/OverviewTab'
import InvestmentsTab from './tabs/InvestmentsTab'
import InvestmentDocsTab from './tabs/InvestmentDocsTab'
import UpdatesSentTab from './tabs/UpdatesSentTab'
import NotesTab from './tabs/NotesTab'
import PendingActionsTab from './tabs/PendingActionsTab'

type Tab = 'overview' | 'investments' | 'investment_docs' | 'updates_sent' | 'notes' | 'pending_actions'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',         label: 'Overview' },
  { key: 'investments',      label: 'Investments' },
  { key: 'investment_docs',  label: 'Investment docs' },
  { key: 'updates_sent',     label: 'Updates sent' },
  { key: 'notes',            label: 'Notes' },
  { key: 'pending_actions',  label: 'Pending actions' },
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
  fund_type: string
  active_fund_type: string | null
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
  pendingInvestments: Record<string, unknown>[]
  activeDeals: Record<string, unknown>[]
  followUpNotes: Record<string, unknown>[]
  lastActivity: string | null
}

export default function ClientRecord({
  client, lead, linkedEntities, portfolioRows, investments,
  valuations, documents, updateRecipients, notes, membershipDocs,
  pendingInvestments, activeDeals, followUpNotes, lastActivity,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('overview')
  const [actionsOpen, setActionsOpen] = useState(false)
  const [showFundTypeModal, setShowFundTypeModal] = useState(false)

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

  // Aggregate portfolio across all entities in group
  const groupPortfolio = portfolioRows.reduce<{ totalInvested: number; currentValue: number; gainLoss: number }>(
    (acc, row) => {
      acc.totalInvested += Number(row.total_invested ?? 0)
      acc.currentValue  += Number(row.current_value  ?? 0)
      acc.gainLoss      += Number(row.gain_loss       ?? 0)
      return acc
    },
    { totalInvested: 0, currentValue: 0, gainLoss: 0 }
  )

  const companySet    = new Set(portfolioRows.map(r => r.company_id as string))
  const holdingsCount = investments.length

  const { pct }      = calcGainLoss(groupPortfolio.totalInvested, groupPortfolio.currentValue)
  const gainLossAbs  = groupPortfolio.gainLoss
  const initials     = getInitials(fullName)

  // Count pending actions for badge and stat card
  const pendingCount = useMemo(() => {
    let count = pendingInvestments.length + activeDeals.length + followUpNotes.length
    // KYC expiry within 60 days or overdue
    if (client.kyc_expiry) {
      const days = Math.floor((new Date(client.kyc_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      if (days <= 60) count++
    }
    // EIS certificates outstanding
    const eisCompanyIds = new Set(
      investments
        .filter(i => { const e = i.eis_status as string; return e === 'yes' || e === 'tbc' })
        .map(i => (i.companies as { id: string } | null)?.id)
        .filter((cid): cid is string => Boolean(cid))
    )
    const eisDocCompanyIds = new Set(
      documents
        .filter(d => (d.type as string)?.toLowerCase().includes('eis') && d.company_id)
        .map(d => d.company_id as string)
    )
    for (const cid of eisCompanyIds) {
      if (!eisDocCompanyIds.has(cid)) count++
    }
    return count
  }, [pendingInvestments, activeDeals, followUpNotes, client.kyc_expiry, investments, documents])

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
                    <ActionItem label="Add note" onClick={() => { switchTab('notes'); setActionsOpen(false) }} />
                    <ActionItem label="Edit fund type" onClick={() => { setShowFundTypeModal(true); setActionsOpen(false) }} />
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
          value={`${pendingCount}`}
          sub={pendingCount > 0
            ? <button
                onClick={() => switchTab('pending_actions')}
                style={{ fontSize: 11, color: '#a32d2d', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                View all →
              </button>
            : <span style={{ color: '#1d9e75', fontSize: 11 }}>All clear</span>
          }
        />
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
              {t.key === 'pending_actions' && pendingCount > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#a32d2d', color: '#fff',
                  fontSize: 10, fontWeight: 700, lineHeight: 1,
                }}>
                  {pendingCount}
                </span>
              )}
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
            lastActivity={lastActivity}
            investments={investments}
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

      {/* Edit fund type modal */}
      {showFundTypeModal && (
        <EditFundTypeModal
          clientId={client.id}
          currentFundType={client.fund_type ?? 'syndicate'}
          currentActiveFundType={client.active_fund_type ?? null}
          onClose={() => setShowFundTypeModal(false)}
          onSaved={() => { setShowFundTypeModal(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function EditFundTypeModal({
  clientId, currentFundType, currentActiveFundType, onClose, onSaved,
}: {
  clientId: string
  currentFundType: string
  currentActiveFundType: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [fundType,       setFundType]       = useState(currentFundType)
  const [activeFundType, setActiveFundType] = useState(currentActiveFundType ?? 'syndicate')
  const [saving,         setSaving]         = useState(false)
  const [err,            setErr]            = useState('')

  const inputSt: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '0.5px solid #d0d0c8', borderRadius: 5, fontSize: 12, outline: 'none', boxSizing: 'border-box', background: '#fff' }
  const labelSt: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4 }

  async function handleSave() {
    setSaving(true); setErr('')
    const { error } = await supabase.from('clients').update({
      fund_type: fundType,
      active_fund_type: fundType === 'both' ? activeFundType : null,
    }).eq('id', clientId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: 400, padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Edit fund type</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#aaa' }}>×</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelSt}>Fund type</label>
          <select value={fundType} onChange={e => setFundType(e.target.value)} style={inputSt}>
            <option value="syndicate">Syndicate</option>
            <option value="multi_manager">Multi Manager</option>
            <option value="both">Both</option>
          </select>
        </div>
        {fundType === 'both' && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Currently active fund type</label>
            <select value={activeFundType} onChange={e => setActiveFundType(e.target.value)} style={inputSt}>
              <option value="syndicate">Syndicate</option>
              <option value="multi_manager">Multi Manager</option>
            </select>
          </div>
        )}
        {fundType === 'multi_manager' && (
          <div style={{ background: '#fffbeb', border: '0.5px solid #f0c674', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#78500a' }}>
            Multi Manager is closed to new clients. Only assign this to existing Multi Manager investors.
          </div>
        )}
        {err && <div style={{ fontSize: 11, color: '#a32d2d', marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 12 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>Cancel</button>
        </div>
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
