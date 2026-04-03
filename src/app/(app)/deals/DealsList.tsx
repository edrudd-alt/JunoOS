'use client'

import Link from 'next/link'
import { FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Deal {
  id: string
  deal_type: string
  status: string
  created_at: string
  updated_at: string | null
  investment_amount: number | null
  companies: { id: string; name: string } | null
  deal_investors: {
    id: string
    signing_status: string
    clients: { id: string; full_name: string } | null
  }[]
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:             { label: 'Draft',             cls: 'pill-grey'   },
  sent:              { label: 'Sent',               cls: 'pill-blue'   },
  partially_signed:  { label: 'Partially signed',   cls: 'pill-amber'  },
  fully_signed:      { label: 'Fully signed',        cls: 'pill-teal'   },
  complete:          { label: 'Complete',            cls: 'pill-green'  },
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  new_investment:  'New investment',
  follow_on:       'Follow-on',
  exit:            'Exit',
  kyc:             'KYC / Onboarding',
  side_letter:     'Side letter',
  membership:      'Membership',
}

export default function DealsList({ deals }: { deals: Record<string, unknown>[] }) {
  const typed = deals as unknown as Deal[]

  const open   = typed.filter(d => d.status !== 'complete')
  const closed = typed.filter(d => d.status === 'complete')

  const thStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, color: '#888',
    padding: '8px 12px', borderBottom: '0.5px solid #e8e7e0',
    textAlign: 'left', whiteSpace: 'nowrap',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Deals</h1>
          <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>
            {open.length} open · {closed.length} completed
          </p>
        </div>
        <Link href="/deals/new" className="btn btn-primary">+ New deal</Link>
      </div>

      {/* Open deals */}
      {open.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 8 }}>
            Open
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  <th style={{ ...thStyle, width: '20%' }}>Company</th>
                  <th style={{ ...thStyle, width: '16%' }}>Type</th>
                  <th style={{ ...thStyle, width: '22%' }}>Investor</th>
                  <th style={{ ...thStyle, width: '12%' }}>Amount</th>
                  <th style={{ ...thStyle, width: '11%' }}>Status</th>
                  <th style={{ ...thStyle, width: '9%' }}>Started</th>
                  <th style={{ ...thStyle, width: '10%' }}></th>
                </tr>
              </thead>
              <tbody>
                {open.map(deal => <DealRow key={deal.id} deal={deal} dateLabel="started" />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {typed.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#888' }}>
            <FileText size={24} strokeWidth={1.5} />
            <p style={{ fontSize: 13, margin: 0 }}>No deals yet</p>
            <Link href="/deals/new" className="btn btn-primary" style={{ marginTop: 4 }}>Start your first deal</Link>
          </div>
        </div>
      )}

      {/* Completed deals */}
      {closed.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 8 }}>
            Completed
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  <th style={{ ...thStyle, width: '20%' }}>Company</th>
                  <th style={{ ...thStyle, width: '16%' }}>Type</th>
                  <th style={{ ...thStyle, width: '22%' }}>Investor</th>
                  <th style={{ ...thStyle, width: '12%' }}>Amount</th>
                  <th style={{ ...thStyle, width: '11%' }}>Status</th>
                  <th style={{ ...thStyle, width: '9%' }}>Completed</th>
                  <th style={{ ...thStyle, width: '10%' }}></th>
                </tr>
              </thead>
              <tbody>
                {closed.map(deal => <DealRow key={deal.id} deal={deal} dateLabel="completed" />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DealRow({ deal, dateLabel }: { deal: Deal; dateLabel: 'started' | 'completed' }) {
  const router = useRouter()
  const status = STATUS_CONFIG[deal.status] ?? { label: deal.status, cls: 'pill-grey' }
  const investors = deal.deal_investors ?? []
  const investorNames = investors
    .map(di => di.clients?.full_name)
    .filter(Boolean)
    .slice(0, 2)
    .join(', ')
  const overflow = investors.length > 2 ? ` +${investors.length - 2} more` : ''

  const dateValue = dateLabel === 'completed'
    ? (deal.updated_at ?? deal.created_at)
    : deal.created_at

  return (
    <tr
      onClick={() => router.push(`/deals/${deal.id}`)}
      style={{ cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f9f9f7')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 500, borderBottom: '0.5px solid #f0f0ec' }}>
        {deal.companies ? (
          <Link
            href={`/portfolio/${deal.companies.id}`}
            onClick={e => e.stopPropagation()}
            style={{ color: '#0f2744', textDecoration: 'none' }}
          >
            {deal.companies.name}
          </Link>
        ) : '—'}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, borderBottom: '0.5px solid #f0f0ec' }}>
        {DEAL_TYPE_LABELS[deal.deal_type] ?? deal.deal_type}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#555', borderBottom: '0.5px solid #f0f0ec' }}>
        {investorNames || '—'}{overflow && <span style={{ color: '#aaa' }}>{overflow}</span>}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, borderBottom: '0.5px solid #f0f0ec' }}>
        {deal.investment_amount ? formatCurrency(deal.investment_amount) : '—'}
      </td>
      <td style={{ padding: '10px 12px', borderBottom: '0.5px solid #f0f0ec' }}>
        <span className={`pill ${status.cls}`}>{status.label}</span>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#888', borderBottom: '0.5px solid #f0f0ec' }}>
        {formatDate(dateValue)}
      </td>
      <td style={{ padding: '10px 12px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right' }}
          onClick={e => e.stopPropagation()}>
        <Link
          href={`/deals/${deal.id}`}
          style={{
            fontSize: 11, fontWeight: 500,
            padding: '4px 10px',
            background: deal.status === 'complete' ? '#f5f5f2' : '#0f2744',
            color: deal.status === 'complete' ? '#555' : '#fff',
            borderRadius: 5,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {deal.status === 'complete' ? 'View' : 'Continue →'}
        </Link>
      </td>
    </tr>
  )
}
