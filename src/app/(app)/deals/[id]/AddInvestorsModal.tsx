'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClientFull, NomineeRow } from './dealUtils'

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Props {
  dealId:              string
  allClients:          ClientFull[]
  nominees:            NomineeRow[]
  existingInvestorIds: Set<string>
  onClose:             () => void
  onSaved:             () => void
}

type Screen    = 'picker' | 'entry'
type PickerTab = 'active' | 'other'

interface EntryRow {
  client:           ClientFull
  vehicleId:        string | null
  nomineeId:        string | null
  softCircleAmount: string
}

const KYC_DOT_COLOR: Record<string, string> = {
  verified:    '#1d9e75',
  renewal_due: '#ba7517',
  outstanding: '#a32d2d',
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AddInvestorsModal({
  dealId, allClients, nominees, existingInvestorIds, onClose, onSaved,
}: Props) {
  const supabase = createClient()

  const [screen,      setScreen]      = useState<Screen>('picker')
  const [pickerTab,   setPickerTab]   = useState<PickerTab>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [favourites,  setFavourites]  = useState<Set<string>>(
    new Set(allClients.filter(c => c.is_favourite).map(c => c.id)),
  )
  const [entryRows,   setEntryRows]   = useState<EntryRow[]>([])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Primary clients only (not vehicles)
  const primaryClients = useMemo(
    () => allClients.filter(c => c.lead_investor_id === null),
    [allClients],
  )

  function getVehicles(investorId: string): ClientFull[] {
    return allClients.filter(c => c.lead_investor_id === investorId)
  }

  // Active investors tab: favourited, not already in deal
  const activeInvestors = useMemo(
    () => primaryClients
      .filter(c => favourites.has(c.id) && !existingInvestorIds.has(c.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [primaryClients, favourites, existingInvestorIds],
  )

  // Other investors tab: all primaries not in deal, filtered by search
  const otherInvestors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return primaryClients
      .filter(c => !existingInvestorIds.has(c.id))
      .filter(c => !q || c.full_name.toLowerCase().includes(q))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [primaryClients, existingInvestorIds, searchQuery])

  function toggleSelect(clientId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  async function toggleFavourite(e: React.MouseEvent, clientId: string) {
    e.stopPropagation()
    const newVal = !favourites.has(clientId)
    setFavourites(prev => {
      const next = new Set(prev)
      if (newVal) next.add(clientId)
      else next.delete(clientId)
      return next
    })
    await supabase.from('clients').update({ is_favourite: newVal }).eq('id', clientId)
  }

  function handleNext() {
    if (selected.size === 0) return
    const rows: EntryRow[] = [...selected]
      .map(id => {
        const client = allClients.find(c => c.id === id)!
        return {
          client,
          vehicleId:        null,
          nomineeId:        client.default_nominee_id ?? null,
          softCircleAmount: '',
        }
      })
      .sort((a, b) => a.client.full_name.localeCompare(b.client.full_name))
    setEntryRows(rows)
    setScreen('entry')
  }

  function updateRow(idx: number, patch: Partial<EntryRow>) {
    setEntryRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const inserts = entryRows.map(r => ({
        deal_id:              dealId,
        client_id:            r.client.id,
        investing_vehicle_id: r.vehicleId ?? null,
        nominee_id:           r.nomineeId ?? null,
        soft_circle_amount:   r.softCircleAmount ? Number(r.softCircleAmount) : null,
        lifecycle_status:     'soft_circled',
        fee_overridden:       false,
        poa_held:             false,
      }))

      const { error: insertError } = await supabase.from('deal_investors').insert(inserts)

      if (insertError) {
        setError(
          insertError.code === '23505'
            ? 'One or more investors are already in this deal.'
            : insertError.message,
        )
        return
      }

      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const displayedList = pickerTab === 'active' ? activeInvestors : otherInvestors

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12,
        width: 860, maxHeight: '82vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '0.5px solid var(--card-border)',
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f2744' }}>
            {screen === 'picker' ? 'Add investors' : 'Set amounts'}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 22, color: '#888', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Screen 1: Picker ── */}
        {screen === 'picker' && (
          <>
            {/* Tabs */}
            <div style={{
              display: 'flex', borderBottom: '0.5px solid var(--card-border)',
              padding: '0 24px',
            }}>
              {(['active', 'other'] as PickerTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setPickerTab(tab)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '12px 16px 10px',
                    borderBottom: pickerTab === tab ? '2px solid var(--teal)' : '2px solid transparent',
                    marginBottom: -1,
                    color: pickerTab === tab ? 'var(--teal)' : '#666',
                    fontWeight: pickerTab === tab ? 600 : 400,
                    fontSize: 13,
                  }}
                >
                  {tab === 'active' ? 'Active investors' : 'Other investors'}
                </button>
              ))}
            </div>

            {/* Search (other tab only) */}
            {pickerTab === 'other' && (
              <div style={{ padding: '12px 24px 0' }}>
                <input
                  type="text"
                  placeholder="Search by name…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%', padding: '8px 12px',
                    border: '0.5px solid var(--card-border)',
                    borderRadius: 6, fontSize: 13, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px' }}>
              {displayedList.length === 0 ? (
                <div style={{
                  textAlign: 'center', color: '#999', fontSize: 13,
                  padding: '40px 0',
                }}>
                  {pickerTab === 'active'
                    ? 'No active investors. Star a client below to pin them here.'
                    : 'No results.'}
                </div>
              ) : (
                displayedList.map(client => (
                  <div
                    key={client.id}
                    onClick={() => toggleSelect(client.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 0',
                      borderBottom: '0.5px solid #f0f0ec',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(client.id)}
                      onChange={() => toggleSelect(client.id)}
                      onClick={e => e.stopPropagation()}
                      style={{ accentColor: 'var(--teal)', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{
                      fontSize: 13, flex: 1,
                      fontWeight: 500, color: '#0f2744',
                    }}>
                      {client.full_name}
                    </span>
                    <button
                      onClick={e => toggleFavourite(e, client.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 18, lineHeight: 1, padding: '0 4px',
                        color: favourites.has(client.id) ? '#f0a500' : '#ddd',
                      }}
                      title={favourites.has(client.id) ? 'Remove from Active investors' : 'Pin to Active investors'}
                    >
                      ★
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px',
              borderTop: '0.5px solid var(--card-border)',
            }}>
              <span style={{ fontSize: 13, color: '#888' }}>
                {selected.size} selected
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 13 }}>
                  Cancel
                </button>
                <button
                  onClick={handleNext}
                  disabled={selected.size === 0}
                  className="btn btn-primary"
                  style={{ fontSize: 13, opacity: selected.size === 0 ? 0.5 : 1 }}
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Screen 2: Bulk entry ── */}
        {screen === 'entry' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {error && (
                <div style={{
                  marginBottom: 12, padding: '8px 12px',
                  background: '#fef2f2', border: '0.5px solid #fca5a5',
                  borderRadius: 6, fontSize: 12, color: '#a32d2d',
                }}>
                  {error}
                </div>
              )}

              {/* Column labels */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 148px 148px 120px',
                marginBottom: 4,
              }}>
                {['Investor', 'Vehicle', 'Location', 'Soft-circle (£)'].map(h => (
                  <div key={h} style={{
                    fontSize: 10, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: '#aaa', padding: '0 8px 6px',
                  }}>
                    {h}
                  </div>
                ))}
              </div>

              {entryRows.map((row, idx) => {
                const vehicles   = getVehicles(row.client.id)
                const kycColor   = KYC_DOT_COLOR[row.client.kyc_status] ?? '#ccc'

                return (
                  <div
                    key={row.client.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 148px 148px 120px',
                      alignItems: 'center',
                      borderTop: '0.5px solid #f0f0ec',
                      padding: '8px 0',
                    }}
                  >
                    {/* Investor name + KYC dot */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '0 8px',
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: kycColor, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#0f2744' }}>
                        {row.client.full_name}
                      </span>
                    </div>

                    {/* Vehicle dropdown */}
                    <div style={{ padding: '0 8px' }}>
                      {vehicles.length > 0 ? (
                        <select
                          value={row.vehicleId ?? ''}
                          onChange={e => updateRow(idx, { vehicleId: e.target.value || null })}
                          style={{
                            width: '100%', padding: '6px 8px',
                            border: '0.5px solid var(--card-border)',
                            borderRadius: 6, fontSize: 12, outline: 'none',
                          }}
                        >
                          <option value="">Own name</option>
                          {vehicles.map(v => (
                            <option key={v.id} value={v.id}>{v.full_name}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: 12, color: '#aaa', paddingLeft: 4 }}>Own name</span>
                      )}
                    </div>

                    {/* Location dropdown */}
                    <div style={{ padding: '0 8px' }}>
                      <select
                        value={row.nomineeId ?? ''}
                        onChange={e => updateRow(idx, { nomineeId: e.target.value || null })}
                        style={{
                          width: '100%', padding: '6px 8px',
                          border: '0.5px solid var(--card-border)',
                          borderRadius: 6, fontSize: 12, outline: 'none',
                        }}
                      >
                        <option value="">Direct</option>
                        {nominees.map(n => (
                          <option key={n.id} value={n.id}>{n.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Soft-circle amount */}
                    <div style={{ padding: '0 8px' }}>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        placeholder="0"
                        value={row.softCircleAmount}
                        onChange={e => updateRow(idx, { softCircleAmount: e.target.value })}
                        style={{
                          width: '100%', padding: '6px 8px',
                          border: '0.5px solid var(--card-border)',
                          borderRadius: 6, fontSize: 12,
                          outline: 'none', boxSizing: 'border-box',
                          textAlign: 'right',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px',
              borderTop: '0.5px solid var(--card-border)',
            }}>
              <button
                onClick={() => setScreen('picker')}
                className="btn btn-secondary"
                style={{ fontSize: 13 }}
              >
                ← Back
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 13 }}>
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ fontSize: 13, opacity: saving ? 0.5 : 1 }}
                >
                  {saving ? 'Saving…' : `Add ${entryRows.length} investor${entryRows.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
