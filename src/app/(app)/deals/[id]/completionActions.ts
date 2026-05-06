// Action helpers for Completion tab — all real DB writes.
import { createClient } from '@/lib/supabase/client'

type Supabase = ReturnType<typeof createClient>
export interface ActionResult { error: string | null }

// ── Checklist types ────────────────────────────────────────────────────────────

export type ChecklistItemKey =
  | 'share_cert_filed'
  | 'eis3_issued'
  | 'transaction_statement_sent'
  | 'documents_archived'

export interface ChecklistState {
  share_cert_filed?: boolean
  eis3_issued?: boolean
  transaction_statement_sent?: boolean
  documents_archived?: boolean
  _disabled?: string[]
}

export const CHECKLIST_LABELS: Record<ChecklistItemKey, string> = {
  share_cert_filed:            'Share certificate filed',
  eis3_issued:                 'EIS3 certificate issued',
  transaction_statement_sent:  'Transaction statement sent',
  documents_archived:          'Documents archived to OneDrive',
}

export function parseChecklist(raw: Record<string, unknown> | null | undefined): ChecklistState {
  if (!raw) return {}
  return raw as ChecklistState
}

export function isItemDisabled(state: ChecklistState, key: ChecklistItemKey, eisQualifying: boolean): boolean {
  if (key === 'eis3_issued' && !eisQualifying) return true
  return (state._disabled ?? []).includes(key)
}

// Returns true when all non-disabled items 1, 2, 3, 5 are checked.
// Item 4 (investment record) is auto-handled at mark-complete time.
export function isMarkCompleteEnabled(state: ChecklistState, eisQualifying: boolean): boolean {
  const keys: ChecklistItemKey[] = [
    'share_cert_filed', 'eis3_issued', 'transaction_statement_sent', 'documents_archived',
  ]
  for (const key of keys) {
    if (isItemDisabled(state, key, eisQualifying)) continue
    if (!state[key]) return false
  }
  return true
}

// ── Checklist toggle ───────────────────────────────────────────────────────────

export async function toggleChecklistItem(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  currentState: ChecklistState,
  key: ChecklistItemKey,
  newValue: boolean,
  userId: string,
): Promise<ActionResult> {
  const updatedState: ChecklistState = { ...currentState, [key]: newValue }

  const { error } = await supabase
    .from('deal_investors')
    .update({
      completion_checklist: updatedState,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'checklist_toggle',
    is_mock: false,
    metadata: { item: key, new_value: newValue },
    actioned_by: userId,
  })

  return { error: null }
}

// ── Checklist disable / enable ─────────────────────────────────────────────────

export async function setChecklistItemDisabled(
  supabase: Supabase,
  dealId: string,
  dealInvestorId: string,
  currentState: ChecklistState,
  key: ChecklistItemKey,
  disabled: boolean,
  userId: string,
): Promise<ActionResult> {
  const currentDisabled = currentState._disabled ?? []
  const newDisabled = disabled
    ? [...new Set([...currentDisabled, key])]
    : currentDisabled.filter(k => k !== key)

  const updatedState: ChecklistState = { ...currentState, _disabled: newDisabled }

  const { error } = await supabase
    .from('deal_investors')
    .update({
      completion_checklist: updatedState,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', dealInvestorId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'checklist_toggle',
    is_mock: false,
    metadata: { item: key, action: disabled ? 'disable' : 'enable' },
    actioned_by: userId,
  })

  return { error: null }
}

// ── Mark complete ──────────────────────────────────────────────────────────────

export interface MarkCompleteParams {
  dealId: string
  dealInvestorId: string
  clientId: string
  investingVehicleId: string | null
  nomineeId: string | null
  confirmedAmount: number | null
  shares: number | null
  shareClassId: string | null
  shareClass: string | null
  sharePrice: number | null
  companyId: string | null
  eisQualifying: string | null
  fundType: string              // from client.fund_type, falls back to 'syndicate'
  checklistState: ChecklistState
  investmentDate: string
  completionDate: string
  userId: string
}

export async function markComplete(
  supabase: Supabase,
  params: MarkCompleteParams,
): Promise<ActionResult> {
  const {
    dealId, dealInvestorId, clientId, investingVehicleId, nomineeId,
    confirmedAmount, shares, shareClassId, shareClass, sharePrice,
    companyId, eisQualifying, fundType, checklistState, investmentDate, completionDate, userId,
  } = params

  if (!companyId) return { error: 'Deal has no company — cannot create investment record.' }

  // Map eis_qualifying to investments.eis_status
  const eisStatus =
    eisQualifying === 'yes' ? 'yes' :
    eisQualifying === 'no'  ? 'no'  : 'tbc'

  // 1. Insert into investments (mapping to actual column names in the DB)
  const { error: invError } = await supabase
    .from('investments')
    .insert({
      deal_id:              dealId,
      client_id:            clientId,
      held_by_entity_id:    investingVehicleId,  // investing vehicle → held_by_entity_id
      nominee_id:           nomineeId,
      company_id:           companyId,
      sum_subscribed:       confirmedAmount ?? 0,
      shares_purchased:     shares ?? 0,
      original_share_price: sharePrice ?? 0,
      share_class_id:       shareClassId,
      share_class:          shareClass ?? '',
      investment_date:      investmentDate,
      completion_date:      completionDate,
      eis_status:           eisStatus,
      transaction_type:     'buy',
      fund_type:            fundType,
      status:               'active',
    })

  if (invError) return { error: invError.message }

  // 2. Update deal_investors row to complete
  const { error: diError } = await supabase
    .from('deal_investors')
    .update({
      lifecycle_status: 'complete',
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', dealInvestorId)

  if (diError) return { error: diError.message }

  // 3. Audit log
  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    deal_investor_id: dealInvestorId,
    action_type: 'mark_complete',
    from_status: 'paid',
    to_status: 'complete',
    is_mock: false,
    metadata: {
      investment_date: investmentDate,
      completion_date: completionDate,
      disabled_items: checklistState._disabled ?? [],
    },
    actioned_by: userId,
  })

  return { error: null }
}

// ── Close the deal ─────────────────────────────────────────────────────────────

export async function closeDeal(
  supabase: Supabase,
  dealId: string,
  userId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from('deals')
    .update({ status: 'complete' })
    .eq('id', dealId)

  if (error) return { error: error.message }

  await supabase.from('deal_action_logs').insert({
    deal_id: dealId,
    action_type: 'close_deal',
    is_mock: false,
    actioned_by: userId,
  })

  return { error: null }
}
