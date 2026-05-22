# Build Prompt — Sub-stage 2A.3a: Microsoft Outlook OAuth Foundation

**Pre-read:** `docs/specs/Juno_Phase_B_Stage_2A3a_Spec_v1.md` is the authoritative spec.

**Branch:** `feat/outlook-integration`
**Base:** `main` (PR #13 merged 22 May 2026)
**Database migrations:** YES — two new tables. Show SQL to Ed for approval before applying.

---

## Context

JunoOS needs to send emails on behalf of team members via Microsoft Graph. This PR is the foundation: OAuth flow, encrypted token storage, refresh logic, and a "Send test email" capability that proves the end-to-end path works. Sub-stage 2A.3b will then wire bulk send and per-statement send buttons on top.

**Ed has already completed:**
- Azure AD app registration in his Microsoft 365 tenant (single-tenant)
- Three redirect URIs configured: production, localhost, and the predicted preview URL for this PR (`https://juno-os-git-feat-outlook-integration-edrudd-3495s-projects.vercel.app/api/auth/microsoft/callback`)
- API permissions granted with admin consent: User.Read, Mail.Send, offline_access
- Three credentials added to Vercel env vars (Production + Preview): `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`

**Still to do (one of Ed's actions during this build, see Task 4):**
- Generate and add `MICROSOFT_TOKEN_ENCRYPTION_KEY` to Vercel

---

## Files to read before writing anything

1. `src/app/(app)/layout.tsx` or wherever the main app shell lives — to understand how Settings is reached (if it exists)
2. Search the repo for any existing `/settings` route or Settings component
3. `CLAUDE.md` — two-query-then-merge pattern still applies
4. `src/lib/templates.ts` from 2A.1.5 — for date formatting helpers
5. `supabase/migrations/` — look at the most recent migration (PR #13's bulk_runs migration) for the migration file naming pattern

---

## Task 1 — Migration (Ed approves before apply)

Two tables and RLS policies. SQL is in spec Section 8. Migration filename:

```
supabase/migrations/20260522140000_outlook_connections.sql
```

**Critical RLS detail to verify before writing SQL:** in JunoOS's existing schema, does `auth.uid()` return the team_members.id directly, OR does it return a separate Supabase auth user id with an intermediate lookup needed?

Check an existing table with a `team_member_id` foreign key (e.g. `bulk_runs.started_by`) — look at how RLS policies on `documents` or similar use `auth.uid()`. Match that pattern exactly.

If `auth.uid()` doesn't directly equal `team_members.id`, the RLS policies need to be like:

```sql
USING (team_member_id IN (SELECT id FROM team_members WHERE auth_user_id = auth.uid()))
```

…or whatever the existing pattern is. Don't guess — match the existing convention exactly.

After writing the SQL, **STOP and show Ed**. Bring the SQL across verbatim from the spec, with RLS adjusted if needed for the auth.uid() pattern.

---

## Task 2 — Token encryption helper

New file: `src/lib/encryption.ts`

```typescript
import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32  // 256 bits
const IV_LENGTH = 12   // 96 bits (recommended for GCM)
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const keyBase64 = process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY
  if (!keyBase64) {
    throw new Error('MICROSOFT_TOKEN_ENCRYPTION_KEY environment variable is not set')
  }
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (got ${key.length})`)
  }
  return key
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: base64(iv || ciphertext || authTag)
  return Buffer.concat([iv, ciphertext, authTag]).toString('base64')
}

export function decrypt(encrypted: string): string {
  const key = getKey()
  const data = Buffer.from(encrypted, 'base64')
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted data is too short to be valid')
  }
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH)
  const ciphertext = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}
```

This uses Node's built-in `node:crypto` — no external dependency needed.

**Unit testability** — these are pure functions. Add a basic round-trip test in `src/lib/__tests__/encryption.test.ts` if the project has a test runner; if not, skip.

---

## Task 3 — Microsoft Graph client helpers

New file: `src/lib/microsoftGraph.ts`

```typescript
const AUTHORIZE_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`

const TOKEN_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

const SCOPES = ['User.Read', 'Mail.Send', 'offline_access']

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number  // seconds
  id_token?: string
}

interface UserProfile {
  id: string  // microsoft user id
  mail: string | null
  userPrincipalName: string  // fallback if mail is null
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
```

Import `crypto` from `'node:crypto'` at the top of the file alongside the other imports.

---

## Task 4 — Generate the encryption key (Ed action)

Before any code can decrypt tokens, the `MICROSOFT_TOKEN_ENCRYPTION_KEY` env var must exist in Vercel.

**STOP at this point in the build and tell Ed:**

> The OAuth code is ready but needs an encryption key in Vercel before the integration will work.
>
> Generate a key by running this command on your computer in any terminal (Mac Terminal, Windows PowerShell, doesn't matter which):
>
> ```
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
> ```
>
> If you don't have Node installed, you can also generate one online at https://generate.plus/en/base64?bytes=32 — but a locally generated value is preferable.
>
> Once you have the value (it'll be about 44 characters ending in `=`):
> 1. Open Vercel → juno-os project → Settings → Environment Variables
> 2. Click "Create" or "Add new"
> 3. Key: `MICROSOFT_TOKEN_ENCRYPTION_KEY`
> 4. Value: paste the generated key
> 5. Environments: tick Production and Preview
> 6. Sensitive: turn ON
> 7. Save
>
> Tell me when done. Once the env var is in Vercel, I'll continue with the rest of the build.

After Ed confirms the env var is set, continue.

---

## Task 5 — Server actions

New file: `src/app/(app)/settings/outlookActions.ts`

```typescript
'use server'

import { createServerClient } from '@/lib/supabase/server'
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
import { redirect } from 'next/navigation'
```

Actions:

- **`startOutlookConnect()`** → `{ authorizeUrl: string }`
  - Get current team_member_id from auth
  - Generate `state` (random) and PKCE pair
  - Insert into `oauth_pending` table
  - Build authorize URL with redirect_uri set to `{current host}/api/auth/microsoft/callback`
  - Return the URL (client will redirect to it)

- **`handleOutlookCallback({ code, state })`** → `{ ok: true } | { error: string }`
  - Look up `oauth_pending` row by state
  - If not found or older than 10 minutes → return error
  - Delete the row immediately to prevent replay
  - Call `exchangeCodeForTokens` with the code and stored verifier
  - Call `fetchUserProfile` to get the user's email
  - Encrypt access_token and refresh_token
  - Upsert into `outlook_connections` (key on team_member_id)
  - Return success

- **`getOutlookConnectionStatus()`** → `{ connected: false } | { connected: true, email, connectedAt }`
  - Look up `outlook_connections` row for current team member
  - Return the status

- **`sendTestEmail({ to, subject? })`** → `{ ok: true } | { error: string }`
  - Look up `outlook_connections` row
  - Decrypt access token
  - Check expiry — if less than 5 minutes remaining or expired, refresh
  - Call `sendMail` with hard-coded test body
  - Update `last_used_at`
  - Return success or error
  - **Wrap all Microsoft Graph errors with friendly messages** — never expose raw 400/401 details to the user
  - If refresh fails, also update `last_refresh_failed_at` and `last_refresh_failure` columns

- **`disconnectOutlook()`** → `{ ok: true }`
  - Delete the `outlook_connections` row for the current team member

**Token refresh helper** (internal to this file):

```typescript
async function getValidAccessToken(connection: OutlookConnection): Promise<string> {
  const FIVE_MINUTES_MS = 5 * 60 * 1000
  const expiresAt = new Date(connection.access_token_expires_at).getTime()
  const now = Date.now()

  if (expiresAt - now > FIVE_MINUTES_MS) {
    return decrypt(connection.encrypted_access_token)
  }

  // Token expired or about to — refresh
  const refreshToken = decrypt(connection.encrypted_refresh_token)
  try {
    const newTokens = await refreshAccessToken(refreshToken)
    // Update the stored tokens
    const supabase = createServerClient()
    await supabase
      .from('outlook_connections')
      .update({
        encrypted_access_token: encrypt(newTokens.access_token),
        encrypted_refresh_token: encrypt(newTokens.refresh_token),  // Microsoft may rotate
        access_token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        last_refresh_failed_at: null,
        last_refresh_failure: null,
      })
      .eq('id', connection.id)
    return newTokens.access_token
  } catch (e) {
    const supabase = createServerClient()
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
```

---

## Task 6 — API routes

### `src/app/api/auth/microsoft/start/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { startOutlookConnect } from '@/app/(app)/settings/outlookActions'

export async function GET(_req: NextRequest) {
  try {
    const { authorizeUrl } = await startOutlookConnect()
    return NextResponse.redirect(authorizeUrl)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

### `src/app/api/auth/microsoft/callback/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { handleOutlookCallback } from '@/app/(app)/settings/outlookActions'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    // User declined consent
    return NextResponse.redirect(new URL('/settings/integrations?outlook_error=denied', req.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings/integrations?outlook_error=invalid', req.url))
  }

  const result = await handleOutlookCallback({ code, state })

  if ('error' in result) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?outlook_error=${encodeURIComponent(result.error)}`, req.url)
    )
  }

  return NextResponse.redirect(new URL('/settings/integrations?connected=outlook', req.url))
}
```

---

## Task 7 — Settings → Integrations page

First check whether a `/settings` route exists in the repo. Then:

- **If `/settings` exists**: add an `/settings/integrations` sub-route, and add a link to it from the main Settings page navigation
- **If `/settings` doesn't exist**: create a minimal `/settings/integrations` page (no need for a Settings parent index right now; that can come in a later PR)

The Integrations page is a Server Component that:

1. Calls `getOutlookConnectionStatus()` for the current team member
2. Renders the Outlook card (see Section 4 of the spec)
3. Includes a client component for the Send Test Email form (only rendered when connected)

The "Connect Outlook" button is a simple `<a href="/api/auth/microsoft/start">` link styled as a button. Don't bother making it a form submission — a plain GET request is fine for starting the OAuth flow.

The Send Test Email form (`SendTestEmailForm.tsx`, client component):

- Single input field for "To" (required, email validation)
- Optional input for "Subject" (defaults to "JunoOS Outlook test")
- "Send test email" button
- On click: calls `sendTestEmail({ to, subject })` server action
- Shows result inline: green success message "Test email sent to {recipient}" or red error message

After the OAuth callback redirects back with `?connected=outlook`, show a brief success banner at the top of the page: "Outlook connected successfully."

After the callback redirects back with `?outlook_error=...`, show a red banner with the error.

---

## Task 8 — Future Work items

Append 14.43-14.47 from spec Section 11 to `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md`.

---

## Acceptance for this PR

All 22 criteria in spec Section 10 must pass on the preview.

**Most critical tests:**

1. Connect Outlook flow completes end-to-end without errors
2. `outlook_connections` row is created with encrypted tokens (verify via Supabase MCP — confirm the columns contain non-readable base64 strings, not plaintext tokens)
3. Test email actually arrives in the recipient's inbox
4. Email appears in the connected team member's Outlook Sent Items
5. Reply to the test email arrives in the team member's normal inbox (proves "from" address is correctly set)
6. Disconnect deletes the row
7. Re-connect works after disconnect
8. After connecting on one team member's account, a different team member logged in cannot see the first one's connection (RLS check)
9. Build passes locally with `npm run build` and `tsc --noEmit`

---

## Anti-patterns to avoid

- **Don't store tokens unencrypted.** Encryption is the whole point of Section 7. If you find yourself thinking "for testing it's easier to just store plaintext", stop.
- **Don't log tokens.** Not even encrypted ones, and definitely not plaintext. Logs go to Vercel where they're searchable.
- **Don't use `console.error(JSON.stringify(tokenResponse))`** when debugging — that would log the access token to Vercel runtime logs. Log only the error message and the HTTP status code.
- **Don't expose raw Microsoft Graph error responses to the user.** Wrap them with friendly messages.
- **Don't use HTML `<form>` action attributes** — use server actions or fetch calls. (Established platform rule.)
- **Don't add a Disconnect confirmation modal.** The action is reversible (re-connect anytime), so no destructive-action warning needed.
- **Don't fetch tokens client-side.** All Microsoft Graph calls happen on the server. The client only triggers server actions.
- **Don't try to use Microsoft Graph SDK packages.** They add weight and complexity. Plain `fetch` against the documented endpoints is enough.
- **Don't add server-side polling or background refresh.** Tokens refresh on-demand when needed; no scheduled jobs.

---

## Workflow

1. Branch `feat/outlook-integration` from `main`
2. Commit 1: Spec file (`docs/specs/Juno_Phase_B_Stage_2A3a_Spec_v1.md`)
3. Commit 2: Future Work items appended to Stage 2A spec
4. Commit 3: Migration SQL — **STOP and show Ed**
5. Ed approves → apply migration
6. **Continue and stop at end of Task 3 to instruct Ed to set up the encryption key env var** (Task 4)
7. Ed confirms env var set → continue
8. Commit 4: Encryption helper (`src/lib/encryption.ts`)
9. Commit 5: Microsoft Graph helpers (`src/lib/microsoftGraph.ts`)
10. Commit 6: Server actions (`outlookActions.ts`)
11. Commit 7: API routes (`/api/auth/microsoft/start`, `/api/auth/microsoft/callback`)
12. Commit 8: Settings → Integrations page + components
13. Push, write PR description, **stop and wait for Ed.**

Expect possibly 9-12 commits total once preview review surfaces issues.

---

*End of build prompt.*
