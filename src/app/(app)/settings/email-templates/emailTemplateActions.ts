'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Seed defaults — mirrors migration 20260524100000. Used only by resetTemplateToDefault.
const SEED_DEFAULTS: Record<string, { subject: string; body: string }> = {
  portfolio_statement: {
    subject: 'Portfolio statement as at {{period}}',
    body: 'Dear {{client_first_name}},\n\nPlease find attached your portfolio statement as at {{period}}.\n\nKind regards,\n{{sender_first_name}}\nJuno Capital Partners LLP',
  },
  transaction_statement: {
    subject: 'Transaction statement — {{period}}',
    body: 'Hi {{client_first_name}},\n\nPlease find your transaction statement attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  application_form: {
    subject: 'Signed application form — {{company_name}}',
    body: 'Hi {{client_first_name}},\n\nPlease find your signed application form attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  eis_certificate: {
    subject: 'EIS3 certificate — {{company_name}}',
    body: 'Hi {{client_first_name}},\n\nPlease find your EIS3 certificate for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  investment_agreement: {
    subject: 'Investment agreement — {{company_name}}',
    body: 'Hi {{client_first_name}},\n\nPlease find your signed investment agreement attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  side_letter: {
    subject: 'Side letter — {{company_name}}',
    body: 'Hi {{client_first_name}},\n\nPlease find your signed side letter attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  membership_agreement: {
    subject: 'Membership agreement',
    body: 'Hi {{client_first_name}},\n\nPlease find your membership agreement attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  ceo_update: {
    subject: '{{company_name}} — CEO update',
    body: 'Hi {{client_first_name}},\n\nPlease find the latest CEO update from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  press_release: {
    subject: '{{company_name}} — Press release',
    body: 'Hi {{client_first_name}},\n\nPlease find the latest press release from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  company_update: {
    subject: '{{company_name}} — Update',
    body: 'Hi {{client_first_name}},\n\nPlease find the latest update from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  exit_statement: {
    subject: 'Exit statement — {{company_name}}',
    body: 'Hi {{client_first_name}},\n\nPlease find your exit statement for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  board_minutes: {
    subject: '{{company_name}} — Board minutes',
    body: 'Hi {{client_first_name}},\n\nPlease find the latest board minutes from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  management_accounts: {
    subject: '{{company_name}} — Management accounts',
    body: 'Hi {{client_first_name}},\n\nPlease find the latest management accounts for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  kpi_spreadsheet: {
    subject: '{{company_name}} — KPI report',
    body: 'Hi {{client_first_name}},\n\nPlease find the latest KPI report for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  invoice: {
    subject: 'Invoice — {{reference}}',
    body: 'Hi {{client_first_name}},\n\nPlease find your invoice attached.\n\nKind regards,\n{{sender_first_name}}',
  },
  other: {
    subject: 'Document — {{filename}}',
    body: 'Hi {{client_first_name}},\n\nPlease find attached.\n\nKind regards,\n{{sender_first_name}}',
  },
}

export async function saveTemplate(
  id: string,
  subject: string,
  body: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('email_templates')
    .update({ subject, body, updated_by: user.id })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/settings/email-templates')
  return { ok: true }
}

export async function resetTemplateToDefault(
  id: string,
  documentType: string,
): Promise<{ ok: true } | { error: string }> {
  const defaults = SEED_DEFAULTS[documentType]
  if (!defaults) return { error: 'No default found for this document type' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Step 1: restore content (trigger fires and clears is_default since content changed)
  const { error: e1 } = await supabase
    .from('email_templates')
    .update({ subject: defaults.subject, body: defaults.body, updated_by: null })
    .eq('id', id)
  if (e1) return { error: e1.message }

  // Step 2: set is_default=TRUE (trigger fires but content unchanged so is_default is preserved)
  const { error: e2 } = await supabase
    .from('email_templates')
    .update({ is_default: true })
    .eq('id', id)
  if (e2) return { error: e2.message }

  revalidatePath('/settings/email-templates')
  return { ok: true }
}

// Used by SendAllConfirmModal to initialise from DB (returns raw template with placeholders).
export async function getRawEmailTemplate(
  documentType: string,
): Promise<{ subject: string; body: string } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('email_templates')
    .select('subject, body')
    .eq('document_type', documentType)
    .single()

  return data ?? null
}
