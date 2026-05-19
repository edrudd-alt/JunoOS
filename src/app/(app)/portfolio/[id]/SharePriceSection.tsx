'use client'

import { formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShareClassRow {
  id: string
  name: string
}

interface ShareClassValuation {
  share_class_id: string | null
  share_price: number
  valuation_date: string
  methodology: string | null
}

interface Props {
  companyId:    string
  shareClasses: ShareClassRow[]
  valuations:   ShareClassValuation[]
  onUpdate:     () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `£${n.toFixed(4)}` }

// ─── Component ────────────────────────────────────────────────────────────────

export default function SharePriceSection({ shareClasses, valuations, onUpdate }: Props) {
  // Valuations are expected sorted descending by date; first hit per class is latest.
  const priceMap = new Map<string, ShareClassValuation>()
  for (const v of valuations) {
    const key = v.share_class_id ?? '__null__'
    if (!priceMap.has(key)) priceMap.set(key, v)
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, paddingBottom: 8, borderBottom: '0.5px solid #e8e7e0',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744' }}>Share prices</div>
        <button onClick={onUpdate} className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}>
          Update price
        </button>
      </div>

      {shareClasses.length === 0 ? (
        <div style={{ fontSize: 12, color: '#aaa' }}>No share classes defined</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={thSt}>Share class</th>
              <th style={{ ...thSt, textAlign: 'right' }}>Current price</th>
              <th style={thSt}>Last updated</th>
              <th style={thSt}>Methodology</th>
            </tr>
          </thead>
          <tbody>
            {shareClasses.map(sc => {
              const v = priceMap.get(sc.id) ?? null
              return (
                <tr key={sc.id}>
                  <td style={tdSt}>{sc.name}</td>
                  <td style={{ ...tdSt, textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                    {v ? fmt(v.share_price) : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td style={{ ...tdSt, color: '#888' }}>
                    {v ? formatDate(v.valuation_date) : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td style={{ ...tdSt, color: '#888' }}>
                    {v?.methodology ?? <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  padding: '6px 12px', fontSize: 10, fontWeight: 500, color: '#888',
  textAlign: 'left', borderBottom: '0.5px solid #e8e7e0',
}
const tdSt: React.CSSProperties = {
  padding: '7px 12px', fontSize: 12, borderBottom: '0.5px solid #f5f5f2',
}
