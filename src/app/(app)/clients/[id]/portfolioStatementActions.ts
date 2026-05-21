'use server'

import { createClient } from '@/lib/supabase/server'
import { generatePortfolioValuationStatement } from '@/services/document-generation/generatePortfolioValuationStatement'

export async function generatePortfolioStatementAction(
  clientId:   string,
  periodDate: string,
): Promise<{ documentId: string; filename: string; createdAt: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const result = await generatePortfolioValuationStatement(supabase, {
    clientId,
    periodDate,
    triggeredBy: user.id,
  })
  return { documentId: result.documentId, filename: result.filename, createdAt: new Date().toISOString() }
}

export async function getStatementSignedUrlAction(storagePath: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 60)   // 60-second TTL
  if (error || !data?.signedUrl) throw new Error('Failed to generate download link')
  return data.signedUrl
}
