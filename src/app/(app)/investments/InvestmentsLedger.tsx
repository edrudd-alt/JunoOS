'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Client, Company, Valuation } from '@/types'
import type { RawInvestment, HoldingRow, CompanyHolding } from './ledgerUtils'
import { HoldingsView } from './HoldingsView'
import { LedgerView } from './LedgerView'
import { SalesView } from './SalesView'
import { RecordTransactionModal } from './RecordTransactionModal'

// ─── Main component ───────────────────────────────────────────────────────────

export default function InvestmentsLedger({
  investments: initialInvestments,
  companies: companiesRaw,
  clients: clientsRaw,
  valuations: valuationsRaw,
}: {
  investments: Record<string, unknown>[]
  companies: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  valuations: Record<string, unknown>[]
}) {
  const router = useRouter()
  const companies  = companiesRaw  as unknown as Company[]
  const clients    = clientsRaw    as unknown as Client[]
  const valuations = valuationsRaw as unknown as Valuation[]

  const [investments, setInvestments] = useState<RawInvestment[]>(
    initialInvestments as unknown as RawInvestment[]
  )
  const [view, setView]           = useState<'holdings' | 'ledger' | 'sales'>('holdings')
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [modalPreset, setModalPreset] = useState<{ txType?: 'buy' | 'sell'; companyId?: string } | null>(null)

  // Latest price per company (valuations already ordered desc)
  const priceByCompany = useMemo(() => {
    const map: Record<string, number> = {}
    for (const v of valuations) {
      if (!map[v.company_id]) map[v.company_id] = v.share_price
    }
    return map
  }, [valuations])

  // Client name lookup
  const clientById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of clients) m[c.id] = c.full_name
    return m
  }, [clients])

  // Compute company holdings from raw investments
  const companyHoldings = useMemo<CompanyHolding[]>(() => {
    const byCompany: Record<string, Record<string, HoldingRow>> = {}

    for (const inv of investments) {
      const compId  = inv.company_id
      const rowKey  = `${inv.client_id}::${inv.share_class}::${inv.holding_location}::${inv.holding_entity ?? ''}`
      if (!byCompany[compId]) byCompany[compId] = {}
      if (!byCompany[compId][rowKey]) {
        byCompany[compId][rowKey] = {
          clientId:      inv.client_id,
          clientName:    clientById[inv.client_id] ?? '—',
          shareClass:    inv.share_class,
          holdingLocation: inv.holding_location,
          holdingEntity: inv.holding_entity,
          sharesIn: 0, sharesOut: 0, remaining: 0,
          totalCost: 0, proceeds: 0, costOfRemaining: 0,
          currentValue: 0, unrealisedPL: 0, realisedPL: 0,
          firstDate: inv.investment_date,
        }
      }
      const row = byCompany[compId][rowKey]
      const txType = inv.transaction_type ?? 'buy'

      if (txType === 'buy' || txType === 'transfer_in') {
        row.sharesIn  += inv.shares_purchased
        row.totalCost += inv.sum_subscribed
        if (inv.investment_date < row.firstDate) row.firstDate = inv.investment_date
      } else {
        row.sharesOut  += inv.shares_purchased
        row.proceeds   += inv.sum_subscribed
      }
    }

    const result: CompanyHolding[] = []

    for (const [compId, rowsMap] of Object.entries(byCompany)) {
      const price = priceByCompany[compId] ?? 0
      const compName = investments.find(i => i.company_id === compId)?.companies?.name ?? ''

      let aggCost = 0, aggRemaining = 0, aggSold = 0, aggValue = 0
      let aggUnrealisedPL = 0, aggRealisedPL = 0
      let firstDate = ''

      const rows = Object.values(rowsMap).map(row => {
        row.remaining = row.sharesIn - row.sharesOut
        row.costOfRemaining = row.sharesIn > 0
          ? row.totalCost * (row.remaining / row.sharesIn)
          : 0
        row.currentValue  = row.remaining * price
        row.unrealisedPL  = row.currentValue - row.costOfRemaining
        const costOfSold  = row.sharesIn > 0
          ? row.totalCost * (row.sharesOut / row.sharesIn)
          : 0
        row.realisedPL    = row.proceeds - costOfSold

        aggCost       += row.totalCost
        aggRemaining  += row.remaining
        aggSold       += row.sharesOut
        aggValue      += row.currentValue
        aggUnrealisedPL += row.unrealisedPL
        aggRealisedPL   += row.realisedPL
        if (!firstDate || row.firstDate < firstDate) firstDate = row.firstDate

        return row
      })

      result.push({
        companyId:      compId,
        companyName:    compName,
        currentPrice:   price,
        rows,
        totalCost:      aggCost,
        remainingShares: aggRemaining,
        soldShares:     aggSold,
        currentValue:   aggValue,
        unrealisedPL:   aggUnrealisedPL,
        realisedPL:     aggRealisedPL,
        moic:           aggCost > 0 ? (aggValue + (aggSold > 0 ? rows.reduce((s, r) => s + r.proceeds, 0) : 0)) / aggCost : 0,
        firstDate,
      })
    }

    return result.sort((a, b) => a.companyName.localeCompare(b.companyName))
  }, [investments, priceByCompany, clientById])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openSell(companyId: string) {
    setModalPreset({ txType: 'sell', companyId })
    setShowModal(true)
  }

  function handleSaved(newInv: RawInvestment[]) {
    setInvestments(prev => [...newInv, ...prev])
    setShowModal(false)
    router.refresh()
  }

  const viewBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? '#0f2744' : '#fff',
    color: active ? '#fff' : '#555',
    border: '0.5px solid #d0d0c8',
    borderRadius: 5, cursor: 'pointer',
  })

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Investments</h1>
        <button
          className="btn btn-primary"
          style={{ fontSize: 12 }}
          onClick={() => { setModalPreset(null); setShowModal(true) }}
        >
          + Record transaction
        </button>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        <button style={viewBtnStyle(view === 'holdings')} onClick={() => setView('holdings')}>Holdings</button>
        <button style={viewBtnStyle(view === 'ledger')}   onClick={() => setView('ledger')}>Full ledger</button>
        <button style={viewBtnStyle(view === 'sales')}    onClick={() => setView('sales')}>Sales</button>
      </div>

      {/* ── Holdings view ── */}
      {view === 'holdings' && (
        <HoldingsView
          holdings={companyHoldings}
          expanded={expanded}
          onToggle={toggleExpand}
          onSell={openSell}
        />
      )}

      {/* ── Ledger view ── */}
      {view === 'ledger' && (
        <LedgerView investments={investments} clientById={clientById} />
      )}

      {/* ── Sales view ── */}
      {view === 'sales' && (
        <SalesView investments={investments} holdings={companyHoldings} clientById={clientById} />
      )}

      {/* ── Modal ── */}
      {showModal && (
        <RecordTransactionModal
          companies={companies}
          clients={clients}
          investments={investments}
          preset={modalPreset}
          onSave={handleSaved}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

