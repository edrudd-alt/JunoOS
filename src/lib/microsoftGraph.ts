import crypto from 'node:crypto'

const AUTHORIZE_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`

const TOKEN_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

const SCOPES = ['User.Read', 'Mail.Send', 'offline_access']

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  id_token?: string
}

interface UserProfile {
  id: string
  mail: string | null
  userPrincipalName: string
}

export function buildAuthorizeUrl({
  redirectUri,
  state,
  codeChallenge,
}: {
  redirectUri: string
  state: string
  codeChallenge: string
}): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${AUTHORIZE_URL(process.env.MICROSOFT_TENANT_ID!)}?${params}`
}

export async function exchangeCodeForTokens({
  code,
  codeVerifier,
  redirectUri,
}: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL(process.env.MICROSOFT_TENANT_ID!), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${errorBody}`)
  }
  return res.json() as Promise<TokenResponse>
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL(process.env.MICROSOFT_TENANT_ID!), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Token refresh failed: ${res.status} ${errorBody}`)
  }
  return res.json() as Promise<TokenResponse>
}

export async function fetchUserProfile(accessToken: string): Promise<UserProfile> {
  const res = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch user profile: ${res.status}`)
  }
  return res.json() as Promise<UserProfile>
}

export async function sendMail({
  accessToken,
  subject,
  bodyText,
  to,
  saveToSentItems = true,
}: {
  accessToken: string
  subject: string
  bodyText: string
  to: string
  saveToSentItems?: boolean
}): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'Text', content: bodyText },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems,
    }),
  })
  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`sendMail failed: ${res.status} ${errorBody}`)
  }
  // 202 Accepted; no response body
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url')
  return { codeVerifier: verifier, codeChallenge: challenge }
}
