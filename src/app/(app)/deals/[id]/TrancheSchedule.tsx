'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { TrancheScheduleItem, CompletionChecklist } from './dealDetailTypes'

interface TrancheScheduleDeal {
  id: string
  total_proceeds_cap: number | null
  completion_checklist: CompletionChecklist | null
}

function blankTranche(n: number): TrancheScheduleItem {
  return {
    tranche_number:          n,
    label:                   '',
    percentage:              0,
    timing:                  '',
    contingency_description: '',
    is_final_tranche:        false,
    is_upfront:              false,
  }
}

function typeBadge(t: TrancheScheduleItem) {
  if (t.is_upfront)       return <span className="pill pill-teal"  style={{ fontSize: 10 }}>Upfront</span>
  if (t.is_final_tranche) return <span className="pill pill-blue"  style={{ fontSize: 10 }}>Final</span>
  return                         <span className="pill pill-grey"  style={{ fontSize: 10 }}>Deferred</span>
}

function validate(rows: TrancheScheduleItem[]): string | null {
  const total    = rows.reduce((s, r) => s + Number(r.percentage), 0)
  const upfronts = rows.filter(r => r.is_upfront).length
  const finals   = rows.filter(r => r.is_final_tranche).length
  if (Math.abs(total - 100) > 0.001) return `Percentages sum to ${total.toFixed(2)}% — must equal 100%`
  if (upfronts !== 1)                return `Exactly one upfront tranche required (${upfronts} found)`
  if (finals   !== 1)                return `Exactly one final tranche required (${finals} found)`
  return null
}

export function TrancheSchedule({
  deal,
  onUpdate,
}: {
  deal:     TrancheScheduleDeal
  onUpdate: () => void
}) {
  const stored = (deal.completion_checklist?.tranches ?? []) as TrancheScheduleItem[]

  const [editing, setEditing] = useState(false)
  const [rows,    setRows]    = useState<TrancheScheduleItem[]>(stored)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const cap   = deal.total_proceeds_cap
  const total = rows.reduce((s, r) => s + Number(r.percentage), 0)

  function startEdit() {
    setRows(stored.length > 0 ? stored.map(r => ({ ...r })) : [blankTranche(1)])
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setRows(stored)
    setError(null)
    setEditing(false)
  }

  function updateRow(i: number, patch: Partial<TrancheScheduleItem>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function addRow() {
    setRows(prev => [...prev, blankTranche(prev.length + 1)])
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, tranche_number: idx + 1 })))
  }

  async function save() {
    const err = validate(rows)
    if (err) { setError(err); return }
    setSaving(true)
    const supabase = createClient()
    const updated  = { ...deal.completion_checklist, tranches: rows }
    const { error: dbErr } = await supabase.from('deals').update({ completion_checklist: updated }).eq('id', deal.id)
    setSaving(false)
    if (dbErr) { setError(dbErr.message); return }
    setEditing(false)
    setError(null)
    onUpdate()
  }

  const totalOk = Math.abs(total - 100) < 0.001

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f2744' }}>Tranche schedule</h3>
        {!editing && (
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={startEdit}>
            Edit
          </button>
        )}
      </div>

      {stored.length === 0 && !editing ? (
        <div style={{ fontSize: 13, color: '#888', padding: '8px 0' }}>
          No tranches defined. Click <strong>Edit</strong> to add them.
        </div>
      ) : (
        <>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: cap ? '18%' : '22%' }}>Label</th>
                <th style={{ width: '8%'  }}>%</th>
                {cap && <th style={{ width: '12%' }}>Amount</th>}
                <th style={{ width: cap ? '16%' : '20%' }}>Timing</th>
                <th>Contingency</th>
                <th style={{ width: '9%' }}>Type</th>
                {editing && <th style={{ width: 32 }} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) =>
                editing ? (
                  <tr key={i}>
                    <td>
                      <input
                        value={row.label}
                        onChange={e => updateRow(i, { label: e.target.value })}
                        style={{ width: '100%', fontSize: 12, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4 }}
                        placeholder="e.g. Upfront"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={row.percentage}
                        onChange={e => updateRow(i, { percentage: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', fontSize: 12, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4 }}
                        min={0} max={100} step={0.01}
                      />
                    </td>
                    {cap && (
                      <td style={{ fontSize: 12, color: '#555' }}>
                        {cap && row.percentage > 0 ? formatCurrency(cap * row.percentage / 100) : '—'}
                      </td>
                    )}
                    <td>
                      <input
                        value={row.timing}
                        onChange={e => updateRow(i, { timing: e.target.value })}
                        style={{ width: '100%', fontSize: 12, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4 }}
                        placeholder="e.g. At completion"
                      />
                    </td>
                    <td>
                      <input
                        value={row.contingency_description}
                        onChange={e => updateRow(i, { contingency_description: e.target.value })}
                        style={{ width: '100%', fontSize: 12, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4 }}
                        placeholder="Optional"
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={row.is_upfront}
                            onChange={e => updateRow(i, { is_upfront: e.target.checked })}
                          />
                          Upfront
                        </label>
                        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={row.is_final_tranche}
                            onChange={e => updateRow(i, { is_final_tranche: e.target.checked })}
                          />
                          Final
                        </label>
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => removeRow(i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d', fontSize: 14, padding: '2px 4px' }}
                        title="Remove tranche"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{row.label || '—'}</td>
                    <td style={{ fontSize: 12 }}>{row.percentage}%</td>
                    {cap && (
                      <td style={{ fontSize: 12 }}>
                        {row.percentage > 0 ? formatCurrency(cap * row.percentage / 100) : '—'}
                      </td>
                    )}
                    <td style={{ fontSize: 12, color: '#555' }}>{row.timing || '—'}</td>
                    <td style={{ fontSize: 12, color: '#555' }}>{row.contingency_description || '—'}</td>
                    <td>{typeBadge(row)}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: totalOk ? '#1a7f4e' : '#a32d2d' }}>
              Total: {total.toFixed(total % 1 === 0 ? 0 : 2)}% — must equal 100%
            </span>

            {editing && (
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={addRow}>
                + Add tranche
              </button>
            )}
          </div>
        </>
      )}

      {editing && (
        <>
          {error && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#a32d2d', padding: '6px 10px', background: '#fef2f2', borderRadius: 4 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={cancel} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
