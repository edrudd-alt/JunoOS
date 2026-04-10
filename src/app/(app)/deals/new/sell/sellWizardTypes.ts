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

