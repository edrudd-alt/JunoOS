'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import ShareClassModal   from '../ShareClassModal'
import CapitalEventModal from '../CapitalEventModal'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShareClass {
  id: string
  company_id: string
  name: string
  type: 'ordinary' | 'preference'
  instrument_type: 'equity' | 'cln' | 'loan_note'
  dividend_rate: number | null
  dividend_cumulative: boolean | null
  dividend_payment: 'paid' | 'rolled_up' | null
  preference_multiple: number | null
  participating: boolean | null
  current_rank: number | null
  created_at: string
}

export interface RankingRow {
  id: string
  company_id: string
  share_class_id: string
  preference_rank: number | null
  effective_from: string
  reason: string
  created_by: string | null
  created_at: string
}

interface CurrentValuation {
  share_class_id: string
  share_price: number
  valuation_date: string
  methodology: string | null
}

interface Props {
  companyId: string
  shareClasses: Record<string, unknown>[]
  rankingHistory: Record<string, unknown>[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank === null) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 20, height: 20, borderRadius: '50%',
      background: '#0f2744', color: '#fff',
      fontSize: 10, fontWeight: 600, flexShrink: 0,
    }}>
      {rank}
    </span>
  )
}

// Render the instrument badge: amber for CLN/loan note, blue/grey for equity.
function InstrumentBadge({ sc }: { sc: ShareClass }) {
  if (sc.instrument_type === 'cln') {
    return (
      <span style={{
        display: 'inline-block', fontSize: 10, fontWeight: 500,
        color: '#5a4200', background: '#fef3c7', borderRadius: 4, padding: '1px 5px',
      }}>CLN</span>
    )
  }
  if (sc.instrument_type === 'loan_note') {
    return (
      <span style={{
        display: 'inline-block', fontSize: 10, fontWeight: 500,
        color: '#5a4200', background: '#fef3c7', borderRadius: 4, padding: '1px 5px',
      }}>Loan note</span>
    )
  }
  return (
    <span className={`pill ${sc.type === 'preference' ? 'pill-blue' : 'pill-grey'}`} style={{ fontSize: 10 }}>
      {sc.type === 'preference' ? 'Preference' : 'Ordinary'}
    </span>
  )
}

// Secondary line shows preference-share terms (multiple, participating,
// dividend) or a CLN/loan-note caveat. Ordinary equity rows have no
// secondary line. Each segment is omitted if the underlying field is NULL,
// so a partially-configured preference class doesn't render dangling
// punctuation. CLN-specific terms like interest rate, conversion price,
// and maturity date are NOT shown here — those fields don't exist on
// company_share_classes (they're Future Work 14.23, captured in a
// dedicated CLN workflow later).
function buildSecondaryLine(sc: ShareClass): string | null {
  if (sc.instrument_type === 'cln' || sc.instrument_type === 'loan_note') {
    return 'Held at principal · accrued-interest estimate planned'
  }
  if (sc.type !== 'preference') return null

  const segments: string[] = []

  const seg1: string[] = []
  if (sc.preference_multiple !== null) seg1.push(`${sc.preference_multiple}×`)
  if (sc.participating !== null) seg1.push(sc.participating ? 'participating' : 'non-participating')
  if (seg1.length > 0) segments.push(seg1.join(' '))

  if (sc.dividend_rate !== null) {
    const pct = `${parseFloat((sc.dividend_rate * 100).toFixed(2))}%`
    const cumuText = sc.dividend_cumulative !== null
      ? (sc.dividend_cumulative ? 'cumulative' : 'non-cumulative')
      : ''
    segments.push([pct, cumuText, 'dividend'].filter(Boolean).join(' '))
  }

  if (sc.dividend_payment !== null) {
    segments.push(sc.dividend_payment === 'paid' ? 'paid' : 'rolled up')
  }

  return segments.length > 0 ? segments.join(' · ') : null
}

// ─── Share class card ─────────────────────────────────────────────────────────

function ShareClassCard({
  sc, valuation, acquisitionDate, onEdit,
}: {
  sc: ShareClass
  valuation: CurrentValuation | null
  acquisitionDate: string | null
  onEdit: (sc: ShareClass) => void
}) {
  const isCln = sc.instrument_type === 'cln' || sc.instrument_type === 'loan_note'

  // Price display
  let priceDisplay: React.ReactNode
  if (isCln) {
    if (valuation) {
      priceDisplay = (
        <>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>£{valuation.share_price.toFixed(4)}</span>
          {' '}<em style={{ fontSize: 10, color: '#aaa', fontWeight: 400 }}>(overridden)</em>
        </>
      )
    } else {
      priceDisplay = (
        <>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>£1.0000</span>
          {' '}<em style={{ fontSize: 10, color: '#aaa', fontWeight: 400 }}>(principal)</em>
        </>
      )
    }
  } else {
    priceDisplay = valuation
      ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>£{valuation.share_price.toFixed(4)}</span>
      : <span style={{ color: '#bbb', fontStyle: 'italic' }}>Never valued</span>
  }

  // Date display
  let dateDisplay: string
  if (isCln) {
    if (valuation) dateDisplay = `Updated ${formatDate(valuation.valuation_date)}`
    else if (acquisitionDate) dateDisplay = `Acquired ${formatDate(acquisitionDate)}`
    else dateDisplay = '—'
  } else {
    dateDisplay = valuation ? `Updated ${formatDate(valuation.valuation_date)}` : '—'
  }

  const secondaryLine = buildSecondaryLine(sc)

  return (
    <div style={{
      background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8,
      padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      {/* Rank badge (preference only) */}
      {sc.type === 'preference' && (
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          <RankBadge rank={sc.current_rank} />
        </div>
      )}

      {/* Name + badge + secondary line */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>{sc.name}</span>
          <InstrumentBadge sc={sc} />
        </div>
        {secondaryLine && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 3, lineHeight: 1.4 }}>
            {secondaryLine}
          </div>
        )}
      </div>

      {/* Price */}
      <div style={{ fontSize: 12, whiteSpace: 'nowrap', minWidth: 110, textAlign: 'right', paddingTop: 2 }}>
        {priceDisplay}
      </div>

      {/* Date */}
      <div style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap', minWidth: 150, paddingTop: 2 }}>
        {dateDisplay}
      </div>

      {/* Edit */}
      <button
        className="btn btn-secondary"
        style={{ fontSize: 10, padding: '3px 10px', flexShrink: 0 }}
        onClick={() => onEdit(sc)}
      >
        Edit
      </button>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CompanyShareClassesTab({ companyId, shareClasses: rawClasses, rankingHistory: rawHistory }: Props) {
  const [editingClass,          setEditingClass]          = useState<ShareClass | null>(null)
  const [showAddModal,          setShowAddModal]          = useState(false)
  const [showCapitalEventModal, setShowCapitalEventModal] = useState(false)
  const [priceMap,              setPriceMap]              = useState(new Map<string, CurrentValuation>())
  const [acquisitionMap,        setAcquisitionMap]        = useState(new Map<string, string>())

  const classes = rawClasses  as unknown as ShareClass[]
  const history = rawHistory  as unknown as RankingRow[]

  // We fetch valuations and earliest investment dates separately rather than
  // using an embedded join. PostgREST embedded joins silently fail under
  // certain conditions — the platform's standing rule (see CLAUDE.md) is to
  // always fetch related tables separately and merge in JavaScript.
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase
        .from('company_current_valuations')
        .select('share_class_id, share_price, valuation_date, methodology')
        .eq('company_id', companyId),
      supabase
        .from('investments')
        .select('share_class_id, investment_date')
        .eq('company_id', companyId)
        .not('share_class_id', 'is', null)
        .order('investment_date', { ascending: true }),
    ]).then(([{ data: valuations }, { data: investments }]) => {
      const pm = new Map<string, CurrentValuation>()
      for (const v of valuations ?? []) {
        if (v.share_class_id) pm.set(v.share_class_id, v as CurrentValuation)
      }
      setPriceMap(pm)

      const am = new Map<string, string>()
      for (const inv of investments ?? []) {
        if (inv.share_class_id && !am.has(inv.share_class_id)) {
          am.set(inv.share_class_id, inv.investment_date)
        }
      }
      setAcquisitionMap(am)
    })
  }, [companyId])

  // Map id → name for resolving names in ranking history
  const classNameMap = useMemo(() =>
    new Map(classes.map(sc => [sc.id, sc.name])),
    [classes]
  )

  // Preference classes sorted by current_rank asc (null last), then ordinary
  const preferenceClasses = useMemo(() =>
    classes
      .filter(sc => sc.type === 'preference')
      .sort((a, b) => {
        if (a.current_rank === null && b.current_rank === null) return 0
        if (a.current_rank === null) return 1
        if (b.current_rank === null) return -1
        return a.current_rank - b.current_rank
      }),
    [classes]
  )

  const ordinaryClasses = useMemo(() =>
    classes.filter(sc => sc.type === 'ordinary').sort((a, b) => a.name.localeCompare(b.name)),
    [classes]
  )

  const sectionHeadSt: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: '#0f2744', marginBottom: 10,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Section 1: Current share classes ─────────────────────────── */}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={sectionHeadSt}>Current share classes</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link
              href={`/settings/share-prices?company=${companyId}`}
              style={{ fontSize: 11, color: '#185fa5', textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              Update share prices →
            </Link>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11 }}
              onClick={() => setShowAddModal(true)}
            >
              + Add share class
            </button>
          </div>
        </div>

        {classes.length === 0 ? (
          <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', padding: '8px 0' }}>
            No share classes recorded. Add the first class to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {preferenceClasses.map(sc => (
              <ShareClassCard
                key={sc.id}
                sc={sc}
                valuation={priceMap.get(sc.id) ?? null}
                acquisitionDate={acquisitionMap.get(sc.id) ?? null}
                onEdit={setEditingClass}
              />
            ))}
            {preferenceClasses.length > 0 && ordinaryClasses.length > 0 && (
              <div style={{ borderTop: '0.5px solid #e8e7e0', margin: '4px 0' }} />
            )}
            {ordinaryClasses.map(sc => (
              <ShareClassCard
                key={sc.id}
                sc={sc}
                valuation={priceMap.get(sc.id) ?? null}
                acquisitionDate={acquisitionMap.get(sc.id) ?? null}
                onEdit={setEditingClass}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Ranking history ────────────────────────────────── */}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={sectionHeadSt}>Ranking history</span>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 11 }}
            onClick={() => setShowCapitalEventModal(true)}
          >
            + Record capital event
          </button>
        </div>

        {history.length === 0 ? (
          <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', padding: '8px 0' }}>
            No ranking history recorded.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #e8e7e0' }}>
                  {['Date', 'Share class', 'Rank', 'Reason'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '0 10px 8px 0', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(row => (
                  <tr key={row.id} style={{ borderBottom: '0.5px solid #f5f5f2' }}>
                    <td style={{ padding: '8px 10px 8px 0', color: '#888', whiteSpace: 'nowrap' }}>
                      {formatDate(row.effective_from)}
                    </td>
                    <td style={{ padding: '8px 10px 8px 0', color: '#0f2744', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {classNameMap.get(row.share_class_id) ?? '—'}
                    </td>
                    <td style={{ padding: '8px 10px 8px 0', whiteSpace: 'nowrap' }}>
                      {row.preference_rank !== null
                        ? <RankBadge rank={row.preference_rank} />
                        : <span style={{ fontSize: 11, color: '#aaa' }}>Ordinary</span>
                      }
                    </td>
                    <td style={{ padding: '8px 0', color: '#444', lineHeight: 1.4 }}>
                      {row.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {showAddModal && (
        <ShareClassModal
          companyId={companyId}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {editingClass && (
        <ShareClassModal
          companyId={companyId}
          shareClass={editingClass}
          onClose={() => setEditingClass(null)}
        />
      )}
      {showCapitalEventModal && (
        <CapitalEventModal
          companyId={companyId}
          shareClasses={classes}
          onClose={() => setShowCapitalEventModal(false)}
        />
      )}
    </div>
  )
}
