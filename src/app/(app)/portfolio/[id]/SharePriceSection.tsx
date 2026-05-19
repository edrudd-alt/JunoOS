'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShareClassRow {
  id:             string
  name:           string
  instrument_type: 'equity' | 'cln' | 'loan_note'
}

interface CurrentValuation {
  share_class_id: string | null
  share_price:    number
  valuation_date: string
  methodology:    string | null
}

interface Props {
  companyId: string
  onUpdate:  () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `£${n.toFixed(4)}` }
function isCln(sc: ShareClassRow) { return sc.instrument_type === 'cln' || sc.instrument_type === 'loan_note' }

// ─── Component ────────────────────────────────────────────────────────────────

export default function SharePriceSection({ companyId, onUpdate }: Props) {
  const [shareClasses,   setShareClasses]   = useState<ShareClassRow[]>([])
  const [priceMap,       setPriceMap]       = useState(new Map<string, CurrentValuation>())
  const [acquisitionMap, setAcquisitionMap] = useState(new Map<string, string>())
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    const supabase = createClient()
    setLoading(true)

    Promise.all([
      // 1. Share classes for this company
      supabase
        .from('company_share_classes')
        .select('id, name, instrument_type')
        .eq('company_id', companyId)
        .order('created_at'),

      // 2. Latest valuation per class (from view)
      supabase
        .from('company_current_valuations')
        .select('share_class_id, share_price, valuation_date, methodology')
        .eq('company_id', companyId),

      // 3. Earliest acquisition date per class (for CLN rows)
      supabase
        .from('investments')
        .select('share_class_id, investment_date')
        .eq('company_id', companyId)
        .not('share_class_id', 'is', null)
        .order('investment_date', { ascending: true }),
    ]).then(([{ data: classes }, { data: valuations }, { data: investments }]) => {
      setShareClasses((classes ?? []) as ShareClassRow[])

      const pm = new Map<string, CurrentValuation>()
      for (const v of valuations ?? []) pm.set(v.share_class_id ?? '__null__', v)
      setPriceMap(pm)

      const am = new Map<string, string>()
      for (const inv of investments ?? []) {
        if (inv.share_class_id && !am.has(inv.share_class_id)) {
          am.set(inv.share_class_id, inv.investment_date)
        }
      }
      setAcquisitionMap(am)
      setLoading(false)
    })
  }, [companyId])

  const hasCln = shareClasses.some(isCln)

  if (loading) {
    return <div className="card" style={{ marginBottom: 16, padding: 20, fontSize: 12, color: '#aaa' }}>Loading…</div>
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 12, paddingBottom: 8, borderBottom: '0.5px solid #e8e7e0' }}>
        Share prices
      </div>

      {shareClasses.length === 0 ? (
        <div style={{ fontSize: 12, color: '#aaa' }}>No share classes defined</div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thSt}>Share class</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Price</th>
                <th style={thSt}>Date</th>
                <th style={thSt}>Methodology</th>
                <th style={thSt} />
              </tr>
            </thead>
            <tbody>
              {shareClasses.map(sc => {
                const cln = isCln(sc)
                const val = priceMap.get(sc.id) ?? null
                const acq = acquisitionMap.get(sc.id) ?? null

                // Price cell
                const priceCell = cln ? (
                  val ? (
                    <>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{fmt(val.share_price)}</span>
                      {' '}<em style={{ fontSize: 10, color: '#aaa', fontWeight: 400 }}>(overridden)</em>
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>£1.0000</span>
                      {' '}<em style={{ fontSize: 10, color: '#aaa', fontWeight: 400 }}>(principal)</em>
                    </>
                  )
                ) : val ? (
                  <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{fmt(val.share_price)}</span>
                ) : (
                  <span style={{ color: '#aaa', fontStyle: 'italic' }}>Never valued</span>
                )

                // Date cell
                const dateCell = cln ? (
                  acq
                    ? <span>Acquired {formatDate(acq)}</span>
                    : <span style={{ color: '#ccc' }}>—</span>
                ) : val ? (
                  <span>{formatDate(val.valuation_date)}</span>
                ) : (
                  <span style={{ color: '#ccc' }}>—</span>
                )

                return (
                  <tr key={sc.id}>
                    <td style={tdSt}>{sc.name}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{priceCell}</td>
                    <td style={{ ...tdSt, color: '#888' }}>{dateCell}</td>
                    <td style={{ ...tdSt, color: '#888' }}>
                      {!cln && (val?.methodology ?? <span style={{ color: '#ccc' }}>—</span>)}
                      {cln && <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      <button onClick={onUpdate} className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }}>
                        Update
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {hasCln && (
            <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic', marginTop: 10, paddingTop: 8, borderTop: '0.5px solid #f5f5f2' }}>
              CLN holdings default to principal value. Use Update to record a write-down or recovery.
            </div>
          )}
        </>
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
  padding: '7px 12px', fontSize: 12, borderBottom: '0.5px solid #f5f5f2', verticalAlign: 'middle',
}
