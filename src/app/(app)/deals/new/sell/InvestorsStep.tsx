'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { SellDealType, SellSetupData, SellInvestorRow } from './sellWizardTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawClient {
  id: string
  full_name: string
  email?: string | null
  default_fee_rate?: number | null
  fund_type?: string | null
  active_fund_type?: string | null
}

interface RawInvestment {
  id: string
  client_id: string
  company_id: string
  share_class?: string | null
  shares_purchased?: number | null
  sum_subscribed?: number | null
  investment_date?: string | null
  transaction_type?: string | null
}

interface ExistingInvestorData {
  sharesSold?: number
  feeRate?:    number
  excluded?:   boolean
}

interface Props {
  dealType:              SellDealType
  setupData:             SellSetupData
  clients:               Record<string, unknown>[]
  investments:           Record<string, unknown>[]
  onBack:                () => void
  existingDealId?:       string
  existingInvestorData?: Record<string, ExistingInvestorData>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10) }

function resolveClientFundType(c: RawClient): 'syndicate' | 'multi_manager' {
  const ft = c.active_fund_type ?? c.fund_type
  return ft === 'multi_manager' ? 'multi_manager' : 'syndicate'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvestorsStep({
  dealType, setupData, clients: clientsRaw, investments: investmentsRaw,
  onBack, existingDealId, existingInvestorData,
}: Props) {
  const clients     = clientsRaw     as unknown as RawClient[]
  const investments = investmentsRaw as unknown as RawInvestment[]
  const router      = useRouter()
  const supabase    = createClient()

  const isFullExit  = dealType === 'full_exit'
  const isEditMode  = !!existingDealId
  const grossPriceNum = parseFloat(setupData.grossPricePerShare) || 0

  // ── Build net holdings for the selected company ────────────────────────────
  const holdingsMap = useMemo(() => {
    const map = new Map<string, {
      sharesOwned:    number
      totalCost:      number
      totalBuyShares: number
      shareClass:     string
      earliestDate:   string | null
      isNegative:     boolean
    }>()

    for (const inv of investments) {
      if (inv.company_id !== setupData.companyId) continue
      const clientId = inv.client_id
      const isSell   = inv.transaction_type === 'sell' || inv.transaction_type === 'transfer_out'
      const shares   = inv.shares_purchased ?? 0
      const cost     = inv.sum_subscribed   ?? 0
      const date     = inv.investment_date  ?? null

      if (!map.has(clientId)) {
        map.set(clientId, {
          sharesOwned:    isSell ? -shares : shares,
          totalCost:      isSell ? 0 : cost,
          totalBuyShares: isSell ? 0 : shares,
          shareClass:     inv.share_class ?? '',
          earliestDate:   isSell ? null : date,
          isNegative:     false,
        })
      } else {
        const h = map.get(clientId)!
        if (isSell) {
          h.sharesOwned -= shares
        } else {
          h.sharesOwned    += shares
          h.totalCost      += cost
          h.totalBuyShares += shares
          if (date && (!h.earliestDate || date < h.earliestDate)) {
            h.earliestDate = date
          }
        }
      }
    }

    // Flag negative balances (data anomaly)
    for (const h of map.values()) {
      if (h.sharesOwned < 0) h.isNegative = true
    }

    return map
  }, [investments, setupData.companyId])

  // ── Detect negative-share anomalies ───────────────────────────────────────
  const negativeClients = useMemo(() => {
    const names: string[] = []
    for (const [clientId, h] of holdingsMap) {
      if (!h.isNegative) continue
      const client = clients.find(c => c.id === clientId)
      names.push(client?.full_name ?? clientId)
    }
    return names
  }, [holdingsMap, clients])

  // ── Initial rows ──────────────────────────────────────────────────────────
  const [rows, setRows] = useState<SellInvestorRow[]>(() => {
    const result: SellInvestorRow[] = []
    for (const [clientId, holding] of holdingsMap) {
      if (holding.sharesOwned <= 0) continue
      const client = clients.find(c => c.id === clientId)
      if (!client) continue

      const avgCostPrice  = holding.totalBuyShares > 0 ? holding.totalCost / holding.totalBuyShares : 0
      const iData         = existingInvestorData?.[clientId]
      const prefilledSold = iData?.sharesSold != null
        ? String(iData.sharesSold)
        : isFullExit ? String(holding.sharesOwned) : ''
      const sellAll       = parseFloat(prefilledSold) === holding.sharesOwned

      result.push({
        uid:                    uid(),
        clientId,
        name:                   client.full_name,
        email:                  client.email ?? '',
        sharesOwned:            holding.sharesOwned,
        totalCost:              holding.totalCost,
        avgCostPrice,
        earliestInvestmentDate: holding.earliestDate,
        fundType:               resolveClientFundType(client),
        shareClass:             setupData.shareClass || holding.shareClass,
        sharesSold:             prefilledSold,
        sellAll,
        excluded:               iData?.excluded ?? false,
        feePct:                 String(iData?.feeRate ?? client.default_fee_rate ?? 2),
      })
    }
    return result
  })

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function updateRow(rowUid: string, updates: Partial<SellInvestorRow>) {
    setRows(prev => prev.map(r => r.uid === rowUid ? { ...r, ...updates } : r))
  }

  function toggleSellAll(rowUid: string, checked: boolean) {
    setRows(prev => prev.map(r => r.uid === rowUid
      ? { ...r, sellAll: checked, sharesSold: checked ? String(r.sharesOwned) : '' }
      : r))
  }

  const activeRows = rows.filter(r => !r.excluded)

  const computeRow = useCallback((row: SellInvestorRow) => {
    const sharesSoldNum  = parseFloat(row.sharesSold) || 0
    const grossProceeds  = sharesSoldNum * grossPriceNum
    const costOfSold     = row.sharesOwned > 0 ? (row.totalCost / row.sharesOwned) * sharesSoldNum : 0
    const pnl            = grossProceeds - costOfSold
    const remaining      = row.sharesOwned - sharesSoldNum
    const oversold       = sharesSoldNum > row.sharesOwned
    return { sharesSoldNum, grossProceeds, pnl, remaining, oversold }
  }, [grossPriceNum])

  const totals = useMemo(() => activeRows.reduce((acc, row) => {
    const { sharesSoldNum, grossProceeds, pnl } = computeRow(row)
    return {
      shares: acc.shares + sharesSoldNum,
      gross:  acc.gross  + grossProceeds,
      pnl:    acc.pnl    + pnl,
    }
  }, { shares: 0, gross: 0, pnl: 0 }), [activeRows, computeRow])

  const hasOversold = activeRows.some(r => computeRow(r).oversold)

  async function handleSave() {
    if (activeRows.length === 0) { setError('No investors to include'); return }
    if (!isFullExit && activeRows.some(r => !parseFloat(r.sharesSold))) {
      setError('Please enter shares sold for all included investors'); return
    }
    if (hasOversold) { setError('One or more investors have more shares sold than currently held'); return }

    setSaving(true)
    setError('')

    const dealCostsNum     = parseFloat(setupData.dealCosts) || 0
    const grossPricePerShr = parseFloat(setupData.grossPricePerShare) || 0

    const investorData: Record<string, unknown> = {}
    for (const row of activeRows) {
      const { sharesSoldNum, grossProceeds, pnl, remaining } = computeRow(row)
      const feePct = parseFloat(row.feePct) || 0
      investorData[row.clientId] = {
        name:           row.name,
        sharesOwned:    row.sharesOwned,
        sharesSold:     sharesSoldNum,
        remaining,
        avgCostPrice:   row.avgCostPrice,
        totalCost:      row.totalCost,
        grossProceeds,
        pnl,
        feeRate:        feePct,
        shareClass:     row.shareClass,
        fundType:       row.fundType,
        earliestInvestmentDate: row.earliestInvestmentDate,
      }
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (isEditMode && existingDealId) {
      // ── Edit mode: update deal + replace deal_investors ──────────────────

      // Fetch existing completion_checklist to preserve setup fields
      const { data: existingDeal } = await supabase
        .from('deals')
        .select('completion_checklist')
        .eq('id', existingDealId)
        .single()

      const existingCC = (existingDeal?.completion_checklist ?? {}) as Record<string, unknown>

      const { error: dealUpdErr } = await supabase
        .from('deals')
        .update({
          investment_amount:    totals.gross || null,
          completion_checklist: { ...existingCC, investor_data: investorData },
          updated_at:           new Date().toISOString(),
        })
        .eq('id', existingDealId)

      if (dealUpdErr) {
        setError('Failed to update deal: ' + dealUpdErr.message)
        setSaving(false)
        return
      }

      await supabase.from('deal_investors').delete().eq('deal_id', existingDealId)

      const { error: diErr } = await supabase.from('deal_investors').insert(
        activeRows.map(row => ({
          deal_id:        existingDealId,
          client_id:      row.clientId,
          amount:         computeRow(row).grossProceeds || null,
          poa_held:       false,
          signing_status: 'pending',
        }))
      )
      if (diErr) {
        setError('Failed to update investors: ' + diErr.message)
        setSaving(false)
        return
      }

      router.push(`/deals/${existingDealId}`)
      return
    }

    // ── Create mode ──────────────────────────────────────────────────────────

    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .insert({
        deal_type:         dealType,
        company_id:        setupData.companyId,
        share_price:       grossPricePerShr,
        share_class:       setupData.shareClass || null,
        investment_amount: totals.gross || null,
        investment_date:   setupData.saleDate,
        status:            'draft',
        notes:             setupData.notes || null,
        completion_checklist: {
          investor_data:         investorData,
          gross_price_per_share: grossPricePerShr,
          deal_costs:            dealCostsNum,
          net_proceeds_method:   setupData.netProceedsMethod,
          net_price_per_share:   parseFloat(setupData.netPricePerShare) || null,
          total_net_proceeds:    parseFloat(setupData.totalNetProceeds) || null,
        },
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()

    if (dealErr || !deal) {
      setError('Failed to create deal: ' + (dealErr?.message ?? 'unknown error'))
      setSaving(false)
      return
    }

    const { error: diErr } = await supabase.from('deal_investors').insert(
      activeRows.map(row => ({
        deal_id:        deal.id,
        client_id:      row.clientId,
        amount:         computeRow(row).grossProceeds || null,
        poa_held:       false,
        signing_status: 'pending',
      }))
    )
    if (diErr) {
      setError('Failed to add deal investors: ' + diErr.message)
      setSaving(false)
      return
    }

    await supabase.from('internal_updates').insert({
      company_id:  setupData.companyId,
      update_type: 'deal',
      description: `Deal created: ${isFullExit ? 'Full exit' : 'Partial exit'} — ${setupData.companyName} (${activeRows.length} investor${activeRows.length !== 1 ? 's' : ''})`,
      created_by:  user?.id ?? null,
    })

    router.push(`/deals/${deal.id}`)
  }

  return (
    <div>
      {/* Setup summary strip */}
      <div style={{
        background: '#f9f9f7', border: '0.5px solid #e8e7e0',
        borderRadius: 6, padding: '10px 16px', fontSize: 12,
        display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap',
      }}>
        <span><span style={{ color: '#888' }}>Company: </span><strong>{setupData.companyName}</strong></span>
        <span><span style={{ color: '#888' }}>Gross price: </span><strong>£{parseFloat(setupData.grossPricePerShare).toFixed(4)}</strong></span>
        <span><span style={{ color: '#888' }}>Date: </span><strong>{setupData.saleDate}</strong></span>
        {setupData.dealCosts && <span><span style={{ color: '#888' }}>Deal costs: </span><strong>{formatCurrency(parseFloat(setupData.dealCosts))}</strong></span>}
      </div>

      {/* Negative-share warning */}
      {negativeClients.length > 0 && (
        <div style={{ background: '#fff7ed', border: '0.5px solid #fdba74', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#92400e', marginBottom: 16 }}>
          Data anomaly: the following investors appear to have a negative share balance — check their investment records before proceeding: <strong>{negativeClients.join(', ')}</strong>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#a32d2d', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'visible', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744' }}>
            Investors
            {rows.length > 0 && <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>({activeRows.length} included{rows.length > activeRows.length ? `, ${rows.length - activeRows.length} excluded` : ''})</span>}
          </div>
          {rows.length === 0 && (
            <span style={{ fontSize: 11, color: '#888' }}>No active holdings found for {setupData.companyName}</span>
          )}
        </div>

        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  <th style={thSt}>Investor</th>
                  <th style={thSt}>Shares owned</th>
                  <th style={thSt}>Avg cost</th>
                  <th style={thSt}>Fund type</th>
                  <th style={{ ...thSt, textAlign: 'center' }}>{isFullExit ? 'All shares' : 'Sell all?'}</th>
                  <th style={thSt}>Shares to sell</th>
                  <th style={thSt}>Gross proceeds</th>
                  <th style={thSt}>P&amp;L</th>
                  <th style={thSt}>Fee %</th>
                  <th style={{ ...thSt, textAlign: 'center' }}>Exclude</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const { sharesSoldNum, grossProceeds, pnl, remaining, oversold } = computeRow(row)
                  const rowBg = row.excluded ? '#fafaf8' : oversold ? '#fef2f2' : undefined

                  return (
                    <tr key={row.uid} style={{ background: rowBg, opacity: row.excluded ? 0.5 : 1 }}>
                      <td style={tdSt}>
                        <div style={{ fontWeight: 500 }}>{row.name}</div>
                        {row.email && <div style={{ fontSize: 10, color: '#aaa' }}>{row.email}</div>}
                      </td>

                      <td style={tdSt}>
                        <div>{row.sharesOwned.toLocaleString()}</div>
                        {row.shareClass && <div style={{ fontSize: 10, color: '#888' }}>{row.shareClass}</div>}
                      </td>

                      <td style={tdSt}>
                        {row.avgCostPrice > 0
                          ? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>£{row.avgCostPrice.toFixed(4)}</span>
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      <td style={tdSt}>
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 3,
                          background: row.fundType === 'multi_manager' ? '#f0f6ff' : '#f0fdf7',
                          color: row.fundType === 'multi_manager' ? '#185fa5' : '#1d9e75',
                          fontWeight: 500,
                        }}>
                          {row.fundType === 'multi_manager' ? 'Multi-Manager' : 'Syndicate'}
                        </span>
                      </td>

                      <td style={{ ...tdSt, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.sellAll}
                          disabled={row.excluded}
                          onChange={e => toggleSellAll(row.uid, e.target.checked)}
                        />
                      </td>

                      <td style={tdSt}>
                        {row.sellAll || isFullExit ? (
                          <span>{row.sharesOwned.toLocaleString()}</span>
                        ) : (
                          <input
                            type="number" min="0" step="1"
                            value={row.sharesSold}
                            disabled={row.excluded}
                            onChange={e => updateRow(row.uid, { sharesSold: e.target.value })}
                            style={{
                              ...inputSt, width: 100, padding: '4px 8px',
                              border: `0.5px solid ${oversold ? '#fca5a5' : '#d0d0c8'}`,
                            }}
                            placeholder="0"
                            max={row.sharesOwned}
                          />
                        )}
                        {oversold && <div style={{ fontSize: 10, color: '#a32d2d', marginTop: 2 }}>Exceeds holding</div>}
                        {!row.excluded && !oversold && !row.sellAll && sharesSoldNum > 0 && (
                          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                            {remaining.toLocaleString()} remaining
                          </div>
                        )}
                      </td>

                      <td style={tdSt}>
                        {grossProceeds > 0
                          ? formatCurrency(grossProceeds)
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      <td style={tdSt}>
                        {sharesSoldNum > 0 ? (
                          <span style={{ color: pnl > 0 ? '#1d9e75' : pnl < 0 ? '#a32d2d' : '#555' }}>
                            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                          </span>
                        ) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      <td style={tdSt}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <input
                            type="number" min="0" max="100" step="0.5"
                            value={row.feePct}
                            disabled={row.excluded}
                            onChange={e => updateRow(row.uid, { feePct: e.target.value })}
                            style={{ ...inputSt, width: 55, padding: '4px 6px' }}
                          />
                          <span style={{ fontSize: 11, color: '#888' }}>%</span>
                        </div>
                      </td>

                      <td style={{ ...tdSt, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.excluded}
                          onChange={e => updateRow(row.uid, { excluded: e.target.checked })}
                          title="Exclude from deal"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeRows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '0.5px solid #e8e7e0', background: '#f9f9f7' }}>
            <AggCell label={`${activeRows.length} investor${activeRows.length !== 1 ? 's' : ''}`} />
            <AggCell label="Shares sold"    value={totals.shares > 0 ? totals.shares.toLocaleString() : undefined} />
            <AggCell label="Gross proceeds" value={totals.gross  > 0 ? formatCurrency(totals.gross)  : undefined} />
            <AggCell label="Total P&L"      value={totals.shares > 0 ? (totals.pnl >= 0 ? '+' : '') + formatCurrency(totals.pnl) : undefined} highlight />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} className="btn btn-secondary" disabled={saving}>← Back</button>
        <button
          onClick={handleSave}
          className="btn btn-primary"
          disabled={saving || hasOversold || activeRows.length === 0}
        >
          {saving ? 'Saving…' : isEditMode ? 'Save changes →' : 'Save deal →'}
        </button>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AggCell({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <div style={{ padding: '10px 16px', borderRight: '0.5px solid #e8e7e0' }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      {value && <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: highlight ? '#1d9e75' : '#0f2744' }}>{value}</div>}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 12, outline: 'none', boxSizing: 'border-box',
  background: '#fff', fontFamily: 'inherit',
}
const thSt: React.CSSProperties = {
  padding: '8px 12px', fontSize: 10, fontWeight: 500, color: '#aaa',
  textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em',
  borderBottom: '0.5px solid #e8e7e0', whiteSpace: 'nowrap', fontFamily: 'inherit',
}
const tdSt: React.CSSProperties = {
  padding: '10px 12px', fontSize: 12, borderBottom: '0.5px solid #f5f5f2',
  verticalAlign: 'middle', fontFamily: 'inherit',
}
