'use server'

import { createClient } from '@/lib/supabase/server'
import { sendDocumentEmail } from '@/lib/outlookSend'
import { type OutlookConnection } from '@/lib/outlookTokens'
import { getEmailTemplate, deriveFirstName, formatPeriodDateUK } from '@/lib/templates'

export async function resolveDocumentTemplate(
  documentId: string,
  clientId: string,
): Promise<{ subject: string; body: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Two-query pattern: fetch document, then fetch company if needed
  const { data: doc } = await supabase
    .from('documents')
    .select('type, filename, period, company_id')
    .eq('id', documentId)
    .single()

  if (!doc) return null

  const [{ data: client }, { data: sender }, companyResult] = await Promise.all([
    supabase.from('clients').select('full_name').eq('id', clientId).single(),
    supabase.from('team_members').select('full_name').eq('id', user.id).single(),
    doc.company_id
      ? supabase.from('companies').select('name').eq('id', doc.company_id).single()
      : Promise.resolve({ data: null }),
  ])

  const senderFullName = sender?.full_name ?? null
  const senderFirstName = senderFullName
    ? deriveFirstName(senderFullName)
    : user.email?.split('@')[0] ?? ''

  return getEmailTemplate(doc.type, {
    clientFirstName: deriveFirstName(client?.full_name),
    clientFullName:  client?.full_name ?? null,
    senderFirstName,
    senderFullName,
    period:          doc.period ? formatPeriodDateUK(doc.period) : null,
    companyName:     companyResult.data?.name ?? null,
    filename:        doc.filename,
    reference:       null,
  })
}

export async function sendDocument({
  documentId,
  clientId,
  recipientEmail,
  subject,
  bodyText,
}: {
  documentId: string
  clientId: string
  recipientEmail: string
  subject: string
  bodyText: string
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: connection } = await supabase
    .from('outlook_connections')
    .select('id, team_member_id, microsoft_user_email, encrypted_access_token, encrypted_refresh_token, access_token_expires_at')
    .eq('team_member_id', user.id)
    .maybeSingle()

  if (!connection) return { error: 'Outlook not connected — connect in Settings → Integrations' }

  const { data: doc } = await supabase
    .from('documents')
    .select('storage_url, filename')
    .eq('id', documentId)
    .single()

  if (!doc?.storage_url) return { error: 'Document file not found' }

  const result = await sendDocumentEmail({
    connection: connection as OutlookConnection,
    teamMemberId: user.id,
    documentId,
    clientId,
    recipientEmail,
    subject,
    bodyText,
    attachmentName: doc.filename,
    storageUrl: doc.storage_url,
  })

  if (!result.ok) {
    if (result.graphStatus === 401) return { error: 'Outlook connection needs renewal — reconnect in Settings' }
    if (result.graphStatus === 400) return { error: 'Recipient email address was rejected by Microsoft' }
    if (result.graphStatus === 429) return { error: 'Microsoft is rate-limiting sends — please wait and retry' }
    return { error: result.error || 'Send failed — please try again' }
  }

  return { ok: true }
}
