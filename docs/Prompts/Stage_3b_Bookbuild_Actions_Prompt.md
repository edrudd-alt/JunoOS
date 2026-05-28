*Historical reference. Terminology updated in Sub-stage B of the Entity Model Cleanup (PR #19, May 2026): Client → Lead investor, Vehicle → Beneficial owner, Location → Legal owner. The `entity_type`, `fund_type`, and `active_fund_type` columns on the `clients` table were removed in Sub-stage A. See the current platform spec for live terminology and schema.*

# Prompt for Claude Code — Stage 3b: Bookbuild Tab Actions

Copy and paste the text between the `===PROMPT START===` and `===PROMPT END===` lines into Claude Code.

---

===PROMPT START===

Stage 3b — second half of Stage 3. Wires up actions on the Bookbuild table. Next-step buttons become functional, fee column gets an override popover, row "⋯" menu opens with per-status options, search/filter toolbar appears, bulk action footer bar works.

NO new tab content (Closing/Completion/Documents/Invoices keep their placeholders). NO new database schema beyond what's already there. NO real external integrations — all sends/emails are mock buttons that record real state changes via `deal_action_logs` with `is_mock = true`.

## Documents to read first

1. `/docs/Juno_Deal_Page_Restructure_Spec_v3.2.md` — primary reference. (If only v3.1 is in the repo, use that — Stage 3b doesn't depend on the v3.2-specific changes.) Sections to focus on: 4.6 (Next step column), 4.7 (Row menu), 4.8 (Toolbar), 4.9 (Bulk actions), 4.10 (Fee column behaviour). If the spec is still v3.1, sections shift by one — adjust accordingly.
2. `/docs/Deal_Page_Restructure_Decision_Log.md`
3. `/CLAUDE.md` — two-query Supabase pattern still mandatory

## Workflow rules

- Branch: `feature/stage-3b-bookbuild-actions`
- Commit logical chunks: one per major piece of work (Next-step buttons, fee popover, row menu, toolbar, bulk actions, manual signature upload)
- Push branch when done; do NOT merge to main — Ed reviews preview first
- Vercel auto-deploys preview; report URL when ready
- DO NOT modify the database schema. Use existing fields only.

## Task 1 — Wire up Next-step buttons (mock buttons)

The Next-step column already renders buttons in Stage 3a but they're non-functional. Make them work — clicking causes real database state changes plus an audit log entry plus a toast.

### Behaviour per button (per displayed status)

**Soft-circled → Confirm investment:**
- Opens a small modal: "Confirm investment for [Investor name]"
- Pre-fills `confirmed_amount` with the row's `soft_circle_amount` (editable)
- Defaults the `fee_pct` from the client's `fee_schedule_id` → look up the buy fee in `fee_schedule_items` (where `fee_type = 'buy'`); if no fee schedule, fall back to **5% (0.0500)** as default
- "Confirm" button + "Cancel" button
- On Confirm:
  - Update the row: `lifecycle_status = 'confirmed'`, `confirmed_amount = entered amount`, `fee_pct = computed fee`, `shares = ROUND(confirmed_amount / deals.share_price, 4)`, `updated_at = NOW()`, `updated_by = current user`
  - Insert into `deal_action_logs`: action_type='confirm_investment', is_mock=false (this isn't a mock — it's a real state change with no external send)
  - Toast: "Investment confirmed for [Investor name]"
  - Modal closes; row updates

**Confirmed → Send application form →:**
- Opens the Edit-before-send modal **temporarily SKIPPED** — for Stage 3b, just show a simple confirmation: "Send application form to [Investor name]? This will lock the fee at [X]%."
- "Send" button + "Cancel" button
- On Send:
  - Update the row: `lifecycle_status = 'app_form_sent'`, `fee_locked_at = NOW()`, `signing_status = 'pending'`, `updated_at = NOW()`, `updated_by = current user`
  - Insert a placeholder `documents` row: `deal_id`, `deal_investor_id`, `type = 'app_form'`, `version = 1`, `filename = '[InvestorName]_AppForm_v1_DRAFT.pdf'`, `file_path = NULL` (no real PDF), `superseded = FALSE`, `created_at = NOW()`
  - Insert into `deal_action_logs`: action_type='send_app_form', is_mock=true (no real email sent)
  - Toast: "Application form drafted (Outlook integration coming soon)"
  - Confirmation modal closes; row updates

**Chase → Send chaser:**
- No modal — clicking the button is the action
- Update the row: `updated_at = NOW()` (resets the chase timer; underlying `lifecycle_status` unchanged)
- Insert into `deal_action_logs`: action_type='send_chaser', is_mock=true
- Toast: "Chaser drafted (Outlook integration coming soon). Chase timer reset."
- Row visually reverts to its underlying status (because the timer's reset)

**App form sent / Signed / Paid / Complete / Declined:**
- Buttons remain non-functional (italic grey text, no action). Already correctly rendered in Stage 3a.

### Important: shared logic

Both "Confirm investment" and "Send application form" cause state changes via similar code paths. Centralise the database update logic in helper functions (e.g. `confirmInvestment(dealInvestorId, confirmedAmount, feePct)`, `sendApplicationForm(dealInvestorId)`). Same helpers will be called from the Row menu (Task 3) when shortcut menu items are used.

### Auth / current user

Get the current user's id from the Supabase auth session. Set `updated_by` on every row update and `created_by` on every new `deal_action_logs` row. If the auth context isn't easily available where you need it, fetch the user once on the page and pass down.

### Toast pattern

If the project doesn't already have a toast notification component, use a simple one. Either:
- Adapt an existing toast library if one's already installed (check package.json)
- Build a minimal one: a fixed-position div in the bottom-right that auto-dismisses after 3 seconds

The exact look isn't critical for Stage 3b — function over form.

Commit as: "Wire up Next-step buttons with mock state changes and audit log".

## Task 2 — Fee override popover

Per spec Section 4.10 (or 4.9 if v3.1) and Q3 design from the planning conversation.

When the user clicks the fee value in a confirmed row (or the "—" placeholder on a confirmable row), a popover anchored to the cell appears. **The fee column is only clickable for rows where status = 'confirmed' AND fee_locked_at IS NULL.** Locked rows show a read-only popover instead.

### Editable popover (status = confirmed, not locked)

```
┌─────────────────────────────────┐
│ Fee for [Investor name]         │
│                                 │
│ Current: [X]%                   │
│ Source: [either "Default from   │
│         client schedule" or     │
│         "Manual override"]      │
│ (If overridden, show the        │
│  previous reason if any)        │
│                                 │
│ Change to:                      │
│ [  X.XX  ] %                    │
│                                 │
│ Reason for change (optional):   │
│ [______________________________]│
│                                 │
│ [ Reset to default ] (only if   │
│  currently overridden)          │
│        [ Cancel ]  [ Save ]     │
└─────────────────────────────────┘
```

Behaviour:
- Save is disabled until the % value differs from current
- On Save:
  - Update row: `fee_pct = new value`, `fee_overridden = TRUE`, `fee_override_reason = entered reason or NULL`, `fee_override_by = current user`, `fee_override_at = NOW()`, `updated_at = NOW()`, `updated_by = current user`
  - Insert into `deal_action_logs`: action_type='fee_override', is_mock=false. Include in `details` JSONB: `{ "old_pct": ..., "new_pct": ..., "reason": ... }`
  - Toast: "Fee overridden to [X]%"
  - Popover closes; row updates with amber ✎ icon
- On Reset to default:
  - Look up the client's default fee from fee_schedule_items
  - Update row: `fee_pct = default value`, `fee_overridden = FALSE`, `fee_override_reason = NULL`, `fee_override_by = NULL`, `fee_override_at = NULL`, `updated_at = NOW()`
  - Insert into `deal_action_logs`: action_type='fee_reset', is_mock=false
  - Toast: "Fee reset to default ([X]%)"
- On Cancel: popover closes with no changes
- Click outside popover (not on the cell): popover closes (Cancel behaviour)

### Read-only popover (status = app_form_sent or later, fee_locked_at IS NOT NULL)

```
┌─────────────────────────────────┐
│ Fee for [Investor name] 🔒      │
│                                 │
│ Current: [X]% (locked)          │
│                                 │
│ Locked: Fee was locked when     │
│ application form was sent on    │
│ [date] ([N] days ago).          │
│ Re-issue the document to        │
│ change.                         │
│                                 │
│              [ Close ]          │
└─────────────────────────────────┘
```

Just informational. No editing.

### Click target

The whole fee cell should be clickable for rows where the popover applies. For rows where it doesn't (e.g. soft_circled rows where fee shows as "—"), the cell is not clickable.

Commit as: "Add fee override popover with audit log".

## Task 3 — Row "⋯" menu

Per Q4 design from the planning conversation. Each row's "⋯" button opens a small dropdown menu anchored to the button. Menu items vary by status.

### Menu items per status

**Soft-circled:**
- View investor record (links to client record page if exists)
- Edit deal details for this investor (opens small modal — see below)
- Mark as confirmed (with amount) — same modal as Next-step Confirm investment, just opened from menu
- Move to declined — opens confirmation: "Mark [Investor] as declined?" → on confirm, sets lifecycle_status='declined', logs the action
- Remove from deal (delete row) — opens confirmation: "Remove [Investor] from this deal? The row will be deleted entirely." → on confirm, deletes the row, logs the action

**Confirmed (and chase-from-confirmed):**
- View investor record
- Edit deal details for this investor
- Move backwards to soft-circled — confirmation: "Move [Investor] back to soft-circled? This will clear the confirmed amount and fee." → on confirm, sets confirmed_amount=NULL, fee_pct=NULL, fee_overridden=FALSE, lifecycle_status='soft_circled', logs the action
- Mark application form as signed (manual upload) — opens upload modal (see Task 6)
- Move to declined
- Remove from deal — **only allowed if `confirmed_amount` is NULL or zero** (audit trail protection); show explanatory message if not allowed

**App form sent (and chase-from-app-form-sent):**
- View investor record
- Edit deal details for this investor (amount only — fee is locked)
- Move backwards to confirmed (un-send) — confirmation: "Move back to confirmed? The application form will be marked superseded." → on confirm, sets lifecycle_status='confirmed', fee_locked_at=NULL, marks the placeholder document as superseded=TRUE, logs the action
- Mark application form as signed (manual upload) — opens upload modal
- Re-issue application form — opens "Send" confirmation again, supersedes existing document on send
- Move to declined

**Declined:**
- View investor record
- Move backwards to soft-circled (un-decline) — confirmation: "Restore [Investor] to soft-circled?" → on confirm, sets lifecycle_status='soft_circled', logs the action
- Remove from deal (permanent — extra confirmation)

**Past states (signed/paid/complete) shown below divider in Bookbuild:**
- View investor record
- Go to Closing tab (jumps to ?tab=closing — these rows are now in Closing)
- Move backwards [ to previous status ] — context-sensitive confirmation (e.g. for signed: "Move back to app_form_sent?"). On confirm, decrements the lifecycle_status and logs the action
  - For signed → app_form_sent
  - For paid → signed
  - For complete → paid
- Remove from deal — **NOT allowed** for past states; menu item disabled with tooltip

### "Edit deal details for this investor" modal

A small modal scoped to one row. Editable fields:
- Soft-circle amount
- Confirmed amount (only if status = confirmed or later)
- Fee % (only if status = confirmed AND not locked)
- POA held (toggle)
- Vehicle (dropdown — same as Add Investors modal)
- Location (dropdown — same as Add Investors modal)

On Save: update the row, log to deal_action_logs as action_type='edit_deal_investor' with old_values and new_values in details JSONB.

### Removal logic

For "Remove from deal":
- DELETE the deal_investors row entirely
- Insert into deal_action_logs: action_type='remove_from_deal', include the deleted row's data in `details` JSONB (so we can recover later if needed)
- The audit log entry persists even though the deal_investors row is gone
- Toast: "[Investor] removed from deal"

Commit as: "Add Row menu with per-status actions and edit modal".

## Task 4 — Search and filter toolbar

Per spec Section 4.8 (or 4.7 if v3.1).

Above the Bookbuild table, add a toolbar row with three controls and one button:

**Layout (left to right):**
1. **Search input** — placeholder "Search investors, vehicles, or locations..." — about 280px wide
2. **Status filter dropdown** — default label "All statuses"; opens to show checkboxes for: Soft-circled, Confirmed, App form sent, Chase, Declined, Signed, Paid, Complete
3. **Vehicle filter dropdown** — default label "All vehicles"; opens to show: "All vehicles" | "Own name only" | "Via vehicle only" | (then list of specific vehicles in this deal)
4. **"+ Add investors" button** — replace the Stage 3a temporary "+ Add investors (test)" button with this proper one (right-aligned, primary teal style)

**Filter behaviour:**
- Search filters by: investor full_name, vehicle full_name, nominee name, POA holder name (substring match, case-insensitive)
- Status filter shows only rows whose displayed status (after chase compute-on-read) matches one of the checked statuses
- Vehicle filter applies on top of search and status
- All filters reset when navigating to a different deal (no persistence across deal pages)
- When filters are active, show a small "Clear filters" link/button somewhere visible

**Empty state:**
- If filters return no rows, show a centred message: "No investors match your filters. [Clear filters]"
- Don't hide the totals row even when filters are active — but show "Filtered totals: X of Y investors" in the totals row

Commit as: "Add search and filter toolbar to Bookbuild tab".

## Task 5 — Bulk action footer bar

Per spec Section 4.9 (or 4.8 if v3.1).

When ≥1 checkbox is ticked in the table, a sticky navy footer bar appears at the bottom of the page. When 0 are ticked, no footer.

**Footer contents:**

```
[N] selected   |   Action: [primary action label OR warning]   |   [Mark POA held] [Decline] [Primary action button] [Clear selection]
```

**Logic for the primary action:**

- **All selected rows have the same status** AND that status has a Next-step button → primary action is that Next-step (e.g. "Confirm investment (3)" or "Send application form (5)")
- **Selected rows have different statuses** → primary action is disabled, show warning: "Selected rows have different statuses. Select rows with the same status to enable bulk actions."
- **All selected are app_form_sent or later** → primary action is disabled, warning: "Selected rows can't be bulk-progressed. Use individual row actions."

**"Mark POA held" button:**
- Always enabled (works on any selection)
- On click: opens confirmation: "Mark POA held for [N] selected investors?" → on confirm, updates all rows' poa_held=TRUE, logs each as action_type='mark_poa_held'
- Toast: "POA marked as held for [N] investors"

**"Decline" button:**
- Always enabled
- On click: opens confirmation: "Mark [N] selected investors as declined?" → on confirm, updates all rows' lifecycle_status='declined', logs each
- Toast: "[N] investors declined"

**Primary action button (only enabled when same status):**
- On click: behaves like clicking the Next-step button on each row, but in bulk
- For "Confirm investment": opens a bulk version of the confirm modal — one row per selected, with an option to set all confirmed amounts to a single value at the top
- For "Send application form": opens a single confirmation: "Send application form to [N] selected investors? Their fees will be locked at the rates shown."
- For "Send chaser": no modal — directly resets all selected timers and logs

**"Clear selection" button:**
- On click: deselects all rows, footer disappears

### Past rows can't be bulk-selected

Past rows (signed/paid/complete) below the divider — their checkboxes should be disabled. Bulk actions don't apply to past states (those are managed in Closing/Completion tabs).

Commit as: "Add bulk action footer bar with same-status logic".

## Task 6 — Manual signature upload flow

Triggered from the Row menu's "Mark application form as signed (manual upload)" option.

Opens a small modal:
- Title: "Upload signed application form for [Investor name]"
- File input: accepts PDF only
- "Date signed" input — date picker, defaults to today
- "Upload and mark as signed" button + "Cancel"

On upload:
- File goes to Supabase Storage (use existing storage helpers if any; otherwise simple upload to a 'documents' bucket)
- Update the placeholder documents row: set `file_path` to the uploaded path, set `signed_at` to the entered date if such a column exists (otherwise rely on documents.uploaded_at)
- Update the deal_investors row: `lifecycle_status = 'signed'`, `signing_status = 'signed'`, `updated_at = NOW()`, `updated_by = current user`
- Insert into deal_action_logs: action_type='manual_signature_upload', is_mock=false (this is a real upload)
- Toast: "Signed form uploaded for [Investor name]"
- Modal closes; row moves to past section

If there's no placeholder documents row (e.g. user is uploading without having "sent" first), insert one fresh.

Commit as: "Add manual signature upload flow".

## Task 7 — Verification

Before pushing:

1. Run `npm run build` and confirm no errors
2. Run typecheck/lint
3. In dev mode on the Cyclr test deal, exercise each action:

**Next-step buttons:**
- On Barry O'Brien III (soft-circled): click "Confirm investment" → confirm modal opens → set amount, save → row becomes confirmed with default fee
- On Bibi (confirmed): click "Send application form" → confirmation modal → send → row becomes app_form_sent, fee locks, placeholder document row created
- On Nick (chase): click "Send chaser" → no modal, status reverts to underlying, toast appears, deal_action_logs has new mock entry

**Fee popover:**
- On Bibi (confirmed, default fee): click fee cell → editable popover → change to 4.5% with reason → save → row shows 4.5% with amber ✎ icon
- On Henry (already overridden): click fee cell → editable popover with "Reset to default" link → click reset → row reverts to 10% (default), no override marker
- On Marcus (app_form_sent, fee locked): click fee cell → read-only popover with lock message

**Row menu:**
- On any soft-circled row: click "⋯" → menu opens with 5 options
- On a confirmed row: try "Move backwards to soft-circled" → confirmation → row reverts
- On Henrietta (declined): try "Move backwards to soft-circled" (un-decline) → restored
- On a soft-circled row: try "Remove from deal" → confirmation → row deleted entirely, deal_action_logs has the row's data preserved
- On Humphrey (signed, past row): menu shows "Go to Closing tab" → URL updates to ?tab=closing
- On Humphrey: try "Remove from deal" → menu item disabled

**Toolbar:**
- Type a name in search → table filters
- Tick 2-3 statuses in status filter → table filters
- Combine search and status → both apply
- Click "Clear filters" → all filters reset

**Bulk actions:**
- Tick 2 confirmed rows → footer appears, primary action is "Send application form (2)"
- Tick 1 confirmed + 1 soft-circled → footer's primary action is disabled with warning
- Tick 3 soft-circled rows → primary action "Confirm investment (3)" → click → bulk confirm modal opens
- Try "Mark POA held" on a selection → toast, all rows updated
- Try "Decline" on a selection → confirmation, all rows declined
- Tick a past row's checkbox → it should be disabled

**Manual upload:**
- On Marcus (app_form_sent): row menu → "Mark as signed (manual upload)" → upload a test PDF, set date, save → row moves to past section as signed

4. Confirm sell deal route still works (visit any sell deal — old page)
5. Confirm Bookbuild tab still functions for all of yesterday's Stage 3a behaviour (table render, badges, KYC, totals, etc.)

If anything fails, STOP and report.

## Task 8 — Push and report

Once verified:
1. Push branch to GitHub
2. Wait for Vercel preview
3. Report:
   - Vercel preview URL
   - List of commits
   - Any judgement calls or concerns
   - Any places where the spec was unclear and you made a decision

DO NOT merge to main. Wait for Ed's review.

## Important constraints

- DO NOT touch any other tab. Closing/Completion/Documents/Invoices keep their placeholders.
- DO NOT modify the persistent header, summary cards, or Edit deal details modal.
- DO NOT touch sell deal rendering.
- DO NOT modify the database schema.
- DO NOT build any real external integrations (no Outlook, no Documenso, no Xero). All sends are mock with is_mock=true in audit log.
- DO NOT build the Edit-before-send modal (that's a separate Stage 6). For now, "Send application form" just shows a simple confirmation.
- DO NOT silently skip features. If something in this prompt is genuinely too big or unclear, STOP and ask before improvising.
- The user (Ed) is non-technical. Explain things in plain English in your final report.

When everything is done and pushed, stop and report.

===PROMPT END===

---

## After Claude Code responds

When the preview is up, this is the biggest review yet — there's a lot to test. Here's a prioritised checklist:

**Most important — actions that do real database changes:**

1. **Confirm investment** on a soft-circled row → fee should auto-populate from default
2. **Send application form** on a confirmed row → fee locks, placeholder document row created
3. **Fee override** popover saves correctly
4. **Reset fee to default** works (on Henry's overridden row)
5. **Row menu's "Move backwards"** actually moves status backwards
6. **Row menu's "Remove from deal"** deletes the row entirely

**Then — UI behaviour:**

7. **Locked fee popover** shows the lock message (try clicking Marcus's fee)
8. **Search** filters the table correctly
9. **Status filter** works with checkboxes
10. **Bulk action footer** appears when rows are ticked
11. **Bulk action disabled** when statuses differ
12. **Manual signature upload** moves a row to signed and creates a document

**Finally — sanity:**

13. Stage 3a behaviour still works (table renders, totals, KYC, badges)
14. Sell deals still load the old page
15. Browser DevTools console — no red errors

Take your time. This is a big stage to review.

A small honest reflection: Stage 3b is the biggest functional stage in the project. After this, the Bookbuild tab is fully alive. Stage 4 (Closing + Completion) is genuinely simpler because much of the same pattern carries over. So this is the conceptual peak.
