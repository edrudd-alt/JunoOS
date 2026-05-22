'use server'

import { createClient } from '@/lib/supabase/server'

export interface TemplateContext {
  clientFirstName?: string | null
  clientFullName?: string | null
  senderFirstName?: string | null
  senderFullName?: string | null
  period?: string | null
  companyName?: string | null
  filename?: string | null
  reference?: string | null
}

export interface ResolvedTemplate {
  subject: string
  body: string
}

const PLACEHOLDER_MAP: Record<string, keyof TemplateContext> = {
  client_first_name: 'clientFirstName',
  client_full_name:  'clientFullName',
  sender_first_name: 'senderFirstName',
  sender_full_name:  'senderFullName',
  period:            'period',
  company_name:      'companyName',
  filename:          'filename',
  reference:         'reference',
}

function substitute(template: string, context: TemplateContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, placeholder) => {
    const contextKey = PLACEHOLDER_MAP[placeholder]
    if (!contextKey) return ''
    return context[contextKey] ?? ''
  })
}

export async function getEmailTemplate(
  documentType: string,
  context: TemplateContext,
): Promise<ResolvedTemplate | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('email_templates')
    .select('subject, body')
    .eq('document_type', documentType)
    .single()

  if (error || !data) return null

  return {
    subject: substitute(data.subject, context),
    body:    substitute(data.body,    context),
  }
}

export function deriveFirstName(fullName: string | null | undefined): string {
  if (!fullName) return ''
  return fullName.trim().split(/\s+/)[0] ?? ''
}

export function formatPeriodDateUK(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00`) : date
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
