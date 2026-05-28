/**
 * Three-state asset register — derive-on-read classification.
 *
 * See docs/specs/Juno_Asset_Register_ThreeState_Spec_v1.md §3.
 *
 * An investment is:
 *   OWNED       — status = 'active'
 *   CONTINGENT  — status = 'exited' AND has ≥1 deferred payment with
 *                 status 'expected' or 'overdue'
 *   DISPOSED    — status = 'exited' AND all deferred payments (if any)
 *                 are 'received' or 'waived'
 *
 * Centralised here so every surface classifies identically.
 * Mirrors the getDisplayedStatus() pattern from the buy deal page.
 */

import type { AssetState, DeferredPayment } from '@/types'

// ─── Core derivation ─────────────────────────────────────────────────────────

/**
 * Classify a single investment into the three-state model.
 *
 * @param investmentStatus - The `investments.status` value ('active' | 'pending' | 'exited')
 * @param deferredPayments - All deferred_payments rows for this investment (may be empty)
 */
export function getAssetState(
  investmentStatus: string,
  deferredPayments: Pick<DeferredPayment, 'status'>[] = [],
): AssetState {
  // Active or pending holdings are owned
  if (investmentStatus !== 'exited') return 'owned'

  // Exited: check for unsettled deferred payments
  const hasUnsettled = deferredPayments.some(
    (dp) => dp.status === 'expected' || dp.status === 'overdue',
  )

  return hasUnsettled ? 'contingent' : 'disposed'
}

// ─── Batch classification ────────────────────────────────────────────────────

/**
 * Classify a batch of investments, given a map of deferred payments keyed by
 * investment_id. Avoids repeated Map lookups in components.
 */
export function classifyInvestments<T extends { id: string; status: string }>(
  investments: T[],
  deferredByInvestment: Map<string, Pick<DeferredPayment, 'status'>[]>,
): Map<string, AssetState> {
  const result = new Map<string, AssetState>()
  for (const inv of investments) {
    result.set(inv.id, getAssetState(inv.status, deferredByInvestment.get(inv.id) ?? []))
  }
  return result
}

// ─── Deferred payment aggregation helpers ────────────────────────────────────

/**
 * Build a Map of investment_id → DeferredPayment[] from a flat array.
 */
export function groupDeferredByInvestment<T extends { investment_id: string }>(
  payments: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const p of payments) {
    if (!map.has(p.investment_id)) map.set(p.investment_id, [])
    map.get(p.investment_id)!.push(p)
  }
  return map
}

/**
 * Sum of settled (received) deferred payments for a given investment.
 */
export function settledDeferredTotal(payments: Pick<DeferredPayment, 'status' | 'actual_amount'>[]): number {
  return payments
    .filter((p) => p.status === 'received')
    .reduce((sum, p) => sum + (p.actual_amount ?? 0), 0)
}

/**
 * Sum of unsettled (expected + overdue) deferred payments for a given investment.
 */
export function unsettledDeferredTotal(payments: Pick<DeferredPayment, 'status' | 'expected_amount'>[]): number {
  return payments
    .filter((p) => p.status === 'expected' || p.status === 'overdue')
    .reduce((sum, p) => sum + (p.expected_amount ?? 0), 0)
}
