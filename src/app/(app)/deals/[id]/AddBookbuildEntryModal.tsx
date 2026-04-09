'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client, BookbuildEntry } from './BookbuildSection'
import type { DealInfo } from './DealDetail'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  bookbuildId:         string
  companyId:           string
  clients:             Client[]
  existingClientIds:   string[]
  dealInfo:            DealInfo
  completionChecklist: Record<string, unknown> | null
  entry?:              BookbuildEntry
  onClose:             () => void
  onSaved:             () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'interested', label: 'Interested' },
  { value: 'confirmed',  label: 'Confirmed'  },
  { value: 'rejected',   label: 'Rejected'   },
  { value: 'withdrawn',  label: 'Withdrawn'  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function AddBookbuildEntryModal({ bookbuildId, companyId, clients, existingClientIds, dealInfo, completionChecklist, entry, onClose, onSaved }: Props) {
  const isEditMode     = !!entry
  const previousStatus = entry?.status ?? 'interested'   // status at modal open — for direction detection
  const supabase       = createClient()

  // Investor (locked in edit mode)
  const [clientId,       setClientId]       = useState(entry?.client_id ?? '')
  const [clientName,     setClientName]      = useState(entry?.client_name ?? '')
  const [clientSearch,   setClientSearch]    = useState('')
  const [showClientDrop, setShowClientDrop]  = useState(false)
  const [dupError,       setDupError]        = useState(false)
  const clientInputRef = useRef<HTMLInputElement>(null)

  // Investing vehicle
  const [vehicleId,       setVehicleId]       = useState(entry?.investing_vehicle_id ?? '')
  const [vehicleName,     setVehicleName]      = useState(entry?.investing_vehicle_name ?? '')
  const [vehicleSearch,   setVehicleSearch]    = useState('')
  const [showVehicleDrop, setShowVehicleDrop]  = useState(false)
  const [linkedVehicles,  setLinkedVehicles]   = useState<Client[]>([])
  const [loadingVehicles, setLoadingVehicles]  = useState(false)

  // Amount + shares (bidirectional)
  const sharePrice = dealInfo.sharePrice ?? 0
  const hasSharePrice = sharePrice > 0

  const [indicativeAmount, setIndicativeAmount] = useState(
    entry?.indicative_amount != null ? String(entry.indicative_amount) : '',
  )
  const [indicativeShares, setIndicativeShares] = useState(
    entry?.indicative_shares != null ? String(Math.round(entry.indicative_shares)) : '',
  )

  function snapToWholeShares(rawAmount: string): { amount: string; shares: string } {
    if (!rawAmount || !hasSharePrice) return { amount: rawAmount, shares: '' }
    const num = parseFloat(rawAmount.replace(/,/g, ''))
    if (isNaN(num)) return { amount: rawAmount, shares: '' }
    const wholeShares   = Math.round(num / sharePrice)
    const canonicalAmt  = wholeShares * sharePrice
    return {
      amount: canonicalAmt.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      shares: String(wholeShares),
    }
  }

  function handleAmountChange(val: string) {
    // While typing, just store the raw value — recalculate shares live but don't snap yet
    setIndicativeAmount(val)
    if (hasSharePrice && val) {
      const num    = parseFloat(val.replace(/,/g, ''))
      const shares = Math.round(num / sharePrice)
      setIndicativeShares(isNaN(shares) ? '' : String(shares))
    } else {
      setIndicativeShares('')
    }
  }

  function handleAmountBlur() {
    // Snap to canonical whole-share amount on blur
    const { amount, shares } = snapToWholeShares(indicativeAmount)
    setIndicativeAmount(amount)
    if (shares) setIndicativeShares(shares)
  }

  function handleAmountFocus() {
    // Strip formatting so the user can edit the raw number
    setIndicativeAmount(indicativeAmount.replace(/,/g, ''))
  }

  function handleSharesChange(val: string) {
    if (!val) { setIndicativeShares(''); setIndicativeAmount(''); return }
    const wholeShares  = Math.round(parseFloat(val))
    if (isNaN(wholeShares)) { setIndicativeShares(''); setIndicativeAmount(''); return }
    const canonicalAmt = wholeShares * sharePrice
    setIndicativeShares(String(wholeShares))
    setIndicativeAmount(
      hasSharePrice
        ? canonicalAmt.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '',
    )
  }

  const [status,  setStatus]  = useState(entry?.status ?? 'interested')
  const [notes,   setNotes]   = useState(entry?.notes ?? '')
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState('')
  const [unconfirmWarning, setUnconfirmWarning] = useState(false)
  const [pendingSave,      setPendingSave]      = useState(false)

  // In edit mode, fetch linked vehicles for the pre-selected investor on mount
  useEffect(() => {
    if (isEditMode && entry?.client_id) {
      fetchLinkedVehicles(entry.client_id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After user confirms the un-confirm warning, re-trigger the save
  useEffect(() => {
    if (pendingSave) {
      handleSubmit({ preventDefault: () => {} } as React.FormEvent)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSave])

  async function fetchLinkedVehicles(investorId: string) {
    setLoadingVehicles(true)
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, email, default_fee_rate, fund_type')
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
    setDupError(existingClientIds.includes(c.id))
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
    setDupError(false)
    setTimeout(() => clientInputRef.current?.focus(), 0)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!clientId) { setError('Please select an investor'); return }

    const perInvestor = (completionChecklist?.per_investor ?? {}) as Record<string, Record<string, boolean>>
    const appSigned   = perInvestor[clientId]?.app_signed === true

    // Un-confirm guard: moving away from 'confirmed'
    if (isEditMode && previousStatus === 'confirmed' && status !== 'confirmed') {
      if (appSigned && !pendingSave) {
        setUnconfirmWarning(true)
        return
      }
    }

    // Amount-change guard: staying 'confirmed' but amount/shares changed
    const amount  = indicativeAmount ? parseFloat(indicativeAmount.replace(/,/g, '')) : null
    const shares  = indicativeShares ? Math.round(parseFloat(indicativeShares))       : null
    const isAmountChanging = isEditMode && previousStatus === 'confirmed' && status === 'confirmed'
      && (amount !== (entry?.indicative_amount ?? null) || shares !== (entry?.indicative_shares ?? null))
    if (isAmountChanging && appSigned && !pendingSave) {
      setUnconfirmWarning(true)
      return
    }

    setPendingSave(false)
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (isEditMode && entry) {
      const { error: dbErr } = await supabase
        .from('bookbuild_entries')
        .update({
          investing_vehicle_id: vehicleId || null,
          indicative_amount:    amount,
          indicative_shares:    shares,
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
          indicative_shares:    shares,
          status,
          notes:                notes.trim() || null,
          created_by:           user?.id ?? null,
          updated_at:           new Date().toISOString(),
        })

      if (dbErr) { setError(dbErr.message); setSaving(false); return }
    }

    // ── Side-effects based on status transition ────────────────────────────────

    const isConfirming   = status === 'confirmed' && previousStatus !== 'confirmed'
    const isUnconfirming = previousStatus === 'confirmed' && status !== 'confirmed'

    if (isConfirming) {
      const client          = clients.find(c => c.id === clientId)
      const feeRate         = client?.default_fee_rate ?? 0
      const sumSubscribed   = amount ?? 0
      const feeAmount       = sumSubscribed * feeRate / 100
      const sharesPurchased = shares ?? (sharePrice > 0 ? sumSubscribed / sharePrice : 0)

      // Upsert deal_investors — safe on re-confirm
      await supabase
        .from('deal_investors')
        .upsert(
          { deal_id: dealInfo.id, client_id: clientId, poa_held: false, signing_status: 'pending' },
          { onConflict: 'deal_id,client_id', ignoreDuplicates: true },
        )

      // Insert pending investment
      await supabase.from('investments').insert({
        client_id:            clientId,
        company_id:           dealInfo.companyId,
        deal_id:              dealInfo.id,
        bookbuild_id:         bookbuildId,
        share_class_id:       dealInfo.shareClassId  || null,
        share_class:          dealInfo.shareClass     || null,
        original_share_price: sharePrice,
        investment_date:      dealInfo.investmentDate || null,
        sum_subscribed:       sumSubscribed,
        shares_purchased:     sharesPurchased,
        eis_status:           dealInfo.eisQualifying  || 'tbc',
        transaction_type:     'buy',
        transaction_category: 'equity',
        status:               'pending',
        fund_type:            client?.fund_type ?? 'syndicate',
        fee_rate:             feeRate,
        fee_amount:           feeAmount,
        holding_location:     'direct',
      })
    }

    if (isUnconfirming) {
      await supabase.from('deal_investors').delete()
        .eq('deal_id', dealInfo.id).eq('client_id', clientId)
      await supabase.from('investments').delete()
        .eq('deal_id', dealInfo.id).eq('client_id', clientId).eq('status', 'pending')
    }

    if (isAmountChanging) {
      // Update the pending investment's amount and shares to match the new bookbuild figures
      await supabase.from('investments')
        .update({
          sum_subscribed:   amount ?? 0,
          shares_purchased: shares ?? (sharePrice > 0 ? (amount ?? 0) / sharePrice : 0),
        })
        .eq('deal_id', dealInfo.id)
        .eq('client_id', clientId)
        .eq('status', 'pending')
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
      <div className="card" style={{ width: 560, padding: '24px 28px' }}>
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

          {/* Amount + Shares + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelSt}>
                Amount <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 13, color: '#888', pointerEvents: 'none',
                }}>£</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={indicativeAmount}
                  onChange={e => handleAmountChange(e.target.value.replace(/,/g, ''))}
                  onBlur={handleAmountBlur}
                  onFocus={handleAmountFocus}
                  placeholder="0.00"
                  style={{ ...inputSt, paddingLeft: 24 }}
                />
              </div>
            </div>
            <div>
              <label style={labelSt}>
                Shares <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
              </label>
              {hasSharePrice ? (
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={indicativeShares}
                  onChange={e => handleSharesChange(e.target.value)}
                  placeholder="0"
                  style={inputSt}
                  onKeyDown={e => { if (e.key === '.') e.preventDefault() }}
                />
              ) : (
                <div style={{ ...inputSt, background: '#f9f9f7', color: '#aaa', fontSize: 11, cursor: 'not-allowed' }}>
                  Share price not set
                </div>
              )}
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

          {dupError && (
            <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>
              This investor is already in the bookbuild. Use the Edit button on their row to update their details.
            </p>
          )}
          {error && (
            <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || dupError}>
              {saving ? 'Saving…' : isEditMode ? 'Save changes' : 'Add investor'}
            </button>
          </div>
        </form>
      </div>

      {/* Un-confirm warning dialog */}
      {unconfirmWarning && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 8,
        }}>
          <div className="card" style={{ width: 360, padding: '24px 28px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f2744', marginBottom: 10 }}>
              Application form already signed
            </div>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.5, marginBottom: 20 }}>
              An application form has already been signed for this investor. To change their status, a new application form will be required.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUnconfirmWarning(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#a32d2d', borderColor: '#a32d2d' }}
                onClick={() => { setUnconfirmWarning(false); setPendingSave(true) }}
              >
                Proceed anyway
              </button>
            </div>
          </div>
        </div>
      )}
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
