'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client, BookbuildEntry } from './BookbuildSection'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  bookbuildId: string
  companyId:   string
  clients:     Client[]
  entry?:      BookbuildEntry    // undefined = add mode
  onClose:     () => void
  onSaved:     () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'interested', label: 'Interested' },
  { value: 'confirmed',  label: 'Confirmed'  },
  { value: 'rejected',   label: 'Rejected'   },
  { value: 'withdrawn',  label: 'Withdrawn'  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function AddBookbuildEntryModal({ bookbuildId, companyId, clients, entry, onClose, onSaved }: Props) {
  const isEditMode = !!entry
  const supabase   = createClient()

  // Investor (locked in edit mode)
  const [clientId,       setClientId]       = useState(entry?.client_id ?? '')
  const [clientName,     setClientName]      = useState(entry?.client_name ?? '')
  const [clientSearch,   setClientSearch]    = useState('')
  const [showClientDrop, setShowClientDrop]  = useState(false)
  const clientInputRef = useRef<HTMLInputElement>(null)

  // Investing vehicle
  const [vehicleId,       setVehicleId]       = useState(entry?.investing_vehicle_id ?? '')
  const [vehicleName,     setVehicleName]      = useState(entry?.investing_vehicle_name ?? '')
  const [vehicleSearch,   setVehicleSearch]    = useState('')
  const [showVehicleDrop, setShowVehicleDrop]  = useState(false)
  const [linkedVehicles,  setLinkedVehicles]   = useState<Client[]>([])
  const [loadingVehicles, setLoadingVehicles]  = useState(false)

  // Other fields
  const [indicativeAmount, setIndicativeAmount] = useState(
    entry?.indicative_amount != null ? String(entry.indicative_amount) : '',
  )
  const [status,  setStatus]  = useState(entry?.status ?? 'interested')
  const [notes,   setNotes]   = useState(entry?.notes ?? '')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  // In edit mode, fetch linked vehicles for the pre-selected investor on mount
  useEffect(() => {
    if (isEditMode && entry?.client_id) {
      fetchLinkedVehicles(entry.client_id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchLinkedVehicles(investorId: string) {
    setLoadingVehicles(true)
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, email')
      .eq('lead_investor_id', investorId)
      .order('full_name')
    setLinkedVehicles(data ?? [])
    setLoadingVehicles(false)
  }

  const filteredClients  = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()),
  )
  const filteredVehicles = linkedVehicles.filter(c =>
    c.full_name.toLowerCase().includes(vehicleSearch.toLowerCase()),
  )

  function selectClient(c: Client) {
    setClientId(c.id)
    setClientName(c.full_name)
    setClientSearch('')
    setShowClientDrop(false)
    // Reset vehicle and fetch linked entities for this investor
    setVehicleId('')
    setVehicleName('')
    setVehicleSearch('')
    fetchLinkedVehicles(c.id)
  }

  function clearClient() {
    setClientId('')
    setClientName('')
    setClientSearch('')
    setTimeout(() => clientInputRef.current?.focus(), 0)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!clientId) { setError('Please select an investor'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const amount = indicativeAmount ? parseFloat(indicativeAmount) : null

    if (isEditMode && entry) {
      const { error: dbErr } = await supabase
        .from('bookbuild_entries')
        .update({
          investing_vehicle_id: vehicleId || null,
          indicative_amount:    amount,
          status,
          notes:                notes.trim() || null,
          updated_by:           user?.id ?? null,
          updated_at:           new Date().toISOString(),
        })
        .eq('id', entry.id)

      if (dbErr) { setError(dbErr.message); setSaving(false); return }
    } else {
      const { error: dbErr } = await supabase
        .from('bookbuild_entries')
        .insert({
          bookbuild_id:         bookbuildId,
          company_id:           companyId,
          client_id:            clientId,
          investing_vehicle_id: vehicleId || null,
          indicative_amount:    amount,
          status,
          notes:                notes.trim() || null,
          created_by:           user?.id ?? null,
          updated_at:           new Date().toISOString(),
        })

      if (dbErr) { setError(dbErr.message); setSaving(false); return }
    }

    onSaved()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 440, padding: '24px 28px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px' }}>
          {isEditMode ? `Edit — ${entry.client_name}` : 'Add investor to bookbuild'}
        </h2>

        <form onSubmit={handleSubmit}>

          {/* Investor */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Investor *</label>
            {isEditMode ? (
              <div style={{ ...inputSt, background: '#f9f9f7', color: '#555' }}>
                {entry.client_name}
              </div>
            ) : clientId ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', border: '0.5px solid #d0d0c8',
                borderRadius: 5, background: '#f9f9f7',
              }}>
                <span style={{ flex: 1, fontSize: 13, color: '#0f2744', fontWeight: 500 }}>{clientName}</span>
                <button
                  type="button"
                  onClick={clearClient}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, padding: 0, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input
                  ref={clientInputRef}
                  type="text"
                  placeholder="Search investors…"
                  value={clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setShowClientDrop(true) }}
                  onFocus={() => setShowClientDrop(true)}
                  onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
                  style={inputSt}
                  autoComplete="off"
                  autoFocus
                />
                {showClientDrop && filteredClients.length > 0 && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
                    background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 5,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100,
                    maxHeight: 200, overflowY: 'auto',
                  }}>
                    {filteredClients.slice(0, 20).map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => selectClient(c)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '8px 12px', fontSize: 13, background: 'none',
                          border: 'none', borderBottom: '0.5px solid #f5f5f2',
                          cursor: 'pointer', color: '#333', fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f2')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        {c.full_name}
                        {c.email && <span style={{ color: '#aaa', marginLeft: 6, fontSize: 11 }}>{c.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Investing vehicle — only shown when the selected investor has linked entities */}
          {loadingVehicles && (
            <div style={{ marginBottom: 14, fontSize: 12, color: '#aaa' }}>Loading vehicles…</div>
          )}
          {!loadingVehicles && linkedVehicles.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelSt}>
                Investing vehicle{' '}
                <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
              </label>
              {vehicleId ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', border: '0.5px solid #d0d0c8',
                  borderRadius: 5, background: '#f9f9f7',
                }}>
                  <span style={{ flex: 1, fontSize: 13, color: '#0f2744', fontWeight: 500 }}>{vehicleName}</span>
                  <button
                    type="button"
                    onClick={() => { setVehicleId(''); setVehicleName(''); setVehicleSearch('') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, padding: 0, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search vehicles…"
                    value={vehicleSearch}
                    onChange={e => { setVehicleSearch(e.target.value); setShowVehicleDrop(true) }}
                    onFocus={() => setShowVehicleDrop(true)}
                    onBlur={() => setTimeout(() => setShowVehicleDrop(false), 150)}
                    style={inputSt}
                    autoComplete="off"
                  />
                  {showVehicleDrop && filteredVehicles.length > 0 && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
                      background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 5,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100,
                      maxHeight: 200, overflowY: 'auto',
                    }}>
                      {filteredVehicles.slice(0, 20).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => {
                            setVehicleId(c.id)
                            setVehicleName(c.full_name)
                            setVehicleSearch('')
                            setShowVehicleDrop(false)
                          }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '8px 12px', fontSize: 13, background: 'none',
                            border: 'none', borderBottom: '0.5px solid #f5f5f2',
                            cursor: 'pointer', color: '#333', fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f2')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          {c.full_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Amount + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelSt}>
                Indicative amount{' '}
                <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 13, color: '#888', pointerEvents: 'none',
                }}>
                  £
                </span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={indicativeAmount}
                  onChange={e => setIndicativeAmount(e.target.value)}
                  placeholder="0"
                  style={{ ...inputSt, paddingLeft: 24 }}
                />
              </div>
            </div>
            <div>
              <label style={labelSt}>Status *</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                style={inputSt}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelSt}>
              Notes{' '}
              <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Waiting on board approval"
              style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEditMode ? 'Save changes' : 'Add investor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 5,
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
  background: '#fff', fontFamily: 'inherit',
}
