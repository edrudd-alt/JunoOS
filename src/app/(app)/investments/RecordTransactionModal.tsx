'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client, Company } from '@/types'
import type { RawInvestment } from './ledgerUtils'
import { fmtAmt } from './ledgerUtils'

// ─── Modal-local helpers ───────────────────────────────────────────────────────

interface LocationRow {
  id: string
  location: string
  shares: string
  eis: string
  available?: number
}

function uid() { return Math.random().toString(36).slice(2) }

const BUY_LOCATIONS = ['Direct', 'Nominee', 'ISA', 'SIPP', 'Other']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4,
}

function F({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function clientDisplayName(client: Client, allClients: Client[]): string {
  if (!client.lead_investor_id) return client.full_name
  const lead = allClients.find(c => c.id === client.lead_investor_id)
  return lead ? `${lead.full_name} — ${client.full_name}` : client.full_name
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  companies: Company[]
  clients: Client[]
  investments: RawInvestment[]
  preset: { txType?: 'buy' | 'sell'; companyId?: string } | null
  onSave: (inv: RawInvestment[]) => void
  onClose: () => void
}

export function RecordTransactionModal({
  companies, clients, investments, preset, onSave, onClose,
}: Props) {
  const [modalType,    setModalType]    = useState<'buy' | 'sell' | 'transfer'>(preset?.txType ?? 'buy')
  const [companyId,    setCompanyId]    = useState(preset?.companyId ?? '')
  const [shareClass,   setShareClass]   = useState('')
  const [txDate,       setTxDate]       = useState(new Date().toISOString().slice(0, 10))
  const [price,        setPrice]        = useState('')
  const [heldBy,       setHeldBy]       = useState('')
  const [fromClient,   setFromClient]   = useState('')
  const [locationRows, setLocationRows] = useState<LocationRow[]>([
    { id: uid(), location: '', shares: '', eis: 'tbc' },
  ])
  const [toClient,   setToClient]   = useState('')
  const [toLocation, setToLocation] = useState('direct')
  const [xferType,   setXferType]   = useState<'commercial' | 'gift'>('commercial')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState('')

  const selectedCompany = companies.find(c => c.id === companyId)
  const shareClasses = Array.isArray(selectedCompany?.share_classes)
    ? selectedCompany!.share_classes as { name: string }[]
    : []

  const holdingsMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    if (!companyId) return map
    for (const inv of investments) {
      if (inv.company_id !== companyId) continue
      if (shareClass && inv.share_class !== shareClass) continue
      const { client_id, holding_location } = inv
      if (!map[client_id]) map[client_id] = {}
      if (!map[client_id][holding_location]) map[client_id][holding_location] = 0
      const tt = inv.transaction_type ?? 'buy'
      if (tt === 'buy'  || tt === 'transfer_in')  map[client_id][holding_location] += inv.shares_purchased
      if (tt === 'sell' || tt === 'transfer_out') map[client_id][holding_location] -= inv.shares_purchased
    }
    return map
  }, [investments, companyId, shareClass])

  const companyClientNet = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const inv of investments) {
      const { company_id, client_id, shares_purchased, transaction_type } = inv
      if (!map[company_id]) map[company_id] = {}
      if (!map[company_id][client_id]) map[company_id][client_id] = 0
      const tt = transaction_type ?? 'buy'
      if (tt === 'buy'  || tt === 'transfer_in')  map[company_id][client_id] += shares_purchased
      if (tt === 'sell' || tt === 'transfer_out') map[company_id][client_id] -= shares_purchased
    }
    return map
  }, [investments])

  const companiesWithHoldings = useMemo(() => {
    const set = new Set<string>()
    for (const [compId, clientMap] of Object.entries(companyClientNet)) {
      if (Object.values(clientMap).some(n => n > 0)) set.add(compId)
    }
    return set
  }, [companyClientNet])

  const sortedClients = useMemo(() => {
    const primaries = clients.filter(c => !c.lead_investor_id).sort((a, b) => a.full_name.localeCompare(b.full_name))
    const linked    = clients.filter(c =>  c.lead_investor_id).sort((a, b) => a.full_name.localeCompare(b.full_name))
    return [...primaries, ...linked]
  }, [clients])

  const eligibleInvestors = useMemo(() => {
    if (modalType === 'buy') return sortedClients
    return sortedClients.filter(c => Object.values(holdingsMap[c.id] ?? {}).some(n => n > 0))
  }, [modalType, sortedClients, holdingsMap])

  const activeClient = modalType === 'transfer' ? fromClient : heldBy

  useEffect(() => {
    if (modalType === 'buy') return
    if (!activeClient) { setLocationRows([]); return }
    const locs = holdingsMap[activeClient] ?? {}
    const rows: LocationRow[] = Object.entries(locs)
      .filter(([, n]) => n > 0)
      .map(([loc, available]) => ({ id: uid(), location: loc, shares: '', eis: 'tbc', available }))
    setLocationRows(rows)
  }, [activeClient, holdingsMap, modalType])

  const priceNum = parseFloat(price) || 0
  const totalAmount = locationRows.reduce((sum, row) => sum + (parseInt(row.shares) || 0) * priceNum, 0)

  function updateRow(id: string, field: keyof LocationRow, value: string) {
    setLocationRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function addRow() {
    setLocationRows(rows => [...rows, { id: uid(), location: '', shares: '', eis: 'tbc' }])
  }

  function removeRow(id: string) {
    setLocationRows(rows => rows.filter(r => r.id !== id))
  }

  const deferredFeeInfo = useMemo(() => {
    if (modalType !== 'sell' || !companyId || !heldBy) return null
    const today = new Date()
    const mmInvs = investments.filter(inv =>
      inv.company_id === companyId &&
      inv.client_id === heldBy &&
      inv.fund_type === 'multi_manager' &&
      (inv.transaction_type === 'buy' || inv.transaction_type === 'transfer_in')
    )
    if (mmInvs.length === 0) return null
    const totalMMCost   = mmInvs.reduce((s, i) => s + i.sum_subscribed, 0)
    const totalMMShares = mmInvs.reduce((s, i) => s + i.shares_purchased, 0)
    const earliest      = mmInvs.reduce((d, i) => i.investment_date < d ? i.investment_date : d, mmInvs[0].investment_date)
    const yearsHeld     = Math.max(0, (today.getTime() - new Date(earliest + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24 * 365))
    const feePct        = Math.min(yearsHeld * 2, 10)
    const totalSharesSelling = locationRows.reduce((s, r) => s + (parseInt(r.shares) || 0), 0)
    const costPerShare  = totalMMShares > 0 ? totalMMCost / totalMMShares : 0
    const costOfSharesSold = totalSharesSelling * costPerShare
    const feeAmount     = (feePct / 100) * costOfSharesSold
    return { feePct, feeAmount, yearsHeld, costOfSharesSold }
  }, [modalType, companyId, heldBy, investments, locationRows])

  const transferFundTypeMismatch = useMemo(() => {
    if (modalType !== 'transfer' || !fromClient || !toClient) return null
    const from = clients.find(c => c.id === fromClient)
    const to   = clients.find(c => c.id === toClient)
    if (!from || !to) return null
    const fromFt = from.fund_type
    const toFt   = to.fund_type
    const label = (ft: string) => ft === 'multi_manager' ? 'Multi Manager' : ft === 'both' ? 'Both' : 'Syndicate'
    if (fromFt !== toFt) return { fromLabel: label(fromFt), toLabel: label(toFt) }
    return null
  }, [modalType, fromClient, toClient, clients])

  const rowErrors = useMemo(() => {
    if (modalType === 'buy') return {} as Record<string, string>
    const errs: Record<string, string> = {}
    for (const row of locationRows) {
      const n = parseInt(row.shares) || 0
      if (n > 0 && row.available !== undefined && n > row.available) {
        errs[row.id] = `Only ${row.available.toLocaleString()} available`
      }
    }
    return errs
  }, [locationRows, modalType])

  const rowWarnings = useMemo(() => {
    if (modalType === 'buy') return {} as Record<string, string>
    const warns: Record<string, string> = {}
    for (const row of locationRows) {
      const n = parseInt(row.shares) || 0
      const avail = row.available ?? 0
      if (n > 0 && avail > 0 && !rowErrors[row.id]) {
        const remaining = avail - n
        if (remaining > 0 && remaining / avail < 0.01) {
          warns[row.id] = `Only ${remaining.toLocaleString()} share${remaining !== 1 ? 's' : ''} would remain (${((remaining / avail) * 100).toFixed(2)}%)`
        }
      }
    }
    return warns
  }, [locationRows, rowErrors, modalType])

  async function handleSave() {
    setErr('')
    if (!companyId)  { setErr('Select a company'); return }
    if (!shareClass) { setErr('Select a share class'); return }
    if (!price)      { setErr('Enter price per share'); return }

    if (modalType === 'buy' && !heldBy)        { setErr('Select who holds the shares'); return }
    if (modalType === 'sell' && !heldBy)        { setErr('Select who holds the shares'); return }
    if (modalType === 'transfer' && !fromClient){ setErr('Select the transferring party'); return }
    if (modalType === 'transfer' && !toClient)  { setErr('Select the recipient'); return }

    const filledRows = locationRows.filter(r => r.location && parseInt(r.shares) > 0)
    if (filledRows.length === 0) { setErr('Enter shares for at least one location'); return }
    if (Object.keys(rowErrors).length > 0) {
      setErr('One or more rows exceed available shares — correct before saving')
      return
    }

    setSaving(true)
    const supabase = createClient()

    const base = {
      company_id:           companyId,
      share_class:          shareClass,
      investment_date:      txDate,
      original_share_price: priceNum,
      status:               'active',
      notes:                notes || null,
    }

    let rows: Record<string, unknown>[]

    if (modalType === 'transfer') {
      rows = filledRows.flatMap(r => {
        const sharesNum = parseInt(r.shares)
        return [
          {
            ...base,
            client_id:                fromClient,
            transaction_type:         'transfer_out',
            holding_location:         r.location,
            eis_status:               r.eis,
            shares_purchased:         sharesNum,
            sum_subscribed:           sharesNum * priceNum,
            transfer_counterparty_id: toClient,
            transfer_type:            xferType,
          },
          {
            ...base,
            client_id:                toClient,
            transaction_type:         'transfer_in',
            holding_location:         toLocation,
            eis_status:               r.eis,
            shares_purchased:         sharesNum,
            sum_subscribed:           sharesNum * priceNum,
            transfer_counterparty_id: fromClient,
            transfer_type:            xferType,
            cost_basis:               xferType === 'gift' ? priceNum : null,
          },
        ]
      })
    } else {
      rows = filledRows.map(r => {
        const sharesNum = parseInt(r.shares)
        return {
          ...base,
          client_id:        heldBy,
          transaction_type: modalType,
          holding_location: r.location,
          eis_status:       r.eis,
          shares_purchased: sharesNum,
          sum_subscribed:   sharesNum * priceNum,
        }
      })
    }

    const { data, error } = await supabase
      .from('investments')
      .insert(rows)
      .select(`
        id, client_id, company_id, share_class, investment_date,
        original_share_price, shares_purchased, sum_subscribed,
        eis_status, holding_entity, holding_location, status,
        transaction_type, cost_basis, transfer_counterparty_id, transfer_type, notes,
        companies (id, name)
      `)

    setSaving(false)
    if (error) { setErr(error.message); return }
    onSave((data ?? []) as unknown as RawInvestment[])
  }

  const typeBtn = (t: 'buy' | 'sell' | 'transfer'): React.CSSProperties => ({
    flex: 1, padding: '8px 0', fontSize: 12, fontWeight: modalType === t ? 600 : 400,
    background: modalType === t ? '#0f2744' : '#fff',
    color: modalType === t ? '#fff' : '#555',
    border: '0.5px solid #d0d0c8', cursor: 'pointer',
  })

  const filteredCompanies = modalType === 'buy'
    ? companies
    : companies.filter(c => companiesWithHoldings.has(c.id))

  const thCell: React.CSSProperties = {
    fontSize: 10, fontWeight: 500, color: '#888',
    padding: '6px 8px', borderBottom: '0.5px solid #e8e7e0', textAlign: 'left',
  }
  const thCellR: React.CSSProperties = { ...thCell, textAlign: 'right' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 580, maxHeight: '90vh', overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Record transaction</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#aaa' }}>×</button>
        </div>

        {/* Type selector */}
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
          <button style={typeBtn('buy')} onClick={() => {
            setModalType('buy'); setHeldBy(''); setFromClient('')
            setLocationRows([{ id: uid(), location: '', shares: '', eis: 'tbc' }])
          }}>Buy</button>
          <button style={typeBtn('sell')} onClick={() => {
            setModalType('sell'); setHeldBy(''); setFromClient(''); setLocationRows([])
          }}>Sell</button>
          <button style={typeBtn('transfer')} onClick={() => {
            setModalType('transfer'); setHeldBy(''); setFromClient(''); setLocationRows([])
          }}>Internal transfer</button>
        </div>

        {/* Contextual notes */}
        {modalType === 'sell' && (
          <div style={{ background: '#f9f9f7', border: '0.5px solid #e8e7e0', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#888' }}>
            Oldest lots sold first (FIFO). Cost basis will be allocated automatically.
          </div>
        )}
        {modalType === 'transfer' && xferType === 'gift' && (
          <div style={{ background: '#fffbeb', border: '0.5px solid #f0c674', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#78500a' }}>
            Gift transfer: recipient inherits the donor&apos;s cost basis for P&amp;L purposes.
          </div>
        )}

        {/* Deferred MM management fee (sell only) */}
        {deferredFeeInfo && (
          <div style={{ background: '#fff8ed', border: '0.5px solid #e0952a', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#b97000', marginBottom: 4 }}>
              Multi Manager deferred management fee
            </div>
            <div style={{ fontSize: 11, color: '#78500a' }}>
              {deferredFeeInfo.yearsHeld.toFixed(1)} years held &rarr; {deferredFeeInfo.feePct.toFixed(1)}% fee rate (2% p.a., capped at 10%)
            </div>
            {deferredFeeInfo.costOfSharesSold > 0 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#b97000', marginTop: 4 }}>
                Estimated deferred fee: {fmtAmt(deferredFeeInfo.feeAmount)}
                <span style={{ fontSize: 10, fontWeight: 400, color: '#78500a', marginLeft: 6 }}>
                  (indicative — confirmed at exit)
                </span>
              </div>
            )}
          </div>
        )}

        {/* Transfer fund-type mismatch warning */}
        {transferFundTypeMismatch && (
          <div style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#a32d2d', marginBottom: 2 }}>
              Fund type mismatch
            </div>
            <div style={{ fontSize: 11, color: '#7f1d1d' }}>
              Transferring from a <strong>{transferFundTypeMismatch.fromLabel}</strong> investor to a{' '}
              <strong>{transferFundTypeMismatch.toLabel}</strong> investor. The transferred shares will retain the
              original investment&apos;s fund type in the ledger.
            </div>
          </div>
        )}

        {/* Company */}
        <F label="Company *">
          <select
            value={companyId}
            onChange={e => { setCompanyId(e.target.value); setShareClass(''); setHeldBy(''); setFromClient(''); setLocationRows(modalType === 'buy' ? [{ id: uid(), location: '', shares: '', eis: 'tbc' }] : []) }}
            style={inputStyle}
          >
            <option value="">Select company…</option>
            {filteredCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {modalType !== 'buy' && filteredCompanies.length === 0 && companyId === '' && (
            <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>No companies with existing holdings recorded</div>
          )}
        </F>

        {/* Share class */}
        <F label="Share class *">
          <select
            value={shareClass}
            onChange={e => { setShareClass(e.target.value); setLocationRows(modalType === 'buy' ? [{ id: uid(), location: '', shares: '', eis: 'tbc' }] : []) }}
            style={inputStyle}
            disabled={!companyId}
          >
            <option value="">Select…</option>
            {shareClasses.map(sc => <option key={sc.name} value={sc.name}>{sc.name}</option>)}
            <option value="Ordinary">Ordinary</option>
          </select>
        </F>

        {/* Held by / Transferring from */}
        <F label={modalType === 'transfer' ? 'Transferring from *' : 'Held by *'}>
          <select
            value={activeClient}
            onChange={e => {
              if (modalType === 'transfer') setFromClient(e.target.value)
              else setHeldBy(e.target.value)
            }}
            style={inputStyle}
            disabled={!companyId}
          >
            <option value="">
              {!companyId ? 'Select a company first…' : 'Select…'}
            </option>
            {eligibleInvestors.map(c => <option key={c.id} value={c.id}>{clientDisplayName(c, clients)}</option>)}
          </select>
        </F>

        {/* Price + Date side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <F label="Price per share (£) *">
            <input
              type="number" min="0" step="0.0001"
              value={price} onChange={e => setPrice(e.target.value)}
              placeholder="1.0000" style={inputStyle}
            />
          </F>
          <F label="Date *">
            <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} style={inputStyle} />
          </F>
        </div>

        {/* Location table */}
        {(modalType === 'buy' || activeClient) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 8 }}>
              {modalType === 'buy' ? 'Locations' : 'Locations with available shares'}
            </div>

            {locationRows.length === 0 && modalType !== 'buy' && (
              <div style={{ fontSize: 12, color: '#aaa', padding: '8px 0' }}>
                No shares found for the selected investor and share class.
              </div>
            )}

            {locationRows.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
                <thead>
                  <tr style={{ background: '#f9f9f7' }}>
                    <th style={thCell}>Location</th>
                    {modalType !== 'buy' && <th style={thCellR}>Available</th>}
                    <th style={thCellR}>Shares</th>
                    {modalType !== 'buy' && <th style={thCellR}>Remaining</th>}
                    {modalType !== 'buy' && <th style={thCellR}>Proceeds</th>}
                    <th style={thCell}>EIS qualifying</th>
                    {modalType === 'buy' && <th style={{ ...thCell, width: 24 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {locationRows.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec' }}>
                        {modalType === 'buy' ? (
                          <select
                            value={row.location}
                            onChange={e => updateRow(row.id, 'location', e.target.value)}
                            style={{ ...inputStyle, padding: '5px 8px' }}
                          >
                            <option value="">Select…</option>
                            {BUY_LOCATIONS.map(l => (
                              <option key={l} value={l.toLowerCase()}>{l}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 500 }}>
                            {row.location.charAt(0).toUpperCase() + row.location.slice(1)}
                          </span>
                        )}
                      </td>
                      {modalType !== 'buy' && (
                        <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right', fontSize: 12, color: '#555' }}>
                          {row.available?.toLocaleString() ?? '—'}
                        </td>
                      )}
                      <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec' }}>
                        <input
                          type="number" min="0" step="1"
                          value={row.shares}
                          onChange={e => updateRow(row.id, 'shares', e.target.value)}
                          placeholder="0"
                          style={{
                            ...inputStyle, padding: '5px 8px', textAlign: 'right',
                            borderColor: rowErrors[row.id] ? '#fca5a5' : '#d0d0c8',
                          }}
                        />
                        {rowErrors[row.id] && (
                          <div style={{ fontSize: 10, color: '#a32d2d', marginTop: 2 }}>
                            ⚠ {rowErrors[row.id]}
                          </div>
                        )}
                        {rowWarnings[row.id] && !rowErrors[row.id] && (
                          <div style={{ fontSize: 10, color: '#78500a', marginTop: 2 }}>
                            ⚠ {rowWarnings[row.id]}
                          </div>
                        )}
                      </td>
                      {modalType !== 'buy' && (() => {
                        const sharesEntered = parseInt(row.shares) || 0
                        const remaining = row.available !== undefined ? row.available - sharesEntered : null
                        const proceeds = sharesEntered > 0 ? sharesEntered * priceNum : null
                        return (
                          <>
                            <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right', fontSize: 12, color: remaining !== null && remaining < 0 ? '#a32d2d' : '#555' }}>
                              {sharesEntered > 0 && remaining !== null ? remaining.toLocaleString() : '—'}
                            </td>
                            <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right', fontSize: 12, fontWeight: 500, color: '#0f2744' }}>
                              {proceeds !== null ? fmtAmt(proceeds) : '—'}
                            </td>
                          </>
                        )
                      })()}
                      <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec' }}>
                        <select
                          value={row.eis}
                          onChange={e => updateRow(row.id, 'eis', e.target.value)}
                          style={{ ...inputStyle, padding: '5px 8px' }}
                        >
                          <option value="tbc">TBC</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </td>
                      {modalType === 'buy' && (
                        <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'center' }}>
                          {locationRows.length > 1 && (
                            <button
                              onClick={() => removeRow(row.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 15, padding: 0, lineHeight: 1 }}
                            >×</button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {modalType === 'buy' && (
              <button
                onClick={addRow}
                style={{ fontSize: 11, color: '#0f2744', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}
              >
                + Add location
              </button>
            )}
          </div>
        )}

        {/* Total amount */}
        {totalAmount > 0 && (
          <div style={{ fontSize: 12, color: '#555', marginBottom: 14, padding: '8px 10px', background: '#f9f9f7', borderRadius: 5 }}>
            Total amount: <strong>{fmtAmt(totalAmount)}</strong>
          </div>
        )}

        {/* Transfer-to section */}
        {modalType === 'transfer' && (
          <div style={{ borderTop: '0.5px solid #e8e7e0', paddingTop: 16, marginTop: 4, marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 12 }}>Transfer to</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <F label="Transfer type">
                  <select value={xferType} onChange={e => setXferType(e.target.value as 'commercial' | 'gift')} style={inputStyle}>
                    <option value="commercial">Commercial sale</option>
                    <option value="gift">Gift</option>
                  </select>
                </F>
              </div>
              <F label="Transferring to *">
                <select value={toClient} onChange={e => setToClient(e.target.value)} style={inputStyle}>
                  <option value="">Select…</option>
                  {sortedClients.filter(c => c.id !== fromClient).map(c =>
                    <option key={c.id} value={c.id}>{clientDisplayName(c, clients)}</option>
                  )}
                </select>
              </F>
              <F label="Recipient location">
                <select value={toLocation} onChange={e => setToLocation(e.target.value)} style={inputStyle}>
                  {BUY_LOCATIONS.map(l => <option key={l} value={l.toLowerCase()}>{l}</option>)}
                </select>
              </F>
            </div>
          </div>
        )}

        <F label="Notes (optional)">
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. EIS3 received" style={inputStyle} />
        </F>

        {err && <p style={{ fontSize: 12, color: '#a32d2d', margin: '0 0 12px' }}>{err}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              background: '#fff', color: '#333', border: '0.5px solid #d0d0c8', borderRadius: 5,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '7px 16px', fontSize: 12, fontWeight: 500, cursor: saving ? 'default' : 'pointer',
              background: '#0f2744', color: '#fff', border: 'none', borderRadius: 5,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : modalType === 'buy' ? 'Record purchase' : modalType === 'sell' ? 'Record sale' : 'Record transfer'}
          </button>
        </div>
      </div>
    </div>
  )
}
