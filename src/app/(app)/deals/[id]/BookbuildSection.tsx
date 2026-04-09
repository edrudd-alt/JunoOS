'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { AddBookbuildEntryModal } from './AddBookbuildEntryModal'
import type { DealInfo } from './DealDetail'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Client {
  id:               string
  full_name:        string
  email:            string | null
  default_fee_rate: number | null
  fund_type:        string | null
}

export interface BookbuildEntry {
  id:                      string
  bookbuild_id:            string
  client_id:               string
  client_name:             string
  investing_vehicle_id:    string | null
  investing_vehicle_name:  string | null
  indicative_amount:       number | null
  indicative_shares:       number | null
  status:                  string
  notes:                   string | null
  updated_at:              string
}

export interface Bookbuild {
  id:           string
  deal_id:      string
  company_id:   string
  target_raise: number | null
  status:       string
  entries:      BookbuildEntry[]
}

interface Props {
  dealId:              string
  companyId:           string
  bookbuild:           Bookbuild | null
  allClients:          Client[]
  dealInfo:            DealInfo
  completionChecklist: Record<string, unknown> | null
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  confirmed:  { label: 'Confirmed',  cls: 'pill-green' },
  interested: { label: 'Interested', cls: 'pill-blue'  },
  maybe:      { label: 'Maybe',      cls: 'pill-amber' },
  rejected:   { label: 'Rejected',   cls: 'pill-grey'  },
  withdrawn:  { label: 'Withdrawn',  cls: 'pill-grey'  },
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 500, color: '#888',
  textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e8e7e0',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

const tdSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 12, borderBottom: '0.5px solid #f0f0ec', verticalAlign: 'middle',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BookbuildSection({ dealId, companyId, bookbuild, allClients, dealInfo, completionChecklist }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [starting,       setStarting]       = useState(false)
  const [modalEntry,     setModalEntry]     = useState<BookbuildEntry | 'new' | null>(null)
  const [editingTarget,  setEditingTarget]  = useState(false)
  const [targetInput,    setTargetInput]    = useState(bookbuild?.target_raise != null ? String(bookbuild.target_raise) : '')
  const [savingTarget,   setSavingTarget]   = useState(false)

  async function saveTarget() {
    if (!bookbuild) return
    setSavingTarget(true)
    const parsed = targetInput.trim() ? parseFloat(targetInput) : null
    await supabase.from('bookbuilds').update({ target_raise: parsed }).eq('id', bookbuild.id)
    setSavingTarget(false)
    setEditingTarget(false)
    router.refresh()
  }

  async function startBookbuild() {
    setStarting(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('bookbuilds').insert({
      deal_id:    dealId,
      company_id: companyId,
      status:     'open',
      created_by: user?.id ?? null,
    })
    setStarting(false)
    router.refresh()
  }

  // ── No bookbuild yet ──────────────────────────────────────────────────────

  if (!bookbuild) {
    return (
      <div className="card" style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#888' }}>No bookbuild started yet</div>
        <button
          onClick={startBookbuild}
          disabled={starting}
          className="btn btn-primary"
          style={{ fontSize: 12 }}
        >
          {starting ? 'Starting…' : 'Start bookbuild'}
        </button>
      </div>
    )
  }

  // ── Summary calculations ──────────────────────────────────────────────────

  const confirmedEntries  = bookbuild.entries.filter(e => e.status === 'confirmed')
  const interestedEntries = bookbuild.entries.filter(e => e.status === 'interested')
  const confirmedAmount   = confirmedEntries.reduce((s, e) => s + (e.indicative_amount ?? 0), 0)
  const interestedAmount  = interestedEntries.reduce((s, e) => s + (e.indicative_amount ?? 0), 0)
  const totalAmount       = confirmedAmount + interestedAmount
  const excludedCount     = bookbuild.entries.filter(e => e.status === 'rejected' || e.status === 'withdrawn').length

  const pctConfirmed = bookbuild.target_raise && bookbuild.target_raise > 0
    ? Math.round(confirmedAmount / bookbuild.target_raise * 100) : null
  const pctIncl = bookbuild.target_raise && bookbuild.target_raise > 0
    ? Math.round(totalAmount / bookbuild.target_raise * 100) : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="card" style={{ padding: 0 }}>

      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>
          Bookbuild
          <span style={{ fontWeight: 400, color: '#888', marginLeft: 6, fontSize: 12 }}>
            {bookbuild.entries.length} investor{bookbuild.entries.length !== 1 ? 's' : ''}
            {excludedCount > 0 && `, ${excludedCount} excluded`}
          </span>
        </div>
        <button
          onClick={() => setModalEntry('new')}
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '5px 12px' }}
        >
          + Add investor
        </button>
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        borderBottom: '0.5px solid #e8e7e0', background: '#f9f9f7',
      }}>
        <SummaryCell
          label="Confirmed"
          value={confirmedAmount > 0 ? formatCurrency(confirmedAmount) : '—'}
          sub={`${confirmedEntries.length} investor${confirmedEntries.length !== 1 ? 's' : ''}`}
          accent="#1d9e75"
        />
        <SummaryCell
          label="Interested"
          value={interestedAmount > 0 ? formatCurrency(interestedAmount) : '—'}
          sub={`${interestedEntries.length} investor${interestedEntries.length !== 1 ? 's' : ''}`}
        />
        <SummaryCell
          label="Total incl. interested"
          value={totalAmount > 0 ? formatCurrency(totalAmount) : '—'}
          sub={pctIncl != null ? `${pctIncl}% of target` : undefined}
        />
        {/* Target raise — inline editable */}
        <div style={{ padding: '10px 16px' }}>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
            Target raise
          </div>
          {editingTarget ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#888' }}>£</span>
              <input
                type="number"
                min="0"
                step="1000"
                autoFocus
                value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
                onBlur={saveTarget}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); saveTarget() }
                  if (e.key === 'Escape') { setEditingTarget(false); setTargetInput(bookbuild.target_raise != null ? String(bookbuild.target_raise) : '') }
                }}
                disabled={savingTarget}
                style={{
                  width: 110, padding: '3px 6px', fontSize: 13, fontWeight: 600,
                  border: '0.5px solid #b0c4de', borderRadius: 4,
                  outline: 'none', fontFamily: 'inherit', color: '#0f2744',
                }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{ fontSize: 14, fontWeight: 600, color: bookbuild.target_raise ? '#0f2744' : '#aaa', cursor: 'pointer' }}
                onClick={() => setEditingTarget(true)}
                title="Click to edit"
              >
                {bookbuild.target_raise ? formatCurrency(bookbuild.target_raise) : 'Set target'}
              </span>
              <button
                onClick={() => setEditingTarget(true)}
                title="Edit target raise"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: 0, lineHeight: 1, fontSize: 12 }}
              >
                ✎
              </button>
            </div>
          )}
          {pctConfirmed != null && !editingTarget && (
            <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>{pctConfirmed}% confirmed</div>
          )}
        </div>
      </div>

      {/* Investor table */}
      {bookbuild.entries.length === 0 ? (
        <div style={{ padding: '28px', textAlign: 'center', color: '#888', fontSize: 12 }}>
          No investors added yet
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9f9f7' }}>
                <th style={thSt}>Investor</th>
                <th style={thSt}>Vehicle</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Amount</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Shares</th>
                <th style={thSt}>Status</th>
                <th style={thSt}>Notes</th>
                <th style={{ ...thSt, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {bookbuild.entries.map(entry => {
                const sc = STATUS_CONFIG[entry.status] ?? { label: entry.status, cls: 'pill-grey' }
                return (
                  <tr key={entry.id}>
                    <td style={tdSt}>
                      <div style={{ fontWeight: 500 }}>{entry.client_name}</div>
                    </td>
                    <td style={tdSt}>
                      {entry.investing_vehicle_name
                        ? <span style={{ color: '#555' }}>{entry.investing_vehicle_name}</span>
                        : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      {entry.indicative_amount != null
                        ? formatCurrency(entry.indicative_amount)
                        : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      {entry.indicative_shares != null
                        ? entry.indicative_shares.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={tdSt}>
                      <span className={`pill ${sc.cls}`}>{sc.label}</span>
                    </td>
                    <td style={{ ...tdSt, color: '#666', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.notes
                        ? entry.notes
                        : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      <button
                        onClick={() => setModalEntry(entry)}
                        style={{
                          fontSize: 11, color: '#185fa5', background: 'none',
                          border: 'none', cursor: 'pointer', padding: '2px 4px',
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalEntry !== null && (
        <AddBookbuildEntryModal
          bookbuildId={bookbuild.id}
          companyId={companyId}
          clients={allClients}
          existingClientIds={bookbuild.entries.map(e => e.client_id)}
          dealInfo={dealInfo}
          completionChecklist={completionChecklist}
          entry={modalEntry === 'new' ? undefined : modalEntry}
          onClose={() => setModalEntry(null)}
          onSaved={() => { setModalEntry(null); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCell({ label, value, sub, accent }: {
  label:   string
  value:   string
  sub?:    string
  accent?: string
}) {
  return (
    <div style={{ padding: '10px 16px', borderRight: '0.5px solid #e8e7e0' }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: accent ?? '#0f2744' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}
