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

interface Props {
  companyId: string
  valuations: Valuation[]         // sorted descending (newest first)
  shareClasses: string[]          // unique share class names from investments
  currentPrice: number | null
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

// SVG layout
const W = 600
const H = 180
const PAD = { l: 56, r: 16, t: 12, b: 32 }
const CHART_W = W - PAD.l - PAD.r
const CHART_H = H - PAD.t - PAD.b

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rangeStart(key: RangeKey): Date | null {
  if (key === 'all') return null
  const d = new Date()
  if (key === '1M') d.setMonth(d.getMonth() - 1)
  if (key === '3M') d.setMonth(d.getMonth() - 3)
  if (key === '6M') d.setMonth(d.getMonth() - 6)
  if (key === '1Y') d.setFullYear(d.getFullYear() - 1)
  return d
}

interface DataPoint { date: Date; price: number }

/** Build step-interpolated series: flat at each price until the next update, then extend to today */
function buildSeries(valuations: Valuation[], start: Date | null): DataPoint[] {
  const today = new Date(); today.setHours(23, 59, 59, 0)

  // All valuations ascending
  const all: DataPoint[] = [...valuations]
    .reverse()
    .map(v => ({ date: new Date(v.valuation_date + 'T00:00:00'), price: v.share_price }))

  if (all.length === 0) return []

  // Find the last known price before the range window (to set starting price)
  let seriesStart = start
  let pts: DataPoint[]

  if (seriesStart) {
    const before = all.filter(p => p.date < seriesStart!)
    const inRange = all.filter(p => p.date >= seriesStart!)

    if (inRange.length === 0 && before.length > 0) {
      // All data is before the window — show flat line from window start to today
      pts = [{ date: seriesStart, price: before[before.length - 1].price }]
    } else if (before.length > 0) {
      // Prepend a synthetic point at the window start with the last known price
      pts = [{ date: seriesStart, price: before[before.length - 1].price }, ...inRange]
    } else {
      pts = inRange
    }
  } else {
    pts = all
  }

  if (pts.length === 0) return []

  // Extend to today if the last point is not today
  const last = pts[pts.length - 1]
  if (last.date < today) {
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

/** Build an SVG step path (horizontal first, then vertical) */
function stepPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` H ${pts[i].x.toFixed(1)} V ${pts[i].y.toFixed(1)}`
  }
  return d
}

function formatPrice2(n: number) { return `£${n.toFixed(2)}` }

// ─── Component ────────────────────────────────────────────────────────────────

export default function SharePriceSection({ companyId, valuations, shareClasses, currentPrice }: Props) {
  const router  = useRouter()
  const supabase = createClient()

  const [priceTab,       setPriceTab]       = useState<'chart' | 'history'>('chart')
  const [selectedClass,  setSelectedClass]  = useState<string>('all')
  const [range,          setRange]          = useState<RangeKey>('all')
  const [tooltip,        setTooltip]        = useState<{ x: number; y: number; date: Date; price: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Update price form
  const [newPrice, setNewPrice] = useState(currentPrice?.toFixed(4) ?? '')
  const [newDate,  setNewDate]  = useState(new Date().toISOString().slice(0, 10))
  const [newNotes, setNewNotes] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saveErr,  setSaveErr]  = useState('')
  const [saved,    setSaved]    = useState(false)

  // Unique classes shown in pills (show 'all' plus actual classes)
  const classes = useMemo(() => [...new Set(shareClasses)].filter(Boolean), [shareClasses])

  // Build data series for the selected range
  const series = useMemo(() => buildSeries(valuations, rangeStart(range)), [valuations, range])

  // Chart bounds
  const { minMs, rangeMs, minP, rangeP, yTicks, xTicks } = useMemo(() => {
    if (series.length === 0) return { minMs: 0, rangeMs: 1, minP: 0, rangeP: 1, yTicks: [], xTicks: [] }

    const minMs = series[0].date.getTime()
    const maxMs = series[series.length - 1].date.getTime()
    const rangeMs = maxMs - minMs || 86400000 // at least 1 day

    const prices = series.map(p => p.price)
    const minP = Math.min(...prices)
    const maxP = Math.max(...prices)
    const pad  = (maxP - minP) * 0.1 || maxP * 0.05 || 0.1
    const paddedMin = Math.max(0, minP - pad)
    const paddedMax = maxP + pad
    const rangeP = paddedMax - paddedMin

    // Y axis ticks (5 evenly spaced)
    const yTicks = Array.from({ length: 5 }, (_, i) => paddedMin + (rangeP / 4) * i)

    // X axis ticks — roughly 4-6 labels
    const xTicks: Date[] = []
    const msPerLabel = rangeMs / 5
    for (let i = 0; i <= 5; i++) {
      xTicks.push(new Date(minMs + msPerLabel * i))
    }

    return { minMs, rangeMs, minP: paddedMin, rangeP, yTicks, xTicks }
  }, [series])

  // SVG points for the series
  const svgPts = useMemo(() => series.map(p => ({
    x: dateToX(p.date, minMs, rangeMs),
    y: priceToY(p.price, minP, rangeP),
    date: p.date,
    price: p.price,
  })), [series, minMs, rangeMs, minP, rangeP])

  // Lines to draw: one per class (same data) or just one
  const lines = useMemo(() => {
    if (selectedClass !== 'all' || classes.length <= 1) {
      const color = selectedClass !== 'all'
        ? CLASS_COLORS[classes.indexOf(selectedClass) % CLASS_COLORS.length] ?? '#0f2744'
        : '#0f2744'
      return [{ label: selectedClass !== 'all' ? selectedClass : (classes[0] ?? 'Price'), color, pts: svgPts }]
    }
    return classes.map((cls, i) => ({
      label: cls,
      color: CLASS_COLORS[i % CLASS_COLORS.length],
      pts: svgPts, // same data for all classes (company-wide valuation)
    }))
  }, [selectedClass, classes, svgPts])

  // Tooltip: find nearest point by x on mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || svgPts.length === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * W
    // Find closest point by x
    let closest = svgPts[0]
    let minDist = Math.abs(mouseX - svgPts[0].x)
    for (const pt of svgPts) {
      const dist = Math.abs(mouseX - pt.x)
      if (dist < minDist) { minDist = dist; closest = pt }
    }
    if (mouseX < PAD.l || mouseX > W - PAD.r) { setTooltip(null); return }
    setTooltip({ x: closest.x, y: closest.y, date: closest.date, price: closest.price })
  }, [svgPts])

  async function handleSavePrice(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseFloat(newPrice)
    if (isNaN(parsed) || parsed <= 0) { setSaveErr('Enter a valid price'); return }
    setSaving(true); setSaveErr(''); setSaved(false)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('valuations').insert({
      company_id: companyId, share_price: parsed,
      valuation_date: newDate, notes: newNotes.trim() || null,
      updated_by: user?.id ?? null,
    })
    if (error) { setSaveErr(error.message); setSaving(false); return }
    await supabase.from('internal_updates').insert({
      company_id: companyId, update_type: 'valuation',
      description: `Share price updated to £${parsed.toFixed(4)}`,
      created_by: user?.id ?? null,
    })
    setSaving(false); setSaved(true); setNewNotes('')
    router.refresh()
  }

  // Price history table (valuations sorted desc — already in that order)
  const historyRows = useMemo(() => {
    return valuations.map((v, i) => {
      const prev = valuations[i + 1]
      const change = prev ? v.share_price - prev.share_price : null
      return { ...v, change }
    })
  }, [valuations])

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid #e8e7e0' }}>
        {([['chart', 'Share price & history'], ['history', 'Price history']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPriceTab(key)}
            style={{
              padding: '10px 16px', fontSize: 12, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: priceTab === key ? '2px solid #0f2744' : '2px solid transparent',
              color: priceTab === key ? '#0f2744' : '#888',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Share price & history tab ── */}
      {priceTab === 'chart' && (
        <div style={{ padding: 16 }}>
          {/* Current price + class pills + range in one row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f2744' }}>
                {currentPrice != null ? formatPrice2(currentPrice) : '—'}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>per share</div>

              {/* Share class pills */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <ClassPill label="All classes" active={selectedClass === 'all'} onClick={() => setSelectedClass('all')} />
                {classes.map((cls, i) => (
                  <ClassPill
                    key={cls} label={cls}
                    active={selectedClass === cls}
                    color={CLASS_COLORS[i % CLASS_COLORS.length]}
                    onClick={() => setSelectedClass(cls)}
                  />
                ))}
              </div>
            </div>

            {/* Range selector */}
            <div style={{ display: 'flex', gap: 3 }}>
              {RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  style={{
                    padding: '3px 9px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: range === r.key ? '#0f2744' : '#f5f5f2',
                    color: range === r.key ? '#fff' : '#555',
                    fontWeight: range === r.key ? 600 : 400,
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* SVG Chart */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Grid lines */}
              {yTicks.map((tick, i) => {
                const y = priceToY(tick, minP, rangeP)
                return (
                  <g key={i}>
                    <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                      stroke="#f0f0ec" strokeWidth="1" />
                    <text x={PAD.l - 4} y={y + 4} textAnchor="end"
                      style={{ fontSize: 9, fill: '#aaa', fontFamily: 'inherit' }}>
                      {formatPrice2(tick)}
                    </text>
                  </g>
                )
              })}

              {/* X axis labels */}
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

              {/* Data lines */}
              {svgPts.length > 0 && lines.map((line, li) => (
                <path
                  key={li}
                  d={stepPath(line.pts)}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={lines.length > 1 ? 1.5 : 2}
                  strokeLinejoin="round"
                  opacity={lines.length > 1 ? 0.85 : 1}
                />
              ))}

              {/* Tooltip crosshair */}
              {tooltip && (
                <>
                  <line x1={tooltip.x} y1={PAD.t} x2={tooltip.x} y2={H - PAD.b}
                    stroke="#0f2744" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />
                  <circle cx={tooltip.x} cy={tooltip.y} r={3.5}
                    fill={lines[0]?.color ?? '#0f2744'} stroke="#fff" strokeWidth={1.5} />
                </>
              )}
            </svg>

            {/* Floating tooltip */}
            {tooltip && (
              <div style={{
                position: 'absolute',
                left: `${(tooltip.x / W) * 100}%`,
                top: `${(tooltip.y / H) * 100}%`,
                transform: tooltip.x > W * 0.7 ? 'translate(-108%, -50%)' : 'translate(8px, -50%)',
                background: '#0f2744',
                color: '#fff',
                borderRadius: 5,
                padding: '4px 8px',
                fontSize: 11,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}>
                <div style={{ fontWeight: 600 }}>{formatPrice2(tooltip.price)}</div>
                <div style={{ opacity: 0.75 }}>
                  {tooltip.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
            )}
          </div>

          {/* Legend (multi-class only) */}
          {lines.length > 1 && (
            <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
              {lines.map(line => (
                <div key={line.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#555' }}>
                  <div style={{ width: 20, height: 2.5, background: line.color, borderRadius: 2 }} />
                  {line.label}
                </div>
              ))}
            </div>
          )}

          {/* Update share price panel */}
          <div style={{
            borderTop: '0.5px solid #f0f0ec', paddingTop: 14, marginTop: 4,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 10 }}>Update share price</div>
            <form onSubmit={handleSavePrice} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={labelSt}>New price (£)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#888', pointerEvents: 'none' }}>£</span>
                  <input
                    type="number" step="0.0001" min="0" required
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    placeholder="0.0000"
                    style={{ ...inputSt, width: 100, paddingLeft: 20 }}
                  />
                </div>
              </div>
              <div>
                <label style={labelSt}>Date</label>
                <input type="date" required value={newDate} onChange={e => setNewDate(e.target.value)} style={{ ...inputSt, width: 130 }} />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={labelSt}>Notes (optional)</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="e.g. Series B round"
                  style={inputSt}
                />
              </div>
              <div>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: 12, padding: '6px 14px' }}>
                  {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </form>
            {saveErr && <div style={{ fontSize: 11, color: '#a32d2d', marginTop: 6 }}>{saveErr}</div>}
          </div>
        </div>
      )}

      {/* ── Price history tab ── */}
      {priceTab === 'history' && (
        <div>
          {historyRows.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: '#888', fontSize: 12 }}>
              No valuations recorded yet
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
                {historyRows.map(row => (
                  <tr key={row.id}>
                    <td style={tdSt}>{formatDate(row.valuation_date)}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 500, fontFamily: 'monospace' }}>
                      {formatPrice2(row.share_price)}
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      {row.change != null ? (
                        <span style={{ color: row.change > 0 ? '#1d9e75' : row.change < 0 ? '#a32d2d' : '#888' }}>
                          {row.change > 0 ? '+' : ''}{formatPrice2(row.change)}
                        </span>
                      ) : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ ...tdSt, color: '#888' }}>Manual</td>
                    <td style={{ ...tdSt, color: '#888', maxWidth: 220 }}>
                      {row.notes ?? <span style={{ color: '#ddd' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ClassPill({ label, active, color, onClick }: {
  label: string; active: boolean; color?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '2px 9px', fontSize: 11, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: active ? (color ?? '#0f2744') : '#f5f5f2',
        color: active ? '#fff' : color ?? '#555',
        fontWeight: active ? 600 : 400,
        transition: 'background 0.1s, color 0.1s',
        outline: active && color ? `2px solid ${color}22` : 'none',
      }}
    >
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
