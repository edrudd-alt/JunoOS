'use server'

import { createClient } from '@/lib/supabase/server'

export async function getDownloadUrlForDocument(documentId: string): Promise<string | null> {
  const supabase = await createClient()

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, storage_url')
    .eq('id', documentId)
    .single()
  if (docError || !doc) return null

  const { data, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.storage_url, 60)
  if (urlError || !data) return null

  return data.signedUrl
}
