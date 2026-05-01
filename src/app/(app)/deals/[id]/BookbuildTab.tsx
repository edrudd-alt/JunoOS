'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import {
  DealInvestorFull, ClientFull, NomineeRow,
  getDisplayedStatus, ACTIVE_STATUSES, PAST_STATUSES,
  STATUS_SORT_ORDER, DisplayedStatus,
} from './dealUtils'
import AddInvestorsModal from './AddInvestorsModal'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<DisplayedStatus, { label: string; cls: string }> = {
  soft_circled:  { label: 'Soft-circled',  cls: 'pill-grey'  },
  confirmed:     { label: 'Confirmed',      cls: 'pill-teal'  },
  app_form_sent: { label: 'App form sent',  cls: 'pill-blue'  },
  chase:         { label: 'Chase',          cls: 'pill-amber' },
  declined:      { label: 'Declined',       cls: 'pill-grey'  },
  signed:        { label: 'Signed',         cls: 'pill-green' },
  paid:          { label: 'Paid',           cls: 'pill-green' },
  complete:      { label: 'Complete',       cls: 'pill-green' },
  superseded:    { label: 'Superseded',     cls: 'pill-grey'  },
}

const KYC_DOT_COLOR: Record<string, string> = {
  verified:    '#1d9e75',
  renewal_due: '#ba7517',
  outstanding: '#a32d2d',
}

const NEXT_STEP_LABEL: Record<DisplayedStatus, string> = {
  soft_circled:  'Send confirmation',
  confirmed:     'Send app form',
  app_form_sent: 'Get signature',
  chase:         'Send chaser',
  declined:      '',
  signed:        '',
  paid:          '',
  complete:      '',
  superseded:    '',
}

function formatWholeNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface DealRow {
  id: string
  eis_qualifying: string | null
}

interface Props {
  deal:          DealRow
  dealInvestors: DealInvestorFull[]
  clientMap:     Map<string, ClientFull>
  allClients:    ClientFull[]
  nominees:      NomineeRow[]
  onDataRefresh: () => void
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BookbuildTab({ deal, dealInvestors, clientMap, allClients, nominees, onDataRefresh }: Props) {
  const [addModalOpen, setAddModalOpen] = useState(false)

  const showEis = deal.eis_qualifying === 'yes'

  const nomineeMap = new Map(nominees.map(n => [n.id, n]))

  // Partition and sort
  const activeRows = dealInvestors
    .filter(di => ACTIVE_STATUSES.has(getDisplayedStatus(di)))
    .sort((a, b) => {
      const sa = STATUS_SORT_ORDER[getDisplayedStatus(a)] ?? 99
      const sb = STATUS_SORT_ORDER[getDisplayedStatus(b)] ?? 99
      if (sa !== sb) return sa - sb
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

  const pastRows = dealInvestors
    .filter(di => PAST_STATUSES.has(getDisplayedStatus(di)))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const declinedCount = activeRows.length - activeRows.filter(di => getDisplayedStatus(di) !== 'declined').length

  // Totals — active non-declined rows
  const activeNonDeclined = activeRows.filter(di => getDisplayedStatus(di) !== 'declined')
  const totalSoftCircle   = activeNonDeclined.reduce((s, di) => s + (di.soft_circle_amount ?? 0), 0)
  const totalConfirmed    = activeNonDeclined.reduce((s, di) => s + (di.confirmed_amount ?? 0), 0)
  const totalShares       = activeNonDeclined.reduce((s, di) => s + (di.shares ?? 0), 0)
  const totalFeeAmount    = activeNonDeclined
    .filter(di => getDisplayedStatus(di) === 'confirmed' && di.fee_pct != null && di.confirmed_amount != null)
    .reduce((s, di) => s + (Number(di.fee_pct) * (di.confirmed_amount ?? 0)), 0)

  // Grid template: 13 columns (14 with EIS)
  const cols = [
    '32px',              // checkbox
    'minmax(160px, 1fr)', // client — min prevents collapse to 0 when fixed cols fill width
    '130px',             // vehicle
    '140px',           // location
    '100px',           // soft-circle
    '100px',           // confirmed
    '90px',            // shares
    '80px',            // fee
    '120px',           // status
    '52px',            // poa
    ...(showEis ? ['52px'] : []),
    '150px',           // next step
    '44px',            // menu
  ]
  const gridTemplate = cols.join(' ')

  const existingInvestorIds = new Set(dealInvestors.map(di => di.client_id))

  return (
    <div>
      {/* Toolbar */}
      <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--card-border)' }}>
        <button
          onClick={() => setAddModalOpen(true)}
          className="btn btn-secondary"
          style={{ fontSize: 12 }}
        >
          + Add investors
        </button>
      </div>

      {/* Horizontally scrollable table — prevents Client column collapsing to 0px */}
      <div style={{ overflowX: 'auto' }}>

      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        padding: '0 8px',
        borderBottom: '0.5px solid var(--card-border)',
        background: '#fafaf8',
      }}>
        <ColHeader />
        <ColHeader label="Client" align="left" />
        <ColHeader label="Vehicle" />
        <ColHeader label="Location" />
        <ColHeader label="Soft-circle" align="right" />
        <ColHeader label="Confirmed" align="right" />
        <ColHeader label="Shares" align="right" />
        <ColHeader label="Fee" align="right" />
        <ColHeader label="Status" />
        <ColHeader label="POA" />
        {showEis && <ColHeader label="EIS" />}
        <ColHeader label="Next step" />
        <ColHeader />
      </div>

      {/* Active rows */}
      {activeRows.map(di => (
        <InvestorRow
          key={di.id}
          di={di}
          client={clientMap.get(di.client_id) ?? null}
          vehicleName={di.investing_vehicle_id ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? null) : null}
          nomineeName={di.nominee_id ? (nomineeMap.get(di.nominee_id)?.name ?? null) : null}
          showEis={showEis}
          gridTemplate={gridTemplate}
          dim={false}
        />
      ))}

      {/* Past section */}
      {pastRows.length > 0 && (
        <div style={{
          padding: '5px 16px',
          background: '#fafaf8',
          borderTop: '0.5px solid var(--card-border)',
          borderBottom: '0.5px solid var(--card-border)',
          fontSize: 10, fontWeight: 600, color: '#aaa',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Signed &amp; beyond
        </div>
      )}
      {pastRows.map(di => (
        <InvestorRow
          key={di.id}
          di={di}
          client={clientMap.get(di.client_id) ?? null}
          vehicleName={di.investing_vehicle_id ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? null) : null}
          nomineeName={di.nominee_id ? (nomineeMap.get(di.nominee_id)?.name ?? null) : null}
          showEis={showEis}
          gridTemplate={gridTemplate}
          dim={true}
        />
      ))}

      {/* Empty state */}
      {activeRows.length === 0 && pastRows.length === 0 && (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          color: '#999', fontSize: 13,
        }}>
          No investors yet — click &ldquo;+ Add investors&rdquo; to get started.
        </div>
      )}

      {/* Totals row */}
      {activeRows.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          padding: '0 8px',
          borderTop: '0.5px solid var(--card-border)',
          background: '#fafaf8',
        }}>
          <div />
          <TotalCell align="left" style={{ color: '#888', fontWeight: 400, fontSize: 11 }}>
            {activeNonDeclined.length} active
            {declinedCount > 0 ? ` · ${declinedCount} declined` : ''}
          </TotalCell>
          <div />
          <div />
          <TotalCell align="right">
            {totalSoftCircle > 0 ? formatCurrency(totalSoftCircle) : '—'}
          </TotalCell>
          <TotalCell align="right">
            {totalConfirmed > 0 ? formatCurrency(totalConfirmed) : '—'}
          </TotalCell>
          <TotalCell align="right">
            {totalShares > 0 ? formatWholeNumber(totalShares) : '—'}
          </TotalCell>
          <TotalCell align="right">
            {totalFeeAmount > 0 ? formatCurrency(totalFeeAmount) : '—'}
          </TotalCell>
          <div />
          <div />
          {showEis && <div />}
          <div />
          <div />
        </div>
      )}

      </div>{/* end overflow-x: auto */}

      {/* Add investors modal */}
      {addModalOpen && (
        <AddInvestorsModal
          dealId={deal.id}
          allClients={allClients}
          nominees={nominees}
          existingInvestorIds={existingInvestorIds}
          onClose={() => setAddModalOpen(false)}
          onSaved={() => {
            setAddModalOpen(false)
            onDataRefresh()
          }}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColHeader({ label, align }: { label?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <div style={{
      padding: '7px 8px',
      fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em', color: '#aaa',
      textAlign: align ?? 'center',
    }}>
      {label ?? ''}
    </div>
  )
}

function TotalCell({
  children, align, style,
}: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      padding: '8px 8px',
      fontSize: 12, fontWeight: 600, color: '#0f2744',
      textAlign: align ?? 'center',
      ...style,
    }}>
      {children}
    </div>
  )
}

function InvestorRow({
  di, client, vehicleName, nomineeName, showEis, gridTemplate, dim,
}: {
  di:           DealInvestorFull
  client:       ClientFull | null
  vehicleName:  string | null
  nomineeName:  string | null
  showEis:      boolean
  gridTemplate: string
  dim:          boolean
}) {
  const displayedStatus = getDisplayedStatus(di)
  const badge    = STATUS_BADGE[displayedStatus] ?? { label: displayedStatus, cls: 'pill-grey' }
  const kycColor = client ? (KYC_DOT_COLOR[client.kyc_status] ?? '#ccc') : '#ccc'
  const nextStep = NEXT_STEP_LABEL[displayedStatus] ?? ''
  const showFee  = displayedStatus === 'confirmed' && di.fee_pct != null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: gridTemplate,
      padding: '0 8px',
      borderBottom: '0.5px solid var(--card-border)',
      opacity: dim ? 0.45 : 1,
      alignItems: 'center',
    }}>
      {/* Checkbox */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 8px' }}>
        <input
          type="checkbox"
          disabled
          style={{ cursor: 'not-allowed', accentColor: 'var(--teal)' }}
        />
      </div>

      {/* Client */}
      <div style={{ padding: '10px 8px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: kycColor, flexShrink: 0,
          }} />
          <span style={{
            fontSize: 12, fontWeight: 500, color: '#0f2744',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>
            {client?.full_name ?? 'Unknown'}
          </span>
        </div>
      </div>

      {/* Vehicle */}
      <div style={{ padding: '10px 8px', fontSize: 12, textAlign: 'center' }}>
        {vehicleName ? (
          <span style={{ color: '#0f2744', fontWeight: 500 }}>{vehicleName}</span>
        ) : (
          <span style={{ color: '#aaa' }}>Own name</span>
        )}
      </div>

      {/* Location */}
      <div style={{ padding: '10px 8px', fontSize: 12, textAlign: 'center' }}>
        {nomineeName ? (
          <span style={{ color: '#0f2744', fontWeight: 500 }}>{nomineeName}</span>
        ) : (
          <span style={{ color: '#aaa' }}>Direct</span>
        )}
      </div>

      {/* Soft-circle */}
      <div style={{ padding: '10px 8px', fontSize: 12, color: '#0f2744', textAlign: 'right' }}>
        {di.soft_circle_amount != null ? formatCurrency(di.soft_circle_amount) : '—'}
      </div>

      {/* Confirmed */}
      <div style={{ padding: '10px 8px', fontSize: 12, color: '#0f2744', textAlign: 'right' }}>
        {di.confirmed_amount != null ? formatCurrency(di.confirmed_amount) : '—'}
      </div>

      {/* Shares */}
      <div style={{ padding: '10px 8px', fontSize: 12, color: '#0f2744', textAlign: 'right' }}>
        {di.shares != null ? formatWholeNumber(di.shares) : '—'}
      </div>

      {/* Fee */}
      <div style={{ padding: '10px 8px', fontSize: 12, textAlign: 'right' }}>
        {showFee ? (
          <span style={{ color: di.fee_overridden ? 'var(--warning)' : '#0f2744' }}>
            {(Number(di.fee_pct) * 100).toFixed(2)}%
            {di.fee_locked_at ? ' 🔒' : di.fee_overridden ? ' ✎' : ''}
          </span>
        ) : (
          <span style={{ color: '#ccc' }}>—</span>
        )}
      </div>

      {/* Status */}
      <div style={{ padding: '10px 8px', display: 'flex', justifyContent: 'center' }}>
        <span className={`pill ${badge.cls}`} style={{ fontSize: 11 }}>
          {badge.label}
        </span>
      </div>

      {/* POA */}
      <div style={{
        padding: '10px 8px', fontSize: 12, textAlign: 'center',
        color: di.poa_held ? '#1d9e75' : '#ccc',
        fontWeight: di.poa_held ? 600 : 400,
      }}>
        {di.poa_held ? '✓' : '—'}
      </div>

      {/* EIS */}
      {showEis && (
        <div style={{ padding: '10px 8px', fontSize: 12, textAlign: 'center', color: '#ccc' }}>
          —
        </div>
      )}

      {/* Next step */}
      <div style={{ padding: '10px 8px' }}>
        {nextStep ? (
          <button
            disabled
            style={{
              fontSize: 11, padding: '4px 8px',
              background: '#f0f0ec',
              border: '0.5px solid #d8d8d0',
              borderRadius: 6, color: '#888',
              cursor: 'not-allowed', whiteSpace: 'nowrap',
            }}
          >
            {nextStep}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: '#ccc' }}>—</span>
        )}
      </div>

      {/* Menu */}
      <div style={{ padding: '10px 8px', display: 'flex', justifyContent: 'center' }}>
        <button
          disabled
          style={{
            background: 'none', border: 'none',
            cursor: 'not-allowed', fontSize: 16,
            color: '#ccc', padding: '0 4px',
          }}
        >
          ⋯
        </button>
      </div>
    </div>
  )
}
