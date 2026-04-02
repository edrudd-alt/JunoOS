'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatPercent, formatDate, getInitials, calcGainLoss } from '@/lib/utils'
import type { KycStatus } from '@/lib/supabase/types'

type Client = {
  id: string
  full_name: string
  investor_reference: string | null
  email: string | null
  kyc_status: KycStatus
  kyc_expiry: string | null
  entity_type: string
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

interface Props {
  leads: Client[]
  linkedByLead: Record<string, Client[]>
  portfolioByClient: Record<string, PortfolioData>
  clientsByCompany: Record<string, string[]>
  companies: { id: string; name: string }[]
  lastActivityByClient: Record<string, string>
}

type SortKey = 'portfolio_value' | 'name' | 'date_joined' | 'companies'

function KycBadge({ status }: { status: KycStatus }) {
  const map: Record<KycStatus, { label: string; cls: string }> = {
    verified: { label: 'Verified', cls: 'pill-green' },
    renewal_due: { label: 'Renewal due', cls: 'pill-amber' },
    outstanding: { label: 'Outstanding', cls: 'pill-red' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'pill-grey' }
  return <span className={`pill ${cls}`}>{label}</span>
}

function ClientAvatar({ name }: { name: string }) {
  const initials = getInitials(name)
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: '#0f2744',
        color: '#fff',
        fontSize: 11,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

export default function ClientList({ leads, linkedByLead, portfolioByClient, clientsByCompany, companies, lastActivityByClient }: Props) {
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [kycFilter, setKycFilter] = useState('all')
  const [sortBy, setSortBy] = useState<SortKey>('portfolio_value')

  const totalClients = leads.length
  const totalLinked = Object.values(linkedByLead).reduce((s, arr) => s + arr.length, 0)

  // Aggregate portfolio including linked entities
  function getLeadPortfolio(leadId: string) {
    const linkedIds = (linkedByLead[leadId] ?? []).map(c => c.id)
    const allIds = [leadId, ...linkedIds]
    let totalInvested = 0, currentValue = 0, gainLoss = 0
    const companySet = new Set<string>()
    for (const id of allIds) {
      const p = portfolioByClient[id]
      if (p) {
        totalInvested += p.totalInvested
        currentValue += p.currentValue
        gainLoss += p.gainLoss
        p.companyIds.forEach(c => companySet.add(c))
      }
    }
    return { totalInvested, currentValue, gainLoss, companyCount: companySet.size }
  }

  const filtered = useMemo(() => {
    let result = leads

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c => c.full_name.toLowerCase().includes(q))
    }

    if (companyFilter !== 'all') {
      const clientSet = new Set(clientsByCompany[companyFilter] ?? [])
      result = result.filter(c => {
        if (clientSet.has(c.id)) return true
        return (linkedByLead[c.id] ?? []).some(e => clientSet.has(e.id))
      })
    }

    if (kycFilter !== 'all') {
      result = result.filter(c => c.kyc_status === kycFilter)
    }

    return result
  }, [leads, search, companyFilter, kycFilter, linkedByLead, clientsByCompany])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.full_name.localeCompare(b.full_name)
      if (sortBy === 'date_joined') {
        return (b.date_joined ?? '').localeCompare(a.date_joined ?? '')
      }
      if (sortBy === 'companies') {
        return getLeadPortfolio(b.id).companyCount - getLeadPortfolio(a.id).companyCount
      }
      // portfolio_value default
      return getLeadPortfolio(b.id).currentValue - getLeadPortfolio(a.id).currentValue
    })
  }, [filtered, sortBy])

  // Pagination
  const [page, setPage] = useState(1)
  const PER_PAGE = 10
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE))
  const paginated = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Clients</h1>
          <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>
            {totalClients} clients · {totalLinked} linked {totalLinked === 1 ? 'entity' : 'entities'}
          </p>
        </div>
        <Link href="/clients/new" className="btn btn-primary">
          + Add client
        </Link>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{
            flex: '1 1 220px',
            minWidth: 180,
            maxWidth: 320,
            padding: '6px 10px',
            border: `0.5px solid ${search ? '#0f2744' : '#d0d0c8'}`,
            borderRadius: 5,
            fontSize: 12,
            outline: 'none',
          }}
        />

        <select
          value={companyFilter}
          onChange={e => { setCompanyFilter(e.target.value); setPage(1) }}
          style={selectStyle(companyFilter !== 'all')}
        >
          <option value="all">All companies</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={kycFilter}
          onChange={e => { setKycFilter(e.target.value); setPage(1) }}
          style={selectStyle(kycFilter !== 'all')}
        >
          <option value="all">All KYC statuses</option>
          <option value="verified">Verified</option>
          <option value="renewal_due">Renewal due</option>
          <option value="outstanding">Outstanding</option>
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortKey)}
          style={{ ...selectStyle(false), marginLeft: 'auto' }}
        >
          <option value="portfolio_value">Portfolio value ↓</option>
          <option value="name">Name A–Z</option>
          <option value="date_joined">Last joined</option>
          <option value="companies">Companies ↓</option>
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '32%' }}>Client</th>
              <th style={{ width: '20%' }}>Portfolio value</th>
              <th style={{ width: '12%' }}>Companies</th>
              <th style={{ width: '14%' }}>KYC</th>
              <th style={{ width: '22%' }}>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>
                  No clients found
                </td>
              </tr>
            ) : (
              paginated.map(client => {
                const linked = linkedByLead[client.id] ?? []
                const portfolio = getLeadPortfolio(client.id)
                const { pct } = calcGainLoss(portfolio.totalInvested, portfolio.currentValue)

                return (
                  <tr key={client.id}>
                    {/* Client */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ClientAvatar name={client.full_name} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Link
                              href={`/clients/${client.id}`}
                              style={{ fontWeight: 500, color: '#0f2744', textDecoration: 'none', fontSize: 13 }}
                            >
                              {client.full_name}
                            </Link>
                            <FundTypePill code={client.fund_type ?? 'syndicate'} />
                          </div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                            {linked.length > 0 ? `Lead · ${linked.length} ${linked.length === 1 ? 'entity' : 'entities'}` : 'Individual'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Portfolio value */}
                    <td>
                      <div style={{ fontWeight: 500 }}>{formatCurrency(portfolio.currentValue)}</div>
                      <div style={{ fontSize: 11, marginTop: 1 }}
                        className={pct >= 0 ? 'text-positive' : 'text-negative'}
                      >
                        {formatPercent(pct)}
                      </div>
                    </td>

                    {/* Companies */}
                    <td style={{ fontWeight: 500 }}>{portfolio.companyCount || '—'}</td>

                    {/* KYC */}
                    <td><KycBadge status={client.kyc_status} /></td>

                    {/* Last activity */}
                    <td style={{ color: '#888' }}>
                      {lastActivityByClient[client.id]
                        ? formatDate(lastActivityByClient[client.id])
                        : client.date_joined ? `Joined ${formatDate(client.date_joined)}` : '—'}
                    </td>
                  </tr>
                )
              })
            )}
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
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 5,
                border: '0.5px solid #d0d0c8',
                background: p === page ? '#0f2744' : '#fff',
                color: p === page ? '#fff' : '#333',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: p === page ? 600 : 400,
              }}
            >
              {p}
            </button>
          ))}
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

function FundTypePill({ code }: { code: string }) {
  const isMM   = code === 'multi_manager'
  const isBoth = code === 'both'
  return (
    <span style={{
      fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 600,
      background: isMM ? '#fff3e0' : isBoth ? '#f0f0ec' : '#e8f5f0',
      color:      isMM ? '#e0952a' : isBoth ? '#555'    : '#1d9e75',
    }}>
      {isMM ? 'MM' : isBoth ? 'Both' : 'S'}
    </span>
  )
}

function selectStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    border: `0.5px solid ${active ? '#0f2744' : '#d0d0c8'}`,
    borderRadius: 5,
    fontSize: 12,
    background: '#fff',
    outline: 'none',
    cursor: 'pointer',
    color: active ? '#0f2744' : '#333',
    fontWeight: active ? 500 : 400,
  }
}
