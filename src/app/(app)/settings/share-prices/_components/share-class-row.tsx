'use client'

import type { RowDisplay } from '../_lib/aggregations'
import type { UpdateModalData } from './update-price-modal'

interface Props {
  companyId:   string
  companyName: string
  row:         RowDisplay
  onUpdate:    (data: UpdateModalData) => void
}

export default function ShareClassRow({ companyId, companyName, row, onUpdate }: Props) {
  return (
    <tr>
      <td style={cellSt}>
        <span style={{ fontWeight: 500, color: '#0f2744' }}>{row.className}</span>
        {(row.instrumentType === 'cln' || row.instrumentType === 'loan_note') && (
          <span style={{
            display: 'inline-block', marginLeft: 6,
            fontSize: 10, fontWeight: 500, color: '#5a4200',
            background: '#fef3c7', borderRadius: 4, padding: '1px 5px',
          }}>
            {row.instrumentType === 'cln' ? 'CLN' : 'Loan note'}
          </span>
        )}
      </td>

      <td style={{ ...cellSt, fontVariantNumeric: 'tabular-nums' }}>
        {row.priceDisplay}
      </td>

      <td style={{ ...cellSt, color: '#555' }}>
        {row.dateDisplay}
      </td>

      <td style={{ ...cellSt, color: '#777', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.methodology ?? '—'}
      </td>

      <td style={{ ...cellSt, textAlign: 'right' }}>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => onUpdate({
            companyId,
            companyName,
            classId:        row.classId,
            className:      row.className,
            instrumentType: row.instrumentType,
            currentPrice:   row.currentPrice,
            hasValuation:   row.hasValuation,
          })}
        >
          Update
        </button>
      </td>
    </tr>
  )
}

const cellSt: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  borderBottom: '0.5px solid #f0f0ea',
  verticalAlign: 'middle',
}
