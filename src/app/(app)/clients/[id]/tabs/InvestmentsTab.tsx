'use client'

import { useState, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Client } from '@/types'
import type { InvestmentRecord, CompanyRecord, ValuationRecord, NomineeRecord } from '../ClientRecord'
import {
  buildRichInvestments,
  filterInvestments,
  groupByCompany,
  groupByShareClass,
  computeTotals,
  DEFAULT_FILTERS,
  type InvFilters,
  type CompanyGroup,
  type CompanyShareClassGroup,
  type RichInvestment,
} from './investmentsAggregations'
import { formatCurrency, formatDate, formatPrice, formatPercent } from '@/lib/utils'

type ViewMode = 'company' | 'share_class' | 'flat'

interface Props {
  investments: InvestmentRecord[]
  companies: CompanyRecord[]
  valuations: ValuationRecord[]
  nominees: NomineeRecord[]
  allEntities: Client[]
  selectedEntity: string
  onEntityChange: (id: string) => void
}

// ── Design constants ──────────────────────────────────────────────────────────

const CO_COLORS: [string, string][] = [
  ['#eef2f7', '#4a6fa5'],
  ['#f3eef7', '#6b4a8a'],
  ['#e8f5ef', '#2e7d5c'],
  ['#faf3e8', '#8a6b2a'],
  ['#fce8e8', '#9e3333'],
  ['#eef7f5', '#2b6e8a'],
]

function coColor(id: string): [string, string] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CO_COLORS[h % CO_COLORS.length]
}

const TH: CSSProperties = {
  fontSize: 10, color: '#888', fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  padding: '9px 12px', textAlign: 'left',
  borderBottom: '0.5px solid #e8e7e0', whiteSpace: 'nowrap',
  background: '#f7f7f5',
}

const STH: CSSProperties = {
  fontSize: 9, color: '#999', fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  padding: '8px 12px 6px', textAlign: 'left',
  borderBottom: '0.5px dashed #d8d7d0', whiteSpace: 'nowrap',
}

const TD: CSSProperties = {
  padding: '11px 12px', fontSize: 12,
  borderBottom: '0.5px solid #f2f2ef', verticalAlign: 'middle',
}

const STD: CSSProperties = {
  padding: '9px 12px', fontSize: 11, color: '#444',
  borderBottom: '0.5px solid #f0f0ec', background: '#fafaf8',
}

const TOTAL_TD: CSSProperties = {
  padding: '11px 12px', fontSize: 11,
  background: '#f7f7f5', fontWeight: 500, color: '#0f2744',
  verticalAlign: 'middle',
}

// ── Small sub-components ──────────────────────────────────────────────────────

function CoLogo({ id, name, logoUrl }: { id: string; name: string; logoUrl: string | null }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
  if (logoUrl) {
    return (
      <img
        src={logoUrl} alt={name}
        style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  const [bg, color] = coColor(id)
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 6, background: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontWeight: 500, color,
      border: '0.5px solid rgba(0,0,0,0.06)',
    }}>
      {initials}
    </div>
  )
}

function EisPill({ status }: { status: string }) {
  const yes = status === 'yes'
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, padding: '1px 5px',
      borderRadius: 4, fontWeight: 500,
      background: yes ? '#e1f5ee' : '#f0f0ec',
      color: yes ? '#085041' : '#777',
    }}>
      {yes ? 'EIS' : 'Non-EIS'}
    </span>
  )
}

function ChangeCell({ change, pct }: { change: number | null; pct: number | null }) {
  if (change === null) return <span style={{ color: '#aaa' }}>—</span>
  const up = change > 0
  const down = change < 0
  const col = up ? '#0f6e56' : down ? '#a32d2d' : '#888'
  return (
    <span style={{ color: col, fontVariantNumeric: 'tabular-nums' }}>
      {up ? '+' : ''}{formatCurrency(change)}
      {pct !== null && (
        <span style={{ display: 'block', fontSize: 10, opacity: 0.75, fontWeight: 'normal' }}>
          {formatPercent(pct)}
        </span>
      )}
    </span>
  )
}

function HeldBy({ inv, showEntity }: { inv: RichInvestment; showEntity: boolean }) {
  const nom = inv.holding_location === 'nominee'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {showEntity && <span style={{ fontSize: 11, color: '#555' }}>{inv.entity_name}</span>}
      {nom ? (
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 4,
          background: '#eeedfe', color: '#3c3489', fontWeight: 500,
        }}>
          {inv.nominee_name ? `Nominee · ${inv.nominee_name}` : 'Nominee'}
        </span>
      ) : (
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 4,
          background: '#f0f0ec', color: '#666', fontWeight: 500,
        }}>
          Direct
        </span>
      )}
    </div>
  )
}

// Sub-table shown inside an expanded company or share-class row
function TxSubTable({
  investments,
  showEntity,
  colSpan,
}: {
  investments: RichInvestment[]
  showEntity: boolean
  colSpan: number
}) {
  const sortedDates = [...investments.map(i => i.investment_date)].sort()
  const first = sortedDates[0]
  const last  = sortedDates[sortedDates.length - 1]
  const priced = investments.filter(i => i.change !== null)
  const allDown = priced.length > 0 && priced.every(i => (i.change as number) < 0)

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...STH, textAlign: 'right', width: 90 }}>Date</th>
              <th style={{ ...STH, width: 110 }}>Share class</th>
              <th style={{ ...STH, width: 60 }}>EIS</th>
              <th style={{ ...STH, textAlign: 'right', width: 80 }}>Orig price</th>
              <th style={{ ...STH, textAlign: 'right', width: 80 }}>Shares</th>
              <th style={{ ...STH, textAlign: 'right', width: 90 }}>Invested</th>
              <th style={{ ...STH, textAlign: 'right', width: 90 }}>Curr price</th>
              <th style={{ ...STH, textAlign: 'right', width: 95 }}>Curr value</th>
              <th style={{ ...STH, textAlign: 'right', width: 105 }}>Change</th>
              <th style={{ ...STH, width: showEntity ? 180 : 110 }}>Held by</th>
            </tr>
          </thead>
          <tbody>
            {investments.map(inv => (
              <tr key={inv.id}>
                <td style={{ ...STD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatDate(inv.investment_date)}
                </td>
                <td style={STD}>{inv.share_class}</td>
                <td style={STD}><EisPill status={inv.eis_status} /></td>
                <td style={{ ...STD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatPrice(inv.original_share_price)}
                </td>
                <td style={{ ...STD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {inv.shares_purchased.toLocaleString('en-GB')}
                </td>
                <td style={{ ...STD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(inv.sum_subscribed)}
                </td>
                <td style={{ ...STD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {inv.current_share_price !== null ? formatPrice(inv.current_share_price) : '—'}
                </td>
                <td style={{ ...STD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {inv.current_value !== null ? formatCurrency(inv.current_value) : '—'}
                </td>
                <td style={{ ...STD, textAlign: 'right' }}>
                  <ChangeCell change={inv.change} pct={inv.change_pct} />
                </td>
                <td style={STD}><HeldBy inv={inv} showEntity={showEntity} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{
          padding: '10px 14px', fontSize: 11, color: '#888',
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          background: '#fafaf8', borderTop: '0.5px dashed #d8d7d0',
        }}>
          <span>Cumulative dividend paid: <strong style={{ color: '#555' }}>£0.00</strong></span>
          <span>·</span>
          <span>First investment: {formatDate(first)}</span>
          {first !== last && (
            <>
              <span>·</span>
              <span>Most recent: {formatDate(last)}</span>
            </>
          )}
          {allDown && (
            <>
              <span>·</span>
              <span style={{ color: '#92571b' }}>Note: Current price below original on all lots</span>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── View 1: By Company ────────────────────────────────────────────────────────

function ByCompanyView({
  groups,
  totals,
  showEntity,
  expanded,
  onToggle,
}: {
  groups: CompanyGroup[]
  totals: ReturnType<typeof computeTotals>
  showEntity: boolean
  expanded: Set<string>
  onToggle: (id: string) => void
}) {
  const COL_COUNT = 8
  return (
    <div style={{ border: '0.5px solid #e8e7e0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, minWidth: 200 }}>Company</th>
            <th style={TH}>Share classes</th>
            <th style={{ ...TH, textAlign: 'right' }}>Shares</th>
            <th style={{ ...TH, textAlign: 'right' }}>Avg cost</th>
            <th style={{ ...TH, textAlign: 'right' }}>Invested</th>
            <th style={{ ...TH, textAlign: 'right' }}>Current value</th>
            <th style={{ ...TH, textAlign: 'right' }}>Change</th>
            <th style={{ ...TH, textAlign: 'right', width: 52 }}></th>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => {
            const open = expanded.has(g.companyId)
            return (
              // eslint-disable-next-line react/jsx-key
              <TableExpandGroup key={g.companyId} open={open}>
                <tr
                  onClick={() => onToggle(g.companyId)}
                  style={{ cursor: 'pointer', borderBottom: open ? 'none' : '0.5px solid #f2f2ef' }}
                  onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = '#fafaf8' }}
                  onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                >
                  <td style={{ ...TD, background: open ? '#fafaf8' : 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        display: 'inline-block', width: 12, color: '#aaa', fontSize: 11, flexShrink: 0,
                        transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
                      }}>›</span>
                      <CoLogo id={g.companyId} name={g.companyName} logoUrl={g.companyLogoUrl} />
                      <div>
                        <div style={{ fontWeight: 500, color: '#0f2744', fontSize: 12 }}>{g.companyName}</div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>
                          {g.companySector ? `${g.companySector} · ` : ''}
                          {g.investments.length} {g.investments.length === 1 ? 'transaction' : 'transactions'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...TD, background: open ? '#fafaf8' : 'inherit' }}>
                    {g.shareClasses.map(sc => (
                      <span key={sc} style={{
                        display: 'inline-block', fontSize: 9, padding: '2px 5px', borderRadius: 4,
                        background: '#eef2f7', color: '#4a6fa5', marginRight: 3, fontWeight: 500,
                      }}>
                        {sc}
                      </span>
                    ))}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: open ? '#fafaf8' : 'inherit' }}>
                    {g.totalShares.toLocaleString('en-GB')}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: open ? '#fafaf8' : 'inherit' }}>
                    {formatPrice(g.weightedAvgCost)}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: open ? '#fafaf8' : 'inherit' }}>
                    {formatCurrency(g.totalInvested)}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: open ? '#fafaf8' : 'inherit' }}>
                    {g.totalCurrentValue !== null ? formatCurrency(g.totalCurrentValue) : '—'}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', background: open ? '#fafaf8' : 'inherit' }}>
                    <ChangeCell change={g.totalChange} pct={g.totalChangePct} />
                  </td>
                  <td style={{ ...TD, textAlign: 'right', background: open ? '#fafaf8' : 'inherit' }}>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 8,
                      background: '#f0f0ec', color: '#888', fontWeight: 500,
                    }}>
                      {g.investments.length} tx
                    </span>
                  </td>
                </tr>
                {open && (
                  <TxSubTable
                    investments={g.investments}
                    showEntity={showEntity}
                    colSpan={COL_COUNT}
                  />
                )}
              </TableExpandGroup>
            )
          })}
          <tr style={{ borderTop: '0.5px solid #d8d7d0' }}>
            <td colSpan={2} style={TOTAL_TD}>
              Total · {totals.companyCount} {totals.companyCount === 1 ? 'company' : 'companies'} · {totals.count} {totals.count === 1 ? 'transaction' : 'transactions'}
            </td>
            <td style={{ ...TOTAL_TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>—</td>
            <td style={{ ...TOTAL_TD, textAlign: 'right' }}>—</td>
            <td style={{ ...TOTAL_TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(totals.totalInvested)}
            </td>
            <td style={{ ...TOTAL_TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {totals.totalCurrentValue !== null ? formatCurrency(totals.totalCurrentValue) : '—'}
            </td>
            <td style={{ ...TOTAL_TD, textAlign: 'right' }}>
              <ChangeCell change={totals.totalChange} pct={totals.totalChangePct} />
            </td>
            <td style={TOTAL_TD}></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── View 2: By Share Class ────────────────────────────────────────────────────

function ByShareClassView({
  groups,
  totals,
  showEntity,
  expandedKeys,
  onToggle,
}: {
  groups: CompanyShareClassGroup[]
  totals: ReturnType<typeof computeTotals>
  showEntity: boolean
  expandedKeys: Set<string>
  onToggle: (key: string) => void
}) {
  const COL_COUNT = 7
  return (
    <div style={{ border: '0.5px solid #e8e7e0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, minWidth: 200 }}>Company / Share class</th>
            <th style={{ ...TH, textAlign: 'right' }}>Shares</th>
            <th style={{ ...TH, textAlign: 'right' }}>Avg cost</th>
            <th style={{ ...TH, textAlign: 'right' }}>Invested</th>
            <th style={{ ...TH, textAlign: 'right' }}>Current value</th>
            <th style={{ ...TH, textAlign: 'right' }}>Change</th>
            <th style={{ ...TH, width: 52 }}></th>
          </tr>
        </thead>
        <tbody>
          {groups.map(co => (
            <TableExpandGroup key={co.companyId}>
              {/* Company header row */}
              <tr style={{ borderBottom: '0.5px solid #e8e7e0' }}>
                <td colSpan={COL_COUNT} style={{
                  padding: '12px 12px 6px',
                  background: '#f7f7f5', borderBottom: '0.5px solid #e8e7e0',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CoLogo id={co.companyId} name={co.companyName} logoUrl={co.companyLogoUrl} />
                    <div>
                      <div style={{ fontWeight: 500, color: '#0f2744', fontSize: 12 }}>{co.companyName}</div>
                      {co.companySector && (
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{co.companySector}</div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>

              {/* Share class rows */}
              {co.shareClassGroups.map(sc => {
                const open = expandedKeys.has(sc.key)
                return (
                  <TableExpandGroup key={sc.key} open={open}>
                    <tr
                      onClick={() => onToggle(sc.key)}
                      style={{ cursor: 'pointer', borderBottom: open ? 'none' : '0.5px solid #f2f2ef' }}
                      onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = '#fafaf8' }}
                      onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                    >
                      <td style={{ ...TD, paddingLeft: 28 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            display: 'inline-block', width: 12, color: '#aaa', fontSize: 11, flexShrink: 0,
                            transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
                          }}>›</span>
                          <span style={{ fontSize: 12, color: '#333', marginRight: 6 }}>{sc.shareClass}</span>
                          {sc.hasEis && <EisPill status="yes" />}
                        </div>
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {sc.totalShares.toLocaleString('en-GB')}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(sc.weightedAvgCost)}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(sc.totalInvested)}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {sc.totalCurrentValue !== null ? formatCurrency(sc.totalCurrentValue) : '—'}
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <ChangeCell change={sc.totalChange} pct={sc.totalChangePct} />
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <span style={{
                          fontSize: 9, padding: '2px 5px', borderRadius: 8,
                          background: '#f0f0ec', color: '#888', fontWeight: 500,
                        }}>
                          {sc.investments.length} tx
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <TxSubTable
                        investments={sc.investments}
                        showEntity={showEntity}
                        colSpan={COL_COUNT}
                      />
                    )}
                  </TableExpandGroup>
                )
              })}

              {/* Company subtotal row */}
              <tr style={{ borderBottom: '0.5px solid #e8e7e0' }}>
                <td style={{ ...TD, paddingLeft: 28, fontStyle: 'italic', fontSize: 11, color: '#555', background: '#fdfdfb' }}>
                  Subtotal · {co.shareClassGroups.reduce((n, sc) => n + sc.investments.length, 0)} transactions
                </td>
                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontStyle: 'italic', fontSize: 11, color: '#555', background: '#fdfdfb' }}>
                  {co.subtotalShares.toLocaleString('en-GB')}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontStyle: 'italic', fontSize: 11, color: '#555', background: '#fdfdfb' }}>
                  {formatPrice(co.subtotalWeightedAvg)}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontStyle: 'italic', fontSize: 11, color: '#555', background: '#fdfdfb' }}>
                  {formatCurrency(co.subtotalInvested)}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontStyle: 'italic', fontSize: 11, color: '#555', background: '#fdfdfb' }}>
                  {co.subtotalCurrentValue !== null ? formatCurrency(co.subtotalCurrentValue) : '—'}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontStyle: 'italic', fontSize: 11, color: '#555', background: '#fdfdfb' }}>
                  <ChangeCell change={co.subtotalChange} pct={co.subtotalChangePct} />
                </td>
                <td style={{ background: '#fdfdfb' }}></td>
              </tr>
            </TableExpandGroup>
          ))}

          {/* Grand total */}
          <tr style={{ borderTop: '0.5px solid #d8d7d0' }}>
            <td style={TOTAL_TD}>
              Total · {totals.companyCount} {totals.companyCount === 1 ? 'company' : 'companies'} · {totals.count} {totals.count === 1 ? 'transaction' : 'transactions'}
            </td>
            <td style={{ ...TOTAL_TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>—</td>
            <td style={{ ...TOTAL_TD, textAlign: 'right' }}>—</td>
            <td style={{ ...TOTAL_TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(totals.totalInvested)}
            </td>
            <td style={{ ...TOTAL_TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {totals.totalCurrentValue !== null ? formatCurrency(totals.totalCurrentValue) : '—'}
            </td>
            <td style={{ ...TOTAL_TD, textAlign: 'right' }}>
              <ChangeCell change={totals.totalChange} pct={totals.totalChangePct} />
            </td>
            <td style={TOTAL_TD}></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── View 3: Flat List ─────────────────────────────────────────────────────────

function FlatListView({
  investments,
  totals,
  showEntity,
}: {
  investments: RichInvestment[]
  totals: ReturnType<typeof computeTotals>
  showEntity: boolean
}) {
  return (
    <div style={{ border: '0.5px solid #e8e7e0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 94 }}>Date</th>
            <th style={{ ...TH, minWidth: 130 }}>Company</th>
            <th style={{ ...TH, minWidth: 90 }}>Share class</th>
            <th style={{ ...TH, width: 68 }}>EIS</th>
            <th style={{ ...TH, textAlign: 'right' }}>Orig price</th>
            <th style={{ ...TH, textAlign: 'right' }}>Shares</th>
            <th style={{ ...TH, textAlign: 'right' }}>Invested</th>
            <th style={{ ...TH, textAlign: 'right' }}>Curr price</th>
            <th style={{ ...TH, textAlign: 'right' }}>Curr value</th>
            <th style={{ ...TH, textAlign: 'right' }}>Change</th>
            <th style={TH}>Held by</th>
          </tr>
        </thead>
        <tbody>
          {investments.map(inv => (
            <tr key={inv.id} style={{ borderBottom: '0.5px solid #f2f2ef' }}>
              <td style={{ ...TD, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: '#888' }}>
                {formatDate(inv.investment_date)}
              </td>
              <td style={TD}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CoLogo id={inv.company_id} name={inv.company_name} logoUrl={inv.company_logo_url} />
                  <span style={{ fontSize: 12, color: '#0f2744', fontWeight: 500 }}>{inv.company_name}</span>
                </div>
              </td>
              <td style={{ ...TD, fontSize: 11 }}>{inv.share_class}</td>
              <td style={TD}><EisPill status={inv.eis_status} /></td>
              <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatPrice(inv.original_share_price)}
              </td>
              <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {inv.shares_purchased.toLocaleString('en-GB')}
              </td>
              <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(inv.sum_subscribed)}
              </td>
              <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {inv.current_share_price !== null ? formatPrice(inv.current_share_price) : '—'}
              </td>
              <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {inv.current_value !== null ? formatCurrency(inv.current_value) : '—'}
              </td>
              <td style={{ ...TD, textAlign: 'right' }}>
                <ChangeCell change={inv.change} pct={inv.change_pct} />
              </td>
              <td style={TD}><HeldBy inv={inv} showEntity={showEntity} /></td>
            </tr>
          ))}
          <tr style={{ borderTop: '0.5px solid #d8d7d0' }}>
            <td colSpan={5} style={TOTAL_TD}>
              {totals.count} {totals.count === 1 ? 'holding' : 'holdings'} · {totals.companyCount} {totals.companyCount === 1 ? 'company' : 'companies'}
            </td>
            <td style={{ ...TOTAL_TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>—</td>
            <td style={{ ...TOTAL_TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(totals.totalInvested)}
            </td>
            <td style={{ ...TOTAL_TD, textAlign: 'right' }}>—</td>
            <td style={{ ...TOTAL_TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {totals.totalCurrentValue !== null ? formatCurrency(totals.totalCurrentValue) : '—'}
            </td>
            <td style={{ ...TOTAL_TD, textAlign: 'right' }}>
              <ChangeCell change={totals.totalChange} pct={totals.totalChangePct} />
            </td>
            <td style={TOTAL_TD}></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Fragment wrapper to group <tr> siblings without a DOM element ─────────────

function TableExpandGroup({ children, open: _open }: { children: ReactNode; open?: boolean }) {
  return <>{children}</>
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InvestmentsTab({
  investments, companies, valuations, nominees,
  allEntities, selectedEntity, onEntityChange,
}: Props) {
  const [viewMode, setViewMode]           = useState<ViewMode>('company')
  const [filters, setFilters]             = useState<InvFilters>(DEFAULT_FILTERS)
  const [expandedCo, setExpandedCo]       = useState<Set<string>>(new Set())
  const [expandedSc, setExpandedSc]       = useState<Set<string>>(new Set())

  const companyMap      = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies])
  const valuationMap    = useMemo(() => new Map(valuations.map(v => [v.company_id, v.share_price])), [valuations])
  const entityNameMap   = useMemo(() => new Map(allEntities.map(e => [e.id, e.full_name])), [allEntities])
  const entityNomMap    = useMemo(() => new Map(allEntities.map(e => [e.id, e.default_nominee_id])), [allEntities])
  const nomineeNameMap  = useMemo(() => new Map(nominees.map(n => [n.id, n.name])), [nominees])

  const richAll = useMemo(
    () => buildRichInvestments(investments, companyMap, valuationMap, entityNameMap, entityNomMap, nomineeNameMap),
    [investments, companyMap, valuationMap, entityNameMap, entityNomMap, nomineeNameMap],
  )

  const filtered     = useMemo(() => filterInvestments(richAll, selectedEntity, filters), [richAll, selectedEntity, filters])
  const totals       = useMemo(() => computeTotals(filtered), [filtered])
  const coGroups     = useMemo(() => viewMode === 'company'     ? groupByCompany(filtered)     : [], [filtered, viewMode])
  const scGroups     = useMemo(() => viewMode === 'share_class' ? groupByShareClass(filtered) : [], [filtered, viewMode])

  const showEntity = selectedEntity === 'all'

  function toggleCo(id: string) {
    setExpandedCo(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleSc(key: string) {
    setExpandedSc(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  if (investments.length === 0) {
    return (
      <div style={{
        background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8,
        padding: '40px 16px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#aaa' }}>No investments yet</div>
      </div>
    )
  }

  const sel: CSSProperties = {
    fontSize: 11, padding: '5px 8px', borderRadius: 6,
    border: '0.5px solid #d8d7d0', background: '#fff',
    color: '#444', fontFamily: 'inherit', cursor: 'pointer',
  }

  const VIEW_OPTS = [
    { mode: 'company'     as const, icon: '☰', label: 'By company' },
    { mode: 'share_class' as const, icon: '⊟', label: 'By share class' },
    { mode: 'flat'        as const, icon: '≡', label: 'Flat list' },
  ]

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#999' }}>Held by</span>
          <select value={selectedEntity} onChange={e => onEntityChange(e.target.value)} style={sel}>
            <option value="all">All entities</option>
            {allEntities.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#999' }}>Location</span>
          <select
            value={filters.locationFilter}
            onChange={e => setFilters(f => ({ ...f, locationFilter: e.target.value as InvFilters['locationFilter'] }))}
            style={sel}
          >
            <option value="all">Direct + nominee</option>
            <option value="direct">Direct only</option>
            <option value="nominee">Nominee only</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#999' }}>EIS</span>
          <select
            value={filters.eisFilter}
            onChange={e => setFilters(f => ({ ...f, eisFilter: e.target.value as InvFilters['eisFilter'] }))}
            style={sel}
          >
            <option value="all">All</option>
            <option value="eis">EIS only</option>
            <option value="non_eis">Non-EIS only</option>
          </select>
        </div>

        {/* View toggle */}
        <div style={{
          display: 'inline-flex', border: '0.5px solid #d8d7d0',
          borderRadius: 6, overflow: 'hidden', background: '#fff', marginLeft: 'auto',
        }}>
          {VIEW_OPTS.map(({ mode, icon, label }, idx) => {
            const active = viewMode === mode
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  fontSize: 11, padding: '5px 10px', border: 'none', cursor: 'pointer',
                  borderRight: idx < 2 ? '0.5px solid #d8d7d0' : 'none',
                  background: active ? '#0f2744' : '#fff',
                  color: active ? '#fff' : '#555',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <span style={{ opacity: active ? 1 : 0.6 }}>{icon}</span>
                {label}
              </button>
            )
          })}
        </div>

        <div style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
          {filtered.length} {filtered.length === 1 ? 'holding' : 'holdings'} · {totals.companyCount} {totals.companyCount === 1 ? 'company' : 'companies'}
        </div>
      </div>

      {viewMode === 'company' && (
        <ByCompanyView
          groups={coGroups}
          totals={totals}
          showEntity={showEntity}
          expanded={expandedCo}
          onToggle={toggleCo}
        />
      )}
      {viewMode === 'share_class' && (
        <ByShareClassView
          groups={scGroups}
          totals={totals}
          showEntity={showEntity}
          expandedKeys={expandedSc}
          onToggle={toggleSc}
        />
      )}
      {viewMode === 'flat' && (
        <FlatListView
          investments={filtered}
          totals={totals}
          showEntity={showEntity}
        />
      )}
    </div>
  )
}
