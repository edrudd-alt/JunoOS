'use server'

import { createClient } from '@/lib/supabase/server'
import { generatePortfolioValuationStatement } from '@/services/document-generation/generatePortfolioValuationStatement'
import type { PortfolioStatementResult } from '@/services/document-generation/generatePortfolioValuationStatement'

export async function generatePortfolioStatementAction(
  clientId:   string,
  periodDate: string,
): Promise<PortfolioStatementResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  return generatePortfolioValuationStatement(supabase, {
    clientId,
    periodDate,
    triggeredBy: user.id,
  })
}

export async function getStatementSignedUrlAction(storagePath: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 60)   // 60-second TTL
  if (error || !data?.signedUrl) throw new Error('Failed to generate download link')
  return data.signedUrl
}
