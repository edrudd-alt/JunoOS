'use client'

import { useState, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Client } from '@/types'
import type {
  InvestmentRecord,
  ValuationRecord,
  DocumentRecord,
  FeeScheduleRecord,
  FeeScheduleItemRecord,
} from '../ClientRecord'
import EditClientModal from '../EditClientModal'
import EditReportingDefaultsModal from '../EditReportingDefaultsModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  lead: Client
  linkedEntities: Client[]        // sorted by entity_type order
  investments: InvestmentRecord[] // all entities, unfiltered
  valuations: ValuationRecord[]
  documents: DocumentRecord[]     // lead's membership docs only
  feeSchedules: FeeScheduleRecord[]
  feeScheduleItems: FeeScheduleItemRecord[] // buy items for lead's fee_schedule_id
  onSaved: () => void
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function isBuyTx(inv: InvestmentRecord): boolean {
  const t = inv.transaction_type ?? 'buy'
  return t === 'buy' || t === 'transfer_in'
}

function computeEntityStats(
  entityId: string,
  investments: InvestmentRecord[],
  valMap: Map<string, number>,
): { invested: number; currentValue: number; change: number } {
  const buyInvs = investments.filter(i => i.client_id === entityId && isBuyTx(i))
  const invested = buyInvs.reduce((s, i) => s + (i.sum_subscribed ?? 0), 0)
  const currentValue = buyInvs.reduce((s, i) => {
    const price = valMap.get(i.company_id) ?? 0
    return s + (i.shares_purchased ?? 0) * price
  }, 0)
  return { invested, currentValue, change: currentValue - invested }
}

function taxStatusLabel(status: string): string {
  switch (status) {
    case 'eis':     return 'EIS qualifying'
    case 'seis':    return 'SEIS qualifying'
    case 'both':    return 'EIS & SEIS qualifying'
    case 'neither': return 'Non-EIS'
    default:        return status
  }
}

function deliveryMethodLabel(method: string): string {
  return method === 'email' ? 'Email' : 'Download only'
}

function frequencyLabel(freq: string): string {
  switch (freq) {
    case 'quarterly':   return 'Quarterly'
    case 'half_yearly': return 'Half-yearly'
    case 'annual':      return 'Annual'
    case 'manual':      return 'Manual'
    default:            return freq
  }
}

function entityTypeLabel(type: string): string {
  switch (type) {
    case 'own_name':   return 'Own name'
    case 'corporate':  return 'Corporate'
    case 'pension':    return 'Pension'
    case 'family':     return 'Family'
    case 'trust':      return 'Trust'
    default:           return type
  }
}

function entityTypeTagStyle(type: string): CSSProperties {
  switch (type) {
    case 'own_name':  return { background: '#eef2f7', color: '#4a6fa5' }
    case 'corporate': return { background: '#faf3e8', color: '#8a6b2a' }
    case 'pension':   return { background: '#f3eef7', color: '#6b4a8a' }
    case 'family':    return { background: '#f3eef7', color: '#6b4a8a' }
    case 'trust':     return { background: '#f0f0ec', color: '#555' }
    default:          return { background: '#f0f0ec', color: '#666' }
  }
}

function docTypeInfo(type: string): { label: string; bg: string; color: string } {
  switch (type) {
    case 'kyc':                    return { label: 'KYC',            bg: '#e1f5ee', color: '#085041' }
    case 'poa':                    return { label: 'POA',            bg: '#f0f0ec', color: '#666' }
    case 'membership_agreement':   return { label: 'Membership',     bg: '#eef2f7', color: '#4a6fa5' }
    case 'suitability_assessment': return { label: 'Suitability',    bg: '#eef2f7', color: '#185fa5' }
    case 'source_of_funds':        return { label: 'Source of funds',bg: '#f5f0ec', color: '#7a5a3a' }
    default:                       return { label: type,             bg: '#f0f0ec', color: '#666' }
  }
}

function resolveFee(
  lead: Client,
  feeSchedules: FeeScheduleRecord[],
  feeScheduleItems: FeeScheduleItemRecord[],
): { rate: string; tooltip: string } {
  if (lead.fee_schedule_id) {
    const schedule = feeSchedules.find(fs => fs.id === lead.fee_schedule_id)
    const buyItem  = feeScheduleItems.find(i => i.fee_type === 'buy')
    if (buyItem) {
      return {
        rate:    `${Number(buyItem.rate).toFixed(2)}%`,
        tooltip: `From fee schedule: ${schedule?.name ?? ''}`,
      }
    }
  }
  return {
    rate:    `${Number(lead.default_fee_rate ?? 5).toFixed(2)}%`,
    tooltip: 'Default fee rate',
  }
}

// ── StubModal — placeholder for flows built in later sub-stages ───────────────

function StubModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '28px 32px', minWidth: 340, maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#0f2744' }}>Coming soon</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: '#555', margin: 0 }}>{message}</p>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 12 }}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OverviewTab({
  lead, linkedEntities, investments, valuations, documents,
  feeSchedules, feeScheduleItems, onSaved,
}: Props) {
  const [editClientOpen, setEditClientOpen]       = useState(false)
  const [editReportingOpen, setEditReportingOpen] = useState(false)
  const [stubMessage, setStubMessage]             = useState<string | null>(null)

  function openStub(message: string) { setStubMessage(message) }

  // All entities in display order: lead first, then linked (already sorted by entity_type)
  const allEntities = useMemo(() => [lead, ...linkedEntities], [lead, linkedEntities])

  // Valuation lookup map
  const valMap = useMemo(
    () => new Map(valuations.map(v => [v.company_id, v.share_price])),
    [valuations],
  )

  // Per-entity stats for linked entities panel
  const entityStats = useMemo(
    () => allEntities.map(e => ({ entity: e, ...computeEntityStats(e.id, investments, valMap) })),
    [allEntities, investments, valMap],
  )

  // Totals row
  const totals = useMemo(() => {
    const invested     = entityStats.reduce((s, r) => s + r.invested, 0)
    const currentValue = entityStats.reduce((s, r) => s + r.currentValue, 0)
    return { invested, currentValue, change: currentValue - invested }
  }, [entityStats])

  // Reporting defaults checked set
  const defaultIds = useMemo(
    () => new Set(lead.reporting_entity_defaults ?? []),
    [lead.reporting_entity_defaults],
  )

  const fee = resolveFee(lead, feeSchedules, feeScheduleItems)

  // Address — split into lines for rendering
  const addressLines = useMemo(() => {
    const lines: string[] = []
    if (lead.address_line1) lines.push(lead.address_line1)
    if (lead.address_line2) lines.push(lead.address_line2)
    const cityPost = [lead.city, lead.postcode].filter(Boolean).join(' ')
    if (cityPost) lines.push(cityPost)
    return lines
  }, [lead])

  function handleSaved() {
    setEditClientOpen(false)
    setEditReportingOpen(false)
    onSaved()
  }

  return (
    <>
      <style>{`
        @media (max-width: 1024px) {
          .overview-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Two-column layout ── */}
      <div className="overview-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Contact details */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}>
              <span>Contact details</span>
              <button onClick={() => setEditClientOpen(true)} style={linkBtnStyle}>Edit</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 9, columnGap: 14 }}>
              <FieldLabel>Email</FieldLabel>
              <FieldValue>
                {lead.email
                  ? <a href={`mailto:${lead.email}`} style={{ color: '#185fa5', textDecoration: 'none' }}>{lead.email}</a>
                  : '—'}
              </FieldValue>

              <FieldLabel>Phone</FieldLabel>
              <FieldValue>{lead.phone ?? '—'}</FieldValue>

              <FieldLabel>Address</FieldLabel>
              <FieldValue>
                {addressLines.length > 0
                  ? addressLines.map((line, i) => (
                      <span key={i}>{i > 0 && <br />}{line}</span>
                    ))
                  : '—'}
              </FieldValue>

              <FieldLabel>Date joined</FieldLabel>
              <FieldValue>{formatDate(lead.date_joined)}</FieldValue>

              <FieldLabel>Tax status</FieldLabel>
              <FieldValue>{taxStatusLabel(lead.tax_status)}</FieldValue>

              <FieldLabel>Investor ref</FieldLabel>
              <FieldValue>{lead.investor_reference ?? '—'}</FieldValue>

              <FieldLabel>Default fee rate</FieldLabel>
              <FieldValue>
                <span title={fee.tooltip} style={{ cursor: 'help', borderBottom: '1px dotted #bbb' }}>
                  {fee.rate}
                </span>
              </FieldValue>

              <FieldLabel>Report email</FieldLabel>
              <FieldValue>
                {(lead.report_delivery_email ?? lead.email)
                  ? <a
                      href={`mailto:${lead.report_delivery_email ?? lead.email}`}
                      style={{ color: '#185fa5', textDecoration: 'none' }}
                    >
                      {lead.report_delivery_email ?? lead.email}
                    </a>
                  : '—'}
              </FieldValue>
            </div>
          </div>

          {/* Membership documents */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}>
              <span>Membership documents</span>
              <button
                onClick={() => openStub('Document upload comes in a later stage.')}
                style={linkBtnStyle}
              >
                + Upload
              </button>
            </div>
            {documents.length === 0 ? (
              <div style={{ fontSize: 12, color: '#aaa', padding: '4px 0' }}>
                No membership documents on file yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {documents.map(doc => {
                  const tag = docTypeInfo(doc.type)
                  return (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 10px', background: '#fafaf8', borderRadius: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 5, flexShrink: 0,
                          background: tag.bg, color: tag.color, fontWeight: 500,
                        }}>
                          {tag.label}
                        </span>
                        <span style={{ fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.filename}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 10 }}>
                        {doc.document_date && (
                          <span style={{ fontSize: 11, color: '#aaa' }}>{formatDate(doc.document_date)}</span>
                        )}
                        <button
                          onClick={() => openStub('Document view comes in a later stage.')}
                          style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          View
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Linked entities */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}>
              <span>Linked entities</span>
              <button
                onClick={() => openStub('Add entity flow comes in a later stage.')}
                style={linkBtnStyle}
              >
                + Add entity
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Entity</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Invested</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Current value</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {entityStats.map(({ entity, invested, currentValue, change }) => {
                  const isLead = entity.id === lead.id
                  const typeStyle = entityTypeTagStyle(entity.entity_type)
                  // TODO: fetch nominee name via entity.default_nominee_id for "Nominee [Name]" label
                  const locationLabel = entity.holding_location === 'nominee' ? 'Nominee' : 'Direct'
                  const changeColor   = change >= 0 ? '#0f6e56' : '#a32d2d'

                  return (
                    <tr
                      key={entity.id}
                      style={{ cursor: 'pointer', borderBottom: '0.5px solid #f2f2ef' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafaf8')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => { window.location.href = `/clients/${entity.id}` }}
                    >
                      <td style={{ padding: '10px 8px', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 12, color: '#0f2744', fontWeight: isLead ? 500 : 400 }}>
                          {entity.full_name}
                        </span>
                        <span style={{
                          ...typeStyle,
                          fontSize: 9, padding: '1px 5px', borderRadius: 5, marginLeft: 6, fontWeight: 500,
                        }}>
                          {entityTypeLabel(entity.entity_type)}
                        </span>
                        <span style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 5, marginLeft: 4, fontWeight: 500,
                          background: entity.holding_location === 'nominee' ? '#eeedfe' : '#f0f0ec',
                          color:      entity.holding_location === 'nominee' ? '#3c3489' : '#666',
                        }}>
                          {locationLabel}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }}>
                        {invested > 0 ? formatCurrency(invested) : '—'}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }}>
                        {currentValue > 0 ? formatCurrency(currentValue) : '—'}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle', color: changeColor }}>
                        {invested > 0 ? `${change >= 0 ? '+' : ''}${formatCurrency(change)}` : '—'}
                      </td>
                    </tr>
                  )
                })}
                {/* Total row */}
                <tr style={{ background: '#f5f4ef' }}>
                  <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 500, color: '#0f2744' }}>Total</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: '#0f2744' }}>
                    {formatCurrency(totals.invested)}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: '#0f2744' }}>
                    {formatCurrency(totals.currentValue)}
                  </td>
                  <td style={{
                    padding: '10px 8px', textAlign: 'right', fontSize: 12, fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    color: totals.change >= 0 ? '#0f6e56' : '#a32d2d',
                  }}>
                    {`${totals.change >= 0 ? '+' : ''}${formatCurrency(totals.change)}`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Reporting defaults */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}>
              <span>Reporting defaults</span>
              <button onClick={() => setEditReportingOpen(true)} style={linkBtnStyle}>Edit</button>
            </div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>
              Entities included in routine portfolio statements:
            </div>
            {allEntities.map(entity => {
              const checked = defaultIds.has(entity.id)
              const locationLabel = entity.holding_location === 'nominee' ? 'Nominee' : 'Direct'
              return (
                <div
                  key={entity.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 0', borderBottom: '0.5px solid #f2f2ef', fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: checked ? '1px solid #0f2744' : '1px solid #c8c7c0',
                      background: checked ? '#0f2744' : '#fff',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 9,
                    }}>
                      {checked ? '✓' : ''}
                    </span>
                    <span style={{ color: '#333' }}>{entity.full_name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#aaa' }}>{locationLabel}</span>
                </div>
              )
            })}
            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: '0.5px solid #f0f0ec',
              display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 8, fontSize: 12,
            }}>
              <span style={{ color: '#999', fontSize: 11 }}>Delivery method</span>
              <span>{deliveryMethodLabel(lead.report_delivery_method ?? 'email')}</span>
              <span style={{ color: '#999', fontSize: 11 }}>Delivery frequency</span>
              <span>{frequencyLabel(lead.report_delivery_frequency ?? 'quarterly')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Performance placeholder (full width) ── */}
      <div style={{
        marginTop: 14, background: '#fafaf8',
        border: '1px dashed #d8d7d0', borderRadius: 8,
        padding: '40px 16px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#888', marginBottom: 8 }}>
          Performance metrics
        </div>
        <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>
          Realised P&amp;L, unrealised P&amp;L, MOIC and IRR will appear here once the performance reporting feature is built.
        </p>
      </div>

      {/* ── Modals ── */}
      {editClientOpen && (
        <EditClientModal
          lead={lead}
          feeSchedules={feeSchedules}
          onClose={() => setEditClientOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {editReportingOpen && (
        <EditReportingDefaultsModal
          lead={lead}
          allEntities={allEntities}
          onClose={() => setEditReportingOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {stubMessage !== null && (
        <StubModal message={stubMessage} onClose={() => setStubMessage(null)} />
      )}
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: '#999', paddingTop: 1 }}>{children}</div>
}

function FieldValue({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: '#333' }}>{children}</div>
}

// ── Style constants ───────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '16px 18px',
}

const panelTitleStyle: CSSProperties = {
  fontSize: 11, fontWeight: 500, color: '#0f2744', marginBottom: 12,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
}

const linkBtnStyle: CSSProperties = {
  fontSize: 11, color: '#0f2744', background: 'none', border: 'none', cursor: 'pointer',
  textTransform: 'none', letterSpacing: 0, fontWeight: 400, padding: 0, fontFamily: 'inherit',
}

const thStyle: CSSProperties = {
  fontSize: 10, color: '#aaa', fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  padding: '6px 8px', textAlign: 'left', borderBottom: '0.5px solid #e8e7e0',
}
