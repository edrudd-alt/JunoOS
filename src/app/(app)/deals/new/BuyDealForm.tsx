'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
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
  fund_type: string
  active_fund_type: string | null
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

interface ExistingDealInvestor {
  id: string
  client_id: string
  amount: number | null
  poa_held: boolean
  clients: { id: string; full_name: string; email: string | null } | null
}

export interface ExistingBuyDeal {
  id: string
  deal_type: string
  company_id: string | null
  share_class: string | null
  share_price: number | null
  investment_date: string | null
  eis_qualifying: string | null
  completion_checklist: {
    investor_data?: Record<string, {
      shares?: number
      shareClass?: string
      eis?: string
      poaHeld?: boolean
      feeRate?: number
      fundType?: string
    }>
  } | null
  deal_investors: ExistingDealInvestor[]
}

interface InvestorRow {
  uid: string
  clientId: string
  name: string
  email: string
  currentShares: number | null
  currentValue: number | null
  currentShareClass: string | null
  shares: string
  shareClassOverride: string | null
  eisOverride: 'yes' | 'no' | 'tbc' | null
  poaHeld: boolean
  feePct: string
  fundType: 'syndicate' | 'multi_manager'
  dealInvestorId?: string  // set for existing investors in edit mode
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10) }

function deriveEis(dealEis: 'yes' | 'no' | 'tbc', clientTaxStatus: string): 'yes' | 'no' | 'tbc' {
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
  backHref,
  existingDeal,
}: {
  dealType: 'new_investment' | 'follow_on'
  companies: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  investments: Record<string, unknown>[]
  onBack?: () => void
  backHref?: string
  existingDeal?: ExistingBuyDeal
}) {
  const companies   = companiesRaw   as unknown as Company[]
  const clients     = clientsRaw     as unknown as Client[]
  const investments = investmentsRaw as unknown as ActiveInvestment[]
  const router      = useRouter()
  const supabase    = createClient()

  const isEditMode = !!existingDeal
  const isFollowOn = dealType === 'follow_on'

  // Deal header — initialise from existingDeal when editing
  const [companyId,      setCompanyId]      = useState(existingDeal?.company_id ?? '')
  const [shareClass,     setShareClass]     = useState(existingDeal?.share_class ?? '')
  const [sharePrice,     setSharePrice]     = useState(existingDeal?.share_price != null ? String(existingDeal.share_price) : '')
  const [investmentDate, setInvestmentDate] = useState(existingDeal?.investment_date ?? new Date().toISOString().slice(0, 10))
  const [eisQualifying,  setEisQualifying]  = useState<'yes' | 'no' | 'tbc'>(
    (existingDeal?.eis_qualifying as 'yes' | 'no' | 'tbc') ?? 'tbc'
  )

  const [rows,         setRows]         = useState<InvestorRow[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  // Fund type prompt for 'both' clients
  const [fundTypePrompt, setFundTypePrompt] = useState<{ client: Client; resolve: (ft: 'syndicate' | 'multi_manager') => void } | null>(null)

  const selectedCompany = companies.find(c => c.id === companyId)
  const shareClasses    = Array.isArray(selectedCompany?.share_classes) ? selectedCompany!.share_classes : []
  const sharePriceNum   = parseFloat(sharePrice) || 0

  // Group investments by company → client
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

  // Populate rows from existingDeal (edit mode) — runs once
  const editInitRef = useRef(false)
  useEffect(() => {
    if (!isEditMode || editInitRef.current || !existingDeal) return
    editInitRef.current = true
    const holdings = holdingsByCompany.get(existingDeal.company_id ?? '')
    const newRows: InvestorRow[] = existingDeal.deal_investors.map(di => {
      const clientId = di.client_id
      const iData    = existingDeal.completion_checklist?.investor_data?.[clientId]
      const client   = clients.find(c => c.id === clientId)
      const holding  = holdings?.get(clientId) ?? null
      const sharesFromData   = iData?.shares ?? 0
      const sharesFromAmount = (di.amount != null && sharePriceNum > 0)
        ? Math.round(di.amount / sharePriceNum) : 0
      return {
        uid:               uid(),
        clientId,
        name:              di.clients?.full_name ?? client?.full_name ?? '',
        email:             di.clients?.email ?? client?.email ?? '',
        currentShares:     holding?.shares ?? null,
        currentValue:      holding?.cost ?? null,
        currentShareClass: holding?.shareClass ?? null,
        shares:            String(sharesFromData || sharesFromAmount || ''),
        shareClassOverride: iData?.shareClass ?? null,
        eisOverride:       (iData?.eis as 'yes' | 'no' | 'tbc') ?? null,
        poaHeld:           iData?.poaHeld ?? di.poa_held ?? false,
        feePct:            String(iData?.feeRate ?? client?.default_fee_rate ?? 2),
        fundType:          ((iData?.fundType as string) === 'multi_manager' || client?.fund_type === 'multi_manager')
                             ? 'multi_manager' : 'syndicate',
        dealInvestorId:    di.id,
      }
    })
    setRows(newRows)
  }, [isEditMode, existingDeal, holdingsByCompany, clients, sharePriceNum])

  // Auto-populate investors for follow-on when company changes (create mode only)
  useEffect(() => {
    if (isEditMode) return
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
  }, [companyId, isFollowOn, holdingsByCompany, clients, isEditMode])

  // Compute derived values for a single row
  const computeRow = useCallback((row: InvestorRow) => {
    const sharesNum  = parseFloat(row.shares) || 0
    const cost       = sharesNum * sharePriceNum
    const feePct     = parseFloat(row.feePct) || 0
    const feePayable = cost * feePct / 100
    const totalCost  = cost + feePayable
    const client     = clients.find(c => c.id === row.clientId)
    const autoEis    = deriveEis(eisQualifying, client?.tax_status ?? '')
    const eisStatus  = row.eisOverride ?? autoEis
    const sc         = row.shareClassOverride ?? shareClass
    return { sharesNum, cost, feePayable, totalCost, eisStatus, sc, feePct }
  }, [sharePriceNum, eisQualifying, shareClass, clients])

  // Aggregates
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

  function removeRow(rowUid: string) {
    setRows(prev => prev.filter(r => r.uid !== rowUid))
  }

  function doAddInvestor(client: Client, fundType: 'syndicate' | 'multi_manager') {
    const holding = holdingsByCompany.get(companyId)?.get(client.id) ?? null
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
    const ft = client.fund_type as string
    if (ft === 'both') {
      setFundTypePrompt({
        client,
        resolve: (chosen) => {
          setFundTypePrompt(null)
          doAddInvestor(client, chosen)
        },
      })
    } else {
      const resolvedFt = ft === 'multi_manager' ? 'multi_manager' : 'syndicate'
      doAddInvestor(client, resolvedFt)
    }
  }

  const existingIds     = new Set(rows.map(r => r.clientId))
  const filteredClients = clients.filter(c =>
    !c.lead_investor_id &&
    !existingIds.has(c.id) &&
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase())
  )

  function handleBack() {
    if (onBack) { onBack(); return }
    if (backHref) { router.push(backHref); return }
    router.push('/deals')
  }

  async function handleSave() {
    if (!companyId)                         { setError('Please select a company'); return }
    if (!sharePrice || sharePriceNum <= 0)  { setError('Please enter a valid share price'); return }
    if (rows.length === 0)                  { setError('Please add at least one investor'); return }
    if (rows.some(r => !(parseFloat(r.shares) > 0))) { setError('Please enter shares for all investors'); return }

    setSaving(true)
    setError('')

    // Build investor_data for completion_checklist
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

    if (isEditMode && existingDeal) {
      // ── Edit mode: update existing deal ──────────────────────────────────────
      const existingChecklist = existingDeal.completion_checklist ?? {}
      await supabase.from('deals').update({
        share_class:          shareClass || null,
        share_price:          sharePriceNum,
        investment_amount:    totals.cost || null,
        investment_date:      investmentDate,
        eis_qualifying:       eisQualifying,
        completion_checklist: { ...existingChecklist, investor_data: investorData },
        updated_at:           new Date().toISOString(),
      }).eq('id', existingDeal.id)

      // Update existing deal_investors
      for (const row of rows.filter(r => r.dealInvestorId)) {
        await supabase.from('deal_investors').update({
          amount:   computeRow(row).cost || null,
          poa_held: row.poaHeld,
        }).eq('id', row.dealInvestorId!)
      }

      // Insert new deal_investors + pending investments
      const newRows = rows.filter(r => !r.dealInvestorId)
      for (const row of newRows) {
        const { sharesNum, cost, eisStatus, sc } = computeRow(row)
        await supabase.from('deal_investors').insert({
          deal_id:        existingDeal.id,
          client_id:      row.clientId,
          amount:         cost || null,
          poa_held:       row.poaHeld,
          signing_status: 'pending',
        })
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
          fund_type:            row.fundType ?? 'syndicate',
        })
      }

      router.push(`/deals/${existingDeal.id}`)
    } else {
      // ── Create mode: insert new deal ─────────────────────────────────────────
      const { data: deal, error: dealErr } = await supabase
        .from('deals')
        .insert({
          deal_type:            dealType,
          company_id:           companyId,
          share_class:          shareClass || null,
          share_price:          sharePriceNum,
          investment_amount:    totals.cost || null,
          investment_date:      investmentDate,
          eis_qualifying:       eisQualifying,
          status:               'draft',
          completion_checklist: { investor_data: investorData },
          created_by:           user?.id ?? null,
        })
        .select('id')
        .single()

      if (dealErr || !deal) {
        setError('Failed to create deal: ' + (dealErr?.message ?? 'unknown error'))
        setSaving(false)
        return
      }

      await supabase.from('deal_investors').insert(
        rows.map(row => ({
          deal_id:        deal.id,
          client_id:      row.clientId,
          amount:         computeRow(row).cost || null,
          poa_held:       row.poaHeld,
          signing_status: 'pending',
        }))
      )

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
          fund_type:            row.fundType ?? 'syndicate',
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
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/deals" style={{ color: '#888', textDecoration: 'none' }}>Deals</Link>
        {' › '}
        {isEditMode ? (
          <button onClick={handleBack} style={{ color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}>
            {selectedCompany?.name ?? 'Deal'}
          </button>
        ) : (
          <button onClick={handleBack} style={{ color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}>
            New deal
          </button>
        )}
        {' › '}
        {isFollowOn ? 'Follow-on Investment' : 'New Investment'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>
            {isFollowOn ? 'Follow-on Investment' : 'New Investment'}
          </h1>
          {selectedCompany && (
            <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{selectedCompany.name}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleBack} className="btn btn-secondary">← Back</button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEditMode ? 'Save changes' : 'Save deal'}
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
              onChange={e => { if (!isEditMode) { setCompanyId(e.target.value); setShareClass('') } }}
              style={{ ...inputSt, background: isEditMode ? '#f9f9f7' : '#fff', color: isEditMode ? '#555' : undefined }}
              disabled={isEditMode}
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
                placeholder="0.0000"
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
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744' }}>
            Investors
            {rows.length > 0 && <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>({rows.length})</span>}
            {isEditMode && rows.some(r => !r.dealInvestorId) && (
              <span style={{ fontSize: 10, color: '#1d9e75', marginLeft: 8, fontWeight: 400 }}>
                +{rows.filter(r => !r.dealInvestorId).length} new
              </span>
            )}
          </div>
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

        {rows.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#888', fontSize: 12 }}>
            {isFollowOn && !companyId
              ? 'Select a company above to auto-populate current investors'
              : 'Search above to add investors to this deal'}
          </div>
        )}

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
                  const hasError  = !parseFloat(row.shares)
                  const isExisting = !!row.dealInvestorId

                  return (
                    <tr key={row.uid} style={{ background: hasError ? '#fffaf0' : isExisting ? undefined : '#f0faf6' }}>
                      <td style={tdSt}>
                        <div style={{ fontWeight: 500 }}>
                          {row.name}
                          {isExisting && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>existing</span>}
                        </div>
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

                      <td style={tdSt}>
                        <input
                          type="number" min="0" step="1"
                          value={row.shares}
                          onChange={e => updateRow(row.uid, { shares: e.target.value })}
                          style={{ ...inputSt, width: 90, padding: '4px 8px', border: `0.5px solid ${hasError ? '#fca5a5' : '#d0d0c8'}` }}
                          placeholder="0"
                        />
                      </td>

                      <td style={tdSt}>
                        {cost > 0 ? <span style={{ fontWeight: 500 }}>{formatCurrency(cost)}</span> : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

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

                      <td style={{ ...tdSt, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.poaHeld}
                          onChange={e => updateRow(row.uid, { poaHeld: e.target.checked })}
                          style={{ accentColor: '#1d9e75', width: 14, height: 14 }}
                        />
                      </td>

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

                      <td style={tdSt}>
                        {feePayable > 0 ? formatCurrency(feePayable) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      <td style={{ ...tdSt, fontWeight: 600 }}>
                        {totalCost > 0 ? formatCurrency(totalCost) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

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

        {rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '0.5px solid #e8e7e0', background: '#f9f9f7' }}>
            <AggCell label={`${rows.length} investor${rows.length !== 1 ? 's' : ''}`} />
            <AggCell label="Total shares" value={totals.shares > 0 ? totals.shares.toLocaleString() : undefined} />
            <AggCell label="Total cost" value={totals.cost > 0 ? formatCurrency(totals.cost) : undefined} />
            <AggCell label="Total fees" value={totals.fees > 0 ? formatCurrency(totals.fees) : undefined} />
          </div>
        )}
      </div>

      {/* Fund type prompt modal for 'both' clients */}
      {fundTypePrompt && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 340, padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Select fund type</div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 20 }}>
              <strong>{fundTypePrompt.client.full_name}</strong> is invested in both Syndicate and Multi Manager.
              Which fund type does this investment belong to?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => fundTypePrompt.resolve('syndicate')}
                className="btn btn-secondary"
                style={{ textAlign: 'left', padding: '10px 14px' }}
              >
                <div style={{ fontWeight: 600, fontSize: 12 }}>Syndicate</div>
                <div style={{ fontSize: 11, color: '#888' }}>Standard deal — no deferred management fee</div>
              </button>
              <button
                onClick={() => fundTypePrompt.resolve('multi_manager')}
                className="btn btn-secondary"
                style={{ textAlign: 'left', padding: '10px 14px', borderColor: '#e0952a' }}
              >
                <div style={{ fontWeight: 600, fontSize: 12, color: '#b97000' }}>Multi Manager</div>
                <div style={{ fontSize: 11, color: '#888' }}>Deferred management fee (2% p.a., max 10%) applies at exit</div>
              </button>
            </div>
            <button
              onClick={() => setFundTypePrompt(null)}
              style={{ marginTop: 14, fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
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
