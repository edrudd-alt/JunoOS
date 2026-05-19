'use client'

import { useState, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { InvestmentDocRecord, CompanyRecord } from '../ClientRecord'
import { formatDate } from '@/lib/utils'

interface Props {
  documents: InvestmentDocRecord[]
  companies: CompanyRecord[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  application_form:      'Application Form',
  eis_certificate:       'EIS Certificate',
  transaction_statement: 'TX Statement',
  exit_statement:        'Exit Statement',
  side_letter:           'Side Letter',
  invoice:               'Invoice',
}

const DOC_TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  application_form:      { bg: '#e8f0fe', color: '#1a56db' },
  eis_certificate:       { bg: '#e1f5ee', color: '#085041' },
  transaction_statement: { bg: '#eef2f7', color: '#4a6fa5' },
  exit_statement:        { bg: '#fce7f3', color: '#9d174d' },
  side_letter:           { bg: '#fef9e8', color: '#8a6a2a' },
  invoice:               { bg: '#f3f4f6', color: '#374151' },
}

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

// ── StubModal ─────────────────────────────────────────────────────────────────

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

// ── Main component ─────────────────────────────────────────────────────────────

export default function InvestmentDocsTab({ documents, companies }: Props) {
  const [coFilter,   setCoFilter]   = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [expandedCos,   setExpandedCos]   = useState<Set<string>>(new Set())
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
  const [stubMessage, setStubMessage] = useState<string | null>(null)

  const companyMap = useMemo(() => {
    const m = new Map<string, CompanyRecord>()
    companies.forEach(c => m.set(c.id, c))
    return m
  }, [companies])

  const { coOptions, typeOptions, yearOptions } = useMemo(() => {
    const cos   = new Map<string, string>()
    const types = new Set<string>()
    const years = new Set<string>()
    documents.forEach(d => {
      if (d.company_id) cos.set(d.company_id, companyMap.get(d.company_id)?.name ?? 'Unknown')
      types.add(d.type)
      if (d.document_date) years.add(d.document_date.substring(0, 4))
    })
    return {
      coOptions:   [...cos.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      typeOptions: [...types].sort(),
      yearOptions: [...years].sort().reverse(),
    }
  }, [documents, companyMap])

  const filtered = useMemo(() => documents.filter(d => {
    if (coFilter   !== 'all' && d.company_id !== coFilter)                     return false
    if (typeFilter !== 'all' && d.type !== typeFilter)                          return false
    if (yearFilter !== 'all' && d.document_date?.substring(0, 4) !== yearFilter) return false
    return true
  }), [documents, coFilter, typeFilter, yearFilter])

  const grouped = useMemo(() => {
    const coGroups = new Map<string, Map<string, InvestmentDocRecord[]>>()
    filtered.forEach(d => {
      const coId = d.company_id ?? '__none__'
      const year = d.document_date?.substring(0, 4) ?? 'Unknown'
      if (!coGroups.has(coId)) coGroups.set(coId, new Map())
      const yearMap = coGroups.get(coId)!
      if (!yearMap.has(year)) yearMap.set(year, [])
      yearMap.get(year)!.push(d)
    })
    return [...coGroups.entries()]
      .sort((a, b) => {
        const na = companyMap.get(a[0])?.name ?? 'Unknown'
        const nb = companyMap.get(b[0])?.name ?? 'Unknown'
        return na.localeCompare(nb)
      })
      .map(([coId, yearMap]) => {
        const years = [...yearMap.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([year, docs]) => ({ year, docs }))
        return {
          coId,
          name:  companyMap.get(coId)?.name    ?? 'Unknown Company',
          logo:  companyMap.get(coId)?.logo_url ?? null,
          years,
          total: years.reduce((s, { docs }) => s + docs.length, 0),
        }
      })
  }, [filtered, companyMap])

  if (documents.length === 0) {
    return (
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '40px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0f2744', marginBottom: 6 }}>No investment documents</div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          Application forms, EIS certificates, and transaction statements will appear here.
        </p>
      </div>
    )
  }

  return (
    <>
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '0.5px solid #e8e7e0', flexWrap: 'wrap' }}>
          <select value={coFilter} onChange={e => setCoFilter(e.target.value)} style={selectStyle}>
            <option value="all">All companies</option>
            {coOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value="all">All types</option>
            {typeOptions.map(t => (
              <option key={t} value={t}>{DOC_TYPE_LABELS[t] ?? t}</option>
            ))}
          </select>
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={selectStyle}>
            <option value="all">All years</option>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Tree */}
        {grouped.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#888', fontSize: 12 }}>
            No documents match the current filters.
          </div>
        ) : grouped.map(({ coId, name, logo, years, total }) => {
          const expanded = expandedCos.has(coId)
          const [coBg, coFg] = coColor(coId)
          return (
            <div key={coId} style={{ borderBottom: '0.5px solid #f2f2ef' }}>
              {/* Company row */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedCos(prev => {
                  const next = new Set(prev)
                  expanded ? next.delete(coId) : next.add(coId)
                  return next
                })}
                onKeyDown={e => e.key === 'Enter' && setExpandedCos(prev => {
                  const next = new Set(prev)
                  expanded ? next.delete(coId) : next.add(coId)
                  return next
                })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', cursor: 'pointer',
                  background: expanded ? '#fafaf8' : '#fff',
                  userSelect: 'none',
                }}
              >
                {logo ? (
                  <img src={logo} alt="" style={{ width: 26, height: 26, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 26, height: 26, borderRadius: 5, background: coBg, color: coFg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', flex: 1 }}>{name}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{total} {total === 1 ? 'doc' : 'docs'}</span>
                <span style={{ fontSize: 10, color: '#bbb', marginLeft: 4, display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
              </div>

              {/* Year groups */}
              {expanded && years.map(({ year, docs }) => {
                const yearKey     = `${coId}:${year}`
                const yearExpanded = expandedYears.has(yearKey)
                return (
                  <div key={yearKey}>
                    {/* Year row */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedYears(prev => {
                        const next = new Set(prev)
                        yearExpanded ? next.delete(yearKey) : next.add(yearKey)
                        return next
                      })}
                      onKeyDown={e => e.key === 'Enter' && setExpandedYears(prev => {
                        const next = new Set(prev)
                        yearExpanded ? next.delete(yearKey) : next.add(yearKey)
                        return next
                      })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 14px 7px 50px', cursor: 'pointer',
                        background: yearExpanded ? '#f7f7f5' : '#fafaf8',
                        borderTop: '0.5px solid #f2f2ef',
                        userSelect: 'none',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#444', flex: 1 }}>{year}</span>
                      <span style={{ fontSize: 11, color: '#aaa' }}>{docs.length} {docs.length === 1 ? 'doc' : 'docs'}</span>
                      <span style={{ fontSize: 10, color: '#ccc', marginLeft: 4, display: 'inline-block', transform: yearExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                    </div>

                    {/* Document rows */}
                    {yearExpanded && docs.map(doc => {
                      const ts  = DOC_TYPE_STYLES[doc.type] ?? { bg: '#f3f4f6', color: '#374151' }
                      const tl  = DOC_TYPE_LABELS[doc.type] ?? doc.type
                      return (
                        <div
                          key={doc.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 14px 7px 70px',
                            borderTop: '0.5px solid #f5f5f3',
                            background: '#fff',
                          }}
                        >
                          <svg width="13" height="15" viewBox="0 0 13 15" fill="none" style={{ flexShrink: 0 }}>
                            <rect x="0.5" y="0.5" width="12" height="14" rx="1.5" fill="#f3f4f6" stroke="#d1d5db"/>
                            <path d="M3 5h7M3 7.5h7M3 10h4.5" stroke="#9ca3af" strokeWidth="0.75" strokeLinecap="round"/>
                          </svg>
                          <span style={{ fontSize: 12, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.filename}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: ts.bg, color: ts.color, flexShrink: 0 }}>
                            {tl}
                          </span>
                          {doc.document_date && (
                            <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>{formatDate(doc.document_date)}</span>
                          )}
                          <button
                            onClick={() => setStubMessage('Document download comes in a later stage.')}
                            style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                          >
                            Download
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {stubMessage !== null && (
        <StubModal message={stubMessage} onClose={() => setStubMessage(null)} />
      )}
    </>
  )
}

const selectStyle: CSSProperties = {
  fontSize: 12, padding: '4px 8px',
  border: '0.5px solid #e0e0dc', borderRadius: 6,
  background: '#fff', color: '#333', cursor: 'pointer',
}
