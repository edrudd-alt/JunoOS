// ── Shared types and helpers for the deal page ────────────────────────────────

export interface NomineeRow {
  id: string
  name: string
}

export interface DealInvestorFull {
  id: string
  client_id: string
  investing_vehicle_id: string | null
  nominee_id: string | null
  soft_circle_amount: number | null
  confirmed_amount: number | null
  shares: number | null
  fee_pct: number | null
  fee_overridden: boolean
  fee_override_reason: string | null
  fee_override_by: string | null
  fee_override_at: string | null
  fee_locked_at: string | null
  poa_held: boolean
  signing_status: string | null
  lifecycle_status: string
  completion_checklist?: Record<string, unknown> | null
  updated_at: string
  updated_by: string | null
  created_at: string
  // Transaction-level EIS status from the investments row (distinct from deal.eis_qualifying)
  transactionEisStatus?: string | null
}

export interface ClientFull {
  id: string
  full_name: string
  email?: string | null
  kyc_status: string
  entity_type: string | null
  lead_investor_id: string | null
  fund_type: string | null
  is_favourite: boolean
  default_nominee_id: string | null
  fee_schedule_id: string | null
  default_fee_rate: number | null
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

// Bookbuild is locked once ALL non-declined investors have reached signed/paid/complete.
// Uses stored lifecycle_status, not computed display status.
export function isBookbuildLocked(dealInvestors: Pick<DealInvestorFull, 'lifecycle_status'>[]): boolean {
  const nonDeclined = dealInvestors.filter(di => di.lifecycle_status !== 'declined')
  if (nonDeclined.length === 0) return false
  return nonDeclined.every(di =>
    di.lifecycle_status === 'signed' ||
    di.lifecycle_status === 'paid' ||
    di.lifecycle_status === 'complete',
  )
}

// Sort priority for the active section of the bookbuild table
export const STATUS_SORT_ORDER: Record<string, number> = {
  soft_circled:  0,
  confirmed:     1,
  app_form_sent: 2,
  chase:         3,
  declined:      4,
}
