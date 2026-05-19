'use client'

import { useState, useMemo } from 'react'
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

function TypePill({ type }: { type: string }) {
  return (
    <span className={`pill ${type === 'preference' ? 'pill-blue' : 'pill-grey'}`} style={{ fontSize: 10 }}>
      {type === 'preference' ? 'Preference' : 'Ordinary'}
    </span>
  )
}

// ─── Share class card ─────────────────────────────────────────────────────────

function ShareClassCard({ sc, onEdit }: { sc: ShareClass; onEdit: (sc: ShareClass) => void }) {
  const cardSt: React.CSSProperties = {
    background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8,
    padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
  }
  const labelSt: React.CSSProperties = {
    fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: '#aaa',
  }

  return (
    <div style={cardSt}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {sc.type === 'preference' && <RankBadge rank={sc.current_rank} />}
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sc.name}
          </span>
          <TypePill type={sc.type} />
        </div>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 10, padding: '3px 10px', flexShrink: 0 }}
          onClick={() => onEdit(sc)}
        >
          Edit
        </button>
      </div>

      {sc.type === 'preference' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 2 }}>
          {sc.preference_multiple !== null && (
            <div>
              <div style={labelSt}>Multiple</div>
              <div style={{ fontSize: 12, color: '#0f2744' }}>{sc.preference_multiple}×</div>
            </div>
          )}
          <div>
            <div style={labelSt}>Participating</div>
            <div style={{ fontSize: 12, color: '#0f2744' }}>{sc.participating ? 'Yes' : 'No'}</div>
          </div>
          {sc.dividend_rate !== null && (
            <div>
              <div style={labelSt}>Dividend rate</div>
              <div style={{ fontSize: 12, color: '#0f2744' }}>{(sc.dividend_rate * 100).toFixed(1)}% p.a.</div>
            </div>
          )}
          {sc.dividend_rate !== null && sc.dividend_cumulative !== null && (
            <div>
              <div style={labelSt}>Cumulative</div>
              <div style={{ fontSize: 12, color: '#0f2744' }}>{sc.dividend_cumulative ? 'Yes' : 'No'}</div>
            </div>
          )}
          {sc.dividend_rate !== null && sc.dividend_payment !== null && (
            <div>
              <div style={labelSt}>Dividend payment</div>
              <div style={{ fontSize: 12, color: '#0f2744' }}>{sc.dividend_payment === 'paid' ? 'Paid' : 'Rolled up'}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CompanyShareClassesTab({ companyId, shareClasses: rawClasses, rankingHistory: rawHistory }: Props) {
  const [editingClass,          setEditingClass]          = useState<ShareClass | null>(null)
  const [showAddModal,          setShowAddModal]          = useState(false)
  const [showCapitalEventModal, setShowCapitalEventModal] = useState(false)

  const classes  = rawClasses  as unknown as ShareClass[]
  const history  = rawHistory  as unknown as RankingRow[]

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
          <button
            className="btn btn-secondary"
            style={{ fontSize: 11 }}
            onClick={() => setShowAddModal(true)}
          >
            + Add share class
          </button>
        </div>

        {classes.length === 0 ? (
          <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', padding: '8px 0' }}>
            No share classes recorded. Add the first class to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {preferenceClasses.map(sc => (
              <ShareClassCard key={sc.id} sc={sc} onEdit={setEditingClass} />
            ))}
            {preferenceClasses.length > 0 && ordinaryClasses.length > 0 && (
              <div style={{ borderTop: '0.5px solid #e8e7e0', margin: '4px 0' }} />
            )}
            {ordinaryClasses.map(sc => (
              <ShareClassCard key={sc.id} sc={sc} onEdit={setEditingClass} />
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
