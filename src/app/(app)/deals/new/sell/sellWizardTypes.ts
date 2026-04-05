// ─── Deal type ────────────────────────────────────────────────────────────────

export type SellDealType        = 'full_exit' | 'partial_exit'
export type NetProceedsMethod   = 'gross_less_costs' | 'given_net_price' | 'calculate_from_total'

// ─── Step definitions ─────────────────────────────────────────────────────────

export const SELL_STEPS = [
  { key: 'setup',      label: 'Setup'        },
  { key: 'investors',  label: 'Investors'    },
  { key: 'consent',    label: 'Consent'      },
  { key: 'poa',        label: 'PoA'          },
  { key: 'bank',       label: 'Bank details' },
  { key: 'review',     label: 'Review'       },
  { key: 'complete',   label: 'Complete'     },
  { key: 'settlement', label: 'Settlement'   },
  { key: 'post_deal',  label: 'Post-deal'    },
] as const

export type SellStepKey = typeof SELL_STEPS[number]['key']

// ─── Data shapes passed between wizard steps ──────────────────────────────────

export interface SellSetupData {
  companyId:          string
  companyName:        string
  grossPricePerShare: string
  saleDate:           string
  dealCosts:          string             // total £ deal costs, empty = 0
  netProceedsMethod:  NetProceedsMethod
  netPricePerShare:   string             // used when method = 'given_net_price'
  totalNetProceeds:   string             // used when method = 'calculate_from_total'
  shareClass:         string
  notes:              string
}

export interface SellInvestorRow {
  uid:                   string
  clientId:              string
  name:                  string
  email:                 string
  sharesOwned:           number
  totalCost:             number
  avgCostPrice:          number
  earliestInvestmentDate: string | null  // used for Multi-Manager fee years calc
  fundType:              'syndicate' | 'multi_manager'
  shareClass:            string
  // editable in step
  sharesSold:            string
  sellAll:               boolean
  excluded:              boolean
  feePct:                string
  // set after save
  dealInvestorId?:       string
}
