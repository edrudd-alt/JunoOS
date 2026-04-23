'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { formatCurrency, formatPercent, formatDate, getInitials, calcGainLoss } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Client = {
  id: string
  full_name: string
  investor_reference: string | null
  email: string | null
  kyc_status: string
  kyc_expiry: string | null
  vehicle_type: string | null
  nominee_id: string | null
  tax_status: string
  date_joined: string | null
  lead_investor_id: string | null
  fund_type: string
}

type PortfolioData = {
  totalInvested: number
  currentValue: number
  gainLoss: number
  companyIds: string[]
}

type ClientFlag = {
  kycOverdue: boolean
  kycRenewalDue: boolean
  appUnsigned: boolean
}

type SortKey = 'last_investment' | 'first_name' | 'last_name' | 'portfolio_value' | 'companies' | 'last_activity'
type SortDir = 'asc' | 'desc'

interface Props {
  allClients: Record<string, unknown>[]
  leadNameById: Record<string, string>
  portfolioByClient: Record<string, PortfolioData>
  clientsByCompany: Record<string, string[]>
  companies: { id: string; name: string }[]
  lastInvestmentByClient: Record<string, string>
  lastActivityByClient: Record<string, string>
  attentionCounts: { kycOverdue: number; kycRenewalDue: number; appUnsigned: number; amlOutstanding: number }
  clientFlags: Record<string, ClientFlag>
  nominees: { id: string; name: string }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PER_PAGE = 20
const LS_KEY   = 'junoos_attention_config'

const DEFAULT_CONFIG: Record<string, boolean> = {
  kycOverdue: true, kycRenewalDue: true, appUnsigned: true, amlOutstanding: true,
  eisMissing: false, pendingActions: false, noActivity: false, reportNotSent: false,
}

const CONFIG_CATS = [
  { key: 'kycOverdue',     label: 'KYC overdue' },
  { key: 'kycRenewalDue',  label: 'KYC renewal due within 60 days' },
  { key: 'appUnsigned',    label: 'Application form unsigned' },
  { key: 'amlOutstanding', label: 'AML checks outstanding' },
  { key: 'eisMissing',     label: 'EIS certificate missing' },
  { key: 'pendingActions', label: 'Pending deal actions' },
  { key: 'noActivity',     label: 'No activity in 90 days' },
  { key: 'reportNotSent',  label: 'Report not sent in 6 months' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function KycBadge({ status, viaLead }: { status: string; viaLead?: boolean }) {
  if (viaLead)               return <span className="pill pill-grey"  style={{ fontSize: 10 }}>Via lead</span>
  if (status === 'verified')    return <span className="pill pill-green" style={{ fontSize: 10 }}>Verified</span>
  if (status === 'renewal_due') return <span className="pill pill-amber" style={{ fontSize: 10 }}>Renewal</span>
  if (status === 'outstanding') return <span className="pill pill-red"   style={{ fontSize: 10 }}>Overdue</span>
  return <span className="pill pill-grey" style={{ fontSize: 10 }}>{status}</span>
}

function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%',
      background: muted ? '#999' : '#0f2744',
      color: '#fff', fontSize: 10, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {getInitials(name)}
    </div>
  )
}

function FundTypePill({ code }: { code: string }) {
  const isMM = code === 'multi_manager', isBoth = code === 'both', isEIS = code === 'eis_fund'
  return (
    <span style={{
      fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 600,
      background: isMM ? '#fff3e0' : isBoth ? '#f0f0ec' : isEIS ? '#f0ecfb' : '#e8f5f0',
      color:      isMM ? '#e0952a' : isBoth ? '#555'    : isEIS ? '#6b21a8' : '#1d9e75',
    }}>
      {isMM ? 'MM' : isBoth ? 'Both' : isEIS ? 'EIS' : 'S'}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  nominee:   'Nominee',
  corporate: 'Corporate vehicle',
  trust:     'Trust',
  estate:    'Estate',
  pension:   'Pension',
}

export default function ClientList({
  allClients, leadNameById, portfolioByClient, clientsByCompany,
  companies, lastInvestmentByClient, lastActivityByClient, attentionCounts, clientFlags, nominees,
}: Props) {
  const clients = allClients as unknown as Client[]
  const nomineeMap = useMemo(() => new Map(nominees.map(n => [n.id, n.name])), [nominees])

  // Filters + sort
  const [search,         setSearch]         = useState('')
  const [kycFilter,      setKycFilter]      = useState('all')
  const [companyFilter,  setCompanyFilter]  = useState('all')
  const [fundTypeFilter, setFundTypeFilter] = useState('all')
  const [flagsFilter,    setFlagsFilter]    = useState('all')
  const [sortKey,        setSortKey]        = useState<SortKey>('last_investment')
  const [sortDir,        setSortDir]        = useState<SortDir>('desc')
  const [page,           setPage]           = useState(1)

  // Attention panel
  const [showConfig,      setShowConfig]      = useState(false)
  const [config,          setConfig]          = useState<Record<string, boolean>>(DEFAULT_CONFIG)
  const [attentionFilter, setAttentionFilter] = useState<string | null>(null)

  // More menu
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const tableRef = useRef<HTMLDivElement>(null)

  // Load attention config from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY)
      if (stored) setConfig(prev => ({ ...prev, ...JSON.parse(stored) }))
    } catch {}
  }, [])

  // Close more menu when clicking elsewhere
  useEffect(() => {
    if (!openMenu) return
    const handler = () => setOpenMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenu])

  function saveConfig(key: string, value: boolean) {
    const next = { ...config, [key]: value }
    setConfig(next)
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch {}
  }

  // Build linked-entity map from flat client list
  const linkedByLead = useMemo(() => {
    const map: Record<string, Client[]> = {}
    for (const c of clients) {
      if (c.lead_investor_id) {
        if (!map[c.lead_investor_id]) map[c.lead_investor_id] = []
        map[c.lead_investor_id].push(c)
      }
    }
    return map
  }, [clients])

  // Aggregate portfolio for a lead (own + all linked entities)
  const getLeadPortfolio = useCallback((leadId: string) => {
    const ids = [leadId, ...(linkedByLead[leadId] ?? []).map(c => c.id)]
    let totalInvested = 0, currentValue = 0, gainLoss = 0
    const cos = new Set<string>()
    for (const id of ids) {
      const p = portfolioByClient[id]
      if (p) {
        totalInvested += p.totalInvested
        currentValue  += p.currentValue
        gainLoss      += p.gainLoss
        p.companyIds.forEach(c => cos.add(c))
      }
    }
    return { totalInvested, currentValue, gainLoss, companyCount: cos.size }
  }, [linkedByLead, portfolioByClient])

  // Filter
  const filtered = useMemo(() => {
    let r = clients
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(c => c.full_name.toLowerCase().includes(q))
    }
    if (kycFilter !== 'all')      r = r.filter(c => c.kyc_status === kycFilter)
    if (companyFilter !== 'all') {
      const s = new Set(clientsByCompany[companyFilter] ?? [])
      r = r.filter(c => s.has(c.id))
    }
    if (fundTypeFilter !== 'all') r = r.filter(c => (c.fund_type || 'syndicate') === fundTypeFilter)
    if (flagsFilter === 'has_flags') {
      r = r.filter(c => { const f = clientFlags[c.id]; return !!(f && (f.kycOverdue || f.kycRenewalDue || f.appUnsigned)) })
    } else if (flagsFilter === 'no_flags') {
      r = r.filter(c => { const f = clientFlags[c.id]; return !f || (!f.kycOverdue && !f.kycRenewalDue && !f.appUnsigned) })
    }
    if (attentionFilter) {
      r = r.filter(c => {
        const f = clientFlags[c.id]
        if (attentionFilter === 'kycOverdue')     return !!f?.kycOverdue
        if (attentionFilter === 'kycRenewalDue')  return !!f?.kycRenewalDue
        if (attentionFilter === 'appUnsigned')    return !!f?.appUnsigned
        if (attentionFilter === 'amlOutstanding') return c.kyc_status === 'outstanding'
        return true
      })
    }
    return r
  }, [clients, search, kycFilter, companyFilter, fundTypeFilter, flagsFilter, attentionFilter, clientsByCompany, clientFlags])

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      // last_investment: clients with no investment always go to bottom
      if (sortKey === 'last_investment') {
        const ad = lastInvestmentByClient[a.id] ?? ''
        const bd = lastInvestmentByClient[b.id] ?? ''
        if (!ad && !bd) return 0
        if (!ad) return 1
        if (!bd) return -1
        return sortDir === 'desc' ? bd.localeCompare(ad) : ad.localeCompare(bd)
      }

      let cmp = 0
      if (sortKey === 'first_name') {
        cmp = (a.full_name.split(' ')[0] ?? '').localeCompare(b.full_name.split(' ')[0] ?? '')
      } else if (sortKey === 'last_name') {
        const ap = a.full_name.split(' '), bp = b.full_name.split(' ')
        cmp = (ap[ap.length - 1] ?? '').localeCompare(bp[bp.length - 1] ?? '')
      } else if (sortKey === 'portfolio_value') {
        const av = a.lead_investor_id ? (portfolioByClient[a.id]?.currentValue ?? 0) : getLeadPortfolio(a.id).currentValue
        const bv = b.lead_investor_id ? (portfolioByClient[b.id]?.currentValue ?? 0) : getLeadPortfolio(b.id).currentValue
        cmp = av - bv
      } else if (sortKey === 'companies') {
        const ac = a.lead_investor_id ? (portfolioByClient[a.id]?.companyIds.length ?? 0) : getLeadPortfolio(a.id).companyCount
        const bc = b.lead_investor_id ? (portfolioByClient[b.id]?.companyIds.length ?? 0) : getLeadPortfolio(b.id).companyCount
        cmp = ac - bc
      } else if (sortKey === 'last_activity') {
        cmp = (lastActivityByClient[a.id] ?? '').localeCompare(lastActivityByClient[b.id] ?? '')
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [filtered, sortKey, sortDir, portfolioByClient, lastInvestmentByClient, lastActivityByClient, getLeadPortfolio])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE))
  const paginated  = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // Counts
  const leadsCount  = clients.filter(c => !c.lead_investor_id).length
  const linkedCount = clients.length - leadsCount

  // Column sort
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(1)
  }
  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span style={{ color: '#d0d0d0', fontSize: 9, marginLeft: 2 }}>↕</span>
    return <span style={{ color: '#185fa5', fontSize: 9, marginLeft: 2 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  // Attention filter with scroll
  function applyAttentionFilter(key: string) {
    setAttentionFilter(prev => prev === key ? null : key)
    setPage(1)
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // Styles
  function chipStyle(active: boolean): React.CSSProperties {
    return {
      fontSize: 10, padding: '4px 10px', borderRadius: 12,
      border: `0.5px solid ${active ? '#185fa5' : '#e0e0d8'}`,
      background: active ? '#e6f1fb' : '#fff',
      color: active ? '#185fa5' : '#888',
      outline: 'none', cursor: 'pointer',
    }
  }

  const tagStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 10, padding: '2px 8px', borderRadius: 10,
    background: '#e6f1fb', color: '#185fa5',
  }
  const xBtn: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0,
    cursor: 'pointer', color: '#185fa5', fontSize: 12, lineHeight: 1,
  }
  const thBase: React.CSSProperties = {
    padding: '9px 12px', fontSize: 11, fontWeight: 500, color: '#888',
    borderBottom: '0.5px solid #e8e7e0', whiteSpace: 'nowrap', background: '#f9f9f7',
  }

  const hasFilters = !!(search || kycFilter !== 'all' || companyFilter !== 'all' || fundTypeFilter !== 'all' || flagsFilter !== 'all' || attentionFilter)

  // Attention cells definition
  const ATTENTION_CELLS = [
    { key: 'kycOverdue',    count: attentionCounts.kycOverdue,    label: 'KYC OVERDUE',     detail: 'clients with expired KYC',        urgentColor: '#a32d2d' },
    { key: 'kycRenewalDue', count: attentionCounts.kycRenewalDue, label: 'RENEWAL DUE',     detail: 'KYC expiring within 60 days',      urgentColor: '#ba7517' },
    { key: 'appUnsigned',   count: attentionCounts.appUnsigned,   label: 'APP UNSIGNED',    detail: 'pending application signatures',   urgentColor: '#185fa5' },
    { key: 'amlOutstanding', count: attentionCounts.amlOutstanding, label: 'AML OUTSTANDING', detail: 'clients with outstanding AML',   urgentColor: '#ba7517' },
  ]
  const activeCells = ATTENTION_CELLS.filter(c => config[c.key])

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Clients</h1>
          <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>
            {leadsCount} clients · {linkedCount} linked {linkedCount === 1 ? 'entity' : 'entities'}
          </p>
        </div>
        <Link href="/clients/new" className="btn btn-primary">+ Add client</Link>
      </div>

      {/* Attention panel */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: activeCells.length > 0 ? '0.5px solid #f0f0ec' : 'none' }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>Needs attention</span>
          <button
            onClick={() => setShowConfig(v => !v)}
            style={{ fontSize: 10, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Configure ⚙
          </button>
        </div>

        {activeCells.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeCells.length}, 1fr)` }}>
            {activeCells.map((cell, i) => {
              const isActive = attentionFilter === cell.key
              const countColor = cell.count > 0 ? cell.urgentColor : '#1d9e75'
              return (
                <div
                  key={cell.key}
                  style={{
                    padding: '14px 16px',
                    borderRight: i < activeCells.length - 1 ? '0.5px solid #f0f0ec' : 'none',
                    background: isActive ? '#fafaf8' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 500, color: countColor, lineHeight: 1.1 }}>{cell.count}</div>
                  <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 4 }}>{cell.label}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{cell.detail}</div>
                  <button
                    onClick={() => applyAttentionFilter(cell.key)}
                    style={{ fontSize: 10, color: isActive ? '#a32d2d' : '#185fa5', background: 'none', border: 'none', padding: '4px 0 0', cursor: 'pointer' }}
                  >
                    {isActive ? '✕ Clear filter' : 'View all →'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {showConfig && (
          <div style={{ borderTop: '0.5px solid #f0f0ec', background: '#fafaf8', padding: '12px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
              {CONFIG_CATS.map(cat => (
                <label key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!config[cat.key]}
                    onChange={e => saveConfig(cat.key, e.target.checked)}
                    style={{ accentColor: '#185fa5' }}
                  />
                  {cat.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toolbar: search + filter chips + sort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hasFilters ? 8 : 14, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{
            flex: '1 1 280px', maxWidth: 360, padding: '6px 10px',
            border: `0.5px solid ${search ? '#0f2744' : '#d0d0c8'}`,
            borderRadius: 5, fontSize: 12, outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={kycFilter} onChange={e => { setKycFilter(e.target.value); setPage(1) }} style={chipStyle(kycFilter !== 'all')}>
            <option value="all">KYC ▾</option>
            <option value="verified">Verified</option>
            <option value="renewal_due">Renewal due</option>
            <option value="outstanding">Overdue</option>
          </select>

          <select value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setPage(1) }} style={chipStyle(companyFilter !== 'all')}>
            <option value="all">Company ▾</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select value={fundTypeFilter} onChange={e => { setFundTypeFilter(e.target.value); setPage(1) }} style={chipStyle(fundTypeFilter !== 'all')}>
            <option value="all">Fund type ▾</option>
            <option value="syndicate">Syndicate</option>
            <option value="multi_manager">Multi Manager</option>
            <option value="eis_fund">EIS Fund</option>
            <option value="both">Both</option>
          </select>

          <select value={flagsFilter} onChange={e => { setFlagsFilter(e.target.value); setPage(1) }} style={chipStyle(flagsFilter !== 'all')}>
            <option value="all">Flags ▾</option>
            <option value="has_flags">Has flags</option>
            <option value="no_flags">No flags</option>
          </select>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#aaa', whiteSpace: 'nowrap' }}>Sort:</span>
          <select
            value={`${sortKey}:${sortDir}`}
            onChange={e => {
              const [k, d] = e.target.value.split(':')
              setSortKey(k as SortKey)
              setSortDir(d as SortDir)
              setPage(1)
            }}
            style={{ fontSize: 10, border: '0.5px solid #d0d0c8', borderRadius: 5, padding: '4px 8px', background: '#fff', outline: 'none', cursor: 'pointer' }}
          >
            <option value="last_investment:desc">Last investment ↓</option>
            <option value="first_name:asc">First name A–Z</option>
            <option value="last_name:asc">Last name A–Z</option>
            <option value="portfolio_value:desc">Portfolio value ↓</option>
            <option value="companies:desc">Companies ↓</option>
            <option value="last_activity:desc">Last activity</option>
          </select>
        </div>
      </div>

      {/* Active filter tags */}
      {hasFilters && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          {search && (
            <span style={tagStyle}>
              &ldquo;{search}&rdquo;
              <button style={xBtn} onClick={() => { setSearch(''); setPage(1) }}>×</button>
            </span>
          )}
          {kycFilter !== 'all' && (
            <span style={tagStyle}>
              KYC: {kycFilter === 'renewal_due' ? 'Renewal due' : kycFilter === 'outstanding' ? 'Overdue' : 'Verified'}
              <button style={xBtn} onClick={() => { setKycFilter('all'); setPage(1) }}>×</button>
            </span>
          )}
          {companyFilter !== 'all' && (
            <span style={tagStyle}>
              {companies.find(c => c.id === companyFilter)?.name ?? 'Company'}
              <button style={xBtn} onClick={() => { setCompanyFilter('all'); setPage(1) }}>×</button>
            </span>
          )}
          {fundTypeFilter !== 'all' && (
            <span style={tagStyle}>
              {fundTypeFilter === 'multi_manager' ? 'Multi Manager' : fundTypeFilter === 'both' ? 'Both' : fundTypeFilter === 'eis_fund' ? 'EIS Fund' : 'Syndicate'}
              <button style={xBtn} onClick={() => { setFundTypeFilter('all'); setPage(1) }}>×</button>
            </span>
          )}
          {flagsFilter !== 'all' && (
            <span style={tagStyle}>
              {flagsFilter === 'has_flags' ? 'Has flags' : 'No flags'}
              <button style={xBtn} onClick={() => { setFlagsFilter('all'); setPage(1) }}>×</button>
            </span>
          )}
          {attentionFilter && (
            <span style={tagStyle}>
              {ATTENTION_CELLS.find(c => c.key === attentionFilter)?.label ?? attentionFilter}
              <button style={xBtn} onClick={() => { setAttentionFilter(null); setPage(1) }}>×</button>
            </span>
          )}
          <span style={{ fontSize: 10, color: '#888' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Table */}
      <div ref={tableRef} className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: 'left', width: '26%', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('first_name')}>
                Client {sortIcon('first_name')}
              </th>
              <th style={{ ...thBase, textAlign: 'right', width: '14%', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('portfolio_value')}>
                Portfolio value {sortIcon('portfolio_value')}
              </th>
              <th style={{ ...thBase, textAlign: 'center', width: '6%', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('companies')}>
                Cos {sortIcon('companies')}
              </th>
              <th style={{ ...thBase, textAlign: 'left', width: '9%' }}>KYC</th>
              <th style={{ ...thBase, textAlign: 'left', width: '8%' }}>Flags</th>
              <th style={{ ...thBase, textAlign: 'right', width: '12%', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('last_investment')}>
                Last investment {sortIcon('last_investment')}
              </th>
              <th style={{ ...thBase, textAlign: 'right', width: '25%' }}></th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#888' }}>
                    <UserPlus size={24} strokeWidth={1.5} />
                    <span style={{ fontSize: 13 }}>
                      {hasFilters ? 'No clients match your filters' : 'No clients yet'}
                    </span>
                    {hasFilters ? (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, marginTop: 4 }}
                        onClick={() => { setSearch(''); setKycFilter('all'); setCompanyFilter('all'); setFundTypeFilter('all'); setFlagsFilter('all'); setAttentionFilter(null) }}
                      >
                        Clear filters
                      </button>
                    ) : (
                      <Link href="/clients/new" className="btn btn-primary" style={{ fontSize: 12, marginTop: 4 }}>Add your first client</Link>
                    )}
                  </div>
                </td>
              </tr>
            ) : paginated.map(client => {
              const isLinked = !!client.lead_investor_id
              const linkedEntities = isLinked ? [] : (linkedByLead[client.id] ?? [])
              const flags    = clientFlags[client.id] ?? { kycOverdue: false, kycRenewalDue: false, appUnsigned: false }
              const lastInv  = lastInvestmentByClient[client.id]

              let totalInvested = 0, currentValue = 0, gainLoss = 0, companyCount = 0
              if (isLinked) {
                const p = portfolioByClient[client.id]
                if (p) { totalInvested = p.totalInvested; currentValue = p.currentValue; gainLoss = p.gainLoss; companyCount = p.companyIds.length }
              } else {
                const lp = getLeadPortfolio(client.id)
                totalInvested = lp.totalInvested; currentValue = lp.currentValue; gainLoss = lp.gainLoss; companyCount = lp.companyCount
              }
              const { pct } = calcGainLoss(totalInvested, currentValue)

              // Subtitle
              let subtitle: string
              if (!isLinked) {
                subtitle = linkedEntities.length > 0
                  ? `Lead · ${linkedEntities.length} ${linkedEntities.length === 1 ? 'entity' : 'entities'}`
                  : 'Individual'
              } else {
                const leadName = leadNameById[client.lead_investor_id!] ?? 'Unknown'
                let typeLabel = VEHICLE_TYPE_LABELS[client.vehicle_type ?? ''] ?? 'Linked entity'
                if (client.vehicle_type === 'nominee' && client.nominee_id) {
                  const nomineeName = nomineeMap.get(client.nominee_id)
                  if (nomineeName) typeLabel = `Nominee (via ${nomineeName})`
                }
                subtitle = `${typeLabel} · linked to ${leadName}`
              }

              const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle', borderBottom: '0.5px solid #f5f5f2' }

              return (
                <tr key={client.id} style={{ opacity: isLinked ? 0.55 : 1 }}>

                  {/* Client */}
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={client.full_name} muted={isLinked} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Link
                            href={`/clients/${client.id}`}
                            style={{ fontSize: 12, fontWeight: 500, color: isLinked ? '#666' : '#0f2744', textDecoration: 'none' }}
                          >
                            {client.full_name}
                          </Link>
                          <FundTypePill code={client.fund_type || 'syndicate'} />
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{subtitle}</div>
                      </div>
                    </div>
                  </td>

                  {/* Portfolio value */}
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: isLinked ? '#999' : '#0f2744' }}>
                      {formatCurrency(currentValue)}
                    </div>
                    <div style={{ fontSize: 10, marginTop: 1 }} className={pct >= 0 ? 'text-positive' : 'text-negative'}>
                      {formatPercent(pct)}
                    </div>
                  </td>

                  {/* Cos */}
                  <td style={{ ...tdStyle, textAlign: 'center', fontSize: 12, fontWeight: 500, color: isLinked ? '#999' : '#0f2744' }}>
                    {companyCount || '—'}
                  </td>

                  {/* KYC */}
                  <td style={tdStyle}>
                    <KycBadge status={client.kyc_status} viaLead={isLinked} />
                  </td>

                  {/* Flags */}
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {flags.kycOverdue    && <div title="KYC overdue"    style={{ width: 6, height: 6, borderRadius: '50%', background: '#a32d2d', flexShrink: 0 }} />}
                      {flags.kycRenewalDue && <div title="KYC renewal due" style={{ width: 6, height: 6, borderRadius: '50%', background: '#ba7517', flexShrink: 0 }} />}
                      {flags.appUnsigned   && <div title="App unsigned"   style={{ width: 6, height: 6, borderRadius: '50%', background: '#185fa5', flexShrink: 0 }} />}
                      {!flags.kycOverdue && !flags.kycRenewalDue && !flags.appUnsigned && (
                        <span style={{ color: '#ccc', fontSize: 11 }}>—</span>
                      )}
                    </div>
                  </td>

                  {/* Last investment */}
                  <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: '#555' }}>
                    {lastInv ? formatDate(lastInv) : '—'}
                  </td>

                  {/* Actions */}
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {!isLinked && (
                        <Link
                          href={`/reports/portfolio-statement?client=${client.id}`}
                          className="btn btn-primary"
                          style={{ fontSize: 9, padding: '3px 8px' }}
                        >
                          Report
                        </Link>
                      )}
                      <Link
                        href={`/clients/${client.id}/edit`}
                        className="btn btn-secondary"
                        style={{ fontSize: 9, padding: '3px 8px' }}
                      >
                        Edit
                      </Link>
                      {!isLinked && (
                        <div style={{ position: 'relative' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 11, padding: '2px 8px', lineHeight: 1.5 }}
                            onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === client.id ? null : client.id) }}
                          >
                            ⋯
                          </button>
                          {openMenu === client.id && (
                            <div
                              onClick={e => e.stopPropagation()}
                              style={{
                                position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 20,
                                background: '#fff', border: '0.5px solid #e0e0d8', borderRadius: 6,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.1)', minWidth: 160, padding: '4px 0',
                              }}
                            >
                              {[
                                { label: 'View record',    href: `/clients/${client.id}` },
                                { label: 'Add note',       href: `/clients/${client.id}?tab=notes` },
                                { label: 'Add investment', href: '/deals/new' },
                              ].map(item => (
                                <Link
                                  key={item.label}
                                  href={item.href}
                                  onClick={() => setOpenMenu(null)}
                                  style={{ display: 'block', padding: '7px 14px', fontSize: 12, color: '#333', textDecoration: 'none' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f2')}
                                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                                >
                                  {item.label}
                                </Link>
                              ))}
                              <button
                                disabled
                                style={{ display: 'block', width: '100%', padding: '7px 14px', fontSize: 12, color: '#bbb', background: 'none', border: 'none', textAlign: 'left', cursor: 'not-allowed' }}
                              >
                                Send update (soon)
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: '4px 10px', fontSize: 12 }}
          >
            ← Prev
          </button>
          {(() => {
            const pages: number[] = []
            for (let p = 1; p <= totalPages; p++) {
              if (p === 1 || p === totalPages || Math.abs(p - page) <= 2) pages.push(p)
            }
            const nodes: React.ReactNode[] = []
            for (let i = 0; i < pages.length; i++) {
              if (i > 0 && pages[i] !== pages[i - 1] + 1) {
                nodes.push(<span key={`ell-${i}`} style={{ fontSize: 12, color: '#888' }}>…</span>)
              }
              const p = pages[i]
              nodes.push(
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    width: 28, height: 28, borderRadius: 5,
                    border: '0.5px solid #d0d0c8',
                    background: p === page ? '#0f2744' : '#fff',
                    color: p === page ? '#fff' : '#333',
                    fontSize: 12, cursor: 'pointer',
                    fontWeight: p === page ? 600 : 400,
                  }}
                >
                  {p}
                </button>
              )
            }
            return nodes
          })()}
          <button
            className="btn btn-secondary"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: '4px 10px', fontSize: 12 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
