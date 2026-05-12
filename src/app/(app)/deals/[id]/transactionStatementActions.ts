'use server'

import { createClient } from '@/lib/supabase/server'
import { generateTransactionStatement } from '@/services/document-generation/generateTransactionStatement'

export async function generateTransactionStatementAction(
  dealInvestorId: string,
): Promise<{ success: boolean; documentId?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { documentId } = await generateTransactionStatement(supabase, dealInvestorId)

    // Audit log — fetch deal_id for the log row
    const { data: di } = await supabase
      .from('deal_investors')
      .select('deal_id')
      .eq('id', dealInvestorId)
      .single()

    if (di) {
      await supabase.from('deal_action_logs').insert({
        deal_id:          di.deal_id,
        deal_investor_id: dealInvestorId,
        document_id:      documentId,
        action_type:      'generate_transaction_statement',
        is_mock:          false,
        actioned_by:      user.id,
      })
    }

    return { success: true, documentId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function markTransactionStatementSentAction(
  dealId: string,
  dealInvestorId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Fetch current checklist
    const { data: di, error: diError } = await supabase
      .from('deal_investors')
      .select('completion_checklist')
      .eq('id', dealInvestorId)
      .single()
    if (diError || !di) throw new Error('deal_investor not found')

    const current = (di.completion_checklist ?? {}) as Record<string, unknown>
    const updated = { ...current, transaction_statement_sent: true }

    const { error: updateError } = await supabase
      .from('deal_investors')
      .update({
        completion_checklist: updated,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', dealInvestorId)
    if (updateError) throw new Error(updateError.message)

    await supabase.from('deal_action_logs').insert({
      deal_id:          dealId,
      deal_investor_id: dealInvestorId,
      action_type:      'checklist_toggle',
      is_mock:          false,
      metadata:         { item: 'transaction_statement_sent', new_value: true },
      actioned_by:      user.id,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
