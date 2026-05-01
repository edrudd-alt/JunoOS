// ── Shared types and helpers for the deal page ────────────────────────────────

export interface DealInvestorFull {
  id: string
  client_id: string
  investing_vehicle_id: string | null
  soft_circle_amount: number | null
  confirmed_amount: number | null
  shares: number | null
  fee_pct: number | null
  fee_overridden: boolean
  fee_locked_at: string | null
  poa_held: boolean
  lifecycle_status: string
  updated_at: string
  created_at: string
}

export interface ClientFull {
  id: string
  full_name: string
  kyc_status: string
  entity_type: string | null
  lead_investor_id: string | null
  fund_type: string | null
  is_favourite: boolean
}

export type DisplayedStatus =
  | 'soft_circled' | 'confirmed' | 'app_form_sent' | 'chase'
  | 'declined' | 'signed' | 'paid' | 'complete' | 'superseded'

const CHASE_ELIGIBLE    = new Set(['soft_circled', 'confirmed', 'app_form_sent'])
const CHASE_THRESHOLD_DAYS = 10

// Centralised chase compute-on-read logic.
// If a row is in a chase-eligible status and hasn't been touched in >10 days,
// it displays as 'chase' without changing the stored value.
// Clicking "Send chaser" (Stage 3b) resets updated_at, clearing the computed chase.
export function getDisplayedStatus(
  row: Pick<DealInvestorFull, 'lifecycle_status' | 'updated_at'>,
): DisplayedStatus {
  const raw = row.lifecycle_status as DisplayedStatus
  if (raw === 'chase') return 'chase'
  if (CHASE_ELIGIBLE.has(raw)) {
    const daysSinceUpdate = (Date.now() - new Date(row.updated_at).getTime()) / 86_400_000
    if (daysSinceUpdate > CHASE_THRESHOLD_DAYS) return 'chase'
  }
  return raw
}

export const ACTIVE_STATUSES = new Set<string>(['soft_circled', 'confirmed', 'app_form_sent', 'chase', 'declined'])
export const PAST_STATUSES   = new Set<string>(['signed', 'paid', 'complete'])

// Sort priority for the active section of the bookbuild table
export const STATUS_SORT_ORDER: Record<string, number> = {
  soft_circled:  0,
  confirmed:     1,
  app_form_sent: 2,
  chase:         3,
  declined:      4,
}
