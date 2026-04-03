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
