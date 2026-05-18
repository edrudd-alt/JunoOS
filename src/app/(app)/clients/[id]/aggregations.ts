// Pure functions computing headline stat card values.
// All functions operate on pre-filtered investment arrays so
// HeadlineStats can recompute when the entity filter changes.

export interface InvestmentForAgg {
  client_id: string
  company_id: string
  shares_purchased: number
  sum_subscribed: number
  transaction_type?: string | null
}

export interface ValuationForAgg {
  company_id: string
  share_price: number
}

export interface NoteForAgg {
  flag_for_followup: boolean
}

export interface DocumentForAgg {
  type: string
}

export interface LeadForAgg {
  kyc_status: string
  kyc_expiry: string | null
}

function isBuy(inv: InvestmentForAgg): boolean {
  const t = inv.transaction_type ?? 'buy'
  return t === 'buy' || t === 'transfer_in'
}

export function totalInvestedStat(
  investments: InvestmentForAgg[],
  scopeEntityIds: string[],
): { total: number; entityCount: number } {
  const buyInvs = investments.filter(isBuy)
  const total = buyInvs.reduce((s, i) => s + (i.sum_subscribed ?? 0), 0)
  const entitiesWithInvestments = new Set(buyInvs.map(i => i.client_id))
  const entityCount = scopeEntityIds.filter(id => entitiesWithInvestments.has(id)).length
  return { total, entityCount }
}

export function currentValuationStat(
  investments: InvestmentForAgg[],
  valuations: ValuationForAgg[],
  totalInvested: number,
): { total: number; change: number; changePct: number } {
  const valMap = new Map(valuations.map(v => [v.company_id, v.share_price]))
  const total = investments.filter(isBuy).reduce((s, i) => {
    const price = valMap.get(i.company_id) ?? 0
    return s + i.shares_purchased * price
  }, 0)
  const change = total - totalInvested
  const changePct = totalInvested > 0 ? (change / totalInvested) * 100 : 0
  return { total, change, changePct }
}

export function companiesInvestedStat(
  investments: InvestmentForAgg[],
): { count: number; totalHoldings: number } {
  const buyInvs = investments.filter(isBuy)
  const companyIds = new Set(buyInvs.map(i => i.company_id).filter(Boolean))
  return { count: companyIds.size, totalHoldings: buyInvs.length }
}

export function pendingActionsStat(
  notes: NoteForAgg[],
  documents: DocumentForAgg[],
  lead: LeadForAgg,
  today: Date = new Date(),
): { count: number; subLine: string } {
  const flaggedNotes = notes.filter(n => n.flag_for_followup).length
  const hasPoa = documents.some(d => d.type === 'poa')
  const todayMs = today.getTime()
  const kycBad =
    lead.kyc_status !== 'verified' ||
    (lead.kyc_expiry ? new Date(lead.kyc_expiry).getTime() < todayMs : false)

  let count = flaggedNotes
  const parts: string[] = []
  if (flaggedNotes > 0) {
    parts.push(`${flaggedNotes} flagged ${flaggedNotes === 1 ? 'note' : 'notes'}`)
  }
  if (!hasPoa) { count++; parts.push('POA missing') }
  if (kycBad)  { count++; parts.push('KYC expired') }

  return {
    count,
    subLine: parts.length > 0 ? parts.join(' · ') : 'Nothing pending',
  }
}
