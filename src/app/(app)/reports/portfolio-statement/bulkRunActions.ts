'use server'

import { createClient } from '@/lib/supabase/server'
import { generatePortfolioValuationStatement } from '@/services/document-generation/generatePortfolioValuationStatement'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BulkRunSummary {
  id:             string
  type:           string
  period_date:    string | null
  status:         'in_progress' | 'completed' | 'cancelled' | 'failed'
  started_at:     string
  completed_at:   string | null
  cancelled_at:   string | null
  started_by:     string | null
  total_items:    number
  succeeded_count: number
  failed_count:   number
  preset_id:      string | null
}

export interface BulkRunItem {
  id:            string
  bulk_run_id:   string
  client_id:     string
  status:        'pending' | 'in_progress' | 'succeeded' | 'failed' | 'skipped'
  started_at:    string | null
  completed_at:  string | null
  document_id:   string | null
  error_message: string | null
  retry_count:   number
}

export interface TickResult {
  run:         BulkRunSummary
  items:       BulkRunItem[]
  currentItem: string | null   // client_id of item currently in_progress
}

export interface BulkRunPreset {
  id:           string
  type:         string
  name:         string
  client_ids:   string[]
  filter_state: Record<string, unknown>
  created_at:   string
  created_by:   string | null
  updated_at:   string
  updated_by:   string | null
}

// ── createBulkRun ─────────────────────────────────────────────────────────────

export async function createBulkRun(
  clientIds:  string[],
  periodDate: string,
  presetId:   string | null = null,
): Promise<{ runId: string }> {
  if (clientIds.length === 0) throw new Error('No clients selected')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: run, error: runError } = await supabase
    .from('bulk_runs')
    .insert({
      type:        'portfolio_statement',
      period_date: periodDate,
      status:      'in_progress',
      started_by:  user.id,
      total_items: clientIds.length,
      preset_id:   presetId,
    })
    .select('id')
    .single()

  if (runError || !run) throw new Error(runError?.message ?? 'Failed to create bulk run')

  const items = clientIds.map(clientId => ({
    bulk_run_id: run.id,
    client_id:   clientId,
    status:      'pending',
  }))

  const { error: itemsError } = await supabase.from('bulk_run_items').insert(items)
  if (itemsError) throw new Error(itemsError.message)

  return { runId: run.id }
}

// ── tickBulkRun ───────────────────────────────────────────────────────────────
// Called by the API route POST /api/bulk-runs/[id]/tick, not directly by client.
// Exported here so the route handler can import it.

export async function tickBulkRun(runId: string): Promise<TickResult> {
  const supabase = await createClient()

  // 1. Read run; bail if cancelled
  const { data: run, error: runError } = await supabase
    .from('bulk_runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (runError || !run) throw new Error(runError?.message ?? 'Run not found')
  if (run.status === 'cancelled') {
    const { data: items } = await supabase.from('bulk_run_items').select('*').eq('bulk_run_id', runId)
    return { run, items: items ?? [], currentItem: null }
  }

  // 2. Claim next pending item via raw SQL (FOR UPDATE SKIP LOCKED)
  const { data: claimed, error: claimError } = await supabase.rpc('claim_next_bulk_run_item', {
    p_run_id: runId,
  })

  if (claimError) throw new Error(claimError.message)

  const itemId:    string | null = claimed?.[0]?.id        ?? null
  const clientId:  string | null = claimed?.[0]?.client_id ?? null
  const periodDate: string | null = run.period_date

  // 3. If nothing claimed, check whether any items are still in_progress
  if (!itemId) {
    const { data: inProgressItems } = await supabase
      .from('bulk_run_items')
      .select('id')
      .eq('bulk_run_id', runId)
      .eq('status', 'in_progress')

    const stillRunning = (inProgressItems ?? []).length > 0

    if (!stillRunning) {
      // All done — compute final counts from items and mark complete
      const { data: allItems } = await supabase
        .from('bulk_run_items')
        .select('status')
        .eq('bulk_run_id', runId)

      const succeeded = (allItems ?? []).filter(i => i.status === 'succeeded').length
      const failed    = (allItems ?? []).filter(i => i.status === 'failed').length

      await supabase
        .from('bulk_runs')
        .update({
          status:          'completed',
          completed_at:    new Date().toISOString(),
          succeeded_count: succeeded,
          failed_count:    failed,
        })
        .eq('id', runId)
    }

    const { data: freshRun } = await supabase.from('bulk_runs').select('*').eq('id', runId).single()
    const { data: items }    = await supabase.from('bulk_run_items').select('*').eq('bulk_run_id', runId)
    return { run: freshRun ?? run, items: items ?? [], currentItem: null }
  }

  // 4. Generate — errors caught, never propagated
  //    Use the run's started_by as the uploader; fall back to authenticated user.
  const uploadedBy: string =
    run.started_by ??
    (await supabase.auth.getUser()).data.user?.id ??
    'system'

  let succeeded = false
  let documentId: string | null = null
  let errorMessage: string | null = null

  try {
    const result = await generatePortfolioValuationStatement(supabase, {
      clientId:    clientId!,
      periodDate:  periodDate!,
      triggeredBy: uploadedBy,
    })
    documentId = result.documentId
    succeeded  = true
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
  }

  // 5. Mark item done
  await supabase
    .from('bulk_run_items')
    .update({
      status:       succeeded ? 'succeeded' : 'failed',
      completed_at: new Date().toISOString(),
      document_id:  documentId,
      error_message: errorMessage,
    })
    .eq('id', itemId)

  // 6. Update run counts
  const { data: counts } = await supabase
    .from('bulk_run_items')
    .select('status')
    .eq('bulk_run_id', runId)

  const succeededCount = (counts ?? []).filter(i => i.status === 'succeeded').length
  const failedCount    = (counts ?? []).filter(i => i.status === 'failed').length

  await supabase
    .from('bulk_runs')
    .update({ succeeded_count: succeededCount, failed_count: failedCount })
    .eq('id', runId)

  const { data: freshRun } = await supabase.from('bulk_runs').select('*').eq('id', runId).single()
  const { data: items }    = await supabase.from('bulk_run_items').select('*').eq('bulk_run_id', runId)

  return {
    run:         freshRun ?? run,
    items:       items ?? [],
    currentItem: succeeded || errorMessage ? null : clientId,
  }
}

// ── cancelBulkRun ─────────────────────────────────────────────────────────────

export async function cancelBulkRun(runId: string): Promise<void> {
  const supabase = await createClient()

  await supabase
    .from('bulk_runs')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'in_progress')

  // Mark pending items skipped so they don't get picked up
  await supabase
    .from('bulk_run_items')
    .update({ status: 'skipped' })
    .eq('bulk_run_id', runId)
    .eq('status', 'pending')
}

// ── retryFailedItems ──────────────────────────────────────────────────────────

export async function retryFailedItems(runId: string): Promise<{ runId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: failedItems, error } = await supabase
    .from('bulk_run_items')
    .select('client_id')
    .eq('bulk_run_id', runId)
    .eq('status', 'failed')

  if (error) throw new Error(error.message)
  if (!failedItems || failedItems.length === 0) throw new Error('No failed items to retry')

  const { data: originalRun } = await supabase
    .from('bulk_runs')
    .select('period_date')
    .eq('id', runId)
    .single()

  if (!originalRun?.period_date) throw new Error('Original run period date not found')

  const clientIds = failedItems.map(i => i.client_id)
  return createBulkRun(clientIds, originalRun.period_date)
}

// ── savePreset ────────────────────────────────────────────────────────────────

export async function savePreset(
  name:        string,
  clientIds:   string[],
  filterState: Record<string, unknown>,
): Promise<{ preset: BulkRunPreset } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: preset, error } = await supabase
    .from('bulk_run_presets')
    .insert({
      type:         'portfolio_statement',
      name,
      client_ids:   clientIds,
      filter_state: filterState,
      created_by:   user.id,
      updated_by:   user.id,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'A preset with this name already exists. Choose a different name or update the existing one.' }
    return { error: error.message }
  }
  return { preset: preset as BulkRunPreset }
}

// ── loadPresets ───────────────────────────────────────────────────────────────

export async function loadPresets(): Promise<BulkRunPreset[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bulk_run_presets')
    .select('*')
    .eq('type', 'portfolio_statement')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

// ── renamePreset ──────────────────────────────────────────────────────────────

export async function renamePreset(presetId: string, newName: string): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('bulk_run_presets')
    .update({ name: newName, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', presetId)

  if (error) {
    if (error.code === '23505') return { error: 'A preset with this name already exists. Choose a different name or update the existing one.' }
    return { error: error.message }
  }
  return null
}

// ── deletePreset ──────────────────────────────────────────────────────────────

export async function deletePreset(presetId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('bulk_run_presets').delete().eq('id', presetId)
  if (error) throw new Error(error.message)
}

// ── loadRunItems ──────────────────────────────────────────────────────────────

export async function loadRunItems(runId: string): Promise<BulkRunItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bulk_run_items')
    .select('*')
    .eq('bulk_run_id', runId)
    .order('id')
  if (error) throw new Error(error.message)
  return (data ?? []) as BulkRunItem[]
}
