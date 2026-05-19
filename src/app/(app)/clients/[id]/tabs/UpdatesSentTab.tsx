'use client'

import { useState, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { InvestorUpdateRecord, CompanyRecord, TeamMemberRecord } from '../ClientRecord'
import { formatDate } from '@/lib/utils'

interface EntitySummary {
  id: string
  full_name: string
}

interface Props {
  updates: InvestorUpdateRecord[]
  companies: CompanyRecord[]
  teamMembers: TeamMemberRecord[]
  entities: EntitySummary[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UPDATE_TYPE_LABELS: Record<string, string> = {
  portfolio: 'Portfolio Update',
  update:    'Company Update',
  letter:    'Letter',
}

const UPDATE_DOT_COLORS: Record<string, string> = {
  portfolio: '#1d9e75',
  update:    '#ba7517',
  letter:    '#185fa5',
}

const UPDATE_TAG_STYLES: Record<string, { bg: string; color: string }> = {
  portfolio: { bg: '#e1f5ee', color: '#085041' },
  update:    { bg: '#fef3c7', color: '#8a5a14' },
  letter:    { bg: '#e8f0fe', color: '#1a56db' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function recipientLabel(ids: string[], entities: EntitySummary[]): string {
  const names = ids
    .map(id => entities.find(e => e.id === id)?.full_name)
    .filter(Boolean) as string[]
  if (names.length === 0) return ''
  if (names.length === 1) return `Emailed to ${names[0]}`
  if (names.length === 2) return `Emailed to ${names[0]} & ${names[1]}`
  return `Emailed to ${names[0]} & ${names.length - 1} others`
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function UpdatesSentTab({ updates, companies, teamMembers, entities }: Props) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')

  const companyMap    = useMemo(() => new Map(companies.map(c    => [c.id,    c])),    [companies])
  const teamMemberMap = useMemo(() => new Map(teamMembers.map(tm => [tm.id, tm])), [teamMembers])

  const yearOptions = useMemo(() => {
    const years = new Set<string>()
    updates.forEach(u => { if (u.sent_at) years.add(u.sent_at.substring(0, 4)) })
    return [...years].sort().reverse()
  }, [updates])

  const filtered = useMemo(() => updates.filter(u => {
    if (typeFilter !== 'all' && u.update_type !== typeFilter)        return false
    if (yearFilter !== 'all' && u.sent_at?.substring(0, 4) !== yearFilter) return false
    return true
  }), [updates, typeFilter, yearFilter])

  if (updates.length === 0) {
    return (
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '40px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0f2744', marginBottom: 6 }}>No updates sent</div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          Portfolio updates, company updates, and letters sent to this investor will appear here.
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '0.5px solid #e8e7e0', flexWrap: 'wrap' }}>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
          <option value="all">All types</option>
          {Object.entries(UPDATE_TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={selectStyle}>
          <option value="all">All years</option>
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#888', fontSize: 12 }}>
          No updates match the current filters.
        </div>
      ) : (
        <div>
          {filtered.map(update => {
            const dotColor  = UPDATE_DOT_COLORS[update.update_type] ?? '#aaa'
            const tagStyle  = UPDATE_TAG_STYLES[update.update_type] ?? { bg: '#f3f4f6', color: '#374151' }
            const typeLabel = UPDATE_TYPE_LABELS[update.update_type] ?? update.update_type
            const coName    = companyMap.get(update.company_id)?.name ?? 'Unknown company'
            const sentBy    = update.created_by ? (teamMemberMap.get(update.created_by)?.initials ?? null) : null
            const recip     = recipientLabel(update.recipient_client_ids, entities)

            const metaParts: string[] = [coName]
            if (recip) metaParts.push(recip)
            if (update.sent_at) metaParts.push(formatDate(update.sent_at))
            if (sentBy) metaParts.push(`Sent by ${sentBy}`)

            return (
              <div
                key={update.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 14px',
                  borderBottom: '0.5px solid #f2f2ef',
                }}
              >
                {/* Dot */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, marginTop: 4, flexShrink: 0 }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', marginBottom: 3 }}>
                    {update.title ?? typeLabel}
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {metaParts.join(' · ')}
                  </div>
                </div>

                {/* Type tag */}
                <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4, background: tagStyle.bg, color: tagStyle.color, flexShrink: 0, marginTop: 2 }}>
                  {typeLabel}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const selectStyle: CSSProperties = {
  fontSize: 12, padding: '4px 8px',
  border: '0.5px solid #e0e0dc', borderRadius: 6,
  background: '#fff', color: '#333', cursor: 'pointer',
}
