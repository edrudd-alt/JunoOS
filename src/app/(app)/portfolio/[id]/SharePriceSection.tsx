'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Valuation {
  id: string
  share_price: number
  valuation_date: string
  notes: string | null
}

interface InvestmentRound {
  investment_date: string
  original_share_price: number
  share_class: string
}

interface Props {
  companyId: string
  valuations: Valuation[]         // manual valuations, sorted descending
  investments: InvestmentRound[]  // all active investments for this company
  shareClasses: string[]          // unique share class names (for pills)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLASS_COLORS = ['#0f2744', '#1d9e75', '#185fa5', '#7c5cbf', '#e0952a']

const RANGES = [
  { key: '1M',  label: '1M'  },
  { key: '3M',  label: '3M'  },
  { key: '6M',  label: '6M'  },
  { key: '1Y',  label: '1Y'  },
  { key: 'all', label: 'All' },
] as const
type RangeKey = typeof RANGES[number]['key']

const W = 600
const H = 180
const PAD = { l: 56, r: 16, t: 12, b: 32 }
const CHART_W = W - PAD.l - PAD.r
const CHART_H = H - PAD.t - PAD.b

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRangeStart(key: RangeKey): Date | null {
  if (key === 'all') return null
  const d = new Date()
  if (key === '1M') d.setMonth(d.getMonth() - 1)
  if (key === '3M') d.setMonth(d.getMonth() - 3)
  if (key === '6M') d.setMonth(d.getMonth() - 6)
  if (key === '1Y') d.setFullYear(d.getFullYear() - 1)
  return d
}

interface DataPoint { date: Date; price: number }

/**
 * Build a merged, step-interpolated price series for one share class.
 * Investment round prices provide the baseline; manual valuations override/extend.
 * The series is extended flat to today and windowed to the range.
 */
function buildClassSeries(
  shareClass: string,
  rounds: InvestmentRound[],
  valuations: Valuation[],
  start: Date | null,
): DataPoint[] {
  const today = new Date(); today.setHours(23, 59, 59, 0)

  // Round price points for this class (earliest investment date per unique price)
  const roundPts: DataPoint[] = rounds
    .filter(i => i.share_class === shareClass)
    .map(i => ({ date: new Date(i.investment_date + 'T00:00:00'), price: i.original_share_price }))

  // Manual valuation points (company-wide — apply to all classes)
  const manualPts: DataPoint[] = [...valuations]
    .reverse()
    .map(v => ({ date: new Date(v.valuation_date + 'T00:00:00'), price: v.share_price }))

  // Merge by timestamp: manual takes priority over round at the same date
  const byMs = new Map<number, number>()
  for (const p of roundPts) byMs.set(p.date.getTime(), p.price)
  for (const p of manualPts) byMs.set(p.date.getTime(), p.price)

  if (byMs.size === 0) return []

  const all = Array.from(byMs.entries())
    .map(([ms, price]) => ({ date: new Date(ms), price }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  // Apply range window
  let pts: DataPoint[]
  if (start) {
    const before  = all.filter(p => p.date <  start)
    const inRange = all.filter(p => p.date >= start)

    if (inRange.length === 0 && before.length > 0) {
      // All data predates the window — flat line from window start at last known price
      pts = [{ date: start, price: before[before.length - 1].price }]
    } else if (before.length > 0) {
      // Prepend a synthetic point at the window edge so the line starts correctly
      pts = [{ date: start, price: before[before.length - 1].price }, ...inRange]
    } else {
      pts = inRange
    }
  } else {
    pts = all
  }

  if (pts.length === 0) return []

  // Extend flat to today
  const last = pts[pts.length - 1]
  if (last.date.getTime() < today.getTime()) {
    pts = [...pts, { date: today, price: last.price }]
  }

  return pts
}

function dateToX(date: Date, minMs: number, rangeMs: number): number {
  return PAD.l + ((date.getTime() - minMs) / rangeMs) * CHART_W
}

function priceToY(price: number, minP: number, rangeP: number): number {
  if (rangeP === 0) return PAD.t + CHART_H / 2
  return PAD.t + CHART_H - ((price - minP) / rangeP) * CHART_H
}

function stepPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` H ${pts[i].x.toFixed(1)} V ${pts[i].y.toFixed(1)}`
  }
  return d
}

function fmt2(n: number) { return `£${n.toFixed(2)}` }

// ─── Component ────────────────────────────────────────────────────────────────

export default function SharePriceSection({ companyId, valuations, investments, shareClasses }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [priceTab,      setPriceTab]      = useState<'chart' | 'history'>('chart')
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [range,         setRange]         = useState<RangeKey>('all')
  const [tooltip,       setTooltip]       = useState<{ x: number; y: number; date: Date; price: number; label: string } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Update price form
  const [newPrice, setNewPrice] = useState('')
  const [newDate,  setNewDate]  = useState(new Date().toISOString().slice(0, 10))
  const [newNotes, setNewNotes] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saveErr,  setSaveErr]  = useState('')
  const [saved,    setSaved]    = useState(false)

  const classes = useMemo(() => [...new Set(shareClasses)].filter(Boolean), [shareClasses])

  const start = getRangeStart(range)

  // Build one series per share class, then pick which to render
  const allSeries = useMemo(() => {
    return classes.map((cls, i) => ({
      label: cls,
      color: CLASS_COLORS[i % CLASS_COLORS.length],
      pts:   buildClassSeries(cls, investments, valuations, start),
    }))
  }, [classes, investments, valuations, start])

  const lines = useMemo(() => {
    if (selectedClass !== 'all') {
      const found = allSeries.find(s => s.label === selectedClass)
      return found ? [found] : []
    }
    // All classes: show each one (filter out empty series)
    return allSeries.filter(s => s.pts.length > 0)
  }, [selectedClass, allSeries])

  // Effective current price: latest point across all series
  const currentPrice = useMemo(() => {
    // Prefer the most recent manual valuation
    if (valuations.length > 0) return valuations[0].share_price
    // Fallback to the most recent investment round price
    const sorted = [...investments].sort(
      (a, b) => new Date(b.investment_date).getTime() - new Date(a.investment_date).getTime()
    )
    return sorted[0]?.original_share_price ?? null
  }, [valuations, investments])

  // Chart bounds — derived from ALL visible series combined
  const { minMs, rangeMs, minP, rangeP, yTicks, xTicks } = useMemo(() => {
    const allPts = lines.flatMap(l => l.pts)
    if (allPts.length === 0) return { minMs: 0, rangeMs: 1, minP: 0, rangeP: 1, yTicks: [], xTicks: [] }

    const minMs  = Math.min(...allPts.map(p => p.date.getTime()))
    const maxMs  = Math.max(...allPts.map(p => p.date.getTime()))
    const rangeMs = maxMs - minMs || 86_400_000

    const prices = allPts.map(p => p.price)
    const minRaw = Math.min(...prices)
    const maxRaw = Math.max(...prices)
    const pad    = (maxRaw - minRaw) * 0.1 || maxRaw * 0.05 || 0.1
    const paddedMin = Math.max(0, minRaw - pad)
    const paddedMax = maxRaw + pad
    const rangeP = paddedMax - paddedMin

    const yTicks = Array.from({ length: 5 }, (_, i) => paddedMin + (rangeP / 4) * i)

    const xTicks: Date[] = []
    const step = rangeMs / 5
    for (let i = 0; i <= 5; i++) xTicks.push(new Date(minMs + step * i))

    return { minMs, rangeMs, minP: paddedMin, rangeP, yTicks, xTicks }
  }, [lines])

  // Map each line's DataPoints to SVG coordinates
  const svgLines = useMemo(() => lines.map(line => ({
    ...line,
    svgPts: line.pts.map(p => ({
      x: dateToX(p.date, minMs, rangeMs),
      y: priceToY(p.price, minP, rangeP),
      date: p.date,
      price: p.price,
    })),
  })), [lines, minMs, rangeMs, minP, rangeP])

  // Tooltip — find nearest point across all lines
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || svgLines.length === 0) return
    const rect   = svgRef.current.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * W
    if (mouseX < PAD.l || mouseX > W - PAD.r) { setTooltip(null); return }

    let best: typeof tooltip = null
    let bestDist = Infinity
    for (const line of svgLines) {
      for (const pt of line.svgPts) {
        const dist = Math.abs(mouseX - pt.x)
        if (dist < bestDist) {
          bestDist = dist
          best = { x: pt.x, y: pt.y, date: pt.date, price: pt.price, label: line.label }
        }
      }
    }
    setTooltip(best)
  }, [svgLines])

  // Price history: merge rounds + manual valuations, sorted newest first
  const historyRows = useMemo(() => {
    type Row = { dateMs: number; date: string; price: number; type: string; shareClass?: string; notes?: string | null }
    const rows: Row[] = []

    // Deduplicate investment rounds: one entry per unique (date, class, price) combination
    const roundSeen = new Set<string>()
    for (const inv of investments) {
      const key = `${inv.investment_date}|${inv.share_class}|${inv.original_share_price}`
      if (roundSeen.has(key)) continue
      roundSeen.add(key)
      rows.push({
        dateMs:     new Date(inv.investment_date + 'T00:00:00').getTime(),
        date:       inv.investment_date,
        price:      inv.original_share_price,
        type:       'Investment round',
        shareClass: inv.share_class,
      })
    }

    for (const v of valuations) {
      rows.push({
        dateMs: new Date(v.valuation_date + 'T00:00:00').getTime(),
        date:   v.valuation_date,
        price:  v.share_price,
        type:   'Manual update',
        notes:  v.notes,
      })
    }

    rows.sort((a, b) => b.dateMs - a.dateMs)

    // Compute change relative to the previous entry (sorted ascending)
    return rows.map((row, i) => {
      const next = rows[i + 1] // next = older entry (we're desc)
      return { ...row, change: next ? row.price - next.price : null }
    })
  }, [investments, valuations])

  async function handleSavePrice(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseFloat(newPrice)
    if (isNaN(parsed) || parsed <= 0) { setSaveErr('Enter a valid price'); return }
    setSaving(true); setSaveErr(''); setSaved(false)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('valuations').insert({
      company_id:     companyId,
      share_price:    parsed,
      valuation_date: newDate,
      notes:          newNotes.trim() || null,
      updated_by:     user?.id ?? null,
    })
    if (error) { setSaveErr(error.message); setSaving(false); return }
    await supabase.from('internal_updates').insert({
      company_id:  companyId,
      update_type: 'valuation',
      description: `Share price updated to £${parsed.toFixed(4)}`,
      created_by:  user?.id ?? null,
    })
    setSaving(false); setSaved(true); setNewNotes(''); setNewPrice('')
    router.refresh()
  }

  const hasData = svgLines.some(l => l.svgPts.length > 0)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid #e8e7e0' }}>
        {([['chart', 'Share price & history'], ['history', 'Price history']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setPriceTab(key)} style={{
            padding: '10px 16px', fontSize: 12, fontWeight: 500,
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: priceTab === key ? '2px solid #0f2744' : '2px solid transparent',
            color: priceTab === key ? '#0f2744' : '#888',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Chart tab ── */}
      {priceTab === 'chart' && (
        <div style={{ padding: 16 }}>
          {/* Header row: price + class pills + range */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f2744' }}>
                {currentPrice != null ? fmt2(currentPrice) : '—'}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>per share</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <ClassPill label="All classes" active={selectedClass === 'all'} onClick={() => setSelectedClass('all')} />
                {classes.map((cls, i) => (
                  <ClassPill key={cls} label={cls} active={selectedClass === cls}
                    color={CLASS_COLORS[i % CLASS_COLORS.length]}
                    onClick={() => setSelectedClass(cls)} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {RANGES.map(r => (
                <button key={r.key} onClick={() => setRange(r.key)} style={{
                  padding: '3px 9px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: range === r.key ? '#0f2744' : '#f5f5f2',
                  color:      range === r.key ? '#fff'    : '#555',
                  fontWeight: range === r.key ? 600 : 400,
                }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* SVG chart */}
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>

              {/* Y grid + labels */}
              {yTicks.map((tick, i) => {
                const y = priceToY(tick, minP, rangeP)
                return (
                  <g key={i}>
                    <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#f0f0ec" strokeWidth="1" />
                    <text x={PAD.l - 4} y={y + 4} textAnchor="end"
                      style={{ fontSize: 9, fill: '#aaa', fontFamily: 'inherit' }}>
                      {fmt2(tick)}
                    </text>
                  </g>
                )
              })}

              {/* X labels */}
              {xTicks.map((d, i) => {
                const x = dateToX(d, minMs, rangeMs)
                if (x < PAD.l || x > W - PAD.r) return null
                return (
                  <text key={i} x={x} y={H - PAD.b + 14} textAnchor="middle"
                    style={{ fontSize: 9, fill: '#aaa', fontFamily: 'inherit' }}>
                    {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </text>
                )
              })}

              {/* Axes */}
              <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#e0e0da" strokeWidth="1" />
              <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#e0e0da" strokeWidth="1" />

              {/* Lines */}
              {svgLines.map((line, li) => (
                <path key={li} d={stepPath(line.svgPts)} fill="none"
                  stroke={line.color} strokeWidth={svgLines.length > 1 ? 1.5 : 2}
                  strokeLinejoin="round" opacity={svgLines.length > 1 ? 0.85 : 1} />
              ))}

              {/* Crosshair */}
              {tooltip && hasData && (
                <>
                  <line x1={tooltip.x} y1={PAD.t} x2={tooltip.x} y2={H - PAD.b}
                    stroke="#0f2744" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />
                  <circle cx={tooltip.x} cy={tooltip.y} r={3.5}
                    fill={svgLines.find(l => l.label === tooltip.label)?.color ?? '#0f2744'}
                    stroke="#fff" strokeWidth={1.5} />
                </>
              )}
            </svg>

            {/* Tooltip bubble */}
            {tooltip && hasData && (
              <div style={{
                position: 'absolute',
                left: `${(tooltip.x / W) * 100}%`,
                top:  `${(tooltip.y / H) * 100}%`,
                transform: tooltip.x > W * 0.7 ? 'translate(-108%, -50%)' : 'translate(8px, -50%)',
                background: '#0f2744', color: '#fff', borderRadius: 5,
                padding: '4px 8px', fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
              }}>
                {svgLines.length > 1 && <div style={{ fontSize: 10, opacity: 0.75 }}>{tooltip.label}</div>}
                <div style={{ fontWeight: 600 }}>{fmt2(tooltip.price)}</div>
                <div style={{ opacity: 0.75 }}>
                  {tooltip.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          {svgLines.length > 1 && (
            <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
              {svgLines.map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#555' }}>
                  <div style={{ width: 20, height: 2.5, background: l.color, borderRadius: 2 }} />
                  {l.label}
                </div>
              ))}
            </div>
          )}

          {/* Update price panel */}
          <div style={{ borderTop: '0.5px solid #f0f0ec', paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 10 }}>Update share price</div>
            <form onSubmit={handleSavePrice} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={labelSt}>New price (£)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#888', pointerEvents: 'none' }}>£</span>
                  <input type="number" step="0.0001" min="0" required value={newPrice}
                    onChange={e => setNewPrice(e.target.value)} placeholder="0.0000"
                    style={{ ...inputSt, width: 100, paddingLeft: 20 }} />
                </div>
              </div>
              <div>
                <label style={labelSt}>Date</label>
                <input type="date" required value={newDate} onChange={e => setNewDate(e.target.value)}
                  style={{ ...inputSt, width: 130 }} />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={labelSt}>Notes (optional)</label>
                <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)}
                  placeholder="e.g. Series B round" style={inputSt} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: 12, padding: '6px 14px' }}>
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
              </button>
            </form>
            {saveErr && <div style={{ fontSize: 11, color: '#a32d2d', marginTop: 6 }}>{saveErr}</div>}
          </div>
        </div>
      )}

      {/* ── Price history tab ── */}
      {priceTab === 'history' && (
        historyRows.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#888', fontSize: 12 }}>
            No price history yet
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9f9f7' }}>
                <th style={thSt}>Date</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Price</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Change</th>
                <th style={thSt}>Type</th>
                <th style={thSt}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((row, i) => (
                <tr key={i}>
                  <td style={tdSt}>{formatDate(row.date)}</td>
                  <td style={{ ...tdSt, textAlign: 'right', fontWeight: 500, fontFamily: 'monospace' }}>
                    {fmt2(row.price)}
                  </td>
                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    {row.change != null ? (
                      <span style={{ color: row.change > 0 ? '#1d9e75' : row.change < 0 ? '#a32d2d' : '#888' }}>
                        {row.change > 0 ? '+' : ''}{fmt2(row.change)}
                      </span>
                    ) : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td style={tdSt}>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      background: row.type === 'Investment round' ? '#e8f5f0' : '#f0f4fa',
                      color:      row.type === 'Investment round' ? '#0a5a3d' : '#1a3a6a',
                    }}>
                      {row.type}
                      {row.shareClass ? ` · ${row.shareClass}` : ''}
                    </span>
                  </td>
                  <td style={{ ...tdSt, color: '#888' }}>
                    {row.notes ?? <span style={{ color: '#ddd' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ClassPill({ label, active, color, onClick }: {
  label: string; active: boolean; color?: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      padding: '2px 9px', fontSize: 11, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: active ? (color ?? '#0f2744') : '#f5f5f2',
      color:      active ? '#fff' : (color ?? '#555'),
      fontWeight: active ? 600 : 400,
      transition: 'background 0.1s, color 0.1s',
    }}>
      {label}
    </button>
  )
}

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 500, color: '#888', marginBottom: 4,
}
const inputSt: React.CSSProperties = {
  width: '100%', padding: '6px 9px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 12, outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const thSt: React.CSSProperties = {
  padding: '8px 14px', fontSize: 10, fontWeight: 500, color: '#888',
  textAlign: 'left', borderBottom: '0.5px solid #e8e7e0',
}
const tdSt: React.CSSProperties = {
  padding: '8px 14px', fontSize: 12, borderBottom: '0.5px solid #f5f5f2', verticalAlign: 'middle',
}
