'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { BuyDealType, EisStatus, SetupData, InvestorRow } from './buyWizardTypes'

// ─── Local types ──────────────────────────────────────────────────────────────

interface Client {
  id:               string
  full_name:        string
  email:            string | null
  default_fee_rate: number
  tax_status:       string
  lead_investor_id: string | null
  fund_type:        string
  active_fund_type: string
}

interface Investment {
  id:                   string
  client_id:            string
  company_id:           string
  share_class:          string
  shares_purchased:     number
  original_share_price: number
  sum_subscribed:       number
}

interface ExistingInvestorData {
  name?:          string
  shares?:        number
  shareClass?:    string
  eis?:           string
  poaHeld?:       boolean
  feeRate?:       number
  currentShares?: number
  fundType?:      string
}

interface Props {
  dealType:              BuyDealType
  setupData:             SetupData
  clients:               Record<string, unknown>[]
  investments:           Record<string, unknown>[]
  onBack:                () => void
  existingDealId?:       string
  existingInvestorData?: Record<string, ExistingInvestorData>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10) }

function deriveEis(dealEis: EisStatus, clientTaxStatus: string): EisStatus {
  if (dealEis === 'yes' && ['eis', 'seis', 'both'].includes(clientTaxStatus)) return 'yes'
  if (dealEis === 'no') return 'no'
  return 'tbc'
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 12, outline: 'none', boxSizing: 'border-box',
  background: '#fff', fontFamily: 'inherit',
}

const thSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 500, color: '#888',
  textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e8e7e0',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

const tdSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 12, borderBottom: '0.5px solid #f0f0ec',
  verticalAlign: 'middle', fontFamily: 'inherit',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvestorsStep({
  dealType, setupData, clients: clientsRaw, investments: investmentsRaw,
  onBack, existingDealId, existingInvestorData,
}: Props) {
  const clients     = clientsRaw     as unknown as Client[]
  const investments = investmentsRaw as unknown as Investment[]
  const router      = useRouter()
  const supabase    = createClient()
  const isFollowOn  = dealType === 'follow_on'
  const isEditMode  = !!existingDealId

  const sharePriceNum = parseFloat(setupData.sharePrice) || 0

  const [rows,          setRows]          = useState<InvestorRow[]>([])
  const [clientSearch,  setClientSearch]  = useState('')
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [bothClientQueue, setBothClientQueue] = useState<Client[]>([])

  const [fundTypePrompt, setFundTypePrompt] = useState<{
    client: Client
    resolve: (ft: 'syndicate' | 'multi_manager') => void
  } | null>(null)

  const [confirmRemove, setConfirmRemove] = useState<{ uid: string; name: string } | null>(null)

  const [priceConfirm, setPriceConfirm] = useState<{ latestPrice: number | null } | null>(null)
  const [priceChoice,  setPriceChoice]  = useState<'updated' | 'kept' | 'custom'>('kept')
  const [customPrice,  setCustomPrice]  = useState('')

  // Group active investments by company → client
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

  // In edit mode: initialise rows from completion_checklist data
  const editInitRef = useRef(false)
  useEffect(() => {
    if (!isEditMode || !existingInvestorData || editInitRef.current) return
    editInitRef.current = true
    const newRows: InvestorRow[] = []
    for (const [clientId, iData] of Object.entries(existingInvestorData)) {
      const client = clients.find(c => c.id === clientId)
      newRows.push({
        uid:               uid(),
        clientId,
        name:              iData.name ?? client?.full_name ?? '',
        email:             client?.email ?? '',
        currentShares:     iData.currentShares ?? null,
        currentValue:      null,
        currentShareClass: null,
        shares:            String(iData.shares || ''),
        shareClassOverride: (iData.shareClass && iData.shareClass !== setupData.shareClass) ? iData.shareClass : null,
        eisOverride:       (iData.eis as EisStatus | null) ?? null,
        poaHeld:           iData.poaHeld ?? false,
        feePct:            String(iData.feeRate ?? client?.default_fee_rate ?? 2),
        fundType:          (iData.fundType as 'syndicate' | 'multi_manager') ?? 'syndicate',
      })
    }
    setRows(newRows)
  }, [isEditMode, existingInvestorData, clients, setupData.shareClass])

  // Follow-on: auto-populate investors (create mode only)
  const followOnInitRef = useRef(false)
  useEffect(() => {
    if (!isFollowOn || isEditMode || followOnInitRef.current) return
    followOnInitRef.current = true
    const holdings = holdingsByCompany.get(setupData.companyId)
    if (!holdings) return

    const newRows: InvestorRow[] = []
    const bothClients: Client[]  = []

    for (const [clientId, holding] of holdings) {
      const client = clients.find(c => c.id === clientId)
      if (!client) continue

      if (client.fund_type === 'both') {
        // Use active_fund_type if it resolves unambiguously, otherwise queue for prompt
        const activeFt = client.active_fund_type
        if (activeFt === 'syndicate' || activeFt === 'multi_manager') {
          newRows.push({
            uid:               uid(),
            clientId,
            name:              client.full_name,
            email:             client.email ?? '',
            currentShares:     holding.shares,
            currentValue:      holding.cost,
            currentShareClass: holding.shareClass,
            shares:            '',
            shareClassOverride: null,
            eisOverride:       null,
            poaHeld:           false,
            feePct:            String(client.default_fee_rate || 2),
            fundType:          activeFt,
          })
        } else {
          bothClients.push(client)
        }
        continue
      }

      newRows.push({
        uid:               uid(),
        clientId,
        name:              client.full_name,
        email:             client.email ?? '',
        currentShares:     holding.shares,
        currentValue:      holding.cost,
        currentShareClass: holding.shareClass,
        shares:            '',
        shareClassOverride: null,
        eisOverride:       null,
        poaHeld:           false,
        feePct:            String(client.default_fee_rate || 2),
        fundType:          (client.fund_type === 'multi_manager' || client.active_fund_type === 'multi_manager')
                             ? 'multi_manager' : 'syndicate',
      })
    }
    setRows(newRows)
    if (bothClients.length > 0) setBothClientQueue(bothClients)
  }, [isFollowOn, isEditMode, setupData.companyId, holdingsByCompany, clients])

  // Process 'both'-fund-type clients sequentially via prompt
  useEffect(() => {
    if (bothClientQueue.length === 0 || fundTypePrompt) return
    const [next, ...rest] = bothClientQueue
    setBothClientQueue(rest)
    setFundTypePrompt({
      client: next,
      resolve: (ft) => {
        setFundTypePrompt(null)
        doAddInvestor(next, ft)
      },
    })
  }, [bothClientQueue, fundTypePrompt]) // eslint-disable-line react-hooks/exhaustive-deps

  const computeRow = useCallback((row: InvestorRow) => {
    const sharesNum  = parseFloat(row.shares) || 0
    const cost       = sharesNum * sharePriceNum
    const feePct     = parseFloat(row.feePct) || 0
    const feePayable = cost * feePct / 100
    const totalCost  = cost + feePayable
    const client     = clients.find(c => c.id === row.clientId)
    const autoEis    = deriveEis(setupData.eisQualifying, client?.tax_status ?? '')
    const eisStatus  = row.eisOverride ?? autoEis
    const sc         = row.shareClassOverride ?? setupData.shareClass
    return { sharesNum, cost, feePayable, totalCost, eisStatus, sc, feePct }
  }, [sharePriceNum, setupData.eisQualifying, setupData.shareClass, clients])

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      const { sharesNum, cost, feePayable, totalCost } = computeRow(row)
      return {
        shares: acc.shares + sharesNum,
        cost:   acc.cost   + cost,
        fees:   acc.fees   + feePayable,
        total:  acc.total  + totalCost,
      }
    }, { shares: 0, cost: 0, fees: 0, total: 0 })
  }, [rows, computeRow])

  function updateRow(rowUid: string, updates: Partial<InvestorRow>) {
    setRows(prev => prev.map(r => r.uid === rowUid ? { ...r, ...updates } : r))
  }

  function doAddInvestor(client: Client, fundType: 'syndicate' | 'multi_manager') {
    const holding = holdingsByCompany.get(setupData.companyId)?.get(client.id) ?? null
    setRows(prev => [...prev, {
      uid:               uid(),
      clientId:          client.id,
      name:              client.full_name,
      email:             client.email ?? '',
      currentShares:     holding?.shares ?? null,
      currentValue:      holding?.cost ?? null,
      currentShareClass: holding?.shareClass ?? null,
      shares:            '',
      shareClassOverride: null,
      eisOverride:       null,
      poaHeld:           false,
      feePct:            String(client.default_fee_rate || 2),
      fundType,
    }])
    setClientSearch('')
  }

  function addInvestor(client: Client) {
    if (client.fund_type === 'both') {
      setFundTypePrompt({ client, resolve: (ft) => { setFundTypePrompt(null); doAddInvestor(client, ft) } })
    } else {
      doAddInvestor(client, client.fund_type === 'multi_manager' ? 'multi_manager' : 'syndicate')
    }
  }

  const existingIds     = new Set(rows.map(r => r.clientId))
  const filteredClients = clients.filter(c =>
    !c.lead_investor_id &&
    !existingIds.has(c.id) &&
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()),
  )

  async function handleSave() {
    setError('')
    if (rows.length === 0)                            { setError('Add at least one investor'); return }
    if (rows.some(r => !(parseFloat(r.shares) > 0))) { setError('Enter shares for all investors'); return }

    // Edit mode: no price confirmation needed
    if (isEditMode) {
      await doSave(sharePriceNum, null)
      return
    }

    // Create mode: fetch latest valuation then show confirmation modal
    setSaving(true)
    const { data: latestVal } = await supabase
      .from('valuations')
      .select('share_price')
      .eq('company_id', setupData.companyId)
      .order('valuation_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    setSaving(false)

    const latestPrice = latestVal ? parseFloat(String(latestVal.share_price)) : null
    setPriceConfirm({ latestPrice })
    setPriceChoice('kept')
    setCustomPrice('')
  }

  async function doSave(finalPrice: number, choice: 'updated' | 'kept' | 'custom' | null) {
    setPriceConfirm(null)
    setSaving(true)

    // Recompute investment amount totals using finalPrice
    const totalInvestmentAmount = rows.reduce((sum, row) => {
      return sum + (parseFloat(row.shares) || 0) * finalPrice
    }, 0)

    const investorData: Record<string, unknown> = {}
    for (const row of rows) {
      const { sharesNum, cost, feePayable, totalCost, eisStatus, sc, feePct } = computeRow(row)
      investorData[row.clientId] = {
        name: row.name, shares: sharesNum, shareClass: sc, eis: eisStatus,
        poaHeld: row.poaHeld, feeRate: feePct, cost, feePayable, totalCost,
        currentShares: row.currentShares, fundType: row.fundType,
      }
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (isEditMode && existingDealId) {
      // ── Edit mode: update deal + replace deal_investors + replace pending investments ──

      const { error: dealUpdErr } = await supabase
        .from('deals')
        .update({
          share_class:          setupData.shareClass || null,
          share_class_id:       setupData.shareClassId || null,
          share_price:          finalPrice,
          investment_amount:    totalInvestmentAmount || null,
          investment_date:      setupData.investmentDate,
          eis_qualifying:       setupData.eisQualifying,
          completion_checklist: { investor_data: investorData },
          updated_at:           new Date().toISOString(),
        })
        .eq('id', existingDealId)

      if (dealUpdErr) {
        setError('Failed to update deal: ' + dealUpdErr.message)
        setSaving(false)
        return
      }

      // Replace deal_investors
      await supabase.from('deal_investors').delete().eq('deal_id', existingDealId)

      const { error: diErr } = await supabase.from('deal_investors').insert(
        rows.map(row => ({
          deal_id:        existingDealId,
          client_id:      row.clientId,
          amount:         (parseFloat(row.shares) || 0) * finalPrice || null,
          poa_held:       row.poaHeld,
          signing_status: 'pending',
        })),
      )
      if (diErr) {
        setError('Failed to update investors: ' + diErr.message)
        setSaving(false)
        return
      }

      // Replace pending investments for these clients at this company
      const clientIds = rows.map(r => r.clientId)
      await supabase.from('investments')
        .delete()
        .in('client_id', clientIds)
        .eq('company_id', setupData.companyId)
        .eq('status', 'pending')

      for (const row of rows) {
        const { sharesNum, eisStatus, sc, feePct, feePayable } = computeRow(row)
        await supabase.from('investments').insert({
          client_id:            row.clientId,
          company_id:           setupData.companyId,
          share_class:          sc || null,
          share_class_id:       row.shareClassOverride ? null : (setupData.shareClassId || null),
          investment_date:      setupData.investmentDate,
          original_share_price: finalPrice,
          shares_purchased:     sharesNum,
          sum_subscribed:       sharesNum * finalPrice,
          eis_status:           eisStatus,
          holding_location:     'direct',
          status:               'pending',
          fund_type:            row.fundType ?? 'syndicate',
          transaction_category: 'equity',
          fee_rate:             feePct,
          fee_amount:           feePayable,
        })
      }

      router.push(`/deals/${existingDealId}`)
      return
    }

    // ── Create mode ────────────────────────────────────────────────────────────

    // If price was updated or custom, record a new valuation
    if (choice === 'updated' || choice === 'custom') {
      await supabase.from('valuations').insert({
        company_id:     setupData.companyId,
        share_price:    finalPrice,
        valuation_date: setupData.investmentDate,
        updated_by:     user?.id ?? null,
        notes:          `Price confirmed at deal setup (${choice})`,
      })
    }

    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .insert({
        deal_type:                  dealType,
        company_id:                 setupData.companyId,
        share_class:                setupData.shareClass || null,
        share_class_id:             setupData.shareClassId || null,
        share_price:                finalPrice,
        investment_amount:          totalInvestmentAmount || null,
        investment_date:            setupData.investmentDate,
        eis_qualifying:             setupData.eisQualifying,
        status:                     'draft',
        completion_checklist:       { investor_data: investorData },
        created_by:                 user?.id ?? null,
        price_confirmed_at_setup:   choice !== null,
        price_confirmation_choice:  choice,
      })
      .select('id')
      .single()

    if (dealErr || !deal) {
      setError('Failed to create deal: ' + (dealErr?.message ?? 'unknown error'))
      setSaving(false)
      return
    }

    const { error: diErr } = await supabase.from('deal_investors').insert(
      rows.map(row => ({
        deal_id:        deal.id,
        client_id:      row.clientId,
        amount:         (parseFloat(row.shares) || 0) * finalPrice || null,
        poa_held:       row.poaHeld,
        signing_status: 'pending',
      })),
    )
    if (diErr) {
      setError('Failed to add deal investors: ' + diErr.message)
      setSaving(false)
      return
    }

    for (const row of rows) {
      const { sharesNum, eisStatus, sc, feePct, feePayable } = computeRow(row)
      await supabase.from('investments').insert({
        client_id:            row.clientId,
        company_id:           setupData.companyId,
        share_class:          sc || null,
        share_class_id:       row.shareClassOverride ? null : (setupData.shareClassId || null),
        investment_date:      setupData.investmentDate,
        original_share_price: finalPrice,
        shares_purchased:     sharesNum,
        sum_subscribed:       sharesNum * finalPrice,
        eis_status:           eisStatus,
        holding_location:     'direct',
        status:               'pending',
        fund_type:            row.fundType ?? 'syndicate',
        transaction_category: 'equity',
        fee_rate:             feePct,
        fee_amount:           feePayable,
      })
    }

    await supabase.from('internal_updates').insert({
      company_id:  setupData.companyId,
      update_type: 'deal',
      description: `Deal created: ${isFollowOn ? 'Follow-on investment' : 'New investment'} — ${setupData.companyName} (${rows.length} investor${rows.length !== 1 ? 's' : ''})`,
      created_by:  user?.id ?? null,
    })

    router.push(`/deals/${deal.id}`)
  }

  return (
    <div>
      {/* Summary of step 1 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Company',    value: setupData.companyName },
          { label: 'Share class', value: setupData.shareClass || '—' },
          { label: 'Price / share', value: `£${parseFloat(setupData.sharePrice || '0').toFixed(4)}` },
          { label: 'Date',       value: setupData.investmentDate },
          { label: 'EIS',        value: setupData.eisQualifying.toUpperCase() },
        ].map(item => (
          <div key={item.label} className="card" style={{ padding: '8px 14px', flex: '0 0 auto' }}>
            <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', marginTop: 2 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Investor table */}
      <div className="card" style={{ padding: 0, overflow: 'visible', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>
            Investors
            {rows.length > 0 && <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>({rows.length})</span>}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="search"
              placeholder="Add investor…"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              style={{ ...inputSt, width: 200, padding: '5px 10px' }}
            />
            {clientSearch.trim() && filteredClients.length > 0 && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 6,
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100,
                minWidth: 220, maxHeight: 220, overflowY: 'auto',
              }}>
                {filteredClients.slice(0, 20).map(c => (
                  <button
                    key={c.id}
                    onMouseDown={() => addInvestor(c)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 12px', fontSize: 12, color: '#333',
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: '0.5px solid #f5f5f2', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f2')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {c.full_name}
                    {c.default_fee_rate ? <span style={{ color: '#aaa', marginLeft: 6 }}>{c.default_fee_rate}%</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#888', fontSize: 12 }}>
            {isFollowOn && !isEditMode ? 'Loading current investors…' : 'Search above to add investors'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  <th style={thSt}>Investor</th>
                  {isFollowOn && <th style={{ ...thSt, color: '#bbb' }}>Current holding</th>}
                  <th style={{ ...thSt, textAlign: 'right' }}>Shares *</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Cost</th>
                  <th style={thSt}>Share class</th>
                  <th style={thSt}>EIS</th>
                  <th style={{ ...thSt, textAlign: 'center' }}>PoA</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Fee %</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Fee</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Total</th>
                  <th style={{ ...thSt, width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const { sharesNum, cost, feePayable, totalCost, eisStatus } = computeRow(row)
                  const hasError = !parseFloat(row.shares)
                  const sc       = row.shareClassOverride ?? setupData.shareClass

                  return (
                    <tr key={row.uid} style={{ background: hasError ? '#fffaf0' : undefined }}>
                      <td style={tdSt}>
                        <div style={{ fontWeight: 500 }}>{row.name}</div>
                        {row.email && <div style={{ fontSize: 10, color: '#aaa' }}>{row.email}</div>}
                      </td>

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

                      <td style={{ ...tdSt, textAlign: 'right' }}>
                        <input
                          type="number" min="0" step="1"
                          value={row.shares}
                          onChange={e => updateRow(row.uid, { shares: e.target.value })}
                          style={{ ...inputSt, width: 90, padding: '4px 8px', textAlign: 'right', border: `0.5px solid ${hasError ? '#fca5a5' : '#d0d0c8'}` }}
                          placeholder="0"
                        />
                      </td>

                      <td style={{ ...tdSt, textAlign: 'right' }}>
                        {cost > 0 ? formatCurrency(cost) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      <td style={tdSt}>
                        <input
                          type="text"
                          value={sc}
                          onChange={e => updateRow(row.uid, { shareClassOverride: e.target.value || null })}
                          style={{ ...inputSt, width: 90, padding: '4px 6px' }}
                          placeholder="—"
                        />
                      </td>

                      <td style={tdSt}>
                        <select
                          value={row.eisOverride ?? eisStatus}
                          onChange={e => updateRow(row.uid, { eisOverride: e.target.value as EisStatus })}
                          style={{ ...inputSt, width: 70, padding: '4px 6px' }}
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                          <option value="tbc">TBC</option>
                        </select>
                      </td>

                      <td style={{ ...tdSt, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.poaHeld}
                          onChange={e => updateRow(row.uid, { poaHeld: e.target.checked })}
                          style={{ accentColor: '#1d9e75', width: 14, height: 14 }}
                        />
                      </td>

                      <td style={{ ...tdSt, textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                          <input
                            type="number" min="0" max="100" step="0.5"
                            value={row.feePct}
                            onChange={e => updateRow(row.uid, { feePct: e.target.value })}
                            style={{ ...inputSt, width: 55, padding: '4px 6px', textAlign: 'right' }}
                          />
                          <span style={{ fontSize: 11, color: '#888' }}>%</span>
                        </div>
                      </td>

                      <td style={{ ...tdSt, textAlign: 'right' }}>
                        {feePayable > 0 ? formatCurrency(feePayable) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      <td style={{ ...tdSt, textAlign: 'right', fontWeight: 600 }}>
                        {totalCost > 0 ? formatCurrency(totalCost) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      <td style={{ ...tdSt, textAlign: 'center' }}>
                        <button
                          onClick={() => setConfirmRemove({ uid: row.uid, name: row.name })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 16, lineHeight: 1, padding: 2 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#a32d2d')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#ccc')}
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

        {/* Totals bar */}
        {rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '0.5px solid #e8e7e0', background: '#f9f9f7' }}>
            <AggCell label={`${rows.length} investor${rows.length !== 1 ? 's' : ''}`} />
            <AggCell label="Total shares" value={totals.shares > 0 ? totals.shares.toLocaleString() : undefined} />
            <AggCell label="Total cost"   value={totals.cost  > 0 ? formatCurrency(totals.cost)  : undefined} />
            <AggCell label="Total fees"   value={totals.fees  > 0 ? formatCurrency(totals.fees)  : undefined} />
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#a32d2d', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onBack} className="btn btn-secondary" disabled={saving}>← Back</button>
        <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isEditMode ? 'Save changes →' : 'Save deal →'}
        </button>
      </div>

      {/* Remove investor confirm */}
      {confirmRemove && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 340, padding: '24px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Remove investor?</div>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 20px' }}>
              Remove <strong>{confirmRemove.name}</strong> from this deal?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmRemove(null)} className="btn btn-secondary" style={{ fontSize: 12 }}>Cancel</button>
              <button
                onClick={() => { setRows(prev => prev.filter(r => r.uid !== confirmRemove.uid)); setConfirmRemove(null) }}
                className="btn btn-primary"
                style={{ fontSize: 12, background: '#a32d2d' }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price confirmation modal */}
      {priceConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 420, padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f2744', marginBottom: 4 }}>Update share price for {setupData.companyName}?</div>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 16px' }}>
              You are completing a deal at <strong>£{parseFloat(setupData.sharePrice || '0').toFixed(4)}</strong> per share. The platform uses the latest share price to calculate portfolio valuations for all investors in this company.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', border: `0.5px solid ${priceChoice === 'kept' ? '#185fa5' : '#e8e7e0'}`, borderRadius: 6, background: priceChoice === 'kept' ? '#f0f6ff' : '#fff' }}>
                <input type="radio" name="priceChoice" value="kept" checked={priceChoice === 'kept'} onChange={() => setPriceChoice('kept')} style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Update to £{parseFloat(setupData.sharePrice || '0').toFixed(4)} — recommended</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Sets the current share price to the deal price. All portfolio valuations will reflect this price.</div>
                </div>
              </label>

              {priceConfirm.latestPrice != null && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', border: `0.5px solid ${priceChoice === 'updated' ? '#185fa5' : '#e8e7e0'}`, borderRadius: 6, background: priceChoice === 'updated' ? '#f0f6ff' : '#fff' }}>
                  <input type="radio" name="priceChoice" value="updated" checked={priceChoice === 'updated'} onChange={() => setPriceChoice('updated')} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>Keep current price of £{priceConfirm.latestPrice.toFixed(4)}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>Use this if the deal price is not representative of the company&apos;s current value — for example, an unusual transaction or a small follow-on at a historic price.</div>
                  </div>
                </label>
              )}

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', border: `0.5px solid ${priceChoice === 'custom' ? '#185fa5' : '#e8e7e0'}`, borderRadius: 6, background: priceChoice === 'custom' ? '#f0f6ff' : '#fff' }}>
                <input type="radio" name="priceChoice" value="custom" checked={priceChoice === 'custom'} onChange={() => setPriceChoice('custom')} style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Enter a different price</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Use this if the correct current valuation price differs from both the deal price and the previously recorded price.</div>
                  {priceChoice === 'custom' && (
                    <div style={{ position: 'relative', marginTop: 6 }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#888', pointerEvents: 'none' }}>£</span>
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={customPrice}
                        onChange={e => setCustomPrice(e.target.value)}
                        placeholder="0.0000"
                        style={{ ...inputSt, paddingLeft: 22, width: 140, fontSize: 12 }}
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPriceConfirm(null)}
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  let finalPrice = sharePriceNum
                  if (priceChoice === 'updated' && priceConfirm.latestPrice != null) {
                    finalPrice = priceConfirm.latestPrice
                  } else if (priceChoice === 'custom') {
                    const p = parseFloat(customPrice)
                    if (!(p > 0)) return
                    finalPrice = p
                  }
                  doSave(finalPrice, priceChoice)
                }}
                className="btn btn-primary"
                style={{ fontSize: 12 }}
              >
                Confirm &amp; save deal →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fund type prompt */}
      {fundTypePrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 340, padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Select fund type</div>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 20px' }}>
              <strong>{fundTypePrompt.client.full_name}</strong> is invested in both Syndicate and Multi Manager. Which fund type does this investment belong to?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => fundTypePrompt.resolve('syndicate')} className="btn btn-secondary" style={{ textAlign: 'left', padding: '10px 14px' }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>Syndicate</div>
                <div style={{ fontSize: 11, color: '#888' }}>Standard deal — no deferred management fee</div>
              </button>
              <button onClick={() => fundTypePrompt.resolve('multi_manager')} className="btn btn-secondary" style={{ textAlign: 'left', padding: '10px 14px', borderColor: '#e0952a' }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#b97000' }}>Multi Manager</div>
                <div style={{ fontSize: 11, color: '#888' }}>Deferred management fee applies at exit</div>
              </button>
            </div>
            <button onClick={() => setFundTypePrompt(null)} style={{ marginTop: 14, fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
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
