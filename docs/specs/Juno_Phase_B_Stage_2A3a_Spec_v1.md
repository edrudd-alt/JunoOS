# Juno Phase B Sub-stage 2A.3a — Microsoft Outlook OAuth Foundation

**Status:** Draft v1 — to be moved into `docs/specs/` once approved
**Depends on:** Sub-stage 2A.2 (merged 22 May 2026, PR #13)
**Position in plan:** the OAuth foundation for Microsoft Graph integration. Sub-stage 2A.3b will build bulk send on top of this.

---

## 1. Purpose

JunoOS currently generates portfolio statements and lets the team compose emails to send them, but the actual sending happens manually — the team copies the body to Outlook, attaches the PDF, and clicks Send. For ~150 investors per quarter, that's an unworkable amount of manual work.

This sub-stage adds the foundation for JunoOS to send emails directly on behalf of each team member via Microsoft Graph API. Once a team member has connected their Outlook account, JunoOS can send mail from their mailbox, attach files, and have replies route back to them naturally — exactly as if they'd composed the email themselves.

**This sub-stage does NOT yet wire up bulk send or per-statement send buttons.** It establishes the OAuth flow, token storage, refresh logic, and a "Send test email" capability that proves the full path works. Sub-stage 2A.3b will then wire bulk send on top, and a small follow-on will add the Send button to the existing 2A.1.5 composer modal.

---

## 2. Out of scope

- **Bulk send.** Each statement still requires manual delivery in this stage. 2A.3b handles bulk.
- **Sending from a shared mailbox.** All sends are from the connected team member's own mailbox.
- **Sending without consent.** Each team member must explicitly connect their Outlook before JunoOS can send on their behalf. There is no app-level send capability.
- **Reply tracking / inbox monitoring.** JunoOS sends only — it doesn't read replies. Replies go back to the team member's normal Outlook inbox.
- **Calendar, contacts, or other Microsoft Graph capabilities.** Just `Mail.Send`.
- **Send-rate management.** Microsoft Graph allows 10,000 sends per day per mailbox by default. We don't need to manage this in 2A.3a; 2A.3b will add basic awareness when bulk sends start.

---

## 3. The user journey

A team member's first experience:

1. They go to Settings → Integrations (a new section)
2. They see "Outlook — Not connected" with a "Connect Outlook" button
3. They click Connect Outlook
4. A new browser tab opens, taking them to Microsoft's sign-in page
5. They sign in (most likely already signed in; just a single click to confirm)
6. Microsoft asks them to consent to JunoOS sending mail on their behalf — they click Accept
7. The tab redirects back to JunoOS Settings → Integrations, now showing "Outlook — Connected as ed@junocapital.co.uk"
8. Below the connection status, a "Send test email" form appears: a "To" field, an optional "Subject" field (defaults to "JunoOS Outlook test"), and a Send button
9. They enter a recipient, click Send, get a confirmation toast
10. The test email arrives in the recipient's inbox, sent from the team member's mailbox

Subsequent uses (e.g. after PR #14 ships bulk send) won't show the connection flow — only the first time. Token refresh happens silently in the background.

---

## 4. Settings page — Integrations section

The Settings page may or may not exist already in JunoOS. The spec assumes either:
- **(A)** there's already a Settings page (e.g. `/settings`), and we add an "Integrations" section to it
- **(B)** there's no Settings page yet, and we create a minimal one with just the Integrations section

The build prompt will tell Claude Code to check and act accordingly.

The Integrations section layout:

```
┌─────────────────────────────────────────────┐
│ Integrations                                │
│                                             │
│ ┌───────────────────────────────────────┐   │
│ │ 📧 Outlook                             │   │
│ │ Send portfolio statements directly    │   │
│ │ from your Outlook mailbox.            │   │
│ │                                       │   │
│ │ Status: Not connected                 │   │
│ │ [ Connect Outlook ]                   │   │
│ └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

After connecting:

```
┌─────────────────────────────────────────────┐
│ Integrations                                │
│                                             │
│ ┌───────────────────────────────────────┐   │
│ │ 📧 Outlook            ● Connected     │   │
│ │ Connected as: ed@junocapital.co.uk    │   │
│ │ Connected on: 22 May 2026             │   │
│ │ [ Disconnect ]   [ Reconnect ]        │   │
│ │                                       │   │
│ │ ┌─────────────────────────────────┐   │   │
│ │ │ Send test email                 │   │   │
│ │ │                                 │   │   │
│ │ │ To: [_______________________]   │   │   │
│ │ │ Subject: [JunoOS Outlook test]  │   │   │
│ │ │ [ Send test email ]             │   │   │
│ │ └─────────────────────────────────┘   │   │
│ └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Disconnect** — deletes the stored tokens. The team member would need to Connect again to use Outlook send.
**Reconnect** — runs the OAuth flow again. Useful if the underlying Microsoft account has changed or the refresh token has gone stale.

The "Send test email" form is only visible when connected. Body of the test email is hard-coded simple text: *"This is a test email from JunoOS to confirm Outlook integration is working. If you received this, the connection is set up correctly."*

---

## 5. The OAuth flow

This follows the standard Microsoft identity platform OAuth 2.0 authorization code flow with PKCE.

### 5.1 What happens when "Connect Outlook" is clicked

1. JunoOS generates a random `state` value (for CSRF protection) and a PKCE `code_verifier` (random) plus `code_challenge` (SHA256 hash of verifier, base64url-encoded)
2. JunoOS stores `state` and `code_verifier` in a short-lived server-side session (a row in a new `oauth_pending` table, keyed by state, expiring after 10 minutes)
3. JunoOS redirects the team member to Microsoft's authorize endpoint:
   ```
   https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize
     ?client_id={MICROSOFT_CLIENT_ID}
     &response_type=code
     &redirect_uri={current host}/api/auth/microsoft/callback
     &response_mode=query
     &scope=User.Read Mail.Send offline_access
     &state={state}
     &code_challenge={code_challenge}
     &code_challenge_method=S256
   ```

The `{current host}` is whichever Vercel deployment the team member is using — production, preview, or localhost. All three are registered as redirect URIs in Azure.

### 5.2 What happens at the callback

1. Microsoft redirects the team member's browser to `/api/auth/microsoft/callback?code={code}&state={state}`
2. JunoOS verifies the `state` matches the one stored in `oauth_pending` (CSRF check)
3. JunoOS retrieves the `code_verifier` from that row, then deletes the row
4. JunoOS exchanges the code for tokens by POSTing to:
   ```
   https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}/oauth2/v2.0/token
   ```
   with body parameters: `client_id`, `client_secret`, `code`, `redirect_uri`, `code_verifier`, `grant_type=authorization_code`
5. Microsoft returns: `access_token` (1 hour TTL), `refresh_token` (90 days TTL), `expires_in`, `id_token`
6. JunoOS calls `https://graph.microsoft.com/v1.0/me` with the access token to get the user's email address
7. JunoOS upserts a row into `outlook_connections` keyed by `team_member_id`, storing:
   - `microsoft_user_email` (from /me)
   - `microsoft_user_id` (from /me)
   - `access_token` (encrypted at rest — see Section 7)
   - `refresh_token` (encrypted at rest)
   - `access_token_expires_at` (now + expires_in seconds)
   - `connected_at` (now)
   - `last_used_at` (now)
8. JunoOS redirects the browser back to `/settings/integrations?connected=outlook`

### 5.3 Token refresh

When JunoOS needs to send an email, it first checks the team member's `outlook_connections` row:

- If `access_token_expires_at` is more than 5 minutes in the future, use the current `access_token`
- Otherwise, POST to the token endpoint with `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`
- Microsoft returns a fresh `access_token` (and possibly a new `refresh_token`)
- Update the `outlook_connections` row with the new values

If refresh fails (refresh token expired, user revoked consent, etc.), mark the connection as failed and prompt the team member to reconnect on their next visit.

### 5.4 Disconnect

Clicking Disconnect simply deletes the row from `outlook_connections`. Microsoft retains a record of the previously granted consent — the next time the team member connects, they may not see the consent screen again (Microsoft remembers), but JunoOS doesn't have their tokens any more.

For a "harder" disconnect that also revokes consent on Microsoft's side, the team member would need to visit https://myaccount.microsoft.com/ — out of scope for JunoOS to manage.

---

## 6. The "Send test email" path

When the connected team member clicks "Send test email":

1. Client posts to a server action `sendTestEmail({ to, subject? })`
2. Server action looks up the current team member's `outlook_connections` row
3. If no row exists, return `{ error: "Not connected to Outlook" }`
4. Refresh the access token if needed (Section 5.3)
5. POST to `https://graph.microsoft.com/v1.0/me/sendMail` with body:
   ```json
   {
     "message": {
       "subject": "JunoOS Outlook test",
       "body": {
         "contentType": "Text",
         "content": "This is a test email from JunoOS..."
       },
       "toRecipients": [
         { "emailAddress": { "address": "<to>" } }
       ]
     },
     "saveToSentItems": true
   }
   ```
6. Microsoft returns `202 Accepted` (no body) on success
7. Update `outlook_connections.last_used_at`
8. Return `{ success: true }` to the client
9. Client shows confirmation toast: "Test email sent to {recipient}"

`saveToSentItems: true` means the email appears in the team member's Outlook Sent Items, which is what they expect.

If the POST fails (4xx or 5xx from Microsoft Graph), surface the error message in a structured JSON log and return `{ error: "Microsoft Graph rejected the send: {message}" }` to the client.

---

## 7. Token storage and encryption

### 7.1 Why encryption matters

The `refresh_token` is a long-lived credential — 90 days. If someone gained read access to the `outlook_connections` table, they could exchange refresh tokens for access tokens and send mail from any connected team member's mailbox. This needs to be defended against.

### 7.2 Approach

Tokens are encrypted at rest using a symmetric key (AES-256-GCM) stored as a Vercel environment variable `MICROSOFT_TOKEN_ENCRYPTION_KEY`. The database stores only the encrypted ciphertext.

Encryption happens in the server action layer — application code encrypts before insert and decrypts on read. Postgres never sees the plaintext.

The encryption key needs to be:
- 32 bytes (256 bits) of random data
- Base64-encoded for storage in environment variable
- Generated once and stored in Vercel Production + Preview (both must use the same key, otherwise preview can't read production-encrypted tokens and vice versa)
- **Never rotated** unless we also re-encrypt all stored tokens at the same time

The build prompt will generate this key during setup and instruct Ed how to add it to Vercel.

### 7.3 Alternative considered: Supabase Vault

Supabase has a `vault` schema designed exactly for storing encrypted secrets at the database level. Worth considering as an alternative — would mean we don't manage the encryption key in application code.

The downsides of Vault: it's still in beta, less familiar to most developers, and adds a Supabase-specific dependency. For 2A.3a, application-level AES-256-GCM is the more straightforward path. Future Work item to consider Vault later if we find ourselves managing more sensitive credentials.

---

## 8. Database changes

Two new tables.

### 8.1 `outlook_connections`

```sql
CREATE TABLE outlook_connections (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id           UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  microsoft_user_id        TEXT NOT NULL,
  microsoft_user_email     TEXT NOT NULL,
  encrypted_access_token   TEXT NOT NULL,
  encrypted_refresh_token  TEXT NOT NULL,
  access_token_expires_at  TIMESTAMPTZ NOT NULL,
  connected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refresh_failed_at   TIMESTAMPTZ,
  last_refresh_failure     TEXT
);

CREATE UNIQUE INDEX outlook_connections_team_member_idx ON outlook_connections (team_member_id);
                  -- One connection per team member (enforces upsert behaviour)
CREATE INDEX outlook_connections_email_idx ON outlook_connections (microsoft_user_email);
```

The encrypted fields store the base64 of `iv || ciphertext || authTag` from AES-256-GCM. Application code is responsible for the encrypt/decrypt round trip.

### 8.2 `oauth_pending`

```sql
CREATE TABLE oauth_pending (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX oauth_pending_created_idx ON oauth_pending (created_at);
                  -- Used for cleanup of stale rows older than 10 minutes
```

This is a short-lived table — rows are deleted as soon as the OAuth callback completes successfully, or aged out by cleanup.

### 8.3 RLS

Both tables get RLS. Critical security note: each team member can read only their own connection — never another team member's tokens.

```sql
ALTER TABLE outlook_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_pending ENABLE ROW LEVEL SECURITY;

-- outlook_connections: only see/manage your own connection
CREATE POLICY "team members read own outlook connection"
  ON outlook_connections FOR SELECT TO authenticated
  USING (team_member_id = auth.uid());

CREATE POLICY "team members insert own outlook connection"
  ON outlook_connections FOR INSERT TO authenticated
  WITH CHECK (team_member_id = auth.uid());

CREATE POLICY "team members update own outlook connection"
  ON outlook_connections FOR UPDATE TO authenticated
  USING (team_member_id = auth.uid())
  WITH CHECK (team_member_id = auth.uid());

CREATE POLICY "team members delete own outlook connection"
  ON outlook_connections FOR DELETE TO authenticated
  USING (team_member_id = auth.uid());

-- oauth_pending: same model
CREATE POLICY "team members read own oauth_pending"
  ON oauth_pending FOR SELECT TO authenticated USING (team_member_id = auth.uid());
CREATE POLICY "team members insert own oauth_pending"
  ON oauth_pending FOR INSERT TO authenticated WITH CHECK (team_member_id = auth.uid());
CREATE POLICY "team members delete own oauth_pending"
  ON oauth_pending FOR DELETE TO authenticated USING (team_member_id = auth.uid());
```

If `auth.uid()` doesn't match `team_members.id` in this codebase (there's sometimes a layer of indirection), the build prompt will tell Claude Code to use the correct subquery pattern. Worth verifying during the build.

---

## 9. Environment variables required

In addition to the existing JunoOS env vars and the three Microsoft credentials already added today:

- `MICROSOFT_TENANT_ID` — already added
- `MICROSOFT_CLIENT_ID` — already added
- `MICROSOFT_CLIENT_SECRET` — already added (Sensitive)
- `MICROSOFT_TOKEN_ENCRYPTION_KEY` — **NEW**, to be added during 2A.3a setup. 32-byte random key, base64 encoded. Sensitive. Production + Preview (must be the same value in both).

The build prompt will provide a one-line command to generate this key.

---

## 10. Acceptance criteria

To be verified on the preview before merging:

### Settings → Integrations
1. New "Integrations" section visible in Settings (or a new minimal Settings page if none existed)
2. Outlook card shows "Not connected" with a "Connect Outlook" button before any connection is made

### OAuth flow
3. Clicking "Connect Outlook" opens Microsoft's sign-in page in the same tab (or new tab — either is acceptable)
4. After signing in and consenting, the user is redirected back to Settings → Integrations with a success indicator
5. The card now shows "Connected as {email}" and "Connected on {date}"
6. The `outlook_connections` table contains a row for the team member with encrypted tokens (verifiable via Supabase MCP: row exists, tokens are not plaintext)

### Token refresh
7. Calling `sendTestEmail` when the access token is more than 5 minutes from expiry uses the current token
8. Calling `sendTestEmail` when the access token has expired silently refreshes and proceeds

### Send test email
9. The "Send test email" form is visible only when connected
10. Submitting with a valid email address shows a success toast within 5 seconds
11. The test email arrives in the recipient's inbox
12. The email's "From" is the connected team member's address
13. The email appears in the connected team member's Outlook Sent Items
14. Replying to the test email routes the reply back to the team member's normal inbox

### Disconnect
15. Clicking Disconnect removes the row from `outlook_connections`
16. After disconnect, the card returns to "Not connected" and Send test email form disappears
17. The team member can reconnect successfully

### Error handling
18. Submitting "Send test email" with an invalid recipient address shows a meaningful inline error (not a generic 500)
19. If Microsoft Graph returns an error (e.g. rate limit), the user sees a meaningful message
20. If a team member's refresh token has expired, the next attempt to send shows "Outlook connection needs to be renewed — please reconnect"

### Security
21. The `outlook_connections` table's `encrypted_access_token` and `encrypted_refresh_token` columns contain ciphertext, not plaintext
22. A second team member signed in cannot see the first team member's connection via the UI or via direct database query (RLS check)

---

## 11. Future Work items to add to a new spec file

Items 14.43–14.47, to be appended to `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md`:

```markdown
- **14.43 — Bulk send (2A.3b).** Wire up the bulk-runner from 2A.2 to use the Outlook integration for actual sending. After a bulk generation completes, a "Send all" button kicks off a polling-based per-statement send queue using the connected user's Outlook. Subject and body come from existing 2A.1.5 templates.

- **14.44 — Send button on existing 2A.1.5 composer modal.** Wire the existing per-statement Email composer modal to actually send via the connected user's Outlook when "Send" is clicked. Foundation is 2A.3a; this is a small follow-on.

- **14.45 — Outlook connection health check.** Once a day, attempt a no-op token refresh for every connected team member. If it fails, mark the connection as needing attention and surface a banner the next time they visit JunoOS.

- **14.46 — Send-from a shared mailbox.** Consider allowing certain emails to be sent from a shared `reports@junocapital.co.uk` mailbox instead of an individual's mailbox. Requires Mail.Send.Shared scope and additional consent.

- **14.47 — Supabase Vault evaluation.** Consider migrating token encryption to Supabase Vault rather than application-level AES-256-GCM. Lower maintenance burden but Vault is still in beta.
```

---

## 12. Implementation order for the build prompt

1. Spec file added to `docs/specs/`
2. Future Work 14.43-14.47 appended to Stage 2A spec
3. Migration: create `outlook_connections`, `oauth_pending` tables + RLS
4. Generate `MICROSOFT_TOKEN_ENCRYPTION_KEY` and add to Vercel (Ed does this; build prompt provides the command)
5. Encryption helper (`src/lib/encryption.ts`) with `encrypt(plaintext): string` and `decrypt(ciphertext): string`
6. Microsoft Graph client helpers (`src/lib/microsoftGraph.ts`) for the OAuth and sendMail calls
7. Server actions: `startOutlookConnect`, `handleOutlookCallback`, `sendTestEmail`, `disconnectOutlook`, `getOutlookConnectionStatus`
8. API routes:
   - `GET /api/auth/microsoft/start` — redirects to Microsoft authorize URL
   - `GET /api/auth/microsoft/callback` — handles the redirect from Microsoft
9. Settings → Integrations page (new or extended depending on what exists)
10. Outlook card component with Connect / Disconnect / Reconnect actions
11. Send test email form component
12. Toast / notification for success and error states

---

*End of spec.*
