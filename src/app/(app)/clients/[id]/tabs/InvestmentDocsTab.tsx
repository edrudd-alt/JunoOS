'use client'

import { useState } from 'react'
import { formatDocumentTimestamp } from '@/lib/utils'
import { getDownloadUrlForDocument } from '../documentActions'
import EmailComposerModal, { type ComposerStatement } from '../_components/EmailComposerModal'

const DOC_LABELS: Record<string, string> = {
  application_form: 'Application form',
  eis_certificate: 'EIS certificate',
  transaction_statement: 'Transaction statement',
  exit_statement: 'Exit statement',
  side_letter: 'Side letter',
  portfolio_statement: 'Portfolio statement',
  company_update: 'Company update',
  invoice: 'Invoice',
  investment_agreement: 'Investment agreement',
  other: 'Other',
}

// Document types that have an Email action in this UI.
// Other types may have their own email workflows when added.
const SUPPORTS_EMAIL: Record<string, boolean> = {
  portfolio_statement: true,
}

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
}

// Group label for documents with no company_id, keyed by documents.type.
// New non-company document types should get a row here; unknown types fall back to 'General'.
const NON_COMPANY_GROUP_BY_TYPE: Record<string, string> = {
  portfolio_statement: 'Valuations',
}

export default function InvestmentDocsTab({ documents, clientFullName = '', clientEmail = null }: Props) {
  const docs = documents as unknown as Doc[]

  const [composerStatement, setComposerStatement] = useState<ComposerStatement | null>(null)

  // Group by company (for company-linked docs) or named group (for client-level docs), then by year.
  // Company-linked docs use company_id as the group key; non-company docs use the group label as key.
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

  const actionBtnSt: React.CSSProperties = {
    fontSize: 12, background: 'none',
    border: 'none', cursor: 'pointer',
    padding: 0, fontFamily: 'inherit',
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

                      {isYearExpanded && yearDocs.map(doc => (
                        <div
                          key={doc.id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 16px 8px 48px',
                            borderTop: '0.5px solid #f5f5f2',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="pill pill-grey" style={{ fontSize: 10 }}>
                              {DOC_LABELS[doc.type] ?? doc.type}
                            </span>
                            <span style={{ fontSize: 12 }}>{doc.filename}</span>
                            {doc.period && (
                              <span style={{ fontSize: 11, color: '#888' }}>{doc.period}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 11, color: '#888' }}>
                              {formatDocumentTimestamp(doc.created_at)}
                            </span>
                            {SUPPORTS_EMAIL[doc.type] && (
                              <button
                                onClick={() => setComposerStatement({
                                  documentId: doc.id,
                                  filename:   doc.filename,
                                  periodDate: doc.period ?? doc.document_date ?? '',
                                })}
                                style={{ ...actionBtnSt, color: '#555' }}
                              >
                                Email
                              </button>
                            )}
                            {doc.storage_url && (
                              <button
                                onClick={async () => {
                                  const url = await getDownloadUrlForDocument(doc.id)
                                  if (url) {
                                    window.open(url, '_blank')
                                  } else {
                                    console.error('Could not generate download URL for document', doc.id)
                                  }
                                }}
                                style={{ ...actionBtnSt, color: '#185fa5' }}
                              >
                                View
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>

      {composerStatement && (
        <EmailComposerModal
          open={true}
          statement={composerStatement}
          client={{ fullName: clientFullName, email: clientEmail }}
          onClose={() => setComposerStatement(null)}
        />
      )}
    </>
  )
}
