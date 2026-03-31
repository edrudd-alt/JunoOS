'use client'

import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Deal {
  id: string
  deal_type: string
  status: string
  created_at: string
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
            <table>
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Type</th>
                  <th style={{ width: '20%' }}>Company</th>
                  <th style={{ width: '24%' }}>Investors</th>
                  <th style={{ width: '14%' }}>Amount</th>
                  <th style={{ width: '12%' }}>Status</th>
                  <th style={{ width: '10%' }}>Started</th>
                </tr>
              </thead>
              <tbody>
                {open.map(deal => <DealRow key={deal.id} deal={deal} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {typed.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: 13, color: '#888', margin: '0 0 12px' }}>No deals yet</p>
          <Link href="/deals/new" className="btn btn-primary">Start your first deal</Link>
        </div>
      )}

      {/* Completed deals */}
      {closed.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 8 }}>
            Completed
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Type</th>
                  <th style={{ width: '20%' }}>Company</th>
                  <th style={{ width: '24%' }}>Investors</th>
                  <th style={{ width: '14%' }}>Amount</th>
                  <th style={{ width: '12%' }}>Status</th>
                  <th style={{ width: '10%' }}>Started</th>
                </tr>
              </thead>
              <tbody>
                {closed.map(deal => <DealRow key={deal.id} deal={deal} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DealRow({ deal }: { deal: Deal }) {
  const status = STATUS_CONFIG[deal.status] ?? { label: deal.status, cls: 'pill-grey' }
  const investors = deal.deal_investors ?? []
  const investorNames = investors
    .map(di => di.clients?.full_name)
    .filter(Boolean)
    .slice(0, 2)
    .join(', ')
  const overflow = investors.length > 2 ? ` +${investors.length - 2} more` : ''

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{DEAL_TYPE_LABELS[deal.deal_type] ?? deal.deal_type}</td>
      <td>
        {deal.companies ? (
          <Link href={`/portfolio/${deal.companies.id}`} style={{ color: '#0f2744', textDecoration: 'none' }}>
            {deal.companies.name}
          </Link>
        ) : '—'}
      </td>
      <td style={{ fontSize: 12, color: '#555' }}>
        {investorNames || '—'}{overflow && <span style={{ color: '#aaa' }}>{overflow}</span>}
      </td>
      <td>{deal.investment_amount ? formatCurrency(deal.investment_amount) : '—'}</td>
      <td><span className={`pill ${status.cls}`}>{status.label}</span></td>
      <td>
        <Link href={`/deals/${deal.id}`} style={{ fontSize: 12, color: '#185fa5', textDecoration: 'none' }}>
          {formatDate(deal.created_at)}
        </Link>
      </td>
    </tr>
  )
}
