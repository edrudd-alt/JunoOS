# Build Prompt — Sub-stage 2A.3b: Outlook Bulk Send + 14.44 Per-Document Send

**Pre-read:** `docs/specs/Juno_Phase_B_Stage_2A3b_Spec_v1.md` is the authoritative spec.

**Branch:** `feat/outlook-bulk-send`
**Base:** `main` (PR #14 merged 22 May 2026)
**Database migrations:** YES — one new table (`email_sends`). Show SQL to Ed for approval before applying.

---

## Context

PR #14 (2A.3a) shipped the Outlook OAuth foundation. JunoOS can send a single test email from a connected mailbox; the path is proven end-to-end.

This PR completes the practical Q2 2026 reporting workflow by adding the two real send paths the team needs:

- **Single send (14.44):** the existing 2A.1.5 Email composer modal gets a working Send button alongside its Copy buttons.
- **Bulk send (2A.3b):** the bulk runner page gets a "Send all" button after generation completes, with confirmation modal showing editable templates, sample preview, missing-email skip list, and progress UI with cancel + retry-failed support.

Both paths share a new `email_sends` audit table so the Documents tab can show a "Sent on {date}" indicator on every JunoOS-delivered document.

---

## Critical: Re-apply orphaned commit first

After PR #14 was merged, Ed asked for Future Work items 14.49-14.52 to be added to the Stage 2A spec. The commit was pushed to `feat/outlook-integration` AFTER the merge, so it's orphaned on a deleted branch.

The orphaned commit hash is `b1e8ee5` on the now-deleted `feat/outlook-integration` branch.

**First commit on the new `feat/outlook-bulk-send` branch must re-apply these four Future Work items to `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md`.** Cherry-pick or recreate from the spec text. Commit message: `docs: re-apply Future Work 14.49-14.52 (from orphaned commit b1e8ee5)`.

The four items, for reference:

```markdown
- **14.49 — Send button for all document types on Documents tab.** Extend the 2A.1.5 Email composer modal (currently scoped to portfolio statements only) to support any document type: transaction statements, EIS certificates, share certificates, signed application forms, KYC documents. Each document type defines its own default subject/body template. Foundation: 2A.3a OAuth + Future Work 14.44 (Send button on composer). Should be designed so adding a new document type to the "supports email" list is a one-line config change.

- **14.50 — Bulk email for transaction statements and completion documents.** The bulk-runner architecture in 2A.2 (`bulk_runs.type` is already a generic string column, see Future Work 14.42) supports this in principle. New bulk run types: `transaction_statement_send`, `share_certificate_send`, etc. Each type wires its own selection criteria, per-recipient template, and document-attachment fetch logic, but shares the polling queue and Outlook send path from 2A.3a/2A.3b. Note: buy-deal completion workflow exists today; sell-deal completion (Future Work 14.1) needs to land before sell-related bulk send is meaningful.

- **14.51 — Email delivery as a first-class feature of the transaction workflow.** When the sell-deal redesign (Future Work 14.1) and broader transaction lifecycle work begins in earnest, email delivery of completion-process documents (application form, signed agreement, share certificate, etc.) should be designed in from the start: clear send-points in each stage, configurable per-type templates, auditable delivery log, retries on failure. Not bolted on as an afterthought. Implementation principle: every new transaction-workflow PR should include a "where does email touch this?" check during spec.

- **14.52 — Audit log of all emails sent via JunoOS.** Across all email pathways (per-document Send from 14.44/14.49, bulk send from 14.43/14.50, transaction-workflow auto-sends from 14.51), maintain a record of: sender (team member), recipient, subject, document(s) attached, sent timestamp, Microsoft Graph response status, retry count. This becomes the "Updates sent" audit trail referenced in Future Work 14.33 and gives the team a single place to answer "did we send X to investor Y" questions.
```

---

## Files to read before writing

1. `src/lib/microsoftGraph.ts` — built in 2A.3a. We're extending the `sendMail` function (or adding a new one) to support attachments.
2. `src/app/(app)/settings/outlookActions.ts` — built in 2A.3a. Token refresh helper `getValidAccessToken` is reused.
3. Bulk runner from PR #13: `src/app/(app)/reports/portfolio-statement/`, `src/lib/bulkRunActions.ts`, `src/app/api/bulk-runs/[id]/tick/route.ts`. The polling pattern is reused for send runs.
4. 2A.1.5 Email composer modal — find the existing component (likely under `src/app/(app)/clients/[id]/components/` or similar). We're adding a Send button to it.
5. `src/lib/templates.ts` from 2A.1.5 — subject/body templates and placeholder substitution.
6. Documents tab on the per-client page — likely `InvestmentDocsTab.tsx` or similar. We're adding a new column.

---

## Task 1 — Migration (Ed approves before apply)

`supabase/migrations/20260523120000_email_sends.sql` per spec Section 4.1.

**Key things to check before writing the SQL:**

- Confirm RLS pattern: use `USING (true) WITH CHECK (true)` to match platform pattern, same as `outlook_connections` in 2A.3a
- Foreign key to `documents(id)` with `ON DELETE CASCADE` (if a document is deleted, its send history goes with it)
- Foreign key to `clients(id)` with `ON DELETE CASCADE`
- Foreign key to `team_members(id)` with `ON DELETE RESTRICT` (don't delete team members who have audit history — preserve their record)
- Foreign key to `bulk_runs(id)` is nullable (single sends from 14.44 have no bulk run)
- Three indexes per spec
- CHECK constraint on status values

**STOP and show Ed the SQL before applying via Supabase MCP.**

---

## Task 2 — Extend Microsoft Graph helpers for attachments

In `src/lib/microsoftGraph.ts`, add a new exported function (or extend the existing `sendMail`):

```typescript
export async function sendMailWithAttachment({
  accessToken,
  subject,
  bodyText,
  to,
  attachmentName,
  attachmentBase64,
  saveToSentItems = true,
}: {
  accessToken: string
  subject: string
  bodyText: string
  to: string
  attachmentName: string
  attachmentBase64: string  // base64-encoded file content (no data: prefix)
  saveToSentItems?: boolean
}): Promise<{ ok: true } | { ok: false, status: number, body: string }> {
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
        attachments: [{
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachmentName,
          contentType: 'application/pdf',
          contentBytes: attachmentBase64,
        }],
      },
      saveToSentItems,
    }),
  })

  if (res.ok) return { ok: true }

  const body = await res.text()
  return { ok: false, status: res.status, body }
}
```

**Key change from the 2A.3a `sendMail`:** structured return shape `{ ok: boolean, ... }` rather than throwing. The send path needs to inspect status codes to decide whether retries are safe (see spec Section 7.2).

---

## Task 3 — Build `src/lib/outlookSend.ts`

This is the shared send function used by both single send and bulk send. Implements spec Section 5.

```typescript
'use server'

import { createServerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/app/(app)/settings/outlookActions'  // refactor as needed
import { sendMailWithAttachment } from '@/lib/microsoftGraph'

export async function sendDocumentEmail({
  teamMemberId,
  documentId,
  clientId,
  recipientEmail,
  subject,
  bodyText,
  bulkRunId = null,
}: {
  teamMemberId: string
  documentId: string
  clientId: string
  recipientEmail: string
  subject: string
  bodyText: string
  bulkRunId?: string | null
}): Promise<{
  status: 'succeeded' | 'failed'
  errorMessage?: string
  graphStatus?: number
  sendId: string
}> {
  const supabase = createServerClient()

  // 1. Look up team member's Outlook connection
  const { data: connection } = await supabase
    .from('outlook_connections')
    .select('*')
    .eq('team_member_id', teamMemberId)
    .single()

  if (!connection) {
    // Insert a failed email_sends row even though we never tried
    const { data: sendRow } = await supabase
      .from('email_sends')
      .insert({
        document_id: documentId,
        client_id: clientId,
        sent_by_team_member_id: teamMemberId,
        sent_from_email: '',
        recipient_email: recipientEmail,
        subject,
        body_text: bodyText,
        status: 'failed',
        error_message: 'Outlook not connected for this team member',
        bulk_run_id: bulkRunId,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()
    return {
      status: 'failed',
      errorMessage: 'Outlook not connected for this team member',
      sendId: sendRow!.id,
    }
  }

  // 2. Insert email_sends row with status='sending'
  const { data: sendRow } = await supabase
    .from('email_sends')
    .insert({
      document_id: documentId,
      client_id: clientId,
      sent_by_team_member_id: teamMemberId,
      sent_from_email: connection.microsoft_user_email,
      recipient_email: recipientEmail,
      subject,
      body_text: bodyText,
      status: 'sending',
      bulk_run_id: bulkRunId,
    })
    .select()
    .single()

  try {
    // 3. Get valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(connection)

    // 4. Fetch PDF from storage
    const { data: doc } = await supabase
      .from('documents')
      .select('storage_url, filename')
      .eq('id', documentId)
      .single()

    if (!doc) {
      throw new Error('Document not found')
    }

    const { data: pdfBlob, error: dlError } = await supabase
      .storage
      .from('documents')
      .download(doc.storage_url)

    if (dlError || !pdfBlob) {
      throw new Error(`Failed to download PDF: ${dlError?.message ?? 'unknown'}`)
    }

    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer())
    const pdfBase64 = pdfBuffer.toString('base64')

    // 5. Send via Microsoft Graph
    const result = await sendMailWithAttachment({
      accessToken,
      subject,
      bodyText,
      to: recipientEmail,
      attachmentName: doc.filename,
      attachmentBase64: pdfBase64,
    })

    if (result.ok) {
      await supabase
        .from('email_sends')
        .update({
          status: 'succeeded',
          graph_response_status: 202,
          completed_at: new Date().toISOString(),
        })
        .eq('id', sendRow!.id)

      // Update last_used_at on connection
      await supabase
        .from('outlook_connections')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', connection.id)

      return { status: 'succeeded', sendId: sendRow!.id }
    } else {
      await supabase
        .from('email_sends')
        .update({
          status: 'failed',
          graph_response_status: result.status,
          error_message: result.body.slice(0, 1000),  // truncate long errors
          completed_at: new Date().toISOString(),
        })
        .eq('id', sendRow!.id)

      return {
        status: 'failed',
        errorMessage: result.body.slice(0, 200),
        graphStatus: result.status,
        sendId: sendRow!.id,
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    await supabase
      .from('email_sends')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', sendRow!.id)

    return { status: 'failed', errorMessage: message, sendId: sendRow!.id }
  }
}
```

Note: `getValidAccessToken` from 2A.3a's `outlookActions.ts` might need to be extracted into its own file (`src/lib/outlookTokens.ts`) to avoid circular imports. Use judgement.

---

## Task 4 — Add Send button to 2A.1.5 composer modal (14.44)

Find the existing EmailComposerModal component (from PR #12). Add:

- A `sendButton: boolean` prop (defaults based on whether Outlook is connected — pass from parent)
- When `sendButton` is true, render a "Send" button alongside the Copy buttons
- Send button click: confirms with user briefly ("Send via Outlook?"), then calls `sendDocumentEmail` server action with the modal's current to/subject/body and the document's id
- Show loading spinner while sending
- On success: success toast "Email sent to {recipient}", close modal
- On failure: show error in modal: "Send failed: {error}. You can still use the Copy buttons to send manually."

The parent component that opens the modal needs to know whether the current user has Outlook connected. Use `getOutlookConnectionStatus()` from 2A.3a, fetched on page load.

When NOT connected, instead of the Send button, show a small grey link: "Connect Outlook in Settings to enable direct sending" → navigates to `/settings/integrations`.

---

## Task 5 — Bulk send server actions

In `src/lib/bulkRunActions.ts` (existing from PR #13), add:

### `startBulkSend(sourceRunId, options)`

```typescript
export async function startBulkSend({
  sourceRunId,
  subject,
  bodyTemplate,
}: {
  sourceRunId: string
  subject: string
  bodyTemplate: string
}): Promise<{ bulkRunId: string }> {
  // 1. Get the source run's items (the generated statements)
  // 2. For each: look up the client's email; skip if missing/invalid
  // 3. Create new bulk_runs row with type='portfolio_statement_send', metadata includes subject_template and body_template
  // 4. Create one bulk_run_items row per investor with email
  // 5. Return the new bulk_run_id
}
```

### Extend `tickBulkRun`

The existing function dispatches based on `bulk_runs.type`. Add a branch for `portfolio_statement_send`:

```typescript
if (run.type === 'portfolio_statement_send') {
  // Claim the next pending item
  const item = await claimNextItem(run.id)
  if (!item) return { status: 'no_pending' }

  // Look up client email and other context
  // Substitute placeholders in subject and body
  // Call sendDocumentEmail
  // Update bulk_run_items based on result
  return { ... }
}
```

Reuse the existing `claim_next_bulk_run_item` RPC — it's already type-agnostic.

### Extend `retryFailedItems`

Add the safety filter from spec Section 7.2:

```typescript
// For 'portfolio_statement_send' type, exclude items where Microsoft Graph
// returned 5xx — those might have queued and we'd risk double-send.
if (sourceRun.type === 'portfolio_statement_send') {
  failedItems = failedItems.filter(item => {
    const status = item.email_send_graph_status  // from joining email_sends
    return status === null || (status >= 400 && status < 500)
  })
}
```

---

## Task 6 — Send All confirmation modal

New component: `src/app/(app)/reports/portfolio-statement/_components/SendAllConfirmModal.tsx`

Renders when the team clicks "Send all" on a completed generation run. Shows everything in spec Section 3.2:

- Sender (from `getOutlookConnectionStatus`)
- Counts: total in source run / will-send / will-skip
- Skipped list with reasons (no email / invalid email)
- Inline-editable Subject (default from template)
- Inline-editable Body (default from template, with placeholder hints)
- "Open 3 random samples" link → opens 3 PDFs in new tabs (use existing `getSignedUrlForDocument`)
- Estimated time line
- Cancel + Send buttons

The Send button is the primary call to action (large, red/primary colour). The number of statements about to be sent is in the button label: `Send 147 statements`.

On Send click: call `startBulkSend` → modal closes → progress UI takes over (reusing the 2A.2 pattern).

---

## Task 7 — "Send all" button on past run details

In `PastRunDetails.tsx` (existing from PR #13), add a "Send all" button at the bottom when:

- The run is a `portfolio_statement` (generation) run
- Status is `completed`
- No `portfolio_statement_send` bulk run exists yet that references this run as source

(Don't worry about preventing multiple send runs for the same source — different team members might re-send. Just check no IN-PROGRESS send run exists for this source.)

Button label: "Send all via Outlook". Disabled with hint if team member hasn't connected Outlook: "Connect Outlook in Settings to enable bulk send".

---

## Task 8 — Documents tab Sent column

In the existing per-client Documents tab component:

1. Server loader: in the data-fetching layer, alongside the existing documents fetch, add a second query for the latest successful `email_sends` per document (use the DISTINCT ON query from spec Section 9)
2. Merge in JavaScript: `documents.map(d => ({ ...d, latestSend: sendsByDocId.get(d.id) }))`
3. Add a new column header "Sent" with a sort affordance
4. Cell renders: `"Sent {DD MMM} via Outlook"` if `latestSend` exists with status='succeeded', else `"—"` (em dash)
5. Sort by `latestSend?.completed_at` — documents without a send sort to the bottom

Keep the sort state in the existing column-sort mechanism if one exists; if not, add minimal `useState` for it (mention this in the PR description).

---

## Task 9 — Past run details for send runs

In `PastRunDetails.tsx`, extend `loadRunItemsWithDetails` to handle `portfolio_statement_send` type:

- Join `bulk_run_items` to `email_sends` (via document_id and bulk_run_id) to get send status
- Display per-item: client name, recipient email, send status icon, error if failed

Same expandable inline pattern as today.

---

## Task 10 — Reports landing recent runs

In the Reports landing page (existing from PR #13), update the "Recent bulk runs" table to:

- Show both `portfolio_statement` (generation) and `portfolio_statement_send` (send) runs
- Type column or labelled in the title: "Generation" vs "Send"
- Counts column shows total / succeeded / failed for both

---

## Task 11 — Append Future Work 14.52-14.56

Append to `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md` per spec Section 11.

---

## Acceptance for this PR

All 30 criteria in spec Section 10 must pass on the preview.

**Most critical tests to plan for:**

1. Single send via 14.44: composer modal Send button works end-to-end
2. Bulk send full flow: generate → Send all → confirmation → progress → complete → Documents tab shows sent
3. Cancel mid-flight: stops further sends without corrupting in-flight ones
4. Retry-failed: creates new run, excludes 5xx failures
5. Skip missing email: investors without email don't break the bulk, appear in skip list
6. Inline-edited template: edited subject/body apply to all sends in the bulk
7. Sample preview: "Open 3 random samples" actually opens 3 PDFs
8. Build passes locally with `npm run build` and `tsc --noEmit`

---

## Anti-patterns to avoid

- **Don't fetch PDFs as base64 across the server-action boundary.** Buffers and base64 strings are large — keep PDF fetching and base64 encoding inside `sendDocumentEmail` server-side, never serialise across the action boundary.
- **Don't auto-retry inside the tick.** If a send fails, mark it failed and move on. Retry is an explicit team action, not automatic.
- **Don't update tokens on every send.** Token refresh only happens when expiry is within 5 minutes (existing 2A.3a logic).
- **Don't log full PDFs or base64 content** to console or structured logs. Log only IDs and status codes.
- **Don't bypass the template helper.** Substitution must use `src/lib/templates.ts` so 14.32 has a single place to update later.
- **Don't add a "Mark all sent" button.** That's Future Work 14.54.
- **Don't auto-send after generation completes.** The team always explicitly clicks Send all.
- **Don't persist inline-edited templates.** Edits are per-bulk-send only; never write them back to defaults.

---

## Workflow

1. Branch `feat/outlook-bulk-send` from `main`
2. Commit 1: Re-apply Future Work 14.49-14.52 (from orphaned b1e8ee5)
3. Commit 2: Spec file (`docs/specs/Juno_Phase_B_Stage_2A3b_Spec_v1.md`)
4. Commit 3: Future Work 14.52-14.56 appended to Stage 2A spec
5. Commit 4: Migration SQL — **STOP and show Ed**
6. Ed approves → apply migration
7. Commit 5: Microsoft Graph extension for attachments
8. Commit 6: `src/lib/outlookSend.ts`
9. Commit 7: 14.44 Send button on composer modal
10. Commit 8: Bulk send server actions + tick extension + retry-failed safety filter
11. Commit 9: SendAllConfirmModal component
12. Commit 10: Send all button wiring on past run details
13. Commit 11: Documents tab Sent column
14. Commit 12: PastRunDetails extended for send runs
15. Commit 13: Reports landing recent runs updated
16. Push, write PR description, stop for Ed's preview review.

Expect 13-17 commits total once preview review surfaces issues.

---

*End of build prompt.*
