# Juno Phase B Sub-stage 2A.3b — Outlook Bulk Send + Per-Document Send

**Status:** Draft v1 — to be moved into `docs/specs/` once approved
**Depends on:** Sub-stages 2A.2 (PR #13, merged), 2A.3a (PR #14, merged)
**Position in plan:** completes the practical Q2 2026 reporting workflow. After this ships, the team can generate 150 portfolio statements and email them in one session without leaving JunoOS.

---

## 1. Purpose

After 2A.3a, JunoOS can send a single test email from a connected mailbox. This sub-stage adds the two real-world send paths the team needs:

- **Single send (Future Work 14.44):** the existing 2A.1.5 Email composer modal gains a working Send button. Click → email goes out via the connected mailbox → done. No more copy-paste-attach-send dance.

- **Bulk send (2A.3b):** the bulk runner page gains a "Send all" button after generation completes. The team can review, edit the template, spot-check samples, then send all generated statements one-by-one with cancel-mid-flight and retry-failed support.

Both paths share a new audit table (`email_sends`) so the Documents tab can show a "Sent on {date}" indicator on every document that's been delivered via JunoOS.

---

## 2. Out of scope

- Manual "Mark as sent" for documents delivered outside JunoOS (future work)
- Scheduled / cron-triggered bulk runs (Future Work 14.38)
- Send-from a shared mailbox (Future Work 14.46)
- Editable templates as a persistent setting (Future Work 14.32 — this PR has *inline-per-send* editing, not persisted template changes)
- Per-investor frequency preferences (Future Work 14.40)
- Reply tracking — replies still land in the team member's normal Outlook inbox
- Email attachments other than the document being sent (e.g. cover letters, separate disclosures)

---

## 3. The user journey

### 3.1 Single send via the existing composer

1. Team member is on a client record's Documents tab, sees a portfolio statement
2. Clicks "Email" → existing 2A.1.5 composer modal opens, pre-filled
3. **New:** if connected to Outlook, a "Send" button is visible alongside the Copy buttons
4. If not connected to Outlook, Send is absent and a small grey hint reads "Connect Outlook in Settings to send directly"
5. Clicks Send → modal stays open with a spinner → success toast appears within ~3 seconds → modal closes
6. The Documents tab row for that statement now shows "Sent {date} via Outlook" in a new Sent column

### 3.2 Bulk send after a bulk run

1. Team member completes a bulk generation run (existing 2A.2 flow) — 150 statements generated
2. Past run details now show a "Send all" button at the bottom
3. Click "Send all" → confirmation modal opens:
   - Sender: "ed@junocapital.co.uk (your connected Outlook)"
   - "150 statements generated. 147 will be sent. 3 will be skipped (no email on file): Alice Smith, Bob Jones, Carol Brown."
   - Inline-editable Subject field (pre-filled from 2A.1.5 template)
   - Inline-editable Body field (pre-filled from 2A.1.5 template) — Body uses placeholders like `{{first_name}}` and `{{period}}` which get substituted per-investor
   - "Open 3 random samples" link — clicking opens 3 random generated PDFs in new tabs for spot-checking
   - "Estimated time: ~5-8 minutes"
   - Cancel button | Send 147 statements button (red/primary)
4. Clicks Send → modal closes → progress UI replaces the past run details:
   - "Sending 1 of 147... 2 of 147..." with progress bar
   - Each statement: pending → in_progress → succeeded / failed
   - Cancel button visible throughout
5. ~5-8 minutes pass (rate-limited to one send every ~2 seconds)
6. Run completes → summary: "147 sent successfully. 0 failed." (or "145 sent, 2 failed. [Retry failed]" with a retry button)
7. Documents tab now shows "Sent {date} via Outlook" for all 147 sent statements

### 3.3 Mid-flight cancel

If the team realises something is wrong while a bulk send is running:

1. Clicks Cancel on the progress UI
2. Confirmation: "Already sent 23. Cancel will stop the remaining 124 but cannot recall the 23 already sent."
3. Confirm → polling stops on next tick → status becomes "Cancelled. 23 sent, 124 cancelled."

### 3.4 Retry failed

If some sends failed (e.g. invalid recipient, transient Microsoft Graph error):

1. Failed run details show a "Retry failed" button
2. Click → a new bulk run is created with the same `bulk_run_id` lineage, containing only the failed items
3. **Critical safety:** only items where the send was rejected BEFORE Microsoft Graph accepted are retried. Items where Microsoft Graph returned 4xx/5xx after potentially queuing the email are NOT retried (would risk double-send). The spec for which errors are "safe to retry" is in Section 8.

---

## 4. Data model changes

### 4.1 New table — `email_sends`

```sql
CREATE TABLE email_sends (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id                 UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  client_id                   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sent_by_team_member_id      UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  sent_from_email             TEXT NOT NULL,
  recipient_email             TEXT NOT NULL,
  subject                     TEXT NOT NULL,
  body_text                   TEXT NOT NULL,
  status                      TEXT NOT NULL CHECK (status IN ('queued','sending','succeeded','failed','cancelled')),
  graph_response_status       INTEGER,
  error_message               TEXT,
  bulk_run_id                 UUID REFERENCES bulk_runs(id),  -- NULL for single-send via 14.44
  attempted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                TIMESTAMPTZ
);

CREATE INDEX email_sends_document_idx ON email_sends (document_id, completed_at DESC);
CREATE INDEX email_sends_bulk_run_idx ON email_sends (bulk_run_id) WHERE bulk_run_id IS NOT NULL;
CREATE INDEX email_sends_status_idx ON email_sends (status);

ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated full access on email_sends"
  ON email_sends FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

**Why a separate table rather than columns on `documents`:** documents could be sent multiple times (resend, re-send to updated address, etc.). The audit log captures every attempt; the "Sent" indicator on Documents tab queries the latest successful send.

### 4.2 Extending `bulk_runs`

The existing `bulk_runs.type` column already supports new types (Future Work 14.42). New type value: `portfolio_statement_send`.

No schema change needed — just new application code that knows how to process this type during the polling tick.

### 4.3 Migration filename

```
supabase/migrations/20260523120000_email_sends.sql
```

---

## 5. The send path (shared by both single and bulk)

A new server module `src/lib/outlookSend.ts` exposes a single function:

```typescript
async function sendDocumentEmail({
  teamMemberId,
  documentId,
  clientId,
  recipientEmail,
  subject,
  bodyText,
  bulkRunId,  // optional — null for single send
}): Promise<{ status: 'succeeded' | 'failed', errorMessage?: string, graphStatus?: number }>
```

Internal flow:

1. Insert `email_sends` row with status='sending', attempted_at=now()
2. Look up team member's `outlook_connections`. If not found, mark failed, return.
3. Refresh access token if needed (reuses 2A.3a path)
4. Fetch the PDF from Supabase storage using `documents.storage_url`
5. Build the Microsoft Graph sendMail request with attachment:
   ```json
   {
     "message": {
       "subject": "<subject>",
       "body": { "contentType": "Text", "content": "<bodyText>" },
       "toRecipients": [{ "emailAddress": { "address": "<recipientEmail>" }}],
       "attachments": [{
         "@odata.type": "#microsoft.graph.fileAttachment",
         "name": "<filename>",
         "contentType": "application/pdf",
         "contentBytes": "<base64 PDF>"
       }]
     },
     "saveToSentItems": true
   }
   ```
6. POST to `/me/sendMail` with the access token
7. On 202 Accepted → update `email_sends` to status='succeeded', completed_at=now()
8. On error → update to status='failed', error_message=<error>, graph_response_status=<HTTP status>, completed_at=now()
9. Return result

### 5.1 Microsoft Graph attachment size limit

Microsoft Graph's `/me/sendMail` accepts inline attachments up to ~3MB base64-encoded (~2.25MB raw PDF). Portfolio statement PDFs from 2A.1 are typically 100-300KB, so well under the limit. The spec assumes this; the build prompt will surface a clear error if a future document type exceeds it.

For attachments >3MB Microsoft requires a multi-step upload via the "upload session" pattern — out of scope here. Future Work item to consider when transaction statements or other larger PDFs need email.

### 5.2 Rate limiting

Microsoft Graph rate limit: ~30 sends/minute per mailbox, 10,000/day. Conservative pace: one send every 2 seconds (~30/min ceiling). The polling tick endpoint (Section 7) enforces this by claiming one item per tick and the client polling at 2-second intervals.

---

## 6. Inline editable templates (per-send, not persisted)

The Send-all confirmation modal shows pre-filled Subject and Body fields editable by the team member. Default values from `src/lib/templates.ts` (the 2A.1.5 helper):

- Subject: `Portfolio statement — {period}`
- Body: existing template referencing `{{first_name}}` and `{{period}}` (and similar)

The team can:
- Edit the subject inline (changes apply to all sends in this bulk)
- Edit the body inline (changes apply to all sends in this bulk)
- Placeholders like `{{first_name}}` remain substituted per-investor at send time

**Important:** edits in the modal are **for this bulk run only**. They are NOT saved as a new default. The template helper is unchanged after the bulk completes. (Persisted template editing is Future Work 14.32.)

Validation: subject must be non-empty; body must contain `{{first_name}}` (warning, not blocker — the team can override) and `{{period}}` (warning).

---

## 7. Bulk send orchestration

Reuses the polling pattern from 2A.2 exactly:

1. Click "Send all" with edited template → POST to `/api/bulk-runs/[id]/start-send` server action
2. Server action:
   - Creates a new `bulk_runs` row with `type='portfolio_statement_send'`, `started_by`, and metadata (subject_template, body_template, source_run_id pointing to the generation run)
   - Creates one `bulk_run_items` row per investor with email present (skip the missing-email ones)
   - Returns the new bulk_run_id
3. Client kicks off polling loop on `/api/bulk-runs/{newRunId}/tick`
4. Each tick:
   - Claim one pending item via `claim_next_bulk_run_item` RPC (existing from 2A.2 — works for any run type)
   - Call `sendDocumentEmail` for that item
   - Mark item succeeded or failed in `bulk_run_items`
   - Insert/update `email_sends` row
   - Return tick result
5. Client polls every 2 seconds (rate limit) until status='completed' or 'cancelled'
6. UI updates progress bar and per-item status as each tick returns

### 7.1 Cancel

The existing 2A.2 `cancelBulkRun` server action works as-is for the new type — sets `bulk_runs.status='cancelled'`. The tick endpoint already returns early if status is cancelled, so no further sends fire.

### 7.2 Retry failed

The existing 2A.2 `retryFailedItems` action creates a new bulk run with only the failed items. Reuse with a small modification: it should set the new run's `type` to match the source run's type.

**Safety filter:** when creating the retry run for `portfolio_statement_send` type, exclude items where the original failure happened AFTER Microsoft Graph might have accepted the message. Specifically: include retry candidates only if `graph_response_status IS NULL` (network/local failure before reaching Graph) or `graph_response_status >= 400 AND graph_response_status < 500` (Graph rejected, did not queue). Exclude `graph_response_status >= 500` (Graph error after possibly queuing).

This is a conservative rule — some 5xx errors are genuinely safe to retry, but distinguishing is hard. Better to leave them as "review manually" than risk double-send.

---

## 8. Past run details — extended for send runs

The existing `PastRunDetails` component from PR #13 needs to render send runs slightly differently:

- For `portfolio_statement` type runs (generation): show generation status + View link to PDF (as today)
- For `portfolio_statement_send` type runs: show send status + recipient email + (optionally) View link to the original PDF

The component switches rendering based on `bulk_runs.type`. Same data fetch shape via existing `loadRunItemsWithDetails`, just adapted for the new type.

The Reports landing page's "Recent bulk runs" table should include both types and label them clearly:
- "Portfolio statements (generation) — 22 May 2026, 150 items"
- "Portfolio statements (send) — 22 May 2026, 147 items"

---

## 9. Documents tab — Sent column

The Documents tab (per-client and globally) gains a new sortable column:

| Document | ... | Sent |
|---|---|---|
| 2026-03-31 — Portfolio statement — Barry O'Brien.pdf | ... | Sent 22 May via Outlook |
| 2026-03-31 — Portfolio statement — Bibi Netanahu.pdf | ... | — |

Sent value derives from a query on `email_sends`:

```sql
-- Latest successful send per document
SELECT DISTINCT ON (document_id)
  document_id, sent_from_email, completed_at
FROM email_sends
WHERE status = 'succeeded'
ORDER BY document_id, completed_at DESC;
```

Two-query-then-merge pattern from CLAUDE.md applies — fetch documents, fetch latest sends separately, merge in JavaScript.

Sortable: clicking the column header sorts ascending/descending by `completed_at`. Documents without a successful send sort last.

---

## 10. Acceptance criteria

### Single send (14.44)
1. The 2A.1.5 Email composer modal shows a "Send" button when team member has connected Outlook
2. The "Send" button is absent (or visibly disabled) when not connected, with a hint linking to Settings
3. Clicking Send sends the email with PDF attached via the connected mailbox
4. The email arrives at the recipient with the correct subject, body, and PDF attached
5. Email appears in the sender's Outlook Sent Items
6. After send, the Documents tab shows "Sent {date} via Outlook" for that document
7. `email_sends` table contains a row with status='succeeded'

### Bulk send (2A.3b)
8. The bulk runner page shows a "Send all" button after generation completes
9. Clicking Send all opens a confirmation modal with sender, counts, skipped list, editable subject/body, sample preview
10. "Open 3 random samples" link opens 3 PDFs in new tabs
11. Confirming send creates a new `bulk_runs` row with type='portfolio_statement_send'
12. Items with missing/invalid emails are skipped at queue creation, surfaced in confirmation
13. Sending proceeds at ~1 every 2 seconds, progress UI updates per item
14. Each successful send creates an `email_sends` row and updates `bulk_run_items.status`
15. Failures get logged with status, graph_response_status, and error_message
16. Cancel mid-flight stops the queue on the next tick; in-flight sends are not interrupted
17. Cancelled runs show "X sent, Y cancelled" summary
18. Retry-failed creates a new bulk run with only safely-retryable items (see Section 7.2)

### Documents tab
19. Sent column appears on per-client Documents tab and any global documents view
20. Documents with a successful send show "Sent {date} via Outlook"
21. Documents without a send show "—" (em dash, not blank)
22. Clicking the Sent column header sorts the table; documents without a send sort last

### Templates and editing
23. Inline-edited subject and body in the confirmation modal apply to the resulting bulk send
24. Edits do NOT persist for future bulk sends — the 2A.1.5 defaults remain unchanged
25. Placeholder substitution (`{{first_name}}`, `{{period}}`) works per-investor at send time

### Past run details
26. Past run details correctly render both generation runs (existing) and send runs (new)
27. Reports landing recent bulk runs table includes both types with clear labels

### Build cleanliness
28. `npm run build` passes locally
29. TypeScript clean
30. No console errors in browser during normal flow

---

## 11. Future Work items to add

Append to Stage 2A spec:

```markdown
- **14.49 — Send button for all document types on Documents tab.** (Restated from previous session — re-applies the items committed to feat/outlook-integration after PR #14 was merged.)
- **14.50 — Bulk email for transaction statements and completion documents.** (Restated.)
- **14.51 — Email delivery as a first-class feature of the transaction workflow.** (Restated.)
- **14.52 — Audit log of all emails sent via JunoOS.** (Partially built in 2A.3b — `email_sends` table is the foundation. Future expansion: dedicated audit-log UI, filtering, export.)
- **14.53 — Persisted editable email templates.** Per the inline-edit-only model in 2A.3b: when 14.32 (editable templates) is built, it should write to a new `email_templates` table and the 2A.1.5 helper should read from there. Inline-per-send editing remains as an override.
- **14.54 — Mark as sent (manual).** Allow the team to mark a document as sent even if the send happened outside JunoOS (paper post, manual Outlook copy-paste, etc.). Adds an "external" provenance marker on `email_sends` and surfaces it differently on the Documents tab.
- **14.55 — Large attachment support via upload session.** Microsoft Graph's inline attachment limit is ~3MB. If/when JunoOS sends larger documents (transaction statements with embedded charts, multi-investor reports), implement the upload-session pattern.
- **14.56 — Smarter retry-failed safety analysis.** The 2A.3b retry-failed conservatively excludes 5xx errors to prevent double-send. A future improvement could query Microsoft Graph's message tracking API to confirm delivery status before deciding to retry.
```

---

## 12. Implementation order

1. Re-apply Future Work 14.49-14.52 from orphaned commit b1e8ee5 (first commit on the new branch)
2. Spec file added to `docs/specs/`
3. Future Work 14.52-14.56 appended
4. Migration: `email_sends` table — STOP for Ed's approval
5. `src/lib/outlookSend.ts` with `sendDocumentEmail` function
6. Single-send wiring in 2A.1.5 composer modal (14.44)
7. Bulk-send server actions: `startBulkSend`, extended `tickBulkRun` to handle send type, extended `retryFailedItems` for safety filter
8. Bulk send confirmation modal with editable templates and sample preview
9. Bulk send progress UI (reuse 2A.2 pattern)
10. Documents tab Sent column with sort
11. Past run details extended for send runs
12. Reports landing recent runs updated for send types

---

*End of spec.*
