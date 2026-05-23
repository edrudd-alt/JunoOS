'use client'

import { useState } from 'react'
import { formatPeriodDateUK } from '@/lib/templateUtils'
import { getDownloadUrlForDocument } from '../documentActions'
import { DocumentActions } from '@/components/documents/DocumentActions'
import { DOCUMENT_TYPE_LABELS } from '@/lib/documentTypes'
import EmailComposerModal, { type ComposerDocument } from '../_components/EmailComposerModal'

interface Doc {
  id: string
  type: string
  filename: string
  storage_url: string | null
  period: string | null
  document_date: string | null
  created_at: string | null
  company_id: string | null
  companies: { name: string } | null
}

interface Props {
  documents: Record<string, unknown>[]
  clientFullName?: string
  clientEmail?: string | null
  clientId?: string
  outlookConnected?: boolean
  latestSends?: Record<string, string>
}

const NON_COMPANY_GROUP_BY_TYPE: Record<string, string> = {
  portfolio_statement: 'Valuations',
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return formatPeriodDateUK(dateStr)
}

export default function InvestmentDocsTab({ documents, clientFullName = '', clientEmail = null, clientId = '', outlookConnected, latestSends }: Props) {
  const docs = documents as unknown as Doc[]

  const [composerDoc, setComposerDoc] = useState<ComposerDocument | null>(null)

  const byCompany: Record<string, { name: string; byYear: Record<string, Doc[]> }> = {}

  for (const doc of docs) {
    let groupKey:  string
    let groupName: string

    if (doc.company_id) {
      groupKey  = doc.company_id
      groupName = doc.companies?.name ?? 'Unknown company'
    } else {
      groupName = NON_COMPANY_GROUP_BY_TYPE[doc.type] ?? 'General'
      groupKey  = groupName
    }

    const year = doc.document_date ? new Date(doc.document_date).getFullYear().toString() : 'Unknown'

    if (!byCompany[groupKey]) byCompany[groupKey] = { name: groupName, byYear: {} }
    if (!byCompany[groupKey].byYear[year]) byCompany[groupKey].byYear[year] = []
    byCompany[groupKey].byYear[year].push(doc)
  }

  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(
    new Set(Object.keys(byCompany))
  )
  const [expandedYears, setExpandedYears] = useState<Set<string>>(
    new Set(Object.keys(byCompany).flatMap(cid =>
      Object.keys(byCompany[cid].byYear).map(year => `${cid}::${year}`)
    ))
  )

  function toggleCompany(cid: string) {
    setExpandedCompanies(prev => {
      const next = new Set(prev)
      next.has(cid) ? next.delete(cid) : next.add(cid)
      return next
    })
  }

  function toggleYear(key: string) {
    setExpandedYears(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (docs.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>
        No investment documents yet
      </div>
    )
  }

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {Object.entries(byCompany).map(([cid, { name, byYear }]) => {
          const isCompanyExpanded = expandedCompanies.has(cid)
          const totalDocs = Object.values(byYear).reduce((s, arr) => s + arr.length, 0)

          return (
            <div key={cid} style={{ borderBottom: '0.5px solid #e8e7e0' }}>
              {/* Company header */}
              <button
                onClick={() => toggleCompany(cid)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '12px 16px',
                  background: '#f9f9f7', border: 'none', cursor: 'pointer',
                  textAlign: 'left', fontSize: 13, fontWeight: 600,
                }}
              >
                <span className={`expand-arrow ${isCompanyExpanded ? 'open' : ''}`} style={{ color: '#aaa', fontSize: 11 }}>›</span>
                {name}
                <span style={{ fontWeight: 400, color: '#888', fontSize: 11 }}>({totalDocs})</span>
              </button>

              {isCompanyExpanded && Object.entries(byYear)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([year, yearDocs]) => {
                  const yearKey = `${cid}::${year}`
                  const isYearExpanded = expandedYears.has(yearKey)
                  return (
                    <div key={yearKey}>
                      {/* Year header */}
                      <button
                        onClick={() => toggleYear(yearKey)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '9px 16px 9px 32px',
                          background: 'none', border: 'none', cursor: 'pointer',
                          textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#555',
                          borderTop: '0.5px solid #f0f0ec',
                        }}
                      >
                        <span className={`expand-arrow ${isYearExpanded ? 'open' : ''}`} style={{ color: '#aaa', fontSize: 10 }}>›</span>
                        {year}
                        <span style={{ fontWeight: 400, color: '#aaa', fontSize: 11 }}>({yearDocs.length})</span>
                      </button>

                      {isYearExpanded && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '0.5px solid #f0f0ec' }}>
                          <thead>
                            <tr style={{ background: '#fafaf8' }}>
                              <th style={thSt}>Date</th>
                              <th style={thSt}>Type</th>
                              <th style={thSt}>Filename</th>
                              <th style={thSt}>Sent</th>
                              <th style={{ ...thSt, textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {yearDocs.map(doc => {
                              const dateStr = doc.document_date ?? doc.created_at
                              const sentDate = latestSends?.[doc.id]
                              return (
                                <tr key={doc.id} style={{ borderTop: '0.5px solid #f5f5f2' }}>
                                  <td style={{ ...tdSt, whiteSpace: 'nowrap', color: '#555', paddingLeft: 48 }}>
                                    {fmtDate(dateStr)}
                                  </td>
                                  <td style={tdSt}>
                                    <span className="pill pill-grey" style={{ fontSize: 10 }}>
                                      {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
                                    </span>
                                  </td>
                                  <td style={{ ...tdSt, maxWidth: 320 }}>
                                    <span
                                      title={doc.filename}
                                      style={{
                                        display: 'block',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        fontSize: 12,
                                      }}
                                    >
                                      {doc.filename}
                                    </span>
                                  </td>
                                  <td style={{ ...tdSt, whiteSpace: 'nowrap' }}>
                                    {sentDate ? (
                                      <span style={{ fontSize: 11, color: '#1d9e75' }}>
                                        Sent {fmtDate(sentDate)} via Outlook
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: 11, color: '#bbb' }}>—</span>
                                    )}
                                  </td>
                                  <td style={tdSt}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                      <DocumentActions
                                        document={doc}
                                        onEmailClick={() => setComposerDoc({
                                          documentId: doc.id,
                                          type:       doc.type,
                                          filename:   doc.filename,
                                          period:     doc.period ?? doc.document_date,
                                        })}
                                        onViewClick={async () => {
                                          const url = await getDownloadUrlForDocument(doc.id)
                                          if (url) window.open(url, '_blank')
                                        }}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>

      {composerDoc && (
        <EmailComposerModal
          open={true}
          document={composerDoc}
          client={{ fullName: clientFullName, email: clientEmail }}
          clientId={clientId}
          outlookConnected={outlookConnected}
          onClose={() => setComposerDoc(null)}
        />
      )}
    </>
  )
}

const thSt: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 10, fontWeight: 600, color: '#888',
  textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em',
}

const tdSt: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 12, color: '#0f2744',
  verticalAlign: 'middle',
}
