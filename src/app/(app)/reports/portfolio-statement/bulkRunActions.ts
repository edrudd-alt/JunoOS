'use server'

import { createClient } from '@/lib/supabase/server'
import { generatePortfolioValuationStatement } from '@/services/document-generation/generatePortfolioValuationStatement'
import { sendDocumentEmail } from '@/lib/outlookSend'
import { type OutlookConnection } from '@/lib/outlookTokens'
import { deriveClientFirstName, formatPeriodDateUK, substituteBulkTemplate } from '@/lib/templates'

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
  metadata:       Record<string, string> | null
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

// ── startBulkSend ─────────────────────────────────────────────────────────────

export async function startBulkSend({
  sourceRunId,
  subjectTemplate,
  bodyTemplate,
}: {
  sourceRunId: string
  subjectTemplate: string
  bodyTemplate: string
}): Promise<{ bulkRunId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: sourceRun } = await supabase
    .from('bulk_runs')
    .select('period_date')
    .eq('id', sourceRunId)
    .single()

  if (!sourceRun) throw new Error('Source run not found')

  const { data: succeededItems, error: itemsError } = await supabase
    .from('bulk_run_items')
    .select('client_id, document_id')
    .eq('bulk_run_id', sourceRunId)
    .eq('status', 'succeeded')
    .not('document_id', 'is', null)

  if (itemsError) throw new Error(itemsError.message)
  if (!succeededItems?.length) throw new Error('No succeeded items with documents to send')

  const { data: run, error: runError } = await supabase
    .from('bulk_runs')
    .insert({
      type:        'portfolio_statement_send',
      period_date: sourceRun.period_date,
      status:      'in_progress',
      started_by:  user.id,
      total_items: succeededItems.length,
      metadata:    { subject_template: subjectTemplate, body_template: bodyTemplate, source_run_id: sourceRunId },
    })
    .select('id')
    .single()

  if (runError || !run) throw new Error(runError?.message ?? 'Failed to create send run')

  const items = succeededItems.map(item => ({
    bulk_run_id: run.id,
    client_id:   item.client_id,
    document_id: item.document_id,
    status:      'pending',
  }))

  const { error: itemsInsertError } = await supabase.from('bulk_run_items').insert(items)
  if (itemsInsertError) throw new Error(itemsInsertError.message)

  return { bulkRunId: run.id }
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

  // 4. Process item — branched by run type
  const runOwnerId: string =
    run.started_by ??
    (await supabase.auth.getUser()).data.user?.id ??
    'system'

  let succeeded = false
  let documentId: string | null = null
  let errorMessage: string | null = null

  if (run.type === 'portfolio_statement') {
    // Generation branch
    try {
      const result = await generatePortfolioValuationStatement(supabase, {
        clientId:    clientId!,
        periodDate:  periodDate!,
        triggeredBy: runOwnerId,
      })
      documentId = result.documentId
      succeeded  = true
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err)
    }
  } else if (run.type === 'portfolio_statement_send') {
    // Send branch — fetch document_id from item row (RPC only returns id + client_id)
    const { data: claimedItem } = await supabase
      .from('bulk_run_items')
      .select('document_id')
      .eq('id', itemId)
      .single()

    const sendDocId = claimedItem?.document_id ?? null
    const meta = (run.metadata ?? {}) as Record<string, string>

    if (!sendDocId) {
      errorMessage = 'No document associated with this item'
    } else {
      const { data: connection } = await supabase
        .from('outlook_connections')
        .select('id, team_member_id, microsoft_user_email, encrypted_access_token, encrypted_refresh_token, access_token_expires_at')
        .eq('team_member_id', runOwnerId)
        .maybeSingle()

      if (!connection) {
        errorMessage = 'Outlook not connected — reconnect in Settings'
      } else {
        const [{ data: clientRow }, { data: docRow }] = await Promise.all([
          supabase.from('clients').select('email, full_name').eq('id', clientId).single(),
          supabase.from('documents').select('filename, storage_url').eq('id', sendDocId).single(),
        ])

        if (!clientRow?.email) {
          errorMessage = 'Client has no email address on file'
        } else if (!docRow?.storage_url) {
          errorMessage = 'Document file not found in storage'
        } else {
          const ctx = {
            clientFirstName: deriveClientFirstName(clientRow.full_name ?? ''),
            periodDateFormatted: formatPeriodDateUK(run.period_date ?? ''),
          }
          const sendResult = await sendDocumentEmail({
            connection:     connection as OutlookConnection,
            teamMemberId:   runOwnerId,
            documentId:     sendDocId,
            clientId:       clientId!,
            recipientEmail: clientRow.email,
            subject:        substituteBulkTemplate(meta.subject_template ?? '', ctx),
            bodyText:       substituteBulkTemplate(meta.body_template ?? '', ctx),
            attachmentName: docRow.filename,
            storageUrl:     docRow.storage_url,
            bulkRunId:      runId,
          })
          succeeded    = sendResult.ok
          errorMessage = sendResult.ok ? null : sendResult.error
        }
      }
    }
  }

  // 5. Mark item done (document_id only updated for generation runs; send runs pre-populate it)
  const itemUpdate: Record<string, unknown> = {
    status:        succeeded ? 'succeeded' : 'failed',
    completed_at:  new Date().toISOString(),
    error_message: errorMessage,
  }
  if (run.type === 'portfolio_statement') {
    itemUpdate.document_id = documentId
  }
  await supabase.from('bulk_run_items').update(itemUpdate).eq('id', itemId)

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

  const { data: originalRun } = await supabase
    .from('bulk_runs')
    .select('type, period_date, metadata')
    .eq('id', runId)
    .single()

  if (!originalRun) throw new Error('Run not found')

  const { data: failedItems, error } = await supabase
    .from('bulk_run_items')
    .select('client_id, document_id')
    .eq('bulk_run_id', runId)
    .eq('status', 'failed')

  if (error) throw new Error(error.message)
  if (!failedItems || failedItems.length === 0) throw new Error('No failed items to retry')

  if (originalRun.type === 'portfolio_statement') {
    if (!originalRun.period_date) throw new Error('Original run period date not found')
    return createBulkRun(failedItems.map(i => i.client_id), originalRun.period_date)
  }

  if (originalRun.type === 'portfolio_statement_send') {
    // Safety filter: never retry 5xx responses — Graph may have queued the send already.
    // Only retry: null status (never reached Graph) or 4xx (Graph definitively rejected).
    const { data: fiveXXSends } = await supabase
      .from('email_sends')
      .select('client_id')
      .eq('bulk_run_id', runId)
      .gte('graph_response_status', 500)
      .lte('graph_response_status', 599)

    const excludeIds = new Set((fiveXXSends ?? []).map(s => s.client_id as string))
    const safeItems = failedItems.filter(i => !excludeIds.has(i.client_id as string))

    if (safeItems.length === 0) {
      throw new Error('No items safe to retry — all failures were 5xx responses that may have been queued by Microsoft')
    }

    const { data: run, error: runError } = await supabase
      .from('bulk_runs')
      .insert({
        type:        'portfolio_statement_send',
        period_date: originalRun.period_date,
        status:      'in_progress',
        started_by:  user.id,
        total_items: safeItems.length,
        metadata:    originalRun.metadata,
      })
      .select('id')
      .single()

    if (runError || !run) throw new Error(runError?.message ?? 'Failed to create retry run')

    const { error: itemsError } = await supabase.from('bulk_run_items').insert(
      safeItems.map(item => ({
        bulk_run_id: run.id,
        client_id:   item.client_id,
        document_id: item.document_id,
        status:      'pending',
      }))
    )
    if (itemsError) throw new Error(itemsError.message)

    return { runId: run.id }
  }

  throw new Error(`Unknown run type: ${originalRun.type}`)
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

// ── loadRunItemsWithDetails ───────────────────────────────────────────────────
// Enriches each item with client name, storage_url, and (for send runs) recipient email.

export interface BulkRunItemDetail extends BulkRunItem {
  client_name:     string
  storage_url:     string | null
  recipient_email?: string
}

export interface RunItemsWithDetails {
  items:   BulkRunItemDetail[]
  runType: string
}

export async function loadRunItemsWithDetails(runId: string): Promise<RunItemsWithDetails> {
  const supabase = await createClient()

  const [{ data: items, error }, { data: run }] = await Promise.all([
    supabase.from('bulk_run_items').select('*').eq('bulk_run_id', runId).order('id'),
    supabase.from('bulk_runs').select('type').eq('id', runId).single(),
  ])

  if (error) throw new Error(error.message)
  const runType = run?.type ?? 'portfolio_statement'
  if (!items?.length) return { items: [], runType }

  const clientIds = [...new Set(items.map(i => i.client_id as string))]
  const docIds    = items.map(i => i.document_id as string | null).filter(Boolean) as string[]

  const [{ data: clients }, { data: docs }] = await Promise.all([
    supabase.from('clients').select('id, full_name, email').in('id', clientIds),
    docIds.length > 0
      ? supabase.from('documents').select('id, storage_url').in('id', docIds)
      : Promise.resolve({ data: [] as { id: string; storage_url: string }[] }),
  ])

  const clientMap = new Map((clients ?? []).map(c => [c.id, c as { id: string; full_name: string; email: string | null }]))
  const docMap    = new Map((docs    ?? []).map(d => [d.id, d.storage_url as string]))

  return {
    runType,
    items: items.map(item => ({
      ...(item as unknown as BulkRunItem),
      client_name:     clientMap.get(item.client_id as string)?.full_name ?? (item.client_id as string),
      storage_url:     item.document_id ? (docMap.get(item.document_id as string) ?? null) : null,
      recipient_email: runType === 'portfolio_statement_send'
        ? (clientMap.get(item.client_id as string)?.email ?? undefined)
        : undefined,
    })),
  }
}

// ── getSignedUrlForDocument ───────────────────────────────────────────────────

export async function getSignedUrlForDocument(storagePath: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 60)
  if (error || !data?.signedUrl) throw new Error('Failed to generate download link')
  return data.signedUrl
}
