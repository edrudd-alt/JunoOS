'use client'

import Link from 'next/link'
import { formatDate } from '@/lib/utils'

interface InvestorUpdate {
  id: string
  update_type: string
  title: string | null
  status: string
  sent_at: string | null
  created_at: string
  companies: { id: string; name: string } | null
  investor_update_recipients: { id: string }[]
}

const UPDATE_TYPE_LABELS: Record<string, string> = {
  portfolio_statement: 'Portfolio statement',
  data_table:          'Investor update (data)',
  table_with_bullets:  'Investor update (bullets)',
  long_form:           'Investor update (long-form)',
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Draft',    cls: 'pill-grey'  },
  review:   { label: 'In review', cls: 'pill-amber' },
  approved: { label: 'Approved', cls: 'pill-teal'  },
  sent:     { label: 'Sent',     cls: 'pill-green' },
}

export default function Reports({ updates: updatesRaw }: { updates: Record<string, unknown>[] }) {
  const updates = updatesRaw as unknown as InvestorUpdate[]

  const recent  = updates.filter(u => u.status === 'sent').slice(0, 10)
  const inDraft = updates.filter(u => u.status !== 'sent')

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>Reports</h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          Generate portfolio statements and investor updates
        </p>
      </div>

      {/* Action cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 32 }}>
        {/* Portfolio Statement */}
        <Link href="/reports/portfolio-statement" style={{ textDecoration: 'none' }}>
          <div className="card" style={{
            cursor: 'pointer', transition: 'box-shadow 0.15s',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: '#e0eaf9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>📊</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Portfolio Statement</div>
                <div style={{ fontSize: 11, color: '#888' }}>For a single investor</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#555', margin: 0, lineHeight: 1.5 }}>
              Holdings table with all transactions, current values, gain/loss, and an optional summary page. Delivered by email or download.
            </p>
            <div style={{ fontSize: 11, color: '#185fa5', fontWeight: 500 }}>Configure & preview →</div>
          </div>
        </Link>

        {/* Investor Update */}
        <Link href="/reports/investor-update" style={{ textDecoration: 'none' }}>
          <div className="card" style={{
            cursor: 'pointer', transition: 'box-shadow 0.15s',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: '#d0f0e6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>✉️</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Investor Update</div>
                <div style={{ fontSize: 11, color: '#888' }}>For all investors in a company</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#555', margin: 0, lineHeight: 1.5 }}>
              Data table, table with bullet commentary, or long-form narrative update. Personalised per investor and batch-sent.
            </p>
            <div style={{ fontSize: 11, color: '#1d9e75', fontWeight: 500 }}>Select type & configure →</div>
          </div>
        </Link>
      </div>

      {/* In-progress drafts */}
      {inDraft.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 8 }}>
            In progress ({inDraft.length})
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title / Company</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inDraft.map(u => {
                  const st = STATUS_CONFIG[u.status] ?? { label: u.status, cls: 'pill-grey' }
                  return (
                    <tr key={u.id}>
                      <td style={{ fontSize: 12 }}>{UPDATE_TYPE_LABELS[u.update_type] ?? u.update_type}</td>
                      <td style={{ fontSize: 12, fontWeight: 500 }}>
                        {u.title ?? u.companies?.name ?? '—'}
                      </td>
                      <td><span className={`pill ${st.cls}`}>{st.label}</span></td>
                      <td style={{ fontSize: 11, color: '#888' }}>{formatDate(u.created_at)}</td>
                      <td>
                        <span style={{ fontSize: 11, color: '#185fa5', cursor: 'pointer' }}>Continue</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sent reports */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 8 }}>
          Recently sent
        </div>
        {recent.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>No reports sent yet</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title / Company</th>
                  <th>Recipients</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontSize: 12 }}>{UPDATE_TYPE_LABELS[u.update_type] ?? u.update_type}</td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>
                      {u.title ?? u.companies?.name ?? '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{u.investor_update_recipients.length}</td>
                    <td style={{ fontSize: 11, color: '#888' }}>{formatDate(u.sent_at ?? u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
