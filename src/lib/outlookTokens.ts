import { createClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/encryption'
import { refreshAccessToken } from '@/lib/microsoftGraph'

export interface OutlookConnection {
  id: string
  team_member_id: string
  microsoft_user_email: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  access_token_expires_at: string
}

const FIVE_MINUTES_MS = 5 * 60 * 1000

export async function getValidAccessToken(connection: OutlookConnection): Promise<string> {
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
