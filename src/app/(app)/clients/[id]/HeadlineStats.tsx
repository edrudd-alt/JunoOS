import { formatCurrency } from '@/lib/utils'
import {
  totalInvestedStat, currentValuationStat, companiesInvestedStat, pendingActionsStat,
} from './aggregations'
import type {
  InvestmentForAgg, ValuationForAgg, NoteForAgg, DocumentForAgg, LeadForAgg,
} from './aggregations'

interface Props {
  investments: InvestmentForAgg[]
  valuations: ValuationForAgg[]
  scopeEntityIds: string[]
  notes: NoteForAgg[]
  documents: DocumentForAgg[]
  lead: LeadForAgg
}

export default function HeadlineStats({
  investments, valuations, scopeEntityIds, notes, documents, lead,
}: Props) {
  const { total: totalInvested, entityCount } = totalInvestedStat(investments, scopeEntityIds)
  const { total: currentVal, change, changePct } = currentValuationStat(investments, valuations, totalInvested)
  const { count: companiesCount, totalHoldings } = companiesInvestedStat(investments)
  const { count: pendingCount, subLine: pendingSubLine } = pendingActionsStat(notes, documents, lead)

  const entitySubLine = entityCount === 1 ? '1 entity' : `across ${entityCount} entities`
  const changeSign = change >= 0 ? '+' : ''
  const changeColor = change >= 0 ? '#0f6e56' : '#a32d2d'
  const changeLabel = `${changeSign}${formatCurrency(change)} (${changeSign}${changePct.toFixed(1)}%)`

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 10,
        marginBottom: 16,
      }}
    >
      <Card label="Total invested" value={formatCurrency(totalInvested)} sub={entitySubLine} />
      <Card
        label="Current valuation"
        value={formatCurrency(currentVal)}
        sub={totalInvested > 0 ? changeLabel : '—'}
        subColor={totalInvested > 0 ? changeColor : '#aaa'}
      />
      <Card
        label="Companies invested"
        value={String(companiesCount)}
        sub={`${totalHoldings} ${totalHoldings === 1 ? 'holding' : 'holdings'} total`}
      />
      <Card
        label="Pending actions"
        value={String(pendingCount)}
        sub={pendingSubLine}
        subColor={pendingCount > 0 ? '#ba7517' : '#aaa'}
      />
    </div>
  )
}

function Card({
  label, value, sub, subColor = '#aaa',
}: {
  label: string
  value: string
  sub: string
  subColor?: string
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid #e8e7e0',
        borderRadius: 8,
        padding: '13px 16px',
      }}
    >
      <div style={{ fontSize: 11, color: '#999', marginBottom: 5 }}>{label}</div>
      <div
        style={{
          fontSize: 20, fontWeight: 500, color: '#0f2744',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, marginTop: 3, color: subColor, fontVariantNumeric: 'tabular-nums' }}>
        {sub}
      </div>
    </div>
  )
}
