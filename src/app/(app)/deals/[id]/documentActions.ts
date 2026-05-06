import { createClient } from '@/lib/supabase/client'

type Supabase = ReturnType<typeof createClient>
export interface ActionResult { error: string | null }

export async function supersedeDocument(
  supabase: Supabase,
  documentId: string,
  dealId: string,
  reason: string,
  userId: string,
): Promise<ActionResult> {
  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    document_id: documentId,
    action_type: 'document_supersede',
    is_mock: false,
    metadata: { reason },
    actioned_by: userId,
  })

  const { error } = await supabase
    .from('documents')
    .update({
      superseded:        true,
      superseded_at:     new Date().toISOString(),
      superseded_reason: reason,
    })
    .eq('id', documentId)

  if (error) return { error: error.message }
  return { error: null }
}

export async function reinstateDocument(
  supabase: Supabase,
  documentId: string,
  dealId: string,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('documents')
    .update({
      superseded:        false,
      superseded_at:     null,
      superseded_reason: null,
    })
    .eq('id', documentId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    document_id: documentId,
    action_type: 'document_reinstate',
    is_mock: false,
    actioned_by: userId,
  })

  return { error: null }
}

export async function deleteDocument(
  supabase: Supabase,
  documentId: string,
  dealId: string,
  userId: string,
): Promise<ActionResult> {
  // Log before delete — FK is still valid at this point
  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    document_id: documentId,
    action_type: 'document_delete',
    is_mock: false,
    metadata: { deleted_document_id: documentId },
    actioned_by: userId,
  })

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)

  if (error) return { error: error.message }
  return { error: null }
}
