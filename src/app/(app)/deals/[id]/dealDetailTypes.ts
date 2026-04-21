// ─── Shared types for DealDetail and its sub-components ──────────────────────

export interface DealInvestor {
  id: string
  amount: number | null
  signing_status: string
  poa_held: boolean
  clients: { id: string; full_name: string; email: string | null } | null
}

export interface InvestorData {
  name: string
  shares?: number
  shareClass?: string
  eis?: string
  cost?: number
  feePayable?: number
  totalCost?: number
  currentShares?: number | null
  // Sale deal fields
  totalShares?: number
  sharesSold?: number
  remaining?: number
  avgCostPrice?: number
  grossProceeds?: number
  pnl?: number
  netProceeds?: number
}

export interface CompletionChecklist {
  investor_data?: Record<string, InvestorData>
  per_investor?: Record<string, Record<string, boolean>>
  [key: string]: unknown
}

export interface CompanyInvestmentRow {
  id:               string
  client_id:        string
  investment_date:  string | null
  shares_purchased: number
  sum_subscribed:   number
  cost_basis:       number | null
  share_class:      string | null
  status:           string
}

export interface FifoLot {
  investmentId:   string
  sharesConsumed: number
  lotCostBasis:   number
  lotProceeds:    number
  gainLoss:       number
}

export interface TrancheScheduleItem {
  tranche_number:          number
  label:                   string
  percentage:              number
  timing:                  string
  contingency_description: string
  is_final_tranche:        boolean
  is_upfront:              boolean
}

export interface TrancheDef {
  tranche_number:          number
  expected_amount:         number
  expected_date:           string
  contingency_description: string
  is_final_tranche:        boolean
}

export interface DeferredData {
  upfrontTotal:         number
  totalProceedsCap:     number
  deferredPeriodMonths: number
  tranches:             TrancheDef[]
}

export interface DeferredPaymentRow {
  id:                      string
  deal_id:                 string
  client_id:               string
  tranche_number:          number
  expected_amount:         number
  actual_amount:           number | null
  actual_date:             string | null
  contingency_description: string | null
  is_final_tranche:        boolean
  status:                  string
  payment_route:           string
}

export interface DeferredNoteRow {
  id:          string
  note:        string
  created_at:  string
  created_by:  string | null
  author_name: string | null
}
