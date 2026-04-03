'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Valuation {
  id: string
  share_price: number
  valuation_date: string
  notes: string | null
  methodology: string | null
  source: string | null
}

interface InvestmentRound {
  id: string
  investment_date: string
  original_share_price: number
  share_class: string
  sum_subscribed: number
  transaction_type?: string
}

interface Props {
  valuations: Record<string, unknown>[]
  investments: Record<string, unknown>[]
  onOpenModal: () => void
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
const H = 200
const PAD = { l: 56, r: 16, t: 16, b: 32 }
const CHART_W = W - PAD.l - PAD.r
const CHART_H = H - PAD.t - PAD.b

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a Date to YYYY-MM-DD in UK time (Europe/London).
 * Used when matching Date objects back to database date strings.
 */
function toUKDateStr(d: Date): string {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * Format a YYYY-MM-DD date string for display (e.g. "15 Jun 2024").
 * Parses components directly to avoid any timezone ambiguity.
 */
function fmtDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d} ${months[m - 1]} ${y}`
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

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

function buildClassSeries(
  shareClass: string,
  rounds: InvestmentRound[],
  valuations: Valuation[],
  start: Date | null,
): DataPoint[] {
  const today = new Date(); today.setHours(23, 59, 59, 0)

  const roundPts: DataPoint[] = rounds
    .filter(i => i.share_class === shareClass && (i.transaction_type ?? 'buy') !== 'sell' && (i.transaction_type ?? 'buy') !== 'transfer_out')
    .map(i => ({ date: new Date(i.investment_date + 'T00:00:00'), price: i.original_share_price }))

  const manualPts: DataPoint[] = [...valuations]
    .reverse()
    .map(v => ({ date: new Date(v.valuation_date + 'T00:00:00'), price: v.share_price }))

  const byMs = new Map<number, number>()
  for (const p of roundPts) byMs.set(p.date.getTime(), p.price)
  for (const p of manualPts) byMs.set(p.date.getTime(), p.price)

  if (byMs.size === 0) return []

  const all = Array.from(byMs.entries())
    .map(([ms, price]) => ({ date: new Date(ms), price }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  let pts: DataPoint[]
  if (start) {
    const before  = all.filter(p => p.date <  start)
    const inRange = all.filter(p => p.date >= start)
    if (inRange.length === 0 && before.length > 0) {
      pts = [{ date: start, price: before[before.length - 1].price }]
    } else if (before.length > 0) {
      pts = [{ date: start, price: before[before.length - 1].price }, ...inRange]
    } else {
      pts = inRange
    }
  } else {
    pts = all
  }

  if (pts.length === 0) return []
  const last = pts[pts.length - 1]
  if (last.date.getTime() < today.getTime()) pts = [...pts, { date: today, price: last.price }]
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string | null }) {
  if (!source || source === 'manual') {
    return <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 3, background: '#f0f0ec', color: '#888' }}>Manual</span>
  }
  if (source.startsWith('deal') || source === 'deal') {
    return <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 3, background: '#e8f0fb', color: '#185fa5' }}>Auto: Deal</span>
  }
  if (source === 'investment_round') {
    return <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 3, background: '#e8f5f0', color: '#0a5a3d' }}>Investment round</span>
  }
  return <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 3, background: '#f0f0ec', color: '#888' }}>{source}</span>
}

function ClassPill({ label, active, color, onClick }: {
  label: string; active: boolean; color?: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      padding: '2px 9px', fontSize: 11, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: active ? (color ?? '#0f2744') : '#f5f5f2',
      color:      active ? '#fff' : (color ?? '#555'),
      fontWeight: active ? 600 : 400,
    }}>
      {label}
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: '100%', padding: '4px 7px', border: '0.5px solid #c8c8c0',
  borderRadius: 4, fontSize: 12, outline: 'none', boxSizing: 'border-box', background: '#fff',
}

export default function CompanyValuationsTab({ valuations: valRaw, investments: invRaw, onOpenModal }: Props) {
  const router      = useRouter()
  const supabase    = createClient()

  const valuations  = valRaw as unknown as Valuation[]
  const investments = invRaw as unknown as InvestmentRound[]

  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [range,         setRange]         = useState<RangeKey>('all')
  const [hoveredPoint,  setHoveredPoint]  = useState<{
    date: Date; price: number; label: string; x: number; y: number
  } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Edit state
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [editValues,     setEditValues]     = useState({ date: '', price: '', methodology: '', notes: '' })
  const [savingEdit,     setSavingEdit]     = useState(false)
  const [editError,      setEditError]      = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId,     setDeletingId]     = useState<string | null>(null)

  // ── Chart series ──────────────────────────────────────────────────────────

  const classes = useMemo(() =>
    [...new Set(investments.filter(i => (i.transaction_type ?? 'buy') !== 'sell' && (i.transaction_type ?? 'buy') !== 'transfer_out').map(i => i.share_class))].filter(Boolean),
    [investments]
  )

  // Memoised so a new Date object is not created on every render
  const start = useMemo(() => getRangeStart(range), [range])

  const allSeries = useMemo(() => {
    if (classes.length === 0 && valuations.length > 0) {
      const manualPts = [...valuations].reverse().map(v => ({ date: new Date(v.valuation_date + 'T00:00:00'), price: v.share_price }))
      const today = new Date(); today.setHours(23, 59, 59, 0)
      const pts = [...manualPts]
      const last = pts[pts.length - 1]
      if (last && last.date.getTime() < today.getTime()) pts.push({ date: today, price: last.price })
      const start_ = start ? pts.filter(p => p.date >= start) : pts
      const windowed = start && start_.length === 0 && pts.length > 0
        ? [{ date: start, price: pts[pts.length - 1].price }]
        : start && pts.some(p => p.date < start)
          ? [{ date: start, price: pts.filter(p => p.date < start).at(-1)!.price }, ...start_]
          : start_
      return [{ label: 'Valuation', color: CLASS_COLORS[0], pts: windowed.length > 0 ? windowed : pts }]
    }
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
    return allSeries.filter(s => s.pts.length > 0)
  }, [selectedClass, allSeries])

  const currentPrice = valuations.length > 0 ? valuations[0].share_price : null

  const { minMs, rangeMs, minP, rangeP, yTicks, xTicks } = useMemo(() => {
    const allPts = lines.flatMap(l => l.pts)
    if (allPts.length === 0) return { minMs: 0, rangeMs: 1, minP: 0, rangeP: 1, yTicks: [], xTicks: [] }
    const minMs   = Math.min(...allPts.map(p => p.date.getTime()))
    const maxMs   = Math.max(...allPts.map(p => p.date.getTime()))
    const rangeMs = maxMs - minMs || 86_400_000
    const prices  = allPts.map(p => p.price)
    const minRaw  = Math.min(...prices); const maxRaw = Math.max(...prices)
    const pad     = (maxRaw - minRaw) * 0.1 || maxRaw * 0.05 || 0.1
    const paddedMin = Math.max(0, minRaw - pad); const paddedMax = maxRaw + pad
    const rangeP  = paddedMax - paddedMin
    const yTicks  = Array.from({ length: 5 }, (_, i) => paddedMin + (rangeP / 4) * i)
    const xTicks: Date[] = []
    const step = rangeMs / 5
    for (let i = 0; i <= 5; i++) xTicks.push(new Date(minMs + step * i))
    return { minMs, rangeMs, minP: paddedMin, rangeP, yTicks, xTicks }
  }, [lines])

  const svgLines = useMemo(() => lines.map(line => ({
    ...line,
    svgPts: line.pts.map(p => ({
      x: dateToX(p.date, minMs, rangeMs),
      y: priceToY(p.price, minP, rangeP),
      date: p.date, price: p.price,
    })),
  })), [lines, minMs, rangeMs, minP, rangeP])

  // Valuation update markers (circles) and investment round markers (diamonds)
  const valuationMarkers = useMemo(() => valuations.map(v => {
    const d = new Date(v.valuation_date + 'T00:00:00')
    const x = dateToX(d, minMs, rangeMs)
    const y = priceToY(v.share_price, minP, rangeP)
    return { id: v.id, x, y, date: d, price: v.share_price, inRange: x >= PAD.l && x <= W - PAD.r }
  }).filter(m => m.inRange), [valuations, minMs, rangeMs, minP, rangeP])

  const roundMarkers = useMemo(() => {
    const seen = new Set<string>()
    return investments.filter(i => {
      if ((i.transaction_type ?? 'buy') === 'sell' || (i.transaction_type ?? 'buy') === 'transfer_out') return false
      const key = `${i.investment_date}|${i.share_class}|${i.original_share_price}`
      if (seen.has(key)) return false
      seen.add(key); return true
    }).map(i => {
      const d = new Date(i.investment_date + 'T00:00:00')
      const x = dateToX(d, minMs, rangeMs)
      const y = priceToY(i.original_share_price, minP, rangeP)
      return { id: i.id, x, y, date: d, price: i.original_share_price, shareClass: i.share_class, inRange: x >= PAD.l && x <= W - PAD.r }
    }).filter(m => m.inRange)
  }, [investments, minMs, rangeMs, minP, rangeP])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || svgLines.length === 0) return
    const rect   = svgRef.current.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * W
    if (mouseX < PAD.l || mouseX > W - PAD.r) { setHoveredPoint(null); return }
    let best: typeof hoveredPoint = null
    let bestDist = Infinity
    for (const line of svgLines) {
      for (const pt of line.svgPts) {
        const dist = Math.abs(mouseX - pt.x)
        if (dist < bestDist) { bestDist = dist; best = { ...pt, label: line.label } }
      }
    }
    setHoveredPoint(best)
  }, [svgLines])

  // ── Lookups ───────────────────────────────────────────────────────────────

  const valuationByDate = useMemo(() => {
    const m = new Map<string, Valuation>()
    for (const v of valuations) m.set(v.valuation_date, v)
    return m
  }, [valuations])

  // Total invested per date (buy/transfer_in only)
  const investedByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of investments) {
      const t = i.transaction_type ?? 'buy'
      if (t === 'sell' || t === 'transfer_out') continue
      m.set(i.investment_date, (m.get(i.investment_date) ?? 0) + (i.sum_subscribed ?? 0))
    }
    return m
  }, [investments])

  // Hover-derived values (use UK date string to match DB keys)
  const hoveredDateStr  = hoveredPoint ? toUKDateStr(hoveredPoint.date) : null
  const hoveredVal      = hoveredDateStr ? (valuationByDate.get(hoveredDateStr) ?? null) : null
  const investedAtHover = hoveredDateStr ? (investedByDate.get(hoveredDateStr) ?? null) : null

  // ── History table rows ────────────────────────────────────────────────────

  const historyRows = useMemo(() => {
    type Row = {
      dateMs: number; date: string; price: number
      type: 'Manual update' | 'Investment round'
      shareClass?: string; notes?: string | null
      methodology?: string | null; source?: string | null
      valuationId?: string           // present on Manual update rows only
      investedAmount?: number | null // present on Investment round rows only
    }
    const rows: Row[] = []
    const roundSeen = new Set<string>()

    for (const inv of investments) {
      if ((inv.transaction_type ?? 'buy') === 'sell' || (inv.transaction_type ?? 'buy') === 'transfer_out') continue
      const key = `${inv.investment_date}|${inv.share_class}|${inv.original_share_price}`
      if (roundSeen.has(key)) continue
      roundSeen.add(key)
      rows.push({
        dateMs: new Date(inv.investment_date + 'T00:00:00').getTime(),
        date:   inv.investment_date,
        price:  inv.original_share_price,
        type:   'Investment round',
        shareClass: inv.share_class,
        investedAmount: investedByDate.get(inv.investment_date) ?? null,
      })
    }

    for (const v of valuations) {
      rows.push({
        dateMs:      new Date(v.valuation_date + 'T00:00:00').getTime(),
        date:        v.valuation_date,
        price:       v.share_price,
        type:        'Manual update',
        notes:       v.notes,
        methodology: v.methodology,
        source:      v.source,
        valuationId: v.id,
      })
    }

    // Most recent first
    rows.sort((a, b) => b.dateMs - a.dateMs)

    return rows.map((row, i) => {
      const next = rows[i + 1]
      return { ...row, change: next ? row.price - next.price : null }
    })
  }, [investments, valuations, investedByDate])

  // ── Edit / delete actions ─────────────────────────────────────────────────

  function startEdit(row: typeof historyRows[number]) {
    if (!row.valuationId) return
    setEditingId(row.valuationId)
    setEditError('')
    setEditValues({
      date:        row.date,
      price:       String(row.price),
      methodology: row.methodology ?? '',
      notes:       row.notes ?? '',
    })
  }

  async function saveEdit() {
    if (!editingId) return
    const price = parseFloat(editValues.price)
    if (isNaN(price) || price <= 0) { setEditError('Enter a valid price'); return }
    setSavingEdit(true); setEditError('')
    const { error } = await supabase.from('valuations').update({
      valuation_date: editValues.date,
      share_price:    price,
      methodology:    editValues.methodology.trim() || null,
      notes:          editValues.notes.trim() || null,
    }).eq('id', editingId)
    if (error) { setEditError(error.message); setSavingEdit(false); return }
    setSavingEdit(false); setEditingId(null)
    router.refresh()
  }

  async function confirmDelete(valuationId: string) {
    setDeletingId(valuationId)
    const { error } = await supabase.from('valuations').delete().eq('id', valuationId)
    setDeletingId(null)
    if (error) { console.error(error); return }
    setDeleteConfirmId(null)
    router.refresh()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasData = svgLines.some(l => l.svgPts.length > 0)
  const cv      = valuations[0] ?? null

  const thSt: React.CSSProperties = {
    padding: '8px 12px', fontSize: 10, fontWeight: 500, color: '#888',
    textAlign: 'left', borderBottom: '0.5px solid #e8e7e0', whiteSpace: 'nowrap',
  }
  const tdSt: React.CSSProperties = {
    padding: '8px 12px', fontSize: 12, borderBottom: '0.5px solid #f5f5f2', verticalAlign: 'middle',
  }
  const actionBtnSt: React.CSSProperties = {
    fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '0.5px solid #d0d0c8',
    background: '#fff', cursor: 'pointer', color: '#555',
  }

  return (
    <div>
      {/* ── Chart + detail panel ── */}
      <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr' }}>

          {/* Left: chart */}
          <div style={{ padding: 16, borderRight: '0.5px solid #e8e7e0' }}>
            {/* Header: price + class pills + range buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#0f2744' }}>
                  {currentPrice != null ? fmt2(currentPrice) : '—'}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>per share</div>
                {classes.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <ClassPill label="All" active={selectedClass === 'all'} onClick={() => setSelectedClass('all')} />
                    {classes.map((cls, i) => (
                      <ClassPill key={cls} label={cls} active={selectedClass === cls}
                        color={CLASS_COLORS[i % CLASS_COLORS.length]}
                        onClick={() => setSelectedClass(cls)} />
                    ))}
                  </div>
                )}
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
                onMouseMove={handleMouseMove} onMouseLeave={() => setHoveredPoint(null)}>

                {yTicks.map((tick, i) => {
                  const y = priceToY(tick, minP, rangeP)
                  return (
                    <g key={i}>
                      <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#f0f0ec" strokeWidth="1" />
                      <text x={PAD.l - 4} y={y + 4} textAnchor="end" style={{ fontSize: 9, fill: '#aaa', fontFamily: 'inherit' }}>
                        {fmt2(tick)}
                      </text>
                    </g>
                  )
                })}

                {xTicks.map((d, i) => {
                  const x = dateToX(d, minMs, rangeMs)
                  if (x < PAD.l || x > W - PAD.r) return null
                  return (
                    <text key={i} x={x} y={H - PAD.b + 14} textAnchor="middle" style={{ fontSize: 9, fill: '#aaa', fontFamily: 'inherit' }}>
                      {d.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' })}
                    </text>
                  )
                })}

                <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#e0e0da" strokeWidth="1" />
                <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#e0e0da" strokeWidth="1" />

                {svgLines.map((line, li) => (
                  <path key={li} d={stepPath(line.svgPts)} fill="none"
                    stroke={line.color} strokeWidth={svgLines.length > 1 ? 1.5 : 2}
                    strokeLinejoin="round" opacity={svgLines.length > 1 ? 0.85 : 1} />
                ))}

                {/* Valuation update markers — filled circles */}
                {valuationMarkers.map(m => (
                  <circle key={m.id} cx={m.x} cy={m.y} r={4} fill="#0f2744" stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
                ))}

                {/* Investment round markers — diamonds */}
                {roundMarkers.map(m => (
                  <rect key={m.id} x={m.x - 4} y={m.y - 4} width={8} height={8}
                    fill="#185fa5" stroke="#fff" strokeWidth={1.5}
                    transform={`rotate(45, ${m.x}, ${m.y})`} style={{ pointerEvents: 'none' }} />
                ))}

                {/* Crosshair */}
                {hoveredPoint && hasData && (
                  <>
                    <line x1={hoveredPoint.x} y1={PAD.t} x2={hoveredPoint.x} y2={H - PAD.b}
                      stroke="#0f2744" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />
                    <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r={3.5}
                      fill={svgLines.find(l => l.label === hoveredPoint.label)?.color ?? '#0f2744'}
                      stroke="#fff" strokeWidth={1.5} />
                  </>
                )}
              </svg>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: '#555' }}>
              {svgLines.length > 1 && svgLines.map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 20, height: 2.5, background: l.color, borderRadius: 2 }} />
                  {l.label}
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
                  <circle cx="5" cy="5" r="3.5" fill="#0f2744" />
                </svg>
                Valuation update
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
                  <rect x="1" y="1" width="8" height="8" fill="#185fa5" transform="rotate(45, 5, 5)" />
                </svg>
                Investment round
              </div>
            </div>
          </div>

          {/* Right: detail panel */}
          <div style={{ padding: 16 }}>
            {hoveredPoint ? (
              <div>
                {/* Date header */}
                <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 8 }}>
                  {hoveredPoint.date.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>

                {/* Share price */}
                <div style={{ fontSize: 24, fontWeight: 700, color: '#0f2744', marginBottom: 4 }}>
                  {fmt2(hoveredPoint.price)}
                </div>

                {/* Change vs previous */}
                {(() => {
                  const row = historyRows.find(r => r.date === hoveredDateStr)
                  if (!row || row.change == null) return null
                  const c = row.change
                  const prevPrice = row.price - c
                  const changePct = prevPrice > 0 ? (c / prevPrice) * 100 : null
                  return (
                    <div style={{ fontSize: 12, marginBottom: 12 }}>
                      <span style={{ color: c > 0 ? '#1d9e75' : c < 0 ? '#a32d2d' : '#888', fontWeight: 500 }}>
                        {c > 0 ? '+' : ''}{fmt2(c)}
                      </span>
                      {changePct != null && (
                        <span style={{ color: c > 0 ? '#1d9e75' : c < 0 ? '#a32d2d' : '#888', marginLeft: 5 }}>
                          ({c > 0 ? '+' : ''}{changePct.toFixed(1)}%)
                        </span>
                      )}
                      <span style={{ color: '#aaa', marginLeft: 4 }}>vs previous</span>
                    </div>
                  )
                })()}

                {/* Method of valuation */}
                {hoveredVal?.methodology && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Method of valuation</div>
                    <div style={{ fontSize: 12, color: '#333' }}>{hoveredVal.methodology}</div>
                  </div>
                )}

                {/* Notes */}
                {hoveredVal?.notes && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Notes</div>
                    <div style={{ fontSize: 12, color: '#444', lineHeight: 1.5 }}>{hoveredVal.notes}</div>
                  </div>
                )}

                {/* Invested at this round */}
                {investedAtHover != null && investedAtHover > 0 && (
                  <div style={{ marginBottom: 10, padding: '8px 10px', background: '#f0f4fa', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Invested at this round</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#185fa5' }}>{formatCurrency(investedAtHover)}</div>
                  </div>
                )}

                {svgLines.length > 1 && (
                  <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic', marginTop: 4 }}>{hoveredPoint.label}</div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 8 }}>
                  Current price
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#0f2744', marginBottom: 4 }}>
                  {currentPrice != null ? fmt2(currentPrice) : '—'}
                </div>
                {cv && (
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 14 }}>
                    Updated {fmtDateStr(cv.valuation_date)}
                  </div>
                )}
                {cv?.methodology && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Method of valuation</div>
                    <div style={{ fontSize: 12, color: '#333' }}>{cv.methodology}</div>
                  </div>
                )}
                {cv?.notes && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Notes</div>
                    <div style={{ fontSize: 12, color: '#444', lineHeight: 1.5 }}>{cv.notes}</div>
                  </div>
                )}
                {!hasData && (
                  <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', marginTop: 8 }}>No price history yet</div>
                )}
                {hasData && (
                  <div style={{ marginTop: 12, fontSize: 10, color: '#bbb' }}>Hover over the chart to inspect a date</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Update valuation button */}
        <div style={{ padding: '10px 16px', borderTop: '0.5px solid #e8e7e0', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onOpenModal} style={{ fontSize: 12 }}>
            Update valuation
          </button>
        </div>
      </div>

      {/* ── Price history table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '0.5px solid #e8e7e0' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Price history</span>
        </div>
        {historyRows.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#888', fontSize: 12 }}>
            No price history yet
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9f9f7' }}>
                <th style={thSt}>Date</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Share price</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Change £</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Change %</th>
                <th style={thSt}>Method</th>
                <th style={thSt}>Notes</th>
                <th style={thSt}>Source</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((row, i) => {
                const isEditing       = editingId === row.valuationId && row.type === 'Manual update'
                const isDeleteConfirm = deleteConfirmId === row.valuationId && row.type === 'Manual update'
                const changePct       = row.change != null && (row.price - row.change) > 0
                  ? (row.change / (row.price - row.change)) * 100
                  : null

                if (isEditing) {
                  return (
                    <tr key={i} style={{ background: '#f5f8ff' }}>
                      <td style={tdSt}>
                        <input type="date" value={editValues.date}
                          onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))}
                          style={{ ...inputSt, width: 130 }} />
                      </td>
                      <td style={{ ...tdSt, textAlign: 'right' }}>
                        <input type="number" step="0.0001" min="0" value={editValues.price}
                          onChange={e => setEditValues(v => ({ ...v, price: e.target.value }))}
                          style={{ ...inputSt, width: 90, textAlign: 'right' }} />
                      </td>
                      <td colSpan={2} style={{ ...tdSt, color: '#ccc', fontSize: 11, fontStyle: 'italic' }}>Recalculated on save</td>
                      <td style={tdSt}>
                        <input type="text" value={editValues.methodology} placeholder="e.g. DCF, last round"
                          onChange={e => setEditValues(v => ({ ...v, methodology: e.target.value }))}
                          style={inputSt} />
                      </td>
                      <td style={tdSt}>
                        <input type="text" value={editValues.notes} placeholder="Optional notes"
                          onChange={e => setEditValues(v => ({ ...v, notes: e.target.value }))}
                          style={inputSt} />
                      </td>
                      <td style={tdSt} />
                      <td style={{ ...tdSt, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}
                              style={{ fontSize: 11, padding: '3px 10px' }}>
                              {savingEdit ? 'Saving…' : 'Save'}
                            </button>
                            <button style={{ ...actionBtnSt }} onClick={() => { setEditingId(null); setEditError('') }}>
                              Cancel
                            </button>
                          </div>
                          {editError && <div style={{ fontSize: 10, color: '#a32d2d' }}>{editError}</div>}
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={i} style={{ borderBottom: '0.5px solid #f5f5f2' }}>
                    <td style={tdSt}>{fmtDateStr(row.date)}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 500, fontFamily: 'monospace' }}>
                      {fmt2(row.price)}
                      {row.investedAmount != null && row.investedAmount > 0 && (
                        <div style={{ fontSize: 10, color: '#185fa5', fontFamily: 'inherit', fontWeight: 400, marginTop: 2 }}>
                          {formatCurrency(row.investedAmount)} invested
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      {row.change != null ? (
                        <span style={{ color: row.change > 0 ? '#1d9e75' : row.change < 0 ? '#a32d2d' : '#888' }}>
                          {row.change > 0 ? '+' : ''}{fmt2(row.change)}
                        </span>
                      ) : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      {changePct != null ? (
                        <span style={{ color: changePct > 0 ? '#1d9e75' : changePct < 0 ? '#a32d2d' : '#888' }}>
                          {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
                        </span>
                      ) : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ ...tdSt, color: '#555' }}>
                      {row.methodology ?? <span style={{ color: '#ddd' }}>—</span>}
                    </td>
                    <td style={{ ...tdSt, color: '#888', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.type === 'Investment round' ? (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: '#e8f5f0', color: '#0a5a3d' }}>
                          Round{row.shareClass ? ` · ${row.shareClass}` : ''}
                        </span>
                      ) : (row.notes ?? <span style={{ color: '#ddd' }}>—</span>)}
                    </td>
                    <td style={tdSt}>
                      {row.type === 'Investment round'
                        ? <SourceBadge source="investment_round" />
                        : <SourceBadge source={row.source ?? null} />
                      }
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      {row.type === 'Manual update' && (
                        isDeleteConfirm ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 11, color: '#a32d2d' }}>Delete?</span>
                            <button
                              style={{ ...actionBtnSt, background: '#a32d2d', color: '#fff', border: 'none' }}
                              onClick={() => confirmDelete(row.valuationId!)}
                              disabled={deletingId === row.valuationId}
                            >
                              {deletingId === row.valuationId ? '…' : 'Yes'}
                            </button>
                            <button style={actionBtnSt} onClick={() => setDeleteConfirmId(null)}>No</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button style={actionBtnSt} onClick={() => startEdit(row)}>Edit</button>
                            <button
                              style={{ ...actionBtnSt, color: '#a32d2d', borderColor: '#f0c0c0' }}
                              onClick={() => setDeleteConfirmId(row.valuationId!)}
                            >
                              Delete
                            </button>
                          </div>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
