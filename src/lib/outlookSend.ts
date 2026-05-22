import { createClient } from '@/lib/supabase/server'
import { sendMailWithAttachment } from '@/lib/microsoftGraph'
import { getValidAccessToken, type OutlookConnection } from '@/lib/outlookTokens'

export async function sendDocumentEmail({
  connection,
  teamMemberId,
  documentId,
  clientId,
  recipientEmail,
  subject,
  bodyText,
  attachmentName,
  storageUrl,
  bulkRunId,
}: {
  connection: OutlookConnection
  teamMemberId: string
  documentId: string
  clientId: string
  recipientEmail: string
  subject: string
  bodyText: string
  attachmentName: string
  storageUrl: string
  bulkRunId?: string
}): Promise<{ ok: true; emailSendId: string } | { ok: false; graphStatus?: number; error: string }> {
  const supabase = await createClient()

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(connection)
  } catch {
    return { ok: false, error: 'Outlook token refresh failed — reconnect in Settings' }
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('documents')
    .download(storageUrl)

  if (downloadError || !fileData) {
    return { ok: false, error: `Document download failed: ${downloadError?.message ?? 'no data'}` }
  }

  const attachmentBase64 = Buffer.from(await fileData.arrayBuffer()).toString('base64')

  const sendResult = await sendMailWithAttachment({
    accessToken,
    subject,
    bodyText,
    to: recipientEmail,
    attachmentName,
    attachmentBase64,
  })

  const now = new Date().toISOString()

  const { data: emailSend, error: insertError } = await supabase
    .from('email_sends')
    .insert({
      document_id: documentId,
      client_id: clientId,
      sent_by_team_member_id: teamMemberId,
      sent_from_email: connection.microsoft_user_email,
      recipient_email: recipientEmail,
      subject,
      body_text: bodyText,
      status: sendResult.ok ? 'succeeded' : 'failed',
      graph_response_status: sendResult.ok ? 202 : sendResult.status,
      error_message: sendResult.ok ? null : sendResult.body,
      bulk_run_id: bulkRunId ?? null,
      attempted_at: now,
      completed_at: now,
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('email_sends insert failed:', insertError.message)
  }

  if (!sendResult.ok) {
    return { ok: false, graphStatus: sendResult.status, error: sendResult.body }
  }

  await supabase
    .from('outlook_connections')
    .update({ last_used_at: now })
    .eq('id', connection.id)

  return { ok: true, emailSendId: emailSend?.id ?? '' }
}
