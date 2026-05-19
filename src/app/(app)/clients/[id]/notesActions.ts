'use server'

import { createClient } from '@/lib/supabase/server'

export async function addNoteAction(
  clientId: string,
  noteText: string,
  flagForFollowup: boolean,
): Promise<{
  success: boolean
  note?: {
    id: string
    client_id: string
    note_text: string
    flag_for_followup: boolean
    created_by: string | null
    created_at: string
  }
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('client_notes')
    .insert({
      client_id:       clientId,
      note_text:       noteText.trim(),
      flag_for_followup: flagForFollowup,
      created_by:      user.id,
    })
    .select('id, client_id, note_text, flag_for_followup, created_by, created_at')
    .single()

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    note: data as {
      id: string; client_id: string; note_text: string
      flag_for_followup: boolean; created_by: string | null; created_at: string
    },
  }
}
