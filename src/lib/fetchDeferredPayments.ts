/**
 * Fetch deferred payments for a set of investment IDs.
 *
 * Follows the platform-wide two-query-then-merge pattern.
 * This is a server-side utility — call from page.tsx or server actions only.
 *
 * Returns the raw rows; use groupDeferredByInvestment() from
 * '@/lib/assetState' to key them by investment_id for component use.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeferredPayment } from '@/types'

/**
 * Fetch all deferred_payments rows for a set of investment IDs.
 * Returns an empty array if investmentIds is empty.
 */
export async function fetchDeferredPayments(
  supabase: SupabaseClient,
  investmentIds: string[],
): Promise<DeferredPayment[]> {
  if (investmentIds.length === 0) return []

  const { data, error } = await supabase
    .from('deferred_payments')
    .select('*')
    .in('investment_id', investmentIds)

  if (error) {
    console.error('fetchDeferredPayments error:', error)
    return []
  }

  return (data ?? []) as DeferredPayment[]
}

/**
 * Fetch deferred payments for a single client (by client_id column).
 * Useful when you don't yet have investment IDs.
 */
export async function fetchDeferredPaymentsByClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<DeferredPayment[]> {
  const { data, error } = await supabase
    .from('deferred_payments')
    .select('*')
    .eq('client_id', clientId)

  if (error) {
    console.error('fetchDeferredPaymentsByClient error:', error)
    return []
  }

  return (data ?? []) as DeferredPayment[]
}
