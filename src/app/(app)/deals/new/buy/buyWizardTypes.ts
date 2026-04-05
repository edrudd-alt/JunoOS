// ─── Shared types and constants for the Buy Deal Wizard ───────────────────────

export type BuyDealType = 'new_investment' | 'follow_on'
export type EisStatus   = 'yes' | 'no' | 'tbc'

export interface SetupData {
  companyId:      string
  companyName:    string
  shareClass:     string
  sharePrice:     string    // kept as string for input binding; parsed on save
  investmentDate: string    // YYYY-MM-DD
  eisQualifying:  EisStatus
}

export interface InvestorRow {
  uid:                string
  clientId:           string
  name:               string
  email:              string
  currentShares:      number | null
  currentValue:       number | null
  currentShareClass:  string | null
  shares:             string
  shareClassOverride: string | null
  eisOverride:        EisStatus | null
  poaHeld:            boolean
  feePct:             string
  fundType:           'syndicate' | 'multi_manager'
}

export const BUY_STEPS = [
  { key: 'setup',     label: 'Setup'    },
  { key: 'investors', label: 'Investors' },
  { key: 'review',    label: 'Review'   },
  { key: 'send',      label: 'Send'     },
  { key: 'track',     label: 'Track'    },
  { key: 'complete',  label: 'Complete' },
  { key: 'post_deal', label: 'Post-deal' },
] as const
