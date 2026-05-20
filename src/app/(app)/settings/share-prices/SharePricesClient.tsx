'use client'

import { useState, useEffect, useRef } from 'react'
import type { CompanyWithClasses, LatestValuation } from './_lib/queries'
import { buildRowDisplay } from './_lib/aggregations'
import type { UpdateModalData } from './_components/update-price-modal'
import UpdatePriceModal from './_components/update-price-modal'
import CompanySection from './_components/company-section'

interface Props {
  companies:           CompanyWithClasses[]
  latestValuations:    Record<string, LatestValuation>
  earliestInvestments: Record<string, string>
  highlightCompanyId?: string
}

export default function SharePricesClient({
  companies,
  latestValuations,
  earliestInvestments,
  highlightCompanyId,
}: Props) {
  const [modal,       setModal]       = useState<UpdateModalData | null>(null)
  const [highlightId, setHighlightId] = useState(highlightCompanyId)
  const scrolledRef = useRef(false)

  // Scroll to highlighted company once on mount, then clear the highlight after 2s
  useEffect(() => {
    if (!highlightCompanyId || scrolledRef.current) return
    scrolledRef.current = true

    const el = document.getElementById(`company-section-${highlightCompanyId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })

    const t = setTimeout(() => setHighlightId(undefined), 2000)
    return () => clearTimeout(t)
  }, [highlightCompanyId])

  if (companies.length === 0) {
    return (
      <div style={{ maxWidth: 820, padding: '40px 0', textAlign: 'center', color: '#888', fontSize: 13 }}>
        No companies found. Add companies from the portfolio page first.
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>Share prices</h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          Current valuations for all portfolio companies and share classes
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {companies.map(company => {
          const rows = company.classes.map(sc =>
            buildRowDisplay(
              sc,
              latestValuations[sc.id] ?? null,
              earliestInvestments[sc.id] ?? null,
            )
          )

          return (
            <CompanySection
              key={company.id}
              company={company}
              rows={rows}
              highlighted={highlightId === company.id}
              onUpdate={data => setModal(data)}
            />
          )
        })}
      </div>

      {modal && (
        <UpdatePriceModal
          data={modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
