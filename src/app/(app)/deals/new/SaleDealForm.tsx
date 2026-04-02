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

interface SaleRow {
  uid: string
  clientId: string
  name: string
  email: string
  // Current aggregated holding
  totalShares: number
  totalCost: number
  avgCostPrice: number
  shareClass: string
  // Sale data
  sharesSold: string  // editable for partial exit
  poaConfirmed: boolean
  bankDetailsReceived: boolean
  feePct: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10) }

// ─── Component ────────────────────────────────────────────────────────────────

export default function SaleDealForm({
  dealType,
  companies: companiesRaw,
  clients: clientsRaw,
  investments: investmentsRaw,
  onBack,
}: {
  dealType: 'full_exit' | 'partial_exit'
  companies: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  investments: Record<string, unknown>[]
  onBack: () => void
}) {
  const companies   = companiesRaw   as unknown as Company[]
  const clients     = clientsRaw     as unknown as Client[]
  const investments = investmentsRaw as unknown as ActiveInvestment[]
  const router      = useRouter()
  const supabase    = createClient()

  const isFullExit = dealType === 'full_exit'

  // Deal header
  const [companyId,   setCompanyId]   = useState('')
  const [salePrice,   setSalePrice]   = useState('')
  const [saleDate,    setSaleDate]    = useState(new Date().toISOString().slice(0, 10))

  // Rows
  const [rows,   setRows]   = useState<SaleRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const selectedCompany = companies.find(c => c.id === companyId)
  const salePriceNum    = parseFloat(salePrice) || 0

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

  // Auto-populate rows when company changes
  useEffect(() => {
    if (!companyId) { setRows([]); return }
    const holdings = holdingsByCompany.get(companyId)
    if (!holdings) { setRows([]); return }

    const newRows: SaleRow[] = []
    for (const [clientId, holding] of holdings) {
      const client = clients.find(c => c.id === clientId)
      if (!client) continue
      const avgCostPrice = holding.shares > 0 ? holding.cost / holding.shares : 0
      newRows.push({
        uid:                 uid(),
        clientId,
        name:                client.full_name,
        email:               client.email ?? '',
        totalShares:         holding.shares,
        totalCost:           holding.cost,
        avgCostPrice,
        shareClass:          holding.shareClass,
        sharesSold:          isFullExit ? String(holding.shares) : '',
        poaConfirmed:        false,
        bankDetailsReceived: false,
        feePct:              String(client.default_fee_rate || 2),
      })
    }
    setRows(newRows)
  }, [companyId, holdingsByCompany, clients, isFullExit])

  // Compute derived values for a single row
  const computeRow = useCallback((row: SaleRow) => {
    const sharesSoldNum  = parseFloat(row.sharesSold) || 0
    const grossProceeds  = sharesSoldNum * salePriceNum
    const costOfSold     = row.totalShares > 0
      ? (row.totalCost / row.totalShares) * sharesSoldNum
      : 0
    const pnl            = grossProceeds - costOfSold
    const feePct         = parseFloat(row.feePct) || 0
    const feePayable     = pnl > 0 ? pnl * feePct / 100 : 0
    const netProceeds    = grossProceeds - feePayable
    const remaining      = row.totalShares - sharesSoldNum
    const remainingPct   = row.totalShares > 0 ? (remaining / row.totalShares) * 100 : 0
    const oversold       = sharesSoldNum > row.totalShares
    const lowRemaining   = !isFullExit && remaining > 0 && remainingPct < 5

    return {
      sharesSoldNum, grossProceeds, costOfSold,
      pnl, feePct, feePayable, netProceeds,
      remaining, remainingPct, oversold, lowRemaining,
    }
  }, [salePriceNum, isFullExit])

  // Aggregates
  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      const { sharesSoldNum, grossProceeds, pnl, feePayable, netProceeds } = computeRow(row)
      return {
        shares:       acc.shares       + sharesSoldNum,
        grossProceeds: acc.grossProceeds + grossProceeds,
        pnl:          acc.pnl          + pnl,
        fees:         acc.fees         + feePayable,
        netProceeds:  acc.netProceeds  + netProceeds,
      }
    }, { shares: 0, grossProceeds: 0, pnl: 0, fees: 0, netProceeds: 0 })
  }, [rows, computeRow])

  function updateRow(rowUid: string, updates: Partial<SaleRow>) {
    setRows(prev => prev.map(r => r.uid === rowUid ? { ...r, ...updates } : r))
  }

  // Validation
  const hasOversold = rows.some(r => computeRow(r).oversold)
  const hasLowRemaining = rows.some(r => computeRow(r).lowRemaining)

  async function handleSave() {
    if (!companyId)                  { setError('Please select a company'); return }
    if (!salePrice || salePriceNum <= 0) { setError('Please enter a valid sale price'); return }
    if (rows.length === 0)           { setError('No investors found for this company'); return }
    const missingShares = rows.some(r => !(parseFloat(r.sharesSold) > 0))
    if (missingShares)               { setError('Please enter shares sold for all investors'); return }
    if (hasOversold)                 { setError('One or more investors have more shares sold than currently held'); return }

    setSaving(true)
    setError('')

    // Build investor_data for completion_checklist
    const investorData: Record<string, {
      name: string; totalShares: number; sharesSold: number; remaining: number
      avgCostPrice: number; grossProceeds: number; pnl: number
      feeRate: number; feePayable: number; netProceeds: number
      shareClass: string; poaConfirmed: boolean; bankDetailsReceived: boolean
    }> = {}
    for (const row of rows) {
      const { sharesSoldNum, grossProceeds, pnl, feePct, feePayable, netProceeds, remaining } = computeRow(row)
      investorData[row.clientId] = {
        name:                row.name,
        totalShares:         row.totalShares,
        sharesSold:          sharesSoldNum,
        remaining,
        avgCostPrice:        row.avgCostPrice,
        grossProceeds,
        pnl,
        feeRate:             feePct,
        feePayable,
        netProceeds,
        shareClass:          row.shareClass,
        poaConfirmed:        row.poaConfirmed,
        bankDetailsReceived: row.bankDetailsReceived,
      }
    }

    const { data: { user } } = await supabase.auth.getUser()

    const totalGrossProceeds = totals.grossProceeds

    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .insert({
        deal_type:         dealType,
        company_id:        companyId,
        share_price:       salePriceNum,
        investment_amount: totalGrossProceeds || null,
        investment_date:   saleDate,
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
        amount:         computeRow(row).grossProceeds || null,
        poa_held:       row.poaConfirmed,
        signing_status: 'pending',
      }))
    )

    await supabase.from('internal_updates').insert({
      company_id:  companyId,
      update_type: 'deal',
      description: `Deal created: ${isFullExit ? 'Full exit' : 'Partial exit'} — ${selectedCompany?.name ?? ''} (${rows.length} investor${rows.length !== 1 ? 's' : ''})`,
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
        {isFullExit ? 'Full Exit' : 'Partial Exit'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>
            {isFullExit ? 'Full Exit' : 'Partial Exit'}
          </h1>
          {selectedCompany && (
            <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{selectedCompany.name}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onBack} className="btn btn-secondary">← Back</button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving || hasOversold}>
            {saving ? 'Saving…' : 'Save deal'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#a32d2d', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {hasLowRemaining && (
        <div style={{ background: '#fffbeb', border: '0.5px solid #fcd34d', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#92400e', marginBottom: 16 }}>
          Warning: one or more investors will have less than 5% of their holding remaining.
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
              onChange={e => setCompanyId(e.target.value)}
              style={inputSt}
            >
              <option value="">Select company…</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelSt}>Sale price per share *</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#888', pointerEvents: 'none' }}>£</span>
              <input
                type="number" min="0" step="0.0001"
                value={salePrice}
                onChange={e => setSalePrice(e.target.value)}
                style={{ ...inputSt, paddingLeft: 24 }}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label style={labelSt}>Sale date *</label>
            <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} style={inputSt} />
          </div>
        </div>
      </div>

      {/* ── Investor table ── */}
      <div className="card" style={{ padding: 0, overflow: 'visible' }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744' }}>
            Investors
            {rows.length > 0 && <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>({rows.length})</span>}
          </div>
          {companyId && rows.length === 0 && (
            <span style={{ fontSize: 11, color: '#888' }}>No active investments found for this company</span>
          )}
        </div>

        {/* Empty state */}
        {!companyId && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#888', fontSize: 12 }}>
            Select a company above to auto-populate current investors
          </div>
        )}

        {/* Table */}
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  <th style={thSt}>Investor</th>
                  <th style={thSt}>Current holding</th>
                  <th style={thSt}>Avg cost price</th>
                  <th style={thSt}>{isFullExit ? 'Shares sold' : 'Shares sold *'}</th>
                  <th style={thSt}>Gross proceeds</th>
                  <th style={thSt}>P&amp;L</th>
                  <th style={thSt}>Fee %</th>
                  <th style={thSt}>Fee payable</th>
                  <th style={thSt}>Net proceeds</th>
                  {!isFullExit && <th style={thSt}>Remaining</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const {
                    sharesSoldNum, grossProceeds, pnl, feePayable, netProceeds,
                    remaining, oversold, lowRemaining,
                  } = computeRow(row)

                  const rowBg = oversold ? '#fef2f2' : lowRemaining ? '#fffbeb' : undefined

                  return (
                    <tr key={row.uid} style={{ background: rowBg }}>
                      {/* Investor */}
                      <td style={tdSt}>
                        <div style={{ fontWeight: 500 }}>{row.name}</div>
                        {row.email && <div style={{ fontSize: 10, color: '#aaa' }}>{row.email}</div>}
                      </td>

                      {/* Current holding */}
                      <td style={tdSt}>
                        <div style={{ fontWeight: 500 }}>{row.totalShares.toLocaleString()}</div>
                        {row.shareClass && <div style={{ fontSize: 10, color: '#888' }}>{row.shareClass}</div>}
                        <div style={{ fontSize: 10, color: '#aaa' }}>{formatCurrency(row.totalCost)}</div>
                      </td>

                      {/* Avg cost price */}
                      <td style={tdSt}>
                        {row.avgCostPrice > 0
                          ? <span style={{ fontFamily: 'monospace' }}>{formatCurrency(row.avgCostPrice)}</span>
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      {/* Shares sold */}
                      <td style={tdSt}>
                        {isFullExit ? (
                          <span style={{ fontWeight: 500 }}>{row.totalShares.toLocaleString()}</span>
                        ) : (
                          <input
                            type="number" min="0" step="1"
                            value={row.sharesSold}
                            onChange={e => updateRow(row.uid, { sharesSold: e.target.value })}
                            style={{
                              ...inputSt, width: 100, padding: '4px 8px',
                              border: `0.5px solid ${oversold ? '#fca5a5' : '#d0d0c8'}`,
                            }}
                            placeholder="0"
                            max={row.totalShares}
                          />
                        )}
                        {oversold && (
                          <div style={{ fontSize: 10, color: '#a32d2d', marginTop: 2 }}>Exceeds holding</div>
                        )}
                      </td>

                      {/* Gross proceeds */}
                      <td style={tdSt}>
                        {grossProceeds > 0
                          ? <span style={{ fontWeight: 500 }}>{formatCurrency(grossProceeds)}</span>
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      {/* P&L */}
                      <td style={tdSt}>
                        {sharesSoldNum > 0 ? (
                          <span style={{
                            fontWeight: 500,
                            color: pnl > 0 ? '#1d9e75' : pnl < 0 ? '#a32d2d' : '#555',
                          }}>
                            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                          </span>
                        ) : <span style={{ color: '#ccc' }}>—</span>}
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
                        {pnl <= 0 && sharesSoldNum > 0 && (
                          <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>No fee (loss)</div>
                        )}
                      </td>

                      {/* Fee payable */}
                      <td style={tdSt}>
                        {feePayable > 0 ? formatCurrency(feePayable) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      {/* Net proceeds */}
                      <td style={{ ...tdSt, fontWeight: 600 }}>
                        {netProceeds > 0 ? formatCurrency(netProceeds) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>

                      {/* Remaining (partial only) */}
                      {!isFullExit && (
                        <td style={tdSt}>
                          {sharesSoldNum > 0 && !oversold ? (
                            <span style={{ color: lowRemaining ? '#92400e' : '#555' }}>
                              {remaining.toLocaleString()}
                              {lowRemaining && <span style={{ fontSize: 10, marginLeft: 4 }}>⚠</span>}
                            </span>
                          ) : <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Aggregate strip */}
        {rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderTop: '0.5px solid #e8e7e0', background: '#f9f9f7' }}>
            <AggCell label={`${rows.length} investor${rows.length !== 1 ? 's' : ''}`} />
            <AggCell label="Shares sold" value={totals.shares > 0 ? totals.shares.toLocaleString() : undefined} />
            <AggCell label="Gross proceeds" value={totals.grossProceeds > 0 ? formatCurrency(totals.grossProceeds) : undefined} />
            <AggCell label="Total fees" value={totals.fees > 0 ? formatCurrency(totals.fees) : undefined} />
            <AggCell
              label="Net proceeds"
              value={totals.netProceeds > 0 ? formatCurrency(totals.netProceeds) : undefined}
              highlight
            />
          </div>
        )}
      </div>
    </div>
  )
}

function AggCell({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <div style={{ padding: '10px 16px', borderRight: '0.5px solid #e8e7e0' }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      {value && <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: highlight ? '#1d9e75' : '#0f2744' }}>{value}</div>}
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
