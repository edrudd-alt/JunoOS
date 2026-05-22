'use server'

import { createClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/encryption'
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchUserProfile,
  sendMail,
  generatePkcePair,
} from '@/lib/microsoftGraph'
import { randomBytes } from 'node:crypto'
import { headers } from 'next/headers'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OutlookConnection {
  id: string
  team_member_id: string
  microsoft_user_email: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  access_token_expires_at: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getRedirectUri(): Promise<string> {
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}/api/auth/microsoft/callback`
}

async function getValidAccessToken(connection: OutlookConnection): Promise<string> {
  const FIVE_MINUTES_MS = 5 * 60 * 1000
  const expiresAt = new Date(connection.access_token_expires_at).getTime()

  if (expiresAt - Date.now() > FIVE_MINUTES_MS) {
    return decrypt(connection.encrypted_access_token)
  }

  const supabase = await createClient()
  const refreshToken = decrypt(connection.encrypted_refresh_token)

  try {
    const newTokens = await refreshAccessToken(refreshToken)
    await supabase
      .from('outlook_connections')
      .update({
        encrypted_access_token: encrypt(newTokens.access_token),
        encrypted_refresh_token: encrypt(newTokens.refresh_token),
        access_token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        last_refresh_failed_at: null,
        last_refresh_failure: null,
      })
      .eq('id', connection.id)
    return newTokens.access_token
  } catch (e) {
    await supabase
      .from('outlook_connections')
      .update({
        last_refresh_failed_at: new Date().toISOString(),
        last_refresh_failure: e instanceof Error ? e.message : 'Unknown',
      })
      .eq('id', connection.id)
    throw e
  }
}

// ── startOutlookConnect ───────────────────────────────────────────────────────

export async function startOutlookConnect(): Promise<{ authorizeUrl: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const state = randomBytes(16).toString('hex')
  const { codeVerifier, codeChallenge } = generatePkcePair()
  const redirectUri = await getRedirectUri()

  await supabase.from('oauth_pending').insert({
    state,
    code_verifier: codeVerifier,
    team_member_id: user.id,
  })

  return { authorizeUrl: buildAuthorizeUrl({ redirectUri, state, codeChallenge }) }
}

// ── handleOutlookCallback ─────────────────────────────────────────────────────

export async function handleOutlookCallback({
  code,
  state,
}: {
  code: string
  state: string
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()

  const { data: pending } = await supabase
    .from('oauth_pending')
    .select('*')
    .eq('state', state)
    .single()

  if (!pending) return { error: 'OAuth state not found or already used' }

  if (Date.now() - new Date(pending.created_at).getTime() > 10 * 60 * 1000) {
    await supabase.from('oauth_pending').delete().eq('state', state)
    return { error: 'OAuth session expired — please try connecting again' }
  }

  await supabase.from('oauth_pending').delete().eq('state', state)

  const redirectUri = await getRedirectUri()

  let tokens
  try {
    tokens = await exchangeCodeForTokens({ code, codeVerifier: pending.code_verifier, redirectUri })
  } catch {
    return { error: 'Failed to exchange authorisation code — please try again' }
  }

  let profile
  try {
    profile = await fetchUserProfile(tokens.access_token)
  } catch {
    return { error: 'Connected to Microsoft but could not retrieve your profile — please try again' }
  }

  const { error: upsertError } = await supabase
    .from('outlook_connections')
    .upsert(
      {
        team_member_id: pending.team_member_id,
        microsoft_user_id: profile.id,
        microsoft_user_email: profile.mail ?? profile.userPrincipalName,
        encrypted_access_token: encrypt(tokens.access_token),
        encrypted_refresh_token: encrypt(tokens.refresh_token),
        access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        connected_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'team_member_id' },
    )

  if (upsertError) return { error: 'Failed to save Outlook connection — please try again' }

  return { ok: true }
}

// ── getOutlookConnectionStatus ────────────────────────────────────────────────

export async function getOutlookConnectionStatus(): Promise<
  { connected: false } | { connected: true; email: string; connectedAt: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { connected: false }

  const { data } = await supabase
    .from('outlook_connections')
    .select('microsoft_user_email, connected_at')
    .eq('team_member_id', user.id)
    .maybeSingle()

  if (!data) return { connected: false }
  return { connected: true, email: data.microsoft_user_email, connectedAt: data.connected_at }
}

// ── sendTestEmail ─────────────────────────────────────────────────────────────

export async function sendTestEmail({
  to,
  subject,
}: {
  to: string
  subject?: string
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: connection } = await supabase
    .from('outlook_connections')
    .select('id, team_member_id, microsoft_user_email, encrypted_access_token, encrypted_refresh_token, access_token_expires_at')
    .eq('team_member_id', user.id)
    .maybeSingle()

  if (!connection) return { error: 'Not connected to Outlook' }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(connection as OutlookConnection)
  } catch {
    return { error: 'Outlook connection needs to be renewed — please reconnect' }
  }

  try {
    await sendMail({
      accessToken,
      subject: subject?.trim() || 'JunoOS Outlook test',
      bodyText:
        'This is a test email from JunoOS to confirm Outlook integration is working. If you received this, the connection is set up correctly.',
      to,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('401')) return { error: 'Outlook connection needs to be renewed — please reconnect' }
    if (msg.includes('400')) return { error: 'The recipient email address is not valid' }
    if (msg.includes('429')) return { error: 'Microsoft is rate-limiting sends — please wait a moment and try again' }
    return { error: 'Could not send the email — please try again' }
  }

  await supabase
    .from('outlook_connections')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', connection.id)

  return { ok: true }
}

// ── disconnectOutlook ─────────────────────────────────────────────────────────

export async function disconnectOutlook(): Promise<{ ok: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await supabase.from('outlook_connections').delete().eq('team_member_id', user.id)

  return { ok: true }
}
