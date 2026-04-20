// ─── Deal type ────────────────────────────────────────────────────────────────

export type SellDealType = 'full_exit' | 'partial_exit'

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

// ─── Setup form data ──────────────────────────────────────────────────────────

export interface SellSetupData {
  companyId:          string
  companyName:        string
  shareClass:         string
  saleDate:           string
  grossPricePerShare: string
  netProceedsMethod:  string
  netPricePerShare:   string
  totalNetProceeds:   string
  dealCosts:          string
  notes:              string
}

// ─── Per-investor row ─────────────────────────────────────────────────────────

export interface SellInvestorRow {
  uid:                    string
  clientId:               string
  name:                   string
  email:                  string
  sharesOwned:            number
  totalCost:              number
  avgCostPrice:           number
  earliestInvestmentDate: string | null
  fundType:               'syndicate' | 'multi_manager'
  shareClass:             string
  sharesSold:             string
  sellAll:                boolean
  excluded:               boolean
  feePct:                 string
}

