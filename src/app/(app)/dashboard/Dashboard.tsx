'use client'

import Link from 'next/link'
import { formatCurrency, formatPercent, formatDate, calcGainLoss } from '@/lib/utils'
import {
  Users, Building2, FileText, TrendingUp, TrendingDown,
  Plus, BarChart2, RefreshCw, PenLine, UserPlus, Info,
} from 'lucide-react'

interface ValuationChange {
  companyId: string
  companyName: string
  newPrice: number
  oldPrice: number | null
  date: string
  affectedClients: number
  aggregateChange: number
}

interface ActivityItem {
  id: string
  update_type: string
  description: string
  created_at: string
  companies: { name: string } | null
  team_members: { full_name: string | null } | null
}

interface NewsItem {
  id: string
  company_id: string
  headline: string
  source: string | null
  url: string | null
  published_at: string | null
  is_significant: boolean
  companies: { name: string } | null
}

interface Props {
  totalAUM: number
  totalInvested: number
  activeClients: number
  portfolioCompanies: number
  bannerChange: ValuationChange | null
  topChanges: ValuationChange[]
  activity: Record<string, unknown>[]
  news: Record<string, unknown>[]
}

const HOUR = new Date().getHours()
const GREETING = HOUR < 12 ? 'Good morning' : HOUR < 17 ? 'Good afternoon' : 'Good evening'

const TODAY = new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})

const UPDATE_ICONS: Record<string, string> = {
  valuation: '📈', document: '📄', deal: '🤝', note: '📝', report: '📊', client: '👤',
}

const UPDATE_COLORS: Record<string, string> = {
  valuation: '#1d9e75', document: '#185fa5', deal: '#0f2744',
  note: '#534ab7', report: '#ba7517', client: '#888',
}

export default function Dashboard({
  totalAUM, totalInvested, activeClients, portfolioCompanies,
  bannerChange, topChanges, activity: activityRaw, news: newsRaw,
}: Props) {
  const activity = activityRaw as unknown as ActivityItem[]
  const news = newsRaw as unknown as NewsItem[]
  const { change: aumChange, pct: aumPct } = calcGainLoss(totalInvested, totalAUM)

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: '#0f2744' }}>{GREETING}</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>{TODAY}</p>
      </div>

      {/* Headline metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <MetricCard
          label="Total AUM"
          value={formatCurrency(totalAUM)}
          sub={
            totalInvested > 0 ? (
              <span className={aumChange >= 0 ? 'text-positive' : 'text-negative'}>
                {aumChange >= 0 ? '+' : ''}{formatCurrency(aumChange)} ({formatPercent(aumPct)})
              </span>
            ) : undefined
          }
          icon={<BarChart2 size={14} color="#1d9e75" />}
        />
        <MetricCard
          label="Active clients"
          value={activeClients.toString()}
          icon={<Users size={14} color="#185fa5" />}
        />
        <MetricCard
          label="Portfolio companies"
          value={portfolioCompanies.toString()}
          icon={<Building2 size={14} color="#0f2744" />}
        />
        <MetricCard
          label="Pending signatures"
          value="—"
          icon={<FileText size={14} color="#888" />}
          muted
        />
      </div>

      {/* Valuation alert banner */}
      {bannerChange && bannerChange.oldPrice && (
        <div style={{
          background: '#0f2744', borderRadius: 8, padding: '14px 18px',
          marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {bannerChange.aggregateChange >= 0
              ? <TrendingUp size={16} color="#1d9e75" />
              : <TrendingDown size={16} color="#e88" />
            }
            <div>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{bannerChange.companyName}</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginLeft: 8 }}>
                share price {bannerChange.aggregateChange >= 0 ? 'up' : 'down'} to £{bannerChange.newPrice.toFixed(4)}
              </span>
            </div>
            {bannerChange.affectedClients > 0 && (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                · {bannerChange.affectedClients} investor{bannerChange.affectedClients !== 1 ? 's' : ''} affected
              </span>
            )}
            {bannerChange.aggregateChange !== 0 && (
              <span style={{
                color: bannerChange.aggregateChange >= 0 ? '#1d9e75' : '#e88',
                fontSize: 12, fontWeight: 600,
              }}>
                {bannerChange.aggregateChange >= 0 ? '+' : ''}{formatCurrency(bannerChange.aggregateChange)} aggregate
              </span>
            )}
          </div>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{formatDate(bannerChange.date)}</span>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/portfolio?action=add_investment" className="btn btn-secondary">
          <Plus size={12} /> Add investment
        </Link>
        <Link href="/reports" className="btn btn-secondary">
          <FileText size={12} /> Generate report
        </Link>
        <Link href="/portfolio?action=update_valuation" className="btn btn-secondary">
          <BarChart2 size={12} /> Update valuation
        </Link>
        <Link href="/deals/new" className="btn btn-secondary">
          <PenLine size={12} /> Start deal
        </Link>
        <Link href="/clients/new" className="btn btn-secondary">
          <UserPlus size={12} /> Add client
        </Link>
        <Link href="/portfolio/new" className="btn btn-secondary">
          <Info size={12} /> Add company
        </Link>
      </div>

      {/* Two-column lower section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Valuation changes */}
          {topChanges.length > 0 && (
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>Recent valuation changes</div>
              <table style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>New price</th>
                    <th>Change</th>
                    <th>Investors</th>
                  </tr>
                </thead>
                <tbody>
                  {topChanges.map(vc => {
                    const pricePct = vc.oldPrice ? ((vc.newPrice - vc.oldPrice) / vc.oldPrice) * 100 : null
                    return (
                      <tr key={vc.companyId}>
                        <td>
                          <Link href={`/portfolio/${vc.companyId}`}
                            style={{ color: '#0f2744', textDecoration: 'none', fontWeight: 500 }}>
                            {vc.companyName}
                          </Link>
                        </td>
                        <td style={{ fontWeight: 500 }}>£{vc.newPrice.toFixed(4)}</td>
                        <td className={pricePct !== null && pricePct >= 0 ? 'text-positive' : 'text-negative'}>
                          {pricePct !== null ? formatPercent(pricePct) : '—'}
                        </td>
                        <td style={{ color: '#888' }}>{vc.affectedClients}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Activity feed */}
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>Recent activity</div>
            {activity.length === 0 ? (
              <p style={{ fontSize: 12, color: '#888', margin: 0 }}>No activity yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activity.map((item) => (
                  <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                      background: UPDATE_COLORS[item.update_type] ?? '#aaa',
                    }} />
                    <div>
                      <div style={{ fontSize: 12 }}>
                        {item.description}
                        {item.companies?.name && (
                          <span style={{ color: '#888' }}> · {item.companies.name}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>
                        {item.team_members?.full_name ?? 'Team'} · {formatDate(item.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — news */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Portfolio company news</div>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}>
              <RefreshCw size={10} /> Refresh
            </button>
          </div>

          {news.length === 0 ? (
            <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
              No news yet — click Refresh to search for the latest updates on your portfolio companies.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {news.map((item) => (
                <div key={item.id}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                    {item.is_significant && (
                      <span className="pill pill-amber" style={{ fontSize: 9, flexShrink: 0 }}>Significant</span>
                    )}
                    <div style={{ fontSize: 10, color: '#aaa' }}>
                      {item.companies?.name && <span style={{ fontWeight: 500, color: '#555' }}>{item.companies.name}</span>}
                      {item.source && <span> · {item.source}</span>}
                    </div>
                  </div>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: '#0f2744', textDecoration: 'none', fontWeight: 500, display: 'block' }}>
                      {item.headline}
                    </a>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{item.headline}</div>
                  )}
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                    {formatDate(item.published_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label, value, sub, icon, muted,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  icon?: React.ReactNode
  muted?: boolean
}) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa' }}>
          {label}
        </div>
        {icon}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: muted ? '#bbb' : '#0f2744' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}
