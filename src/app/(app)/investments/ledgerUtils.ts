// ─── Shared types, formatters, and constants for the investments ledger ───────

export type TxType = 'buy' | 'sell' | 'transfer_in' | 'transfer_out'

export interface RawInvestment {
  id: string
  client_id: string
  company_id: string
  share_class: string
  investment_date: string
  original_share_price: number
  shares_purchased: number
  sum_subscribed: number
  eis_status: string
  holding_entity: string | null
  holding_location: string
  status: string
  transaction_type: TxType
  cost_basis: number | null
  transfer_counterparty_id: string | null
  transfer_type: string | null
  notes: string | null
  fund_type: string
  companies: { id: string; name: string } | null
}

export interface HoldingRow {
  clientId: string
  clientName: string
  shareClass: string
  holdingLocation: string
  holdingEntity: string | null
  sharesIn: number
  sharesOut: number
  remaining: number
  totalCost: number
  proceeds: number
  costOfRemaining: number
  currentValue: number
  unrealisedPL: number
  realisedPL: number
  firstDate: string
}

export interface CompanyHolding {
  companyId: string
  companyName: string
  currentPrice: number
  rows: HoldingRow[]
  totalCost: number
  remainingShares: number
  soldShares: number
  currentValue: number
  unrealisedPL: number
  realisedPL: number
  moic: number
  firstDate: string
}

export function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

export function pct(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

export function moicFmt(cost: number, value: number) {
  if (cost <= 0) return '—'
  return `${(value / cost).toFixed(2)}x`
}

export function irrFmt(cost: number, value: number, firstDate: string) {
  if (cost <= 0 || value <= 0 || !firstDate) return '—'
  const years = (Date.now() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24 * 365)
  if (years < 0.1) return '—'
  const r = (Math.pow(value / cost, 1 / years) - 1) * 100
  return pct(r)
}

export function holdPeriod(firstDate: string) {
  if (!firstDate) return '—'
  const days = (Date.now() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24)
  if (days < 365) return `${Math.round(days)}d`
  return `${(days / 365).toFixed(1)}y`
}

export const TX_COLORS: Record<TxType, string> = {
  buy:          '#1d9e75',
  sell:         '#a32d2d',
  transfer_in:  '#6b40c4',
  transfer_out: '#6b40c4',
}

export const TX_LABELS: Record<TxType, string> = {
  buy:          'Buy',
  sell:         'Sell',
  transfer_in:  'Transfer in',
  transfer_out: 'Transfer out',
}
