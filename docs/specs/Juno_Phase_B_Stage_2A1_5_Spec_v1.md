# Juno Phase B Sub-stage 2A.1.5 — Portfolio Statement Delivery Workflow

**Status:** Draft v1 — to be moved into `docs/specs/` once approved
**Depends on:** Sub-stage 2A.1 (merged 21 May 2026, PR #11)
**Position in plan:** sits between 2A.1 (per-client generation) and 2A.2 (bulk trigger)

---

## 1. Purpose

Sub-stage 2A.1 built the per-client portfolio statement generation pipeline: a team member clicks Generate, gets a PDF stored in Supabase, and can view it on the Documents tab. What it doesn't do is help the team **deliver** the statement to the client.

Today the workflow is:
1. Click Generate (PDF opens in a new tab)
2. Manually copy the PDF
3. Switch to Outlook
4. Compose an email from scratch
5. Attach the PDF
6. Send

Steps 3-5 are friction. Stage 2A.1.5 collapses them into:
1. Click Generate (PDF opens in new tab + Decision modal appears)
2. Click "Email to client" → composer modal opens with To pre-filled, draft body, attachment available for download
3. Use Copy buttons to bring To/Subject/Body into Outlook in seconds
4. Download the attachment from the modal, attach in Outlook, send

The Send button itself waits for Outlook integration (separate work, expected to land in a few weeks). Until then, the team's workflow is "compose in JunoOS, send from Outlook". When Outlook integration ships, a Send button gets added to the existing composer modal in a small follow-up — no rework of the modal itself.

---

## 2. Out of scope

Explicitly deferred:

- **Send button.** Composer modal has no Send action in v1. Future Work item to add once Outlook MCP connector or equivalent is wired in.
- **Updates sent tab integration.** No statements appear on the Updates sent tab in v1. The "things sent to the client" history will only become meaningful when Outlook integration is real. Deferred entirely.
- **Editable email templates.** Per Future Work item below, templates become settings-editable when Outlook integration ships. For now, the draft body is hard-coded.
- **Bulk-statement workflow.** Sub-stage 2A.2 handles "generate statements for all 150 investors at once".
- **Email tracking** (opens, clicks, etc.). Out of scope; this is a "compose and copy" workflow, not a transactional email service.

---

## 3. The two modals

### 3.1 Decision modal

Opens immediately after a fresh statement is generated (replacing today's "auto-open the PDF in a new tab" behaviour).

**Triggered from:** the Generate button on the Portfolio statement card on a client's Overview tab.

**What it shows:**
- Title: "Statement generated"
- Meta line: `Period: 31 March 2026 · Generated 21 May 2026 12:14 · Saved to Documents`
- A grey PDF preview card showing the filename and "2 pages · A4 landscape"
- Two action buttons side-by-side:
  - **View** (secondary, with eye icon) — opens the PDF in a new browser tab via signed URL
  - **Email to client** (primary navy, with mail icon) — closes this modal, opens the composer modal

**Closing the modal without choosing either action** is fine. The statement is already in the database (the "Saved to Documents" note in the meta line communicates this). The team can return to it from the Documents tab at any time.

**Close button (×) in the top-right** behaves identically to closing without choice.

### 3.2 Email composer modal

**Triggered from two places:**
1. After clicking "Email to client" in the decision modal (the fresh-generation flow)
2. From an action menu on any existing statement row — either on the Portfolio statement card or on the Documents tab

**What it shows:**
- Title: "Email portfolio statement"
- A grey "context row" at the top showing the statement filename and period — important because when reached from a row action menu, the user needs visible confirmation of which statement is being emailed
- An info banner in soft warning yellow: *"Outlook integration not yet available. Use Copy buttons to paste into your email client. The PDF needs to be downloaded and attached manually."*
- Three fields, each with a small "Copy" button on the right of the label:
  - **To** (readonly, pre-filled from `clients.email`)
  - **Subject** (editable, pre-filled with the default template)
  - **Body** (editable textarea, pre-filled with the draft template)
- Below the body, an attachment pill showing the PDF filename and a separate "Download attachment" button
- Footer with grey text "Send button enabled once Outlook integration ships" and a Close button

**On opening, focus moves to the Subject field** (most likely thing the user wants to edit first, since the To is locked and the Body is usually accepted as-is).

**The PDF attachment is conceptual until Outlook integration ships.** The team downloads the PDF from the modal and attaches it in Outlook themselves. Once Outlook integration lands, the Send button posts the attachment programmatically and the manual download step disappears.

---

## 4. Default templates

### 4.1 Subject template

```
Portfolio statement as at {period_date_formatted}
```

Example: `Portfolio statement as at 31 March 2026`

`{period_date_formatted}` uses British format: `31 March 2026` (no leading zero on day, full month name).

### 4.2 Body template

```
Dear {client_first_name},

Please find attached your portfolio valuation statement as at {period_date_formatted}.

The statement covers your holdings across all entities and includes per-lot performance and a summary by company. If you have any questions, please get in touch.

Kind regards,
Juno Capital Partners LLP
```

`{client_first_name}` is derived from `clients.full_name` — take everything before the first space. E.g. "Barry O'Brien III" → "Barry". For clients with single-word names or unusual structures, fall back to the full `clients.full_name`.

`{period_date_formatted}` same as Subject.

If either substitution fails (NULL or empty string), use a literal placeholder `[Client first name]` or `[Period date]` to make it obvious the team needs to fix it before sending.

### 4.3 Template management — deferred

Templates are hard-coded in v1. **Future Work 14.32** (see Section 7): once Outlook integration is in, build a Settings page for editing email templates per document type. Until then, edits live in the codebase.

---

## 5. Behaviour details

### 5.1 Decision modal — flow

```
User clicks Generate
  ↓
Server action runs:
  1. Fetch context (client, investments, dividends, share prices)
  2. Render PDF
  3. Storage rename of prior current statement for (client, period)
  4. Upload new PDF
  5. Insert new documents row
  6. Update DB rows for superseded statements
  7. Return { documentId }
  ↓
Client receives documentId
  ↓
Decision modal opens (NOT a new tab auto-opening as before)
  ↓
Either:
  - User clicks "View" → window.open(signedUrl, '_blank') with the new PDF
  - User clicks "Email to client" → decision modal closes, composer modal opens
  - User closes modal → nothing else happens; statement is already saved
```

Notable change from 2A.1: **no auto-open new tab on generation.** The decision modal is the new "what next" interaction. View is now an explicit choice.

### 5.2 Composer modal — Copy button behaviour

Each Copy button:
1. Copies the field's current value to the clipboard via `navigator.clipboard.writeText()`
2. On success, shows a brief "Copied" state (button text changes for ~1.5 seconds) then reverts
3. On failure (e.g. clipboard permission denied), shows "Failed" state with the same timeout

The "Copy body" button copies the entire body textarea content as plain text. Line breaks preserved.

The "Download attachment" button calls `getDownloadUrlForDocument(documentId)` (the server action already built in 2A.1) and opens the result in a new tab. Same behaviour as the View button on other surfaces.

### 5.3 Composer modal — closing

Two ways to close:
1. The × button in the top-right
2. The Close button in the footer

Both behave identically — modal closes, no action taken. Since this is a draft-only workflow in v1, there's no "discard draft" confirmation. The team can reopen the composer from the row action menu at any time.

**Editing the Subject or Body and then closing** discards the edits. This is fine for v1 — Outlook integration will introduce proper draft persistence as part of its own work.

### 5.4 Composer modal — entry from existing statement rows

On the Portfolio statement card on the Overview tab, each existing statement row currently has a "View" link. **Add an "Email" link/button next to View** that opens the composer modal for that statement.

On the Documents tab, the same. Each statement row in the Valuations group should have "View" and "Email" actions available.

For consistency, both actions open the standard composer modal with the relevant statement pre-loaded into the context row.

---

## 6. UI/UX rules

### 6.1 Visual style

Both modals follow the platform conventions established in earlier stages:

- White card on dark overlay
- 24px padding
- 12px corner radius
- Navy primary buttons, white secondary buttons with border
- Body text 12px, labels 10px uppercase grey
- Em-dashed filenames preserved everywhere
- The yellow info banner uses platform-warning semantic colours

A visual mockup is referenced in the chat history (sketch produced and approved before this spec was written).

### 6.2 Dark mode

All text and background colours must use CSS variables (`--color-text-primary`, `--color-background-primary`, etc.) so the modals adapt correctly. No hard-coded white-on-white or dark-on-dark combinations.

### 6.3 Keyboard

- Escape closes either modal
- Tab cycles through interactive elements in natural reading order
- Enter in the Subject field does nothing (no submission)
- Buttons receive visible focus rings per platform convention

### 6.4 Accessibility

- Modal has `role="dialog"` and `aria-modal="true"`
- Focus moves into the modal on open, back to the trigger element on close
- Close (×) button has `aria-label="Close"`
- Each Copy button has `aria-label="Copy {field name}"`

---

## 7. Future Work items to add to the Stage 2A spec

To be appended to the Future Work section of `Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md`:

```markdown
- **14.32 — Email template management.** Currently the subject and body templates for the portfolio statement email composer are hard-coded in code. When Outlook integration ships, build a Settings page where the team can edit:
  - The default subject line per document type
  - The default body template per document type
  - The substitution variables available in each template (e.g. {client_first_name}, {period_date_formatted})
  Templates remain code-defaults if no Settings override exists. Future enhancement: per-investor or per-fund-type template overrides (deferred to 14.33 if ever needed).

- **14.33 — Updates sent tab integration for portfolio statements.** Once Outlook integration ships, statements sent via the composer modal's Send button should appear on the Updates sent tab on the client record. Send action records a row in the appropriate table (internal_updates or equivalent) with the send timestamp, recipient, and a reference to the document. Display format follows the existing Updates sent tab pattern.

- **14.34 — Email send wired into composer modal.** Add a Send button to the existing composer modal (don't redesign it). On click: validate To address, submit through the Outlook integration, on success close modal and surface a confirmation toast. On failure, surface the error inline.

- **14.35 — Per-investor "last statement sent" timestamp.** Once Updates sent integration is real (14.33), surface a "Last statement: 21 May 2026" timestamp on each investor's row on the Holdings summary or similar. Useful for the team to see at a glance which investors are due an update.
```

---

## 8. Database changes

**None.** This sub-stage uses only existing tables (`documents`, `clients`). No migrations.

If a future "draft persistence" feature lands, a new `email_drafts` table might be introduced — but that's part of the Outlook integration work, not 2A.1.5.

---

## 9. Acceptance criteria

To be verified on the preview before merging:

1. Clicking Generate on the Portfolio statement card opens the Decision modal (not a new tab auto-open).
2. The Decision modal shows the filename, generation timestamp, period date, and "Saved to Documents" confirmation.
3. Clicking "View" on the Decision modal opens the PDF in a new browser tab via signed URL.
4. Clicking "Email to client" closes the Decision modal and opens the Composer modal.
5. The Composer modal pre-fills To from `clients.email`, Subject from the default template, and Body from the default template — substitutions correctly resolved.
6. Each Copy button copies its field's current value to the clipboard and shows "Copied" feedback briefly.
7. The Download attachment button opens the PDF in a new browser tab.
8. Closing either modal without action leaves the statement saved in the database (verified by inspecting the row remains in `documents` with `superseded = false`).
9. The Composer modal can be opened from an Email action on any existing statement row — Documents tab and Overview card.
10. Both modals render correctly in both light and dark mode. No invisible buttons or unreadable text.
11. Escape key closes either modal.
12. Tab navigation works through fields and buttons in natural order.

---

*End of spec.*
