'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { getInitials } from '@/lib/utils'
import UpdateValuationModal from './UpdateValuationModal'
import CompanyOverviewTab     from './tabs/CompanyOverviewTab'
import CompanyInvestorsTab    from './tabs/CompanyInvestorsTab'
import CompanyValuationsTab   from './tabs/CompanyValuationsTab'
import CompanyShareClassesTab from './tabs/CompanyShareClassesTab'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string
  name: string
  sector: string | null
  stage: string | null
  eis_eligible: boolean
  logo_url: string | null
  website: string | null
  description: string | null
  share_classes: unknown
}

interface Investment {
  id: string
  client_id: string
  transaction_type?: string
  clients: { id: string; full_name: string; lead_investor_id: string | null } | null
}

type Tab = 'overview' | 'investors' | 'valuations' | 'share_classes' | 'performance' | 'documents' | 'updates' | 'legal'

interface Props {
  company: Company
  valuations: Record<string, unknown>[]
  currentValuation: Record<string, unknown> | null
  investments: Record<string, unknown>[]
  kpiData: Record<string, unknown>[]
  internalUpdates: Record<string, unknown>[]
  news: Record<string, unknown>[]
  openDeals: Record<string, unknown>[]
  companyDocs: Record<string, unknown>[]
  shareClasses: Record<string, unknown>[]
  rankingHistory: Record<string, unknown>[]
  initialAction: string | null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompanyAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return <img src={logoUrl} alt={name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain' }} />
  }
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 8,
      background: '#dff0f9', color: '#185fa5',
      fontSize: 16, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {getInitials(name)}
    </div>
  )
}

function StagePill({ stage }: { stage: string | null }) {
  if (!stage) return null
  const labels: Record<string, string> = {
    'pre-seed': 'Pre-seed', 'seed': 'Seed', 'series_a': 'Series A',
    'series_b': 'Series B', 'series_c': 'Series C', 'growth': 'Growth', 'late_stage': 'Late stage',
  }
  return <span className="pill pill-blue" style={{ fontSize: 10 }}>{labels[stage] ?? stage}</span>
}

// ─── Component ────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',       label: 'Overview'       },
  { key: 'investors',      label: 'Investors'      },
  { key: 'valuations',     label: 'Valuations'     },
  { key: 'share_classes',  label: 'Share classes'  },
  { key: 'performance',    label: 'Performance'    },
  { key: 'documents',      label: 'Documents'      },
  { key: 'updates',        label: 'Updates'        },
  { key: 'legal',          label: 'Legal'          },
]

export default function CompanyPage({
  company, valuations, currentValuation, investments,
  kpiData, internalUpdates, news, openDeals, companyDocs,
  shareClasses, rankingHistory, initialAction,
}: Props) {
  const [activeTab,          setActiveTab]          = useState<Tab>('overview')
  const [showValuationModal, setShowValuationModal] = useState(initialAction === 'update_valuation')

  const inv = investments as unknown as Investment[]

  // Lightweight investor count for header (remaining > 0)
  const currentInvestorsCount = useMemo(() => {
    const sharesIn  = new Map<string, number>()
    const sharesOut = new Map<string, number>()
    for (const i of inv) {
      const cid = i.client_id
      const t   = i.transaction_type ?? 'buy'
      if (t === 'buy' || t === 'transfer_in') {
        sharesIn.set(cid, (sharesIn.get(cid) ?? 0) + 1)
      } else if (t === 'sell' || t === 'transfer_out') {
        sharesOut.set(cid, (sharesOut.get(cid) ?? 0) + 1)
      }
    }
    // Count clients who have any buy but haven't fully exited
    // (simplified: just track unique client IDs with buy transactions,
    // minus those whose sell count matches or exceeds buys — approximate)
    // For display accuracy: count clients in netByClient with remaining > 0
    const net = new Map<string, { in: number; out: number }>()
    for (const i of inv) {
      const cid = i.client_id
      const t   = i.transaction_type ?? 'buy'
      if (!net.has(cid)) net.set(cid, { in: 0, out: 0 })
      const pos = net.get(cid)!
      if (t === 'buy' || t === 'transfer_in')   pos.in  += (i as unknown as Record<string, unknown>).shares_purchased as number ?? 1
      else if (t === 'sell' || t === 'transfer_out') pos.out += (i as unknown as Record<string, unknown>).shares_purchased as number ?? 1
    }
    return [...net.values()].filter(p => p.in - p.out > 0).length
  }, [inv])

  return (
    <div>
      <Breadcrumb items={[{ label: 'Portfolio', href: '/portfolio' }, { label: company.name }]} />

      {/* Header card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <CompanyAvatar name={company.name} logoUrl={company.logo_url} />
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{company.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                {company.sector && <span style={{ fontSize: 11, color: '#888' }}>{company.sector}</span>}
                <StagePill stage={company.stage} />
                {company.eis_eligible && <span className="pill pill-green" style={{ fontSize: 10 }}>EIS eligible</span>}
                <span style={{ fontSize: 11, color: '#888' }}>
                  {currentInvestorsCount} investor{currentInvestorsCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              disabled
              title="Coming soon"
              style={{ opacity: 0.45, cursor: 'not-allowed' }}
            >
              Add info
            </button>
            <button className="btn btn-secondary" onClick={() => setShowValuationModal(true)}>
              Update valuation
            </button>
            <Link href="/reports/investor-update" className="btn btn-secondary">Investor update</Link>
            <Link href={`/portfolio/${company.id}/settings`} className="btn btn-secondary">Settings</Link>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderTop: '0.5px solid #e8e7e0', marginTop: 14, marginLeft: -16, marginRight: -16, paddingLeft: 16 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 14px', fontSize: 12, fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === tab.key ? '2px solid #0f2744' : '2px solid transparent',
                color: activeTab === tab.key ? '#0f2744' : '#888',
                marginBottom: -0.5,
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <CompanyOverviewTab
          companyId={company.id}
          investments={investments}
          currentValuation={currentValuation}
          kpiData={kpiData as unknown as Parameters<typeof CompanyOverviewTab>[0]['kpiData']}
          internalUpdates={internalUpdates}
          openDeals={openDeals}
          companyDocs={companyDocs}
          onOpenValuationModal={() => setShowValuationModal(true)}
          onSwitchTab={tab => setActiveTab(tab as Tab)}
        />
      )}

      {activeTab === 'investors' && (
        <CompanyInvestorsTab
          investments={investments}
          currentValuation={currentValuation}
        />
      )}

      {activeTab === 'valuations' && (
        <CompanyValuationsTab
          valuations={valuations}
          investments={investments}
          onOpenModal={() => setShowValuationModal(true)}
        />
      )}

      {activeTab === 'share_classes' && (
        <CompanyShareClassesTab
          companyId={company.id}
          shareClasses={shareClasses}
          rankingHistory={rankingHistory}
        />
      )}

      {(activeTab === 'performance' || activeTab === 'documents' || activeTab === 'updates' || activeTab === 'legal') && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Coming soon</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#0f2744', marginBottom: 8 }}>
            {TABS.find(t => t.key === activeTab)?.label} tab
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>This tab is under construction and will be available shortly.</div>
        </div>
      )}

      {showValuationModal && (
        <UpdateValuationModal
          companyId={company.id}
          companyName={company.name}
          currentPrice={(currentValuation as { share_price?: number } | null)?.share_price ?? null}
          onClose={() => setShowValuationModal(false)}
        />
      )}
    </div>
  )
}
