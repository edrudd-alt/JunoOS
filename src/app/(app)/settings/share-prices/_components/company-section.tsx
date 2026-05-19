'use client'

import { useState } from 'react'
import type { CompanyWithClasses } from '../_lib/queries'
import type { RowDisplay } from '../_lib/aggregations'
import type { UpdateModalData } from './update-price-modal'
import ShareClassRow from './share-class-row'
import ShareClassModal from '@/app/(app)/portfolio/[id]/ShareClassModal'

interface Props {
  company:         CompanyWithClasses
  rows:            RowDisplay[]
  highlighted:     boolean
  onUpdate:        (data: UpdateModalData) => void
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function CompanySection({ company, rows, highlighted, onUpdate }: Props) {
  const [addingClass, setAddingClass] = useState(false)
  const hasClns = rows.some(r => r.instrumentType === 'cln' || r.instrumentType === 'loan_note')

  return (
    <div
      id={`company-section-${company.id}`}
      className="card"
      style={{
        padding: 0, overflow: 'hidden',
        outline: highlighted ? '2px solid #185fa5' : 'none',
        transition: 'outline 0.4s',
      }}
    >
      {/* Company header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: '0.5px solid #f0f0ea',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {company.logo_url ? (
            <img src={company.logo_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: '#e8f0fb', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#185fa5',
            }}>
              {getInitials(company.name)}
            </div>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0f2744' }}>{company.name}</span>
        </div>

        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => setAddingClass(true)}
        >
          + Add share class
        </button>
      </div>

      {/* Share class table */}
      {rows.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafaf8' }}>
              <th style={thSt}>Share class</th>
              <th style={thSt}>Price</th>
              <th style={thSt}>Date</th>
              <th style={thSt}>Methodology</th>
              <th style={{ ...thSt, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <ShareClassRow
                key={row.classId}
                companyId={company.id}
                companyName={company.name}
                row={row}
                onUpdate={onUpdate}
              />
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: 12, color: '#888', padding: '12px 16px', margin: 0 }}>
          No share classes yet
        </p>
      )}

      {/* CLN footnote */}
      {hasClns && (
        <div style={{
          borderTop: '0.5px solid #f0f0ea',
          padding: '8px 16px',
          fontSize: 11, color: '#666',
          background: '#fafaf8',
        }}>
          * CLN and loan note prices default to £1.00 (principal) unless a write-down or write-up has been recorded.
        </div>
      )}

      {/* Add share class modal */}
      {addingClass && (
        <ShareClassModal
          companyId={company.id}
          onClose={() => setAddingClass(false)}
        />
      )}
    </div>
  )
}

const thSt: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 11, fontWeight: 500, color: '#666',
  textAlign: 'left',
  borderBottom: '0.5px solid #f0f0ea',
}
