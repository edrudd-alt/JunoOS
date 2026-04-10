'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface FundType {
  id: string
  name: string
  code: string
  description: string | null
  default_fee_schedule_id: string | null
}

interface ClientRow {
  id: string
  full_name: string
  fund_type: string
  active_fund_type: string | null
}

interface FeeSchedule {
  id: string
  name: string
  description: string | null
  active: boolean
  created_at: string
}

interface FeeScheduleItem {
  id: string
  fee_schedule_id: string
  fee_type: string
  label: string
  basis: string
  rate: number
  cap_rate: number | null
  cap_years: number | null
  display_order: number
  active: boolean
}

const FUND_TYPE_LABELS: Record<string, string> = {
  syndicate:     'Syndicate',
  multi_manager: 'Multi Manager',
  eis:           'EIS Fund',
  both:          'Both',
}

const FEE_TYPE_LABELS: Record<string, string> = {
  buy:                   'Buy fee',
  exit_profit_share:     'Exit profit share',
  annual_management:     'Annual management',
  other:                 'Other',
}

const BASIS_LABELS: Record<string, string> = {
  percentage_of_profit:   '% of profit',
  percentage_of_cost:     '% of cost',
  percentage_of_proceeds: '% of proceeds',
  fixed:                  'Fixed',
}

export default function FundManagementClient({
  fundTypes: fundTypesRaw,
  clients: clientsRaw,
  feeSchedules: feeSchedulesRaw,
  feeScheduleItems: feeScheduleItemsRaw,
}: {
  fundTypes: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  feeSchedules: Record<string, unknown>[]
  feeScheduleItems: Record<string, unknown>[]
}) {
  const router  = useRouter()
  const supabase = createClient()

  const fundTypes        = fundTypesRaw        as unknown as FundType[]
  const clients          = clientsRaw          as unknown as ClientRow[]
  const feeSchedules     = feeSchedulesRaw     as unknown as FeeSchedule[]
  const feeScheduleItems = feeScheduleItemsRaw as unknown as FeeScheduleItem[]

  // Fund type card state
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editDesc,   setEditDesc]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [fundFilter, setFundFilter] = useState<'all' | 'syndicate' | 'multi_manager' | 'eis' | 'both'>('all')

  // Fee schedule state
  const [expandedScheduleId,  setExpandedScheduleId]  = useState<string | null>(null)
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false)
  const [editingSchedule,     setEditingSchedule]     = useState<FeeSchedule | null>(null)
  const [showAddItemModal,    setShowAddItemModal]    = useState<string | null>(null)
  const [editingItem,         setEditingItem]         = useState<FeeScheduleItem | null>(null)

  const syndicateCount    = clients.filter(c => c.fund_type === 'syndicate').length
  const multiManagerCount = clients.filter(c => c.fund_type === 'multi_manager').length
  const eisCount          = clients.filter(c => c.fund_type === 'eis').length
  const bothCount         = clients.filter(c => c.fund_type === 'both').length

  function clientCountForCode(code: string) {
    if (code === 'syndicate')     return syndicateCount
    if (code === 'multi_manager') return multiManagerCount
    if (code === 'eis')           return eisCount
    return 0
  }

  function startEdit(ft: FundType) {
    setEditingId(ft.id)
    setEditDesc(ft.description ?? '')
  }

  async function saveDesc(id: string) {
    setSaving(true)
    await supabase.from('fund_types').update({ description: editDesc }).eq('id', id)
    setSaving(false)
    setEditingId(null)
    router.refresh()
  }

  async function saveFeeSchedule(ftId: string, scheduleId: string | null) {
    await supabase
      .from('fund_types')
      .update({ default_fee_schedule_id: scheduleId })
      .eq('id', ftId)
    router.refresh()
  }

  async function deactivateItem(itemId: string) {
    await supabase.from('fee_schedule_items').update({ active: false }).eq('id', itemId)
    router.refresh()
  }

  const filteredClients = fundFilter === 'all'
    ? clients
    : clients.filter(c => c.fund_type === fundFilter)

  const activeFeeSchedules = feeSchedules.filter(s => s.active)

  const thSt: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: '#888', textAlign: 'left', padding: '7px 12px', borderBottom: '0.5px solid #e8e7e0' }
  const tdSt: React.CSSProperties = { fontSize: 12, padding: '7px 12px', borderBottom: '0.5px solid #f5f5f2', verticalAlign: 'middle' }

  function cardAccent(code: string): string {
    if (code === 'multi_manager') return '#e8a820'
    if (code === 'eis')           return '#7c5cbf'
    return '#1d9e75'
  }

  function fundTypeBadgeStyle(code: string): React.CSSProperties {
    if (code === 'multi_manager') return { background: '#fff3e0', color: '#e0952a', fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600 }
    if (code === 'eis')           return { background: '#f0eaff', color: '#7c5cbf', fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600 }
    return { background: '#e8f5f0', color: '#1d9e75', fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600 }
  }

  return (
    <>
      <div style={{ maxWidth: 1100 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
          <Link href="/settings" style={{ color: '#888', textDecoration: 'none' }}>Settings</Link>
          {' › '}Fund management
        </div>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>Fund management</h1>
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
            Fund types, fee schedules, and client assignments.
          </p>
        </div>

        {/* Note */}
        <div style={{ background: '#f0f4fa', border: '0.5px solid #c0d0e8', borderRadius: 8, padding: '10px 16px', marginBottom: 24, fontSize: 12, color: '#1a3a6a' }}>
          Multi Manager is closed to new clients. All new clients are onboarded as Syndicate or EIS Fund.
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

          {/* ── Left column: Fund types ── */}
          <div style={{ width: 360, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', marginBottom: 12 }}>Fund types</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {fundTypes.map(ft => (
                <div key={ft.id} style={{
                  background: '#fff',
                  border: `1px solid ${cardAccent(ft.code)}22`,
                  borderRadius: 10,
                  padding: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f2744' }}>{ft.name}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{clientCountForCode(ft.code)} clients</div>
                    </div>
                    <span style={fundTypeBadgeStyle(ft.code)}>
                      {ft.code === 'syndicate' ? 'S' : ft.code === 'multi_manager' ? 'MM' : 'EIS'}
                    </span>
                  </div>

                  {/* Default fee schedule selector */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4, fontWeight: 500 }}>Default fee schedule</div>
                    <select
                      value={ft.default_fee_schedule_id ?? ''}
                      onChange={e => saveFeeSchedule(ft.id, e.target.value || null)}
                      style={{
                        width: '100%', padding: '5px 8px', fontSize: 12,
                        border: '0.5px solid #d0d0c8', borderRadius: 5,
                        background: '#fff', color: '#0f2744',
                        fontFamily: 'inherit',
                      }}
                    >
                      <option value="">None assigned</option>
                      {activeFeeSchedules.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Description (editable) */}
                  {editingId === ft.id ? (
                    <div>
                      <textarea
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        rows={3}
                        style={{
                          width: '100%', padding: '7px 10px', fontSize: 12,
                          border: '0.5px solid #d0d0c8', borderRadius: 5,
                          outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 11, padding: '4px 12px' }}
                          disabled={saving}
                          onClick={() => saveDesc(ft.id)}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 11, color: '#888', fontStyle: ft.description ? 'normal' : 'italic' }}>
                        {ft.description || 'No additional description'}
                      </div>
                      <button
                        onClick={() => startEdit(ft)}
                        style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        Edit desc
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Client summary table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>
                  Clients
                  <span style={{ fontWeight: 400, color: '#888', marginLeft: 8, fontSize: 11 }}>
                    {syndicateCount} S · {multiManagerCount} MM · {eisCount} EIS
                    {bothCount > 0 ? ` · ${bothCount} Both` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {(['all', 'syndicate', 'multi_manager', 'eis', 'both'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFundFilter(f)}
                      style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer',
                        background: fundFilter === f ? '#0f2744' : '#f5f5f2',
                        color:      fundFilter === f ? '#fff' : '#555',
                        fontWeight: fundFilter === f ? 600 : 400,
                      }}
                    >
                      {f === 'all' ? 'All' : f === 'syndicate' ? 'S' : f === 'multi_manager' ? 'MM' : f === 'eis' ? 'EIS' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>

              {filteredClients.length === 0 ? (
                <div style={{ padding: '20px 14px', textAlign: 'center', color: '#888', fontSize: 12 }}>
                  No clients in this category
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9f9f7' }}>
                      <th style={thSt}>Client</th>
                      <th style={thSt}>Fund type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map(client => (
                      <tr key={client.id}>
                        <td style={tdSt}>
                          <Link href={`/clients/${client.id}`} style={{ color: '#0f2744', textDecoration: 'none', fontWeight: 500 }}>
                            {client.full_name}
                          </Link>
                        </td>
                        <td style={tdSt}>
                          <FundTypePill code={client.fund_type} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Right column: Fee schedules ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Fee schedules</div>
              <button
                className="btn btn-primary"
                style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => { setEditingSchedule(null); setShowAddScheduleModal(true) }}
              >
                + Add schedule
              </button>
            </div>

            {feeSchedules.length === 0 ? (
              <div style={{ background: '#f9f9f7', border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '32px 20px', textAlign: 'center', color: '#888', fontSize: 12 }}>
                No fee schedules yet. Add one to assign to fund types.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {feeSchedules.map(schedule => {
                  const items        = feeScheduleItems.filter(i => i.fee_schedule_id === schedule.id && i.active)
                  const allItems     = feeScheduleItems.filter(i => i.fee_schedule_id === schedule.id)
                  const isExpanded   = expandedScheduleId === schedule.id

                  return (
                    <div key={schedule.id} style={{
                      background: '#fff',
                      border: '0.5px solid #e8e7e0',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}>
                      {/* Schedule header row */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                        onClick={() => setExpandedScheduleId(isExpanded ? null : schedule.id)}
                      >
                        <div style={{ fontSize: 11, color: '#888', width: 12, flexShrink: 0 }}>
                          {isExpanded ? '▾' : '▸'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>{schedule.name}</span>
                            {!schedule.active && (
                              <span className="pill pill-grey" style={{ fontSize: 10 }}>Inactive</span>
                            )}
                            <span style={{ fontSize: 10, color: '#888' }}>
                              {items.length} item{items.length !== 1 ? 's' : ''}
                              {allItems.length > items.length ? ` (${allItems.length - items.length} inactive)` : ''}
                            </span>
                          </div>
                          {schedule.description && (
                            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{schedule.description}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setEditingSchedule(schedule); setShowAddScheduleModal(true) }}
                            style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setEditingItem(null); setShowAddItemModal(schedule.id) }}
                            style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            + Item
                          </button>
                        </div>
                      </div>

                      {/* Expanded items table */}
                      {isExpanded && (
                        <div style={{ borderTop: '0.5px solid #e8e7e0' }}>
                          {items.length === 0 ? (
                            <div style={{ padding: '16px 14px', fontSize: 12, color: '#888', fontStyle: 'italic' }}>
                              No active items.{' '}
                              <button
                                onClick={() => { setEditingItem(null); setShowAddItemModal(schedule.id) }}
                                style={{ color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0 }}
                              >
                                Add one
                              </button>
                            </div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f9f9f7' }}>
                                  <th style={thSt}>Ord</th>
                                  <th style={thSt}>Label</th>
                                  <th style={thSt}>Fee type</th>
                                  <th style={thSt}>Basis</th>
                                  <th style={{ ...thSt, textAlign: 'right' }}>Rate</th>
                                  <th style={thSt}>Cap</th>
                                  <th style={thSt}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map(item => (
                                  <tr key={item.id}>
                                    <td style={{ ...tdSt, color: '#aaa' }}>{item.display_order}</td>
                                    <td style={{ ...tdSt, fontWeight: 500 }}>{item.label}</td>
                                    <td style={{ ...tdSt, color: '#555' }}>{FEE_TYPE_LABELS[item.fee_type] ?? item.fee_type}</td>
                                    <td style={{ ...tdSt, color: '#555' }}>{BASIS_LABELS[item.basis] ?? item.basis}</td>
                                    <td style={{ ...tdSt, textAlign: 'right' }}>
                                      {item.basis === 'fixed'
                                        ? `£${Number(item.rate).toLocaleString()}`
                                        : `${Number(item.rate)}%`}
                                    </td>
                                    <td style={{ ...tdSt, color: '#888', fontSize: 11 }}>
                                      {item.cap_rate != null
                                        ? `${item.cap_rate}%${item.cap_years ? ` / ${item.cap_years}y` : ''}`
                                        : <span style={{ color: '#ccc' }}>—</span>}
                                    </td>
                                    <td style={{ ...tdSt, whiteSpace: 'nowrap' }}>
                                      <button
                                        onClick={() => { setEditingItem(item); setShowAddItemModal(item.fee_schedule_id) }}
                                        style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8 }}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => deactivateItem(item.id)}
                                        style={{ fontSize: 11, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer' }}
                                      >
                                        Remove
                                      </button>
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
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit fee schedule modal */}
      {showAddScheduleModal && (
        <AddEditFeeScheduleModal
          schedule={editingSchedule}
          onClose={() => { setShowAddScheduleModal(false); setEditingSchedule(null) }}
          onSaved={() => { setShowAddScheduleModal(false); setEditingSchedule(null); router.refresh() }}
        />
      )}

      {/* Add/Edit fee schedule item modal */}
      {showAddItemModal && (
        <AddEditFeeScheduleItemModal
          feeScheduleId={showAddItemModal}
          item={editingItem}
          onClose={() => { setShowAddItemModal(null); setEditingItem(null) }}
          onSaved={() => { setShowAddItemModal(null); setEditingItem(null); router.refresh() }}
        />
      )}
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FundTypePill({ code }: { code: string }) {
  const isMM   = code === 'multi_manager'
  const isEIS  = code === 'eis'
  const isBoth = code === 'both'
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
      background: isMM ? '#fff3e0' : isEIS ? '#f0eaff' : isBoth ? '#f0f0ec' : '#e8f5f0',
      color:      isMM ? '#e0952a' : isEIS ? '#7c5cbf' : isBoth ? '#555'    : '#1d9e75',
    }}>
      {isMM ? 'Multi Manager' : isEIS ? 'EIS Fund' : isBoth ? 'Both' : 'Syndicate'}
    </span>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────────

function AddEditFeeScheduleModal({
  schedule,
  onClose,
  onSaved,
}: {
  schedule: FeeSchedule | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [name,   setName]   = useState(schedule?.name ?? '')
  const [desc,   setDesc]   = useState(schedule?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    if (schedule) {
      const { error: err } = await supabase
        .from('fee_schedules')
        .update({ name: name.trim(), description: desc.trim() || null })
        .eq('id', schedule.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase
        .from('fee_schedules')
        .insert({ name: name.trim(), description: desc.trim() || null })
      if (err) { setError(err.message); setSaving(false); return }
    }
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 400, maxWidth: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>
          {schedule ? 'Edit fee schedule' : 'Add fee schedule'}
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 5 }}>Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Standard Syndicate Fees"
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '0.5px solid #d0d0c8', borderRadius: 5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 5 }}>Description</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              placeholder="Optional description"
              style={{ width: '100%', padding: '7px 10px', fontSize: 12, border: '0.5px solid #d0d0c8', borderRadius: 5, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
          {error && <div style={{ fontSize: 12, color: '#c0392b', marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 12 }} disabled={saving}>
              {saving ? 'Saving…' : schedule ? 'Save changes' : 'Create schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddEditFeeScheduleItemModal({
  feeScheduleId,
  item,
  onClose,
  onSaved,
}: {
  feeScheduleId: string
  item: FeeScheduleItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [label,        setLabel]        = useState(item?.label ?? '')
  const [feeType,      setFeeType]      = useState(item?.fee_type ?? 'buy')
  const [basis,        setBasis]        = useState(item?.basis ?? 'percentage_of_cost')
  const [rate,         setRate]         = useState(item?.rate != null ? String(item.rate) : '')
  const [capRate,      setCapRate]      = useState(item?.cap_rate != null ? String(item.cap_rate) : '')
  const [capYears,     setCapYears]     = useState(item?.cap_years != null ? String(item.cap_years) : '')
  const [displayOrder, setDisplayOrder] = useState(item?.display_order != null ? String(item.display_order) : '0')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim())    { setError('Label is required'); return }
    if (rate === '')      { setError('Rate is required'); return }
    setSaving(true)
    setError(null)

    const payload = {
      fee_schedule_id: feeScheduleId,
      label:           label.trim(),
      fee_type:        feeType,
      basis,
      rate:            parseFloat(rate),
      cap_rate:        capRate  !== '' ? parseFloat(capRate)   : null,
      cap_years:       capYears !== '' ? parseInt(capYears, 10) : null,
      display_order:   parseInt(displayOrder, 10) || 0,
    }

    if (item) {
      const { error: err } = await supabase.from('fee_schedule_items').update(payload).eq('id', item.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('fee_schedule_items').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    onSaved()
  }

  const inputSt: React.CSSProperties = {
    width: '100%', padding: '6px 9px', fontSize: 12, border: '0.5px solid #d0d0c8',
    borderRadius: 5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 480, maxWidth: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>
          {item ? 'Edit fee item' : 'Add fee item'}
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSt}>Label *</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Entry fee" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Fee type *</label>
              <select value={feeType} onChange={e => setFeeType(e.target.value)} style={inputSt}>
                <option value="buy">Buy fee</option>
                <option value="exit_profit_share">Exit profit share</option>
                <option value="annual_management">Annual management</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label style={labelSt}>Basis *</label>
              <select value={basis} onChange={e => setBasis(e.target.value)} style={inputSt}>
                <option value="percentage_of_profit">% of profit</option>
                <option value="percentage_of_cost">% of cost</option>
                <option value="percentage_of_proceeds">% of proceeds</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
            <div>
              <label style={labelSt}>Rate * {basis === 'fixed' ? '(£)' : '(%)'}</label>
              <input type="number" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Display order</label>
              <input type="number" step="1" value={displayOrder} onChange={e => setDisplayOrder(e.target.value)} placeholder="0" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Cap rate (%)</label>
              <input type="number" step="0.0001" value={capRate} onChange={e => setCapRate(e.target.value)} placeholder="Optional" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Cap years</label>
              <input type="number" step="1" value={capYears} onChange={e => setCapYears(e.target.value)} placeholder="Optional" style={inputSt} />
            </div>
          </div>
          {error && <div style={{ fontSize: 12, color: '#c0392b', marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 12 }} disabled={saving}>
              {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
