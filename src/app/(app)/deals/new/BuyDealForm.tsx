'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string
  name: string
  share_classes: { name: string; type?: string }[] | null
}

interface Client {
  id: string
  full_name: string
  email: string | null
  default_fee_rate: number
  tax_status: string
  lead_investor_id: string | null
}

interface ActiveInvestment {
  id: string
  client_id: string
  company_id: string
  share_class: string
  shares_purchased: number
  original_share_price: number
  sum_subscribed: number
  eis_status: string
}

interface InvestorRow {
  uid: string
  clientId: string
  name: string
  email: string
  // Follow-on: aggregated current holding
  currentShares: number | null
  currentValue: number | null
  currentShareClass: string | null
  // New investment data
  shares: string
  shareClassOverride: string | null
  eisOverride: 'yes' | 'no' | 'tbc' | null  // null = auto-derive
  poaHeld: boolean
  feePct: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10) }

function deriveEis(
  dealEis: 'yes' | 'no' | 'tbc',
  clientTaxStatus: string,
): 'yes' | 'no' | 'tbc' {
  if (dealEis === 'yes' && ['eis', 'seis', 'both'].includes(clientTaxStatus)) return 'yes'
  if (dealEis === 'no') return 'no'
  return 'tbc'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BuyDealForm({
  dealType,
  companies: companiesRaw,
  clients: clientsRaw,
  investments: investmentsRaw,
  onBack,
}: {
  dealType: 'new_investment' | 'follow_on'
  companies: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  investments: Record<string, unknown>[]
  onBack: () => void
}) {
  const companies  = companiesRaw  as unknown as Company[]
  const clients    = clientsRaw    as unknown as Client[]
  const investments = investmentsRaw as unknown as ActiveInvestment[]
  const router     = useRouter()
  const supabase   = createClient()

  // Deal header
  const [companyId,      setCompanyId]      = useState('')
  const [shareClass,     setShareClass]     = useState('')
  const [sharePrice,     setSharePrice]     = useState('')
  const [investmentDate, setInvestmentDate] = useState(new Date().toISOString().slice(0, 10))
  const [eisQualifying,  setEisQualifying]  = useState<'yes' | 'no' | 'tbc'>('tbc')

  // Investor rows
  const [rows,         setRows]         = useState<InvestorRow[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const isFollowOn       = dealType === 'follow_on'
  const selectedCompany  = companies.find(c => c.id === companyId)
  const shareClasses     = Array.isArray(selectedCompany?.share_classes) ? selectedCompany!.share_classes : []
  const sharePriceNum    = parseFloat(sharePrice) || 0

  // Pre-group investments by company → client
  const holdingsByCompany = useMemo(() => {
    const map = new Map<string, Map<string, { shares: number; cost: number; shareClass: string }>>()
    for (const inv of investments) {
      if (!map.has(inv.company_id)) map.set(inv.company_id, new Map())
      const clientMap = map.get(inv.company_id)!
      const existing  = clientMap.get(inv.client_id)
      if (existing) {
        existing.shares += inv.shares_purchased
        existing.cost   += inv.sum_subscribed
      } else {
        clientMap.set(inv.client_id, {
          shares:     inv.shares_purchased,
          cost:       inv.sum_subscribed,
          shareClass: inv.share_class,
        })
      }
    }
    return map
  }, [investments])

  // Auto-populate investors for follow-on when company changes
  useEffect(() => {
    if (!isFollowOn || !companyId) {
      if (isFollowOn) setRows([])
      return
    }
    const holdings = holdingsByCompany.get(companyId)
    if (!holdings) { setRows([]); return }

    const newRows: InvestorRow[] = []
    for (const [clientId, holding] of holdings) {
      const client = clients.find(c => c.id === clientId)
      if (!client) continue
      newRows.push({
        uid:              uid(),
        clientId,
        name:             client.full_name,
        email:            client.email ?? '',
        currentShares:    holding.shares,
        currentValue:     holding.cost,
        currentShareClass: holding.shareClass,
        shares:           '',
        shareClassOverride: null,
        eisOverride:      null,
        poaHeld:          false,
        feePct:           String(client.default_fee_rate || 2),
      })
    }
    setRows(newRows)
  }, [companyId, isFollowOn, holdingsByCompany, clients])

  // When eisQualifying changes, re-derive EIS for non-overridden rows
  useEffect(() => {
    setRows(prev => prev.map(row => {
      if (row.eisOverride !== null) return row
      return row
    }))
  }, [eisQualifying])

  // Compute derived values for a single row
  const computeRow = useCallback((row: InvestorRow) => {
    const sharesNum    = parseFloat(row.shares) || 0
    const cost         = sharesNum * sharePriceNum
    const feePct       = parseFloat(row.feePct) || 0
    const feePayable   = cost * feePct / 100
    const totalCost    = cost + feePayable
    const client       = clients.find(c => c.id === row.clientId)
    const autoEis      = deriveEis(eisQualifying, client?.tax_status ?? '')
    const eisStatus    = row.eisOverride ?? autoEis
    const sc           = row.shareClassOverride ?? shareClass
    return { sharesNum, cost, feePayable, totalCost, eisStatus, sc, feePct }
  }, [sharePriceNum, eisQualifying, shareClass, clients])

  // Aggregates
  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      const { sharesNum, cost, feePayable, totalCost } = computeRow(row)
      return {
        shares:  acc.shares  + sharesNum,
        cost:    acc.cost    + cost,
        fees:    acc.fees    + feePayable,
        total:   acc.total   + totalCost,
      }
    }, { shares: 0, cost: 0, fees: 0, total: 0 })
  }, [rows, computeRow])

  function updateRow(rowUid: string, updates: Partial<InvestorRow>) {
    setRows(prev => prev.map(r => r.uid === rowUid ? { ...r, ...updates } : r))
  }

  function removeRow(rowUid: string) {
    setRows(prev => prev.filter(r => r.uid !== rowUid))
  }

  function addInvestor(client: Client) {
    const holding = holdingsByCompany.get(companyId)?.get(client.id) ?? null
    setRows(prev => [...prev, {
      uid:              uid(),
      clientId:         client.id,
      name:             client.full_name,
      email:            client.email ?? '',
      currentShares:    holding?.shares ?? null,
      currentValue:     holding?.cost ?? null,
      currentShareClass: holding?.shareClass ?? null,
      shares:           '',
      shareClassOverride: null,
      eisOverride:      null,
      poaHeld:          false,
      feePct:           String(client.default_fee_rate || 2),
    }])
    setClientSearch('')
  }

  // Filtered clients for search (exclude already-added, exclude linked entities)
  const existingIds      = new Set(rows.map(r => r.clientId))
  const filteredClients  = clients.filter(c =>
    !c.lead_investor_id &&
    !existingIds.has(c.id) &&
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase())
  )

  async function handleSave() {
    if (!companyId)        { setError('Please select a company'); return }
    if (!sharePrice || sharePriceNum <= 0) { setError('Please enter a valid share price'); return }
    if (rows.length === 0) { setError('Please add at least one investor'); return }
    const missingShares = rows.some(r => !(parseFloat(r.shares) > 0))
    if (missingShares)     { setError('Please enter shares for all investors'); return }

    setSaving(true)
    setError('')

    // Build investor_data for completion_checklist
    const investorData: Record<string, {
      name: string; shares: number; shareClass: string; eis: string
      poaHeld: boolean; feeRate: number; cost: number; feePayable: number; totalCost: number
      currentShares: number | null
    }> = {}
    for (const row of rows) {
      const { sharesNum, cost, feePayable, totalCost, eisStatus, sc, feePct } = computeRow(row)
      investorData[row.clientId] = {
        name: row.name, shares: sharesNum, shareClass: sc, eis: eisStatus,
        poaHeld: row.poaHeld, feeRate: feePct, cost, feePayable, totalCost,
        currentShares: row.currentShares,
      }
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .insert({
        deal_type:         dealType,
        company_id:        companyId,
        share_class:       shareClass || null,
        share_price:       sharePriceNum,
        investment_amount: totals.cost || null,
        investment_date:   investmentDate,
        eis_qualifying:    eisQualifying,
        status:            'draft',
        completion_checklist: { investor_data: investorData },
        created_by:        user?.id ?? null,
      })
      .select('id')
      .single()

    if (dealErr || !deal) {
      setError('Failed to create deal: ' + (dealErr?.message ?? 'unknown error'))
      setSaving(false)
      return
    }

    // Create deal_investors
    await supabase.from('deal_investors').insert(
      rows.map(row => ({
        deal_id:        deal.id,
        client_id:      row.clientId,
        amount:         computeRow(row).cost || null,
        poa_held:       row.poaHeld,
        signing_status: 'pending',
      }))
    )

    // Create pending investments
    for (const row of rows) {
      const { sharesNum, eisStatus, sc } = computeRow(row)
      await supabase.from('investments').insert({
        client_id:            row.clientId,
        company_id:           companyId,
        share_class:          sc || null,
        investment_date:      investmentDate,
        original_share_price: sharePriceNum,
        shares_purchased:     sharesNum,
        sum_subscribed:       sharesNum * sharePriceNum,
        eis_status:           eisStatus,
        holding_location:     'direct',
        status:               'pending',
      })
    }

    await supabase.from('internal_updates').insert({
      company_id:  companyId,
      update_type: 'deal',
      description: `Deal created: ${isFollowOn ? 'Follow-on investment' : 'New investment'} — ${selectedCompany?.name ?? ''} (${rows.length} investor${rows.length !== 1 ? 's' : ''})`,
      created_by:  user?.id ?? null,
    })

    router.push(`/deals/${deal.id}`)
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/deals" style={{ color: '#888', textDecoration: 'none' }}>Deals</Link>
        {' › '}
        <button onClick={onBack} style={{ color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}>
          New deal
        </button>
        {' › '}
        {isFollowOn ? 'Follow-on Investment' : 'New Investment'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>
            {isFollowOn ? 'Follow-on Investment' : 'New Investment'}
          </h1>
          {companyId && selectedCompany && (
            <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{selectedCompany.name}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onBack} className="btn btn-secondary">← Back</button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save deal'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#a32d2d', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── Deal header ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 10, borderBottom: '0.5px solid #f0f0ec' }}>
          Deal details
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <div>
            <label style={labelSt}>Company *</label>
            <select
              value={companyId}
              onChange={e => { setCompanyId(e.target.value); setShareClass('') }}
              style={inputSt}
            >
              <option value="">Select company…</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelSt}>Share class</label>
            <select value={shareClass} onChange={e => setShareClass(e.target.value)} style={inputSt} disabled={!companyId}>
              <option value="">— Select —</option>
              {shareClasses.map(sc => <option key={sc.name} value={sc.name}>{sc.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelSt}>Share price *</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#888', pointerEvents: 'none' }}>£</span>
              <input
                type="number" min="0" step="0.0001"
                value={sharePrice}
                onChange={e => setSharePrice(e.target.value)}
                style={{ ...inputSt, paddingLeft: 24 }}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label style={labelSt}>Investment date *</label>
            <input type="date" value={investmentDate} onChange={e => setInvestmentDate(e.target.value)} style={inputSt} />
          </div>

          <div>
            <label style={labelSt}>EIS qualifying</label>
            <select value={eisQualifying} onChange={e => setEisQualifying(e.target.value as 'yes' | 'no' | 'tbc')} style={inputSt}>
              <option value="tbc">TBC</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Investor table ── */}
      <div className="card" style={{ padding: 0, overflow: 'visible' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744' }}>
            Investors
            {rows.length > 0 && <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>({rows.length})</span>}
          </div>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              type="search"
              placeholder="Add investor…"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              style={{ ...inputSt, width: 200, padding: '5px 10px', fontSize: 12 }}
            />
            {clientSearch.trim() && filteredClients.length > 0 && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                background: '#fff', border: '0.5px solid #e8e7e0',
                borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                zIndex: 100, minWidth: 220, maxHeight: 220, overflowY: 'auto',
              }}>
                {filteredClients.slice(0, 20).map(c => (
                  <button
                    key={c.id}
                    onMouseDown={() => addInvestor(c)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 12px', fontSize: 12, color: '#333',
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: '0.5px solid #f5f5f2',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f5f5f2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    {c.full_name}
                    {c.default_fee_rate ? <span style={{ color: '#aaa', marginLeft: 6 }}>{c.default_fee_rate}%</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Empty state */}
        {rows.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#888', fontSize: 12 }}>
            {isFollowOn && !companyId
              ? 'Select a company above to auto-populate current investors'
              : 'Search above to add investors to this deal'}
          </div>
        )}

        {/* Table */}
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  <th style={thSt}>Investor</th>
                  {isFollowOn && <th style={{ ...thSt, color: '#aaa' }}>Current holding</th>}
                  <th style={thSt}>Shares *</th>
                  <th style={thSt}>Cost</th>
                  <th style={thSt}>Share class</th>
                  <th style={thSt}>EIS</th>
                  <th style={{ ...thSt, textAlign: 'center' }}>PoA</th>
                  <th style={thSt}>Fee %</th>
                  <th style={thSt}>Fee payable</th>
                  <th style={thSt}>Total cost</th>
                  <th style={{ ...thSt, width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const { sharesNum, cost, feePayable, totalCost, eisStatus, sc } = computeRow(row)
                  const hasError = !parseFloat(row.shares)

                  return (
                    <tr key={row.uid} style={{ background: hasError ? '#fffaf0' : undefined }}>
                      {/* Investor */}
                      <td style={tdSt}>
                        <div style={{ fontWeight: 500 }}>{row.name}</div>
                        {row.email && <div style={{ fontSize: 10, color: '#aaa' }}>{row.email}</div>}
                      </td>

                      {/* Current holding (follow-on) */}
                      {isFollowOn && (
                        <td style={tdSt}>
                          {row.currentShares != null ? (
                            <div>
                              <div style={{ fontWeight: 500 }}>{row.currentShares.toLocaleString()}</div>
                              {row.currentShareClass && <div style={{ fontSize: 10, color: '#888' }}>{row.currentShareClass}</div>}
                            </div>
                          ) : <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                      )}

                      {/* Shares input */}
                      <td style={tdSt}>
                        <input
                          type="number" min="0" step="1"
                          value={row.shares}
                          onChange={e => updateRow(row.uid, { shares: e.target.value })}
                          style={{ ...inputSt, width: 90, padding: '4px 8px', border: `0.5px solid ${hasError ? '#fca5a5' : '#d0d0c8'}` }}
                          placeholder="0"
                        />
                      </td>

                      {/* Cost */}
                      <td style={tdSt}>
                        {cost > 0 ? <span style={{ fontWeight: 500 }}>{formatCurrency(cost)}</span> : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      {/* Share class */}
                      <td style={tdSt}>
                        <select
                          value={row.shareClassOverride ?? shareClass}
                          onChange={e => updateRow(row.uid, { shareClassOverride: e.target.value || null })}
                          style={{ ...inputSt, width: 90, padding: '4px 6px', fontSize: 11 }}
                        >
                          {!shareClass && <option value="">—</option>}
                          {shareClass && <option value={shareClass}>{shareClass}</option>}
                          {shareClasses.filter(s => s.name !== shareClass).map(s => (
                            <option key={s.name} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* EIS */}
                      <td style={tdSt}>
                        <select
                          value={row.eisOverride ?? eisStatus}
                          onChange={e => updateRow(row.uid, { eisOverride: e.target.value as 'yes' | 'no' | 'tbc' })}
                          style={{ ...inputSt, width: 70, padding: '4px 6px', fontSize: 11 }}
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                          <option value="tbc">TBC</option>
                        </select>
                      </td>

                      {/* PoA */}
                      <td style={{ ...tdSt, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.poaHeld}
                          onChange={e => updateRow(row.uid, { poaHeld: e.target.checked })}
                          style={{ accentColor: '#1d9e75', width: 14, height: 14 }}
                        />
                      </td>

                      {/* Fee % */}
                      <td style={tdSt}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <input
                            type="number" min="0" max="100" step="0.5"
                            value={row.feePct}
                            onChange={e => updateRow(row.uid, { feePct: e.target.value })}
                            style={{ ...inputSt, width: 55, padding: '4px 6px' }}
                          />
                          <span style={{ fontSize: 11, color: '#888' }}>%</span>
                        </div>
                      </td>

                      {/* Fee payable */}
                      <td style={tdSt}>
                        {feePayable > 0 ? formatCurrency(feePayable) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      {/* Total cost */}
                      <td style={{ ...tdSt, fontWeight: 600 }}>
                        {totalCost > 0 ? formatCurrency(totalCost) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      {/* Remove */}
                      <td style={{ ...tdSt, textAlign: 'center' }}>
                        <button
                          onClick={() => removeRow(row.uid)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 16, lineHeight: 1, padding: 2 }}
                          onMouseEnter={e => e.currentTarget.style.color = '#a32d2d'}
                          onMouseLeave={e => e.currentTarget.style.color = '#bbb'}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Aggregate strip */}
        {rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '0.5px solid #e8e7e0', background: '#f9f9f7' }}>
            <AggCell label={`${rows.length} investor${rows.length !== 1 ? 's' : ''}`} />
            <AggCell label="Total shares" value={totals.shares > 0 ? totals.shares.toLocaleString() : undefined} />
            <AggCell label="Total cost" value={totals.cost > 0 ? formatCurrency(totals.cost) : undefined} />
            <AggCell label="Total fees" value={totals.fees > 0 ? formatCurrency(totals.fees) : undefined} />
          </div>
        )}
      </div>
    </div>
  )
}

function AggCell({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ padding: '10px 16px', borderRight: '0.5px solid #e8e7e0' }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      {value && <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: '#0f2744' }}>{value}</div>}
    </div>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 12, outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const labelSt: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4,
}
const thSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 500, color: '#888',
  textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e8e7e0',
}
const tdSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 12, borderBottom: '0.5px solid #f0f0ec', verticalAlign: 'middle',
}
