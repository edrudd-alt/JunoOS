'use client'

import { formatCurrency } from '@/lib/utils'
import type { DealInvestor } from './dealDetailTypes'

const SIGNING_OPTIONS = ['not_sent', 'sent', 'viewed', 'signed', 'declined']
const SIGNING_LABELS: Record<string, string> = {
  not_sent: 'Not sent', sent: 'Sent', viewed: 'Viewed', signed: 'Signed', declined: 'Declined',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff',
}

interface Props {
  investors:        DealInvestor[]
  dealStatus:       string
  signingStatuses:  Record<string, string>
  onStatusChange:   (diId: string, status: string) => void
}

export function SignatureTracking({
  investors, dealStatus, signingStatuses, onStatusChange,
}: Props) {
  return (
    <div className="card">
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Signature tracking</div>
      {investors.length === 0 ? (
        <p style={{ fontSize: 12, color: '#888' }}>No investors added</p>
      ) : (
        <>
          <table style={{ marginBottom: 14 }}>
            <thead>
              <tr>
                <th>Investor</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {investors.map(di => (
                <tr key={di.id}>
                  <td style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 500 }}>{di.clients?.full_name ?? '—'}</div>
                    {di.poa_held && <div style={{ fontSize: 10, color: '#888' }}>POA held</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>{di.amount ? formatCurrency(di.amount) : '—'}</td>
                  <td>
                    {dealStatus === 'complete' ? (
                      <SigningBadge status={signingStatuses[di.id] ?? 'not_sent'} />
                    ) : (
                      <select
                        value={signingStatuses[di.id] ?? 'not_sent'}
                        onChange={e => onStatusChange(di.id, e.target.value)}
                        style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '4px 6px' }}
                      >
                        {SIGNING_OPTIONS.map(o => (
                          <option key={o} value={o}>{SIGNING_LABELS[o]}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <SuggestedNextStep investors={investors} statuses={signingStatuses} />
        </>
      )}
    </div>
  )
}

function SuggestedNextStep({ investors, statuses }: { investors: DealInvestor[]; statuses: Record<string, string> }) {
  const statusValues      = investors.map(di => statuses[di.id] ?? di.signing_status ?? 'not_sent')
  const allSigned         = statusValues.every(s => s === 'signed')
  const noneSent          = statusValues.every(s => s === 'not_sent')
  const anyDeclined       = statusValues.some(s => s === 'declined')
  const unsignedInvestors = investors.filter(di => {
    const s = statuses[di.id] ?? di.signing_status
    return s !== 'signed'
  })

  if (allSigned || investors.length === 0) return null

  let message = ''
  if (noneSent) {
    message = 'Documents not yet sent — send to all investors to proceed.'
  } else if (anyDeclined) {
    const names = investors
      .filter(di => statuses[di.id] === 'declined')
      .map(di => di.clients?.full_name ?? 'Unknown')
      .join(', ')
    message = `${names} declined — follow up or re-send documents.`
  } else if (unsignedInvestors.length > 0) {
    const names = unsignedInvestors.slice(0, 2).map(di => di.clients?.full_name ?? 'Unknown').join(', ')
    const more  = unsignedInvestors.length > 2 ? ` +${unsignedInvestors.length - 2} more` : ''
    message = `Awaiting signatures from: ${names}${more}.`
  }

  if (!message) return null

  return (
    <div style={{
      background: '#fffbf0', border: '0.5px solid #f5d87a', borderRadius: 6,
      padding: '8px 12px', fontSize: 11, color: '#7a5a00', marginBottom: 12,
    }}>
      <strong>Next step:</strong> {message}
    </div>
  )
}

function SigningBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    signed:   { label: 'Signed',   cls: 'pill-green' },
    viewed:   { label: 'Viewed',   cls: 'pill-blue'  },
    sent:     { label: 'Sent',     cls: 'pill-amber' },
    not_sent: { label: 'Not sent', cls: 'pill-grey'  },
  }
  const { label, cls } = map[status] ?? map['not_sent']
  return <span className={`pill ${cls}`} style={{ fontSize: 10 }}>{label}</span>
}
