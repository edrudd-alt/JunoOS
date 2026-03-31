'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils'

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

interface Doc {
  id: string
  type: string
  filename: string
  storage_url: string | null
  period: string | null
  document_date: string | null
  company_id: string | null
  companies: { name: string } | null
}

interface Props {
  documents: Record<string, unknown>[]
}

export default function InvestmentDocsTab({ documents }: Props) {
  const docs = documents as unknown as Doc[]

  // Group by company, then by year
  const byCompany: Record<string, { name: string; byYear: Record<string, Doc[]> }> = {}

  for (const doc of docs) {
    const companyId = doc.company_id ?? '__general'
    const companyName = doc.companies?.name ?? 'General'
    const year = doc.document_date ? new Date(doc.document_date).getFullYear().toString() : 'Unknown'

    if (!byCompany[companyId]) byCompany[companyId] = { name: companyName, byYear: {} }
    if (!byCompany[companyId].byYear[year]) byCompany[companyId].byYear[year] = []
    byCompany[companyId].byYear[year].push(doc)
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
                            {formatDate(doc.document_date)}
                          </span>
                          {doc.storage_url && (
                            <a
                              href={doc.storage_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 12, color: '#185fa5', textDecoration: 'none' }}
                            >
                              View
                            </a>
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
  )
}
