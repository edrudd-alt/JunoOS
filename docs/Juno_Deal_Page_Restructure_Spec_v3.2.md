# Juno OS — Deal Page Restructure Specification (v3.2)

**Version:** 3.2
**Date:** 1 May 2026
**Status:** Buildable — all design questions resolved AND database state verified
**Supersedes:** v1, v2, v3, v3.1

**What's new in v3.2:**

A structural addition to how investments are modelled. Through Stage 3a's preview review, it became clear that every investment has **three independent dimensions** rather than the two the spec previously implied. The spec now explicitly documents this Client / Vehicle / Location model, applies it to the Bookbuild table column structure (now 13 columns instead of 12), and references it as the canonical model for future work — including the eventual sell deal redesign (14.1) which will inherit the same three-dimensional structure. New Future Work items 14.9 (deal title naming convention), 14.10 (recapitalisation event handling), and 14.11 (last-deal-date in investor picker).

**What was new in v3.1:**

A small but important correction to Section 3.7 — the unique constraint `deal_investors_deal_client_unique` on `(deal_id, client_id)` does exist in the live database. The v3 verification missed it because the query used at the time surfaced foreign keys but not unique constraints. Claude Code caught this during Stage 1 verification. Section 3.7 and Section 3.9 updated to reflect the drop-then-add approach.

**What was new in v3 (still applies):**
The Supabase database was inspected directly via MCP integration. Every "Claude Code to verify during Stage 1" note in v2 has been resolved with verified facts. The migration plan in Section 3 has been tightened based on the actual current schema. A few v2 assumptions have been corrected — flagged inline as "[CORRECTED IN v3 — verified]".

**Key v2-to-v3 corrections:**
- The `deal_type` constraint "bug" Claude Code flagged in v1 isn't a real bug — the constraint actually allows `full_exit` and `partial_exit`. Removed from migration plan.
- `deal_investors` has **no unique constraint at all** in the live database — adding one is the question, not adjusting one.
- Confirmed: `invoices.issued_at` query bug is real and needs fixing.
- The `fund_types` table is its own first-class entity with default fee schedules per type — the persistent header "Fund type" cell pulls from here.
- Migration tracking: there's no platform-tracked migration history. Going forward, use `apply_migration` (not `execute_sql`) to start tracking properly.
- Live data state: 60 deals exist (44 buy / 16 sell), 124 deal_investors, 100 bookbuild_entries, 19 clients. All test data — Ed has confirmed wipe-and-reload via importers.

**Companion documents:**
- `Deal_Page_Restructure_Decision_Log.md` — the *why* (Section 8.3 reference to Xero polling/webhooks is superseded by Section 9.5 of this spec — manual-only)
- `Juno_Platform_Specification_v1.md` — the master spec; Section 13 will be replaced by this once the new deal page is live

---

## How to read this spec

This document describes the redesigned deal page in Juno OS. It is written for Claude Code, working from the existing codebase at `Edrudd-alt/junoOS`.

This v3 document is **buildable as-is** — there are no remaining unresolved design questions, and database assumptions have been verified directly. Claude Code should:

1. Read this document end-to-end.
2. Read the companion decision log for context on why decisions were made (a few items in the log are superseded by v3 — flagged inline above).
3. Begin with Stage 1 (foundation migrations) per Section 12.

The user (Ed Rudd) is non-technical and reviews proposed SQL/code before running migrations. Migration workflow: Claude Code proposes SQL via `apply_migration` → Ed reviews → Claude Code applies via Supabase MCP (with Ed's explicit go-ahead).

---

## 1. Overview and scope

### 1.1 What is being built

A complete redesign of the Juno OS deal page (`/deals/[id]`). The existing tab structure (Bookbuild / Pre-close / Post-close) is being replaced with a full five-tab redesign covering the entire deal lifecycle.

### 1.2 What is in scope

- New tab-based deal page UI replacing the current implementation
- Persistent header strip, deal-wide summary cards
- Five tabs: Bookbuild, Closing, Completion, Documents, Invoices
- Cross-tab investor visibility logic (active / past / hidden)
- Status-driven Next-step workflow buttons
- Per-investor fee handling with override
- Edit-before-send modal with locked structured fields and editable free text (Preview tab as placeholder — see Section 14.2)
- Backwards-step support with audit logging
- Document versioning with superseded badges
- Mock-button behaviour for M365, Documenso, and Xero
- "Edit deal details" as a modal (not a separate page)
- "Chase" status auto-fires after 10 days of inactivity (lifecycle-wide)
- KYC visibility (no workflow blocking)

### 1.3 What is NOT in scope (deferred — see Section 14)

- Actual M365 Graph API integration
- Actual Documenso integration
- Actual Xero API integration for invoice push
- Actual application form PDF generation (PandaDoc continues as bridge)
- Investor drill-down view linking investment payment with fee invoice
- Xero webhooks for automatic paid status (decided: not built — Section 9.5)
- Bulk AI matching for share certificate uploads
- Sell deal page redesign (Section 14.1)
- KYC request workflow

### 1.4 Buy deals only

The new tabbed page applies only to deals where `deal_type IN ('new_investment', 'follow_on', 'kyc', 'side_letter', 'membership')`.

Sell deals (`full_exit`, `partial_exit`, `exit`) continue to render via the existing implementation. **[CORRECTED IN v3 — verified]** The `deal_type` constraint already allows all of these values; no constraint fix is needed.

The deal page router needs to detect deal type and render the right page accordingly:
- `new_investment`, `follow_on`, `kyc`, `side_letter`, `membership` → new tabbed page
- `full_exit`, `partial_exit`, `exit` → existing legacy page

**[VERIFIED]** Live data state: 44 buy deals and 16 sell deals exist as test data. Both routes need to work side by side until the sell deal redesign happens (Section 14.1).

### 1.5 Existing infrastructure to preserve

The following exists in the current codebase and must be preserved or refactored, not rebuilt:

**Verified database tables:**
- Core: `deals`, `deal_investors`, `investments`, `clients`, `companies`, `bookbuilds`, `bookbuild_entries`, `documents`, `invoices`
- Fee infrastructure: `fee_schedules`, `fee_schedule_items`, `fund_types`, `investment_fee_items`
- Reference: `nominees`, `team_members`, `client_relationships`, `client_notes`, `internal_updates`
- Domain-specific: `cln_positions`, `loan_notes`, `loan_note_repayments`, `loan_note_interest_adjustments`, `dividends`, `deferred_payments`, `deal_deferred_notes`
- Misc: `valuations`, `kpi_data`, `share_class_ranking_history`, `company_news`, `company_share_classes`, `investor_updates`, `investor_update_recipients`

**[NEW IN v3]** Worth knowing for design:
- `team_members` is referenced as FK target by many tables (created_by, etc.) but currently has **0 rows** populated. Names won't render until populated. Two `auth.users` exist (jhickman and erudd) — `team_members` should be backfilled from auth.users at some point, but this is out of scope for the deal page work.
- `fund_types` has 3 rows (`syndicate`, `multi_manager`, `eis`) and each has its own `default_fee_schedule_id` — this is the source of truth for default fee rates by fund type, not just `clients.default_fee_rate`.

**Other infrastructure to preserve:**
- The two-query-then-merge pattern for Supabase data fetching
- Investment cockpit page at `/investments/[id]`
- Transaction statement PDF generation via jsPDF
- Share price chart with step interpolation
- The `completeInvestor()` and `completeSellInvestor()` functions and their dependencies
- The `internal_updates` activity feed

---

## 2. Page structure

### 2.1 Persistent header (always visible)

A header strip sits above the tabs and stays visible regardless of which tab is open.

**Top row:**
- Company logo (or initials fallback in light coloured rounded square)
- Deal title (e.g. "So Purple Group — Series B Top-Up")
- Deal subtitle: deal type and creation date — e.g. "Buy deal · Created 12 March 2026"
  - Deal owner / lead user is NOT shown
- Status pill (e.g. "In bookbuild", "Closed", "Completed")
- "Edit deal details" button (right-aligned, opens modal — see Section 2.5)
- Overflow "⋯" button for less-common deal-level actions

**Metadata grid (6 cells, divided by vertical lines):**
| Cell | Label | Value source (verified) | Sub-text |
|---|---|---|---|
| 1 | Share class | `deals.share_class_id` joined to `company_share_classes` | "EIS qualifying" or "Non-EIS" (from `deals.eis_qualifying`) |
| 2 | Share price | `deals.share_price` | "Set [date]" (from `deals.created_at` or last-modified) |
| 3 | Target raise | `bookbuilds.target_raise` (joined via `bookbuilds.deal_id`) | "[shares] shares" calculated as target÷share_price |
| 4 | Soft-circled | Sum of `deal_investors.soft_circle_amount` for active rows | "% of target" |
| 5 | Confirmed | Sum of `deal_investors.confirmed_amount` for active rows | "[n] of [total] investors" |
| 6 | Fund type | **[CORRECTED IN v3 — verified]** Lookup via the deal's primary client → `clients.active_fund_type` → `fund_types` row | Default fee from `fund_types.exit_fee_default_pct` or fee schedule default |

The header should refresh whenever any deal data changes.

**[NEW IN v3 — verified]** Note on fund type: deals don't currently have a direct `fund_type` field. The fund type for a deal is implicit from the investors involved (most are syndicate). The header should derive the fund type from the most common active investor's `active_fund_type`, with a small visual cue if mixed (rare but possible).

### 2.2 Summary cards (above tabs, always visible)

Four KPI cards in a single row:

| Card | Label | Value | Progress bar | Sub-text |
|---|---|---|---|---|
| 1 | Bookbuild progress | % soft-circled of target | Yes (teal) | "£X of £Y soft-circled" |
| 2 | Signatures | "[n] / [total]" signed | Yes (teal) | "[n] chasers due" (amber if any) |
| 3 | Cash received | Total received from all investors | Yes (blue) | "From [n] investors" |
| 4 | Completed | "[n] / [total]" fully complete | Yes (teal) | "All docs filed" or similar |

### 2.3 Tab strip

Five tabs in this order:
1. Bookbuild
2. Closing
3. Completion
4. Documents
5. Invoices

Each tab shows a count badge: **active count / total count**. Documents and Invoices show single counts.

### 2.4 Tab content panels

Each panel sits below the tab strip in a card-style container. Only one panel visible at a time.

### 2.5 Edit deal details modal

Clicking "Edit deal details" opens an inline modal on top of the deal page. The modal contains the same form currently at `/deals/[id]/edit` — that page can be refactored into a modal component, with the route either deprecated or kept as a fallback.

Editable fields: deal title, share class, share price, target raise. Modal supports save/cancel with dirty-form check.

---

## 3. Data model implications

**[SIGNIFICANTLY UPDATED IN v3 — based on actual schema inspection]**

### 3.1 The unified `deal_investors.lifecycle_status` field

**[VERIFIED]** `deal_investors` currently has these columns: `id`, `deal_id`, `client_id`, `amount`, `poa_held`, `signing_status` (allowed: `not_reviewed`, `reviewed`, `signed`, `pending`), `created_at`. There is no lifecycle status field, no fee fields, no audit fields, no `investing_vehicle_id`, no `updated_at`.

The full lifecycle is currently split: `bookbuild_entries.status` for pre-confirmation, `deal_investors.signing_status` for signing phase, `deals.completion_checklist` JSONB blob for completion.

**Migration step:**
```sql
ALTER TABLE deal_investors
  ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'soft_circled'
    CHECK (lifecycle_status IN (
      'soft_circled', 'confirmed', 'app_form_sent', 'signed',
      'paid', 'complete', 'declined', 'superseded', 'chase'
    )),
  ADD COLUMN soft_circle_amount NUMERIC,
  ADD COLUMN confirmed_amount NUMERIC,
  ADD COLUMN shares NUMERIC,
  ADD COLUMN investing_vehicle_id UUID REFERENCES clients(id),
  ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN updated_by UUID REFERENCES auth.users(id);
```

**[NEW IN v3]** Notes:
- The existing `amount` column will be deprecated in favour of `soft_circle_amount` and `confirmed_amount`. Don't drop yet — keep it for legacy reads, drop in Stage 7 cutover.
- `investing_vehicle_id` is added because `bookbuild_entries` has it but `deal_investors` doesn't. Adding it makes deal_investors capable of "same client, different vehicle in same deal."
- An `updated_at` trigger is needed (Supabase doesn't auto-update timestamps unless explicitly defined). Migration should include the trigger.

### 3.2 Fee fields on `deal_investors`

**[VERIFIED]** No fee fields exist on `deal_investors` today.

**Migration step:**
```sql
ALTER TABLE deal_investors
  ADD COLUMN fee_pct NUMERIC(5,4),
  ADD COLUMN fee_overridden BOOLEAN DEFAULT FALSE,
  ADD COLUMN fee_override_reason TEXT,
  ADD COLUMN fee_override_by UUID REFERENCES auth.users(id),
  ADD COLUMN fee_override_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN fee_locked_at TIMESTAMP WITH TIME ZONE;
```

**[NEW IN v3]** Important note on fee schedules:
- The default fee comes from `clients.fee_schedule_id` → `fee_schedules` → `fee_schedule_items` (where `fee_type='buy'`)
- If the client has no `fee_schedule_id`, fall back to `clients.default_fee_rate` (legacy column, still populated, default 5.00)
- The `investments.fee_rate` and `investments.fee_amount` columns also exist but are populated only at completion. They're separate from `deal_investors.fee_pct` — don't confuse them.
- The `investment_fee_items` table records fees at investment completion. The new `deal_investors.fee_pct` is the locked fee at app-form-send. These two should match by the time the deal is complete, but they exist at different points in the lifecycle.

### 3.3 Document versioning fields

**[VERIFIED]** `documents` table has: `id`, `type`, `company_id`, `client_id`, `deal_id`, `filename`, `storage_url`, `onedrive_url`, `period`, `document_date`, `uploaded_by`, `created_at`. No versioning fields exist.

**Migration step:**
```sql
ALTER TABLE documents
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN superseded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN superseded_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN superseded_reason TEXT,
  ADD COLUMN superseded_by_id UUID REFERENCES documents(id),
  ADD COLUMN deal_investor_id UUID REFERENCES deal_investors(id);
```

**[NEW IN v3]** Note: `deal_investor_id` is added because some documents (app forms, signed agreements, transaction statements) belong to a specific deal_investor row, not just the deal. This enables clean per-investor document filtering in the Documents tab.

### 3.4 Action log table (new)

**[VERIFIED]** No audit log table exists in the schema. Adding one as new.

**Migration step:**
```sql
CREATE TABLE deal_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id),
  deal_investor_id UUID REFERENCES deal_investors(id),
  document_id UUID REFERENCES documents(id),
  invoice_id UUID REFERENCES invoices(id),
  action_type TEXT NOT NULL,
  action_subtype TEXT,
  is_mock BOOLEAN NOT NULL DEFAULT TRUE,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  metadata JSONB,
  actioned_by UUID NOT NULL REFERENCES auth.users(id),
  actioned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deal_action_logs_deal ON deal_action_logs(deal_id);
CREATE INDEX idx_deal_action_logs_investor ON deal_action_logs(deal_investor_id);
CREATE INDEX idx_deal_action_logs_recent ON deal_action_logs(actioned_at DESC);
```

Allowed `action_type` values: `send_app_form`, `send_chaser`, `send_signature_chaser`, `send_payment_chaser`, `mark_payment_received`, `mark_invoice_paid`, `send_to_xero`, `generate_transaction_statement`, `mark_complete`, `move_backwards`, `fee_override`, `manual_signature_upload`, `re_issue_document`.

### 3.5 No per-deal threshold needed

The chaser threshold is hardcoded at 10 days for v1. No `chaser_threshold_days` column needed.

### 3.6 `invoices.deal_investor_id` foreign key

**[VERIFIED]** `invoices` table currently has: `deal_id`, `client_id`, `company_id`, `investment_amount`, `fee_percentage`, `fee_amount`, `vat_amount`, `due_date`, `xero_invoice_id`, `xero_invoice_number`, `status`, `created_at`. No `deal_investor_id`.

**Migration step:**
```sql
ALTER TABLE invoices
  ADD COLUMN deal_investor_id UUID REFERENCES deal_investors(id);
```

This allows clean linkage from invoice back to the specific deal_investor row.

### 3.7 `deal_investors` unique constraint

**[CORRECTED IN v3.1 — re-verified by Claude Code]** There IS an existing unique constraint on `deal_investors` named `deal_investors_deal_client_unique` covering `(deal_id, client_id)`. The earlier verification missed this because it queried foreign keys but not unique constraints. Confirmed via `information_schema.table_constraints`.

This existing constraint must be dropped before the new three-column constraint can be added — otherwise both would be enforced, and the two-column one would block exactly the scenario (same client, different vehicles) that the new one is meant to allow.

**Decision in v3.1:** drop the old constraint, then add the new one.

```sql
ALTER TABLE deal_investors
  DROP CONSTRAINT deal_investors_deal_client_unique;

ALTER TABLE deal_investors
  ADD CONSTRAINT deal_investors_deal_client_vehicle_unique
    UNIQUE (deal_id, client_id, investing_vehicle_id);
```

This allows: a single client investing through multiple vehicles in one deal (e.g. own name + family trust).

**Note:** with 124 existing rows under the old constraint, all rows currently have unique `(deal_id, client_id)` pairs by definition. After the data wipe (which is part of Stage 1), the table is empty and the new constraint applies cleanly.

### 3.8 Existing bug fixes

**[CORRECTED IN v3 — verified]**

- **`deal_type` constraint**: NO BUG. The constraint allows `'new_investment', 'follow_on', 'exit', 'full_exit', 'partial_exit', 'kyc', 'side_letter', 'membership'`. Removed from migration plan.
- **`invoices.issued_at` query**: REAL BUG confirmed. The column doesn't exist. Fix by either:
  - Updating the query in `deals/[id]/page.tsx` to use `created_at` instead, OR
  - Adding `issued_at TIMESTAMP WITH TIME ZONE` to `invoices` if there's a meaningful semantic distinction (issued = pushed to Xero, vs created = draft created in JunoOS)
  - **Recommendation:** add the column. The semantic distinction matters — "draft created" and "sent to Xero" are different events worth tracking separately.

```sql
ALTER TABLE invoices
  ADD COLUMN issued_at TIMESTAMP WITH TIME ZONE;
```

### 3.9 The Stage 1 migration in full

Combining Sections 3.1–3.8 into a single coherent migration. Claude Code should propose this via `apply_migration` (which tracks the migration in the platform), Ed reviews, then approves to apply. Total scope: 6 ALTER TABLE statements (one of which includes a DROP CONSTRAINT for the old `deal_investors` two-column unique constraint, before the new three-column one is added) + 1 CREATE TABLE + indexes + an updated_at trigger on `deal_investors`.

---

## 4. Bookbuild tab

### 4.1 Definition

**Bookbuild = the phase before signature.** Any investor who has been added to the deal and not yet signed an application form is "active in bookbuild."

### 4.2 Active vs past rows

**Active rows (top of table):**
- Soft-circled
- Confirmed
- App form sent (awaiting investor signature)
- Chase (any of the above + 10 days of inactivity)
- Declined (visible only in Bookbuild — hidden from other tabs)

**Past rows (greyed, below divider):**
- Signed (now active in Closing)
- Paid (now active in Closing or Completion)
- Complete (now active in Completion or fully closed)

A horizontal divider separates active rows from past rows. Past rows are at ~45% opacity, with hover restoring full visibility. Past rows have disabled checkboxes.

### 4.3 The three-dimensional investor identity model

**[NEW IN v3.2]**

Every row in the deal represents a single investment. An investment has **three independent dimensions** that together fully describe who is investing, how, and where the shares end up:

| Dimension | Database field | Examples | What it tells you |
|---|---|---|---|
| **Client** | `deal_investors.client_id` | "Nigel Rudd", "Bob Bigballs" | Who is the principal investor — always a real person, the relationship-holder |
| **Vehicle** | `deal_investors.investing_vehicle_id` | NULL ("Own name"), "Rother House", "Robert Bigballs III" | How is the money wrapped — own name by default, or a legal entity through which the investment is made |
| **Location** | `deal_investors.nominee_id` | NULL ("Direct"), "City Partnership Nominees Ltd" | Where are the shares held — directly in the legal investor's name, or via a nominee |

**Why three dimensions, not two:**

These are genuinely independent. The same investor might invest:
- In their own name, held directly (most common)
- Through their family vehicle, held directly
- In their own name, but held via a nominee
- Through their family vehicle, held via a nominee

All four combinations occur in real syndicates. The platform must surface all three dimensions clearly because each affects different downstream paperwork: the legal investor (Client + Vehicle) signs the application form; the nominee (Location) appears on the share certificate.

**The "legal investor" derived from the model:**

For documents that go to the cap table or HMRC, the *legal investor* is determined by the Client + Vehicle:
- If `investing_vehicle_id` is NULL → legal investor = the client themself
- If `investing_vehicle_id` is set → legal investor = the vehicle (e.g. "Rother House Ltd")

The Location is a separate concern — it's about the registered holder of the shares, not who put up the money.

**This model applies platform-wide.**

The Client / Vehicle / Location triangulation is the canonical way investments are modelled in JunoOS. It applies to:
- Buy deals (this spec)
- Sell deals (Future Work 14.1) — when the redesign happens, sells will inherit the same three-dimensional structure
- Reports — investments can be filtered/grouped by any combination of the three dimensions
- Documents — applications and statements derive their content from these three fields

### 4.4 Bookbuild table columns

In order, left to right (13 columns total):

1. Checkbox (28px wide) — for bulk selection
2. **Client** — primary investor name with KYC indicator badge (🟢 verified / 🟡 renewal due / 🔴 outstanding) near the name. From `deal_investors.client_id` → `clients.full_name`. Min-width 160px to prevent CSS layout collapse on narrow screens.
3. **Vehicle** — `deal_investors.investing_vehicle_id`. Shows "Own name" if NULL (in muted grey), otherwise the vehicle's `full_name`.
4. **Location** — `deal_investors.nominee_id`. Shows "Direct" if NULL (in muted grey), otherwise the nominee's `name`.
5. Soft-circle (£) — right-aligned, tabular numerals
6. Confirmed (£) — right-aligned, tabular numerals
7. Shares — right-aligned, tabular numerals (calculated: confirmed_amount ÷ deals.share_price)
8. Fee (%) — right-aligned, **only shown on confirmed rows** (others show "—" in light grey)
9. Status — coloured badge (Soft-circled / Confirmed / App form sent / Chase / Declined / Signed / Paid / Complete)
10. POA — small purple badge if `poa_held = TRUE`
11. EIS — small green badge if `deals.eis_qualifying = 'yes'` (deal-level flag, applies to all rows on this deal)
12. Next step — coloured action button (Section 4.6)
13. Action ("⋯") — opens row-level menu (Section 4.7)

### 4.5 Totals row

Aggregates only the active rows (excludes past and declined):
- Soft-circle total
- Confirmed total
- Shares total
- **Fee total — only summed across confirmed rows**

### 4.6 Next step column logic

| Status | Next step button | Colour |
|---|---|---|
| Soft-circled | "Confirm investment" | Grey (white background with navy text) |
| Confirmed | "Send application form →" | Green |
| App form sent | "Awaiting signature" | Grey italic text (no button) |
| Chase | "Send chaser" | Amber |
| Declined | "No action" | Grey italic text |

**KYC behaviour:** KYC status does NOT block any workflow action. Visual indicator only. When user clicks "Send application form" with KYC outstanding, the modal shows an informational reminder.

**Chase status mechanics:**
- When 10 days pass since `deal_investors.updated_at`, status auto-set to `chase`
- Chase overrides whatever was there before
- Status column displays "Chase" with amber badge
- Clicking "Send chaser" logs the action AND resets status back to its previous state with `updated_at` refreshed
- **Implementation approach (recommended):** compute on read rather than scheduled job — query checks if `NOW() - updated_at > 10 days AND lifecycle_status IN ('soft_circled', 'confirmed', 'app_form_sent')`, and treats the row as if `lifecycle_status = 'chase'` for display purposes. Cheaper and more reliable than a scheduled job.

### 4.7 Row "⋯" menu

Each active row has a "⋯" button opening a dropdown:
- View investor record
- Edit deal details for this investor
- ─── divider ───
- Mark as signed (manual upload)
- Move backwards to [previous status] — context-sensitive
- ─── divider ───
- Decline / remove from deal (red text)

Past rows have a simpler menu (View record, View deal details only).

### 4.8 Toolbar

- Search input (left) — filters by investor name, entity, POA holder
- Status filter dropdown
- Entity filter dropdown
- "+ Add investor" button (right, primary navy)

### 4.9 Bulk actions

Checkboxes select rows. When ≥1 row is checked, navy footer bar appears with:
- Selected count
- Description of bulk action available, OR warning that mixed statuses prevent it
- "Mark POA held" button (any selection)
- "Decline" button (any selection)
- Primary bulk action button — only enabled when all selected rows share same next step
- Clear selection button

### 4.10 Fee column behaviour

Fee value shown only on confirmed rows. Other rows show "—" in light grey.

**Default fee:** read from client's `fee_schedule_id` → matching `fee_schedule_items` row where `fee_type='buy'`. Falls back to `clients.default_fee_rate` (5.00) if no schedule. Falls further back to `fund_types.exit_fee_default_pct` (rare).

**Override behaviour:**
- Click fee value to open popover: current value, source, input for new value, optional reason, Save / Cancel
- Saving overrides for this deal_investor row only
- Overridden fees display in amber with edit icon (e.g. "3.5% ✎")
- Override logged in `deal_action_logs`

**Lock behaviour:**
- Once `fee_locked_at` is non-null (set when app form sent), fee is locked
- Cell becomes non-clickable, displays 🔒 icon, tooltips explain lock
- Section 5.4 covers what happens when a user tries to change a locked fee

---

## 5. Edit-before-send modal

### 5.1 When it appears

Opens whenever the user clicks any "Send [document]" Next-step button:
- "Send application form →" (Bookbuild)
- "Generate transaction statement →" (Completion)

Does NOT appear for chaser actions — those go straight to email-draft mock-toast pattern.

### 5.2 Three sub-tabs

- **Preview** (default) — read-only document view. **In v1, this is a placeholder** showing "PDF generation pending — Section 14.2. Currently using PandaDoc workflow externally." When PDF generation is built, this tab shows actual rendered PDFs.
- **Edit** — split panel: locked structured fields (top) + editable free-text sections (below)
- **Email** — draft email shown as it'll appear in Outlook

### 5.3 Locked structured fields

From the deal record, **cannot be edited within the modal**:
- Investor name (from `clients.full_name`)
- Email address (from `clients.email`)
- Company (from `companies.name`)
- Investment amount (from `deal_investors.confirmed_amount`)
- Share class & share price (from `company_share_classes` + `deals.share_price`)
- Number of shares (from `deal_investors.shares`)
- Fee % and fee £ amount (from `deal_investors.fee_pct`)
- EIS qualifying status (from `deals.eis_qualifying`)
- Signing method (POA / direct — from `deal_investors.poa_held`)

If wrong, click "Fix in deal record" — opens Edit deal details modal.

### 5.4 Editable free-text sections

Bespoke per-deal, edit freely on the document:
- Cover paragraph (default templated, editable)
- Special clauses (optional, free text)
- Signature block wording (default templated, editable)

Free-text edits do NOT backflow to the database.

### 5.5 Email tab

Shows the email that'll be drafted in the user's Outlook:
- From: user's mailbox (read-only)
- To: investor's email (read-only — from deal data)
- Subject: editable (defaults to a template based on document type)
- Body: editable (defaults to a template referencing the Documenso signing link placeholder)

### 5.6 KYC informational reminder

When the modal opens and the investor's KYC is `outstanding` or `renewal_due`, an amber callout at the top of the modal body:

> ⚠ **KYC outstanding** — Consider sending a KYC request alongside the application form. KYC handling is currently outside JunoOS (see your normal process).

Does NOT block sending. Informational only.

### 5.7 Modal footer

- Footer note (left): "🔒 Sending will lock the fee on this document. Subsequent fee changes will prompt re-issue."
- Cancel button (secondary)
- Primary action button — text: "Draft email + create signing link" (green)

In v1 the primary button shows a toast (Section 11) — does not call M365 or Documenso APIs. Action logged in `deal_action_logs` with `is_mock = true`.

### 5.8 Document versioning

- Drafts overwrite each other while user is iterating
- When user clicks the primary button, draft is locked, given version suffix (`_v1.pdf`), saved to documents store with `documents.version = 1` and `documents.deal_investor_id` set
- Re-issues create new version (`_v2.pdf`) and mark previous as superseded (`documents.superseded = TRUE`, `superseded_by_id` pointing to new row)

### 5.9 Field changes after sending

If a structured field changes after sending, system shows a modal:

> "The application form for [investor] was sent on [date] with [field]: [old value]. The new value is [new value]. What do you want to do?"
>
> Options:
> - Re-issue: regenerate, send again (creates new version, marks old superseded)
> - Don't re-issue: keep old document as-is
> - Mark old as accepted: keep old, treat change as future-only

Mandatory modal — system never auto-decides.

---

## 6. Closing tab

### 6.1 Definition

**Closing = the phase between signing and full completion.** An investor enters Closing when they have signed an application form. They leave when all completion items are complete.

### 6.2 Active vs past rows

**Active rows:**
- Signed (awaiting payment)
- Paid (awaiting completion items)
- Chase (signed + 10 days no payment)

**Past rows (greyed, below divider):**
- Fully complete

**Hidden:**
- Anyone not yet signed (still active in Bookbuild)
- Declined (only ever visible in Bookbuild)

### 6.3 Table columns

1. Checkbox
2. Investor (name + KYC indicator)
3. Confirmed (£)
4. Fee (%) — locked, no override
5. App form — badge showing version + date sent
6. Cash received — badge: "Awaited" (amber) or "£X · [date]" (green)
7. Next step
8. Action ("⋯")

No Signature column — every row is signed by definition.

### 6.4 Next step logic

| Status | Next step button | Colour |
|---|---|---|
| Signed, awaiting payment, < 10 days | "Awaiting payment" | Grey italic |
| Signed, awaiting payment, ≥ 10 days (chase) | "Send payment chaser" | Amber |
| Paid, awaiting completion items | "Move to completion →" | Green |
| Awaiting countersignature (Juno) | "Sign now (POA)" | Green |

### 6.5 Mark payment received

- Row "⋯" menu has "Mark payment as received"
- Single click flips cash status from "Awaited" to "Received"
- 5-second undo toast appears at bottom of screen
- If undone within 5s, status reverts and no audit log entry created
- After 5s, action committed to `deal_action_logs` with `is_mock = false`

No date/reference fields captured — that data lives in Xero's bank feed.

### 6.6 Toolbar

- Search input
- Status filter dropdown

### 6.7 Bulk actions

Same pattern as Bookbuild — bulk only when same next step.

---

## 7. Completion tab

### 7.1 Definition

**Completion = the phase after payment.** Investors here while per-investor admin items still pending.

### 7.2 Active vs past rows

**Active rows:**
- Has any of the four completion items still pending

**Past rows (greyed):**
- All four completion items complete

**Hidden:**
- Anyone not yet paid

### 7.3 Table columns

1. Checkbox
2. Investor
3. Amount (£)
4. Share cert — centred icon: ✓ / ○ / ⌛
5. EIS cert — centred icon: ✓ / ○ / ⌛
6. Transaction statement — centred icon: ✓ / ○ / ⌛
7. Docs filed — centred icon: ✓ / ○
8. Next step
9. Action ("⋯")

Icon meanings: ✓ filed · ○ not yet (grey) · ⌛ awaited from third party (amber, e.g. HMRC).

### 7.4 Next step logic

| Pending items | Next step button |
|---|---|
| Transaction statement not generated | "Generate transaction statement →" (green) |
| Share cert pending | "Upload share cert" (green) |
| EIS cert pending (HMRC) | "Awaiting EIS cert (HMRC)" (grey italic) |
| Docs filed pending | "Mark docs filed" (green) |
| All complete | "Complete" (grey italic) |

### 7.5 Bulk upload (deferred)

For v1, simpler manual upload — user uploads each PDF and matches to investor via dropdown. Bulk AI matching deferred to Section 14.5.

### 7.6 Manual signature upload

"Mark as signed (manual upload)" from Bookbuild "⋯" menu opens a manual upload flow for hand-signed forms. User uploads PDF, JunoOS files it, status moves to `signed`. Logged with `action_type = manual_signature_upload`.

---

## 8. Documents tab

### 8.1 Definition

The document file cabinet for this deal.

### 8.2 Two independent toggles

**View grouping:**
- By investor (default)
- By type
- By date

**Filter:**
- Final only (default — superseded hidden)
- All docs (superseded visible)

Defaults reset each session. No per-user persistence.

### 8.3 Document row

Each row shows:
- Document icon (📄)
- Filename (using existing convention: `YYYY-MM-DD — [Investor] — [Company] — [Type]_v[N].pdf`)
- Sub-meta
- Type tag
- Date
- Status badge (Draft / Sent / Signed / Filed / Issued / Superseded)
- View link

Superseded rows render at ~60% opacity with grey "Superseded" badge.

### 8.4–8.6 The three views

- **By investor (default):** rows grouped under collapsible investor headers
- **By type:** grouped under type headers (Application forms, Investment agreements, etc.)
- **By date:** grouped under date headers, most recent first

### 8.7 Toolbar

- View toggle (segmented)
- Filter toggle
- Search input
- "Bulk upload" button

### 8.8 OneDrive sync (deferred)

`documents.onedrive_url` exists in schema but is unused. Marked for future work (Section 14.6).

---

## 9. Invoices tab

### 9.1 Definition

Tracks fee invoices for this deal. **One invoice per confirmed investor**, linked via the new `invoices.deal_investor_id` field.

**[VERIFIED]** `invoices` table currently holds 2 rows. Once the new logic is in place, the existing rows should either be backfilled with `deal_investor_id` (if the matching deal_investor exists) or wiped along with other test data.

### 9.2 Auto-generation

When investor's `lifecycle_status` moves to `confirmed`, system creates draft invoice with:
- `deal_investor_id`: the row that triggered creation
- Investor: from linked client
- Investment amount: from `deal_investors.confirmed_amount`
- Fee %: from locked `deal_investors.fee_pct`
- Fee £: calculated
- VAT: 0% (always — fee invoices are exempt)
- Payment terms: due immediately
- Status: 'draft'
- Xero invoice number: empty until pushed

### 9.3 Table columns

1. Checkbox
2. Investor
3. Investment amount (£)
4. Fee % — inline; if overridden, amber + ✎ icon
5. Fee amount (£)
6. Status — Draft (amber) / Sent to Xero (blue) / Paid (green)
7. Xero invoice # — populated after push
8. Next step
9. Action ("⋯")

Totals row aggregates fee amounts.

### 9.4 Next step logic

| Status | Next step button |
|---|---|
| Draft | "Send to Xero" (blue, mock button) |
| Sent to Xero, not yet paid | "Mark as paid" (grey, manual flip) |
| Paid | "Paid" (grey italic) |

KYC outstanding shows visible indicator but does NOT block.

### 9.5 Paid status — manual only (confirmed)

Paid status updated manually. **No Xero webhook integration. Permanent decision.**

When user knows invoice paid (from checking Xero or bank reconciliation), they click "Mark as paid". Status flips with 5-second undo toast.

Reasoning: Xero is the source of truth; the Invoices tab "Paid" column is a convenience indicator only.

### 9.6 Override visibility

Inline indicator on each row. No separate summary strip.

### 9.7 Bulk actions

Bulk "Send to Xero" enabled when multiple draft rows selected. Pushed to Xero one at a time when integration wired.

---

## 10. Backwards steps and audit logging

### 10.1 What backwards steps exist

| In tab | Forward state | Backwards step |
|---|---|---|
| Bookbuild | Confirmed | Move to soft-circled |
| Bookbuild | App form sent | Move to confirmed (un-send) |
| Closing | Signed | Move to app form sent |
| Closing | Paid | Move to signed |
| Completion | Complete | Move to paid |

### 10.2 Confirmation modal

Every backwards step opens a modal explaining:
- What is changing
- What documents will be affected
- Optional reason text field
- Cancel / Confirm

### 10.3 Audit log entries

Every backwards step logged in `deal_action_logs` with:
- `action_type = move_backwards`
- from_status, to_status
- reason (text from modal)
- actioned_by, actioned_at
- metadata.documents_superseded: array of document ids

### 10.4 Documents are never deleted

When backwards step taken, related documents marked superseded — never deleted. Remain visible via "All docs" filter.

---

## 11. Mock buttons in v1

### 11.1 Purpose

In v1, M365 / Documenso / Xero integrations NOT wired. But buttons that will trigger them are real components.

### 11.2 Mock-button behaviour

When clicked:
1. Logs intended action in `deal_action_logs` with `is_mock = true`
2. Shows toast notification:
   - "Email drafted in Outlook — coming soon" (M365)
   - "Document signing link prepared — coming soon" (Documenso)
   - "Invoice queued for Xero — coming soon" (Xero)
3. Updates UI state as if action succeeded (status moves forward)

### 11.3 Mock-action banner

Rows where most recent mock action is unresolved show small amber banner above Next step column:

> ⚠ Mock action — actual email/integration not sent.

Banner appears because `deal_action_logs` query for that row returns `is_mock = true` for the most recent matching action_type. When integrations go live and a real action fires (`is_mock = false`), the banner clears.

### 11.4 Buttons affected

**Mock buttons:**
- Send application form →
- Send chaser
- Send payment chaser
- Send to Xero

**Not mock (manual flips):**
- Mark payment received
- Mark as paid
- Mark as signed (manual upload) — real upload, just no Documenso integration

**[VERIFIED]** Generate transaction statement uses existing jsPDF generation — already real, not mock.

---

## 12. Build sequence and migration plan

### Stage 1 — Foundation migration (1-2 days)

**[REFINED IN v3 — using Supabase MCP `apply_migration`]**

A single migration named `20260429_deal_page_restructure_foundation` applied via `apply_migration`. Contents:

1. Add lifecycle_status, soft_circle_amount, confirmed_amount, shares, investing_vehicle_id, updated_at, updated_by to `deal_investors`
2. Add fee fields to `deal_investors` (Section 3.2)
3. Add updated_at trigger to `deal_investors`
4. Add unique constraint to `deal_investors` (Section 3.7) — runs against empty table after wipe, so no duplicate-resolution needed
5. Add versioning fields and deal_investor_id to `documents` (Section 3.3)
6. Add deal_investor_id and issued_at to `invoices` (Section 3.6, 3.8)
7. Create `deal_action_logs` table with indexes (Section 3.4)

Ed reviews proposed SQL. Claude Code applies via Supabase MCP after explicit approval.

**[NEW IN v3]** Stage 1 also includes a small data wipe step (per Ed's plan): `TRUNCATE` all transactional tables (deal_investors, bookbuild_entries, investments, deal_action_logs, invoices, deal_deferred_notes, deferred_payments) but keep reference data (clients, companies, fee_schedules, fund_types, etc.). This gives a clean slate for the new lifecycle model.

### Stage 2 — New deal page shell (3-5 days)

- Build new deal page as parallel route, behind feature flag (or replace existing if confidence is high)
- Persistent header with metadata grid
- Summary cards (4 KPIs)
- Five-tab strip with count badges
- Tab bodies as placeholders
- Edit deal details modal (refactor from `/deals/[id]/edit`)
- Router detects deal_type and renders new page only for buy deals

### Stage 3 — Bookbuild tab (4-6 days)

- Active/past row split using `lifecycle_status`
- All 12 columns with KYC indicator
- Next step column with mock buttons writing to `deal_action_logs`
- Fee column with override popover, amber overridden indicator, lock icon
- Search/filter toolbar, "+ Add investor" (refactor existing)
- Bulk action footer bar
- Totals row
- Chase status logic (compute on read approach — Section 4.6)
- KYC indicator (informational)

### Stage 4 — Closing and Completion tabs (4-5 days)

- Closing: active/past split, cash received marking with 5-sec undo toast (new richer pattern than existing toast)
- Completion: 4-item checklist rows, icon states
- Backwards steps: confirmation modal, audit log writes
- Manual signature upload flow

### Stage 5 — Documents and Invoices tabs (3-4 days)

- Documents: three view groupings, Final-only/All-docs filter, superseded badges, manual upload
- Invoices: auto-draft on confirmation trigger, table with override indicators, mock "Send to Xero", "Mark as paid" with undo toast
- Mock-action banner on relevant rows

### Stage 6 — Edit-before-send modal (3-4 days)

- Locked structured fields (read-only, "Fix in deal record" link)
- Editable free-text sections
- Email tab (Outlook draft preview)
- Preview tab as placeholder
- KYC informational reminder
- Field-changed-after-send modal

### Stage 7 — Cutover (1-2 days)

- Verify deal creation wizard initialises new `deal_investors` records with `lifecycle_status = 'soft_circled'`
- Switch deal page route from old to new (remove feature flag if used)
- Archive or remove old components
- Drop deprecated `deal_investors.amount` column (no longer used after Stage 3 onwards)
- The data wipe and importer-driven reload happens **separately** as Ed's Phase E

### Total rough estimate

5-7 weeks for one developer at solid pace. Guide, not commitment.

---

## 13. Glossary

For clarity:

- **Bookbuild** — phase before any investor has signed an application form
- **Closing** — phase between signature and full completion
- **Completion** — phase of finalising paperwork after payment
- **Soft-circled** — investor has indicated intent but not confirmed amount
- **Confirmed** — investor has confirmed the amount they intend to invest
- **App form sent** — application form emailed to investor for signature
- **Signed** — application form signed (via Documenso webhook or manual upload)
- **Paid** — investment cash received (manually marked in JunoOS)
- **Complete** — all per-investor admin items finished
- **Declined** — investor declined to participate (visible only in Bookbuild)
- **Chase** — auto-applied status when 10 days pass since last forward step
- **Superseded** — document replaced by newer version; never deleted
- **POA** — Power of Attorney
- **EIS** — Enterprise Investment Scheme
- **Fee schedule** — named template assigned per client/vehicle
- **Lock-at-doc-send** — the rule that anything in a customer-facing document is locked when that document is sent
- **Mock button** — real UI component whose action is a placeholder until integration is wired
- **Mock action** — entry in `deal_action_logs` with `is_mock = true`

---

## 14. Future work registry

### 14.1 Sell deal page redesign

The new tabbed page applies to buy deals only. Sell deals continue using existing implementation.

A future project will redesign the sell deal page using the same tabbed pattern, adapted for sell-specific flow: FIFO lot matching, deferred consideration, tranche schedules, and statuses (selling / not selling / undecided).

**[UPDATED IN v3.2]** When the sell deal redesign happens, it should inherit the **Client / Vehicle / Location three-dimensional model** documented in Section 4.3. The model applies identically to sells: the seller has a client (relationship-holder), a vehicle (legal entity actually selling — own name or vehicle), and a location (where the shares are currently held — direct or nominee). FIFO lot matching needs to respect the Vehicle dimension (Bob's own-name shares are a separate lot from Bob's vehicle's shares) and may need to respect Location too if shares were originally bought via different nominees.

The sell deal table should have similar three-column structure for the seller identity, plus sell-specific columns (proceeds, current holding, FIFO lot mapping, etc.).

**Trigger to start:** when sell deal volume justifies the work, or inconsistency between buy/sell becomes painful.

**[NEW IN v3]** Note: 16 sell deals exist as test data. Both routes will coexist immediately.

### 14.2 Application form PDF generation

Currently handled via PandaDoc (external). PandaDoc costs are too high. Future project:
- Design templates with structured fields and free-text sections
- Subject template language to legal review
- Implement PDF generation (likely jsPDF, given existing infrastructure)
- Update Section 5.2 Preview tab to show actual rendered PDFs

**Trigger to start:** when deal page is live and stable.

### 14.3 M365 / Documenso / Xero integrations

Wire up:
- Microsoft 365 Graph API for email drafting
- Documenso for e-signature
- Xero API for invoice push (manual paid status remains)

**Trigger:** when deal page is live and team is ready for real integrations.

### 14.4 KYC request workflow

Future project to bring KYC requests into JunoOS — likely as separate "KYC" tab on client record.

**Trigger:** when KYC volume justifies dedicated workflow.

### 14.5 Bulk AI matching for share certificates

Originally proposed as Completion tab feature. Deferred. For v1, manual upload only.

**Trigger:** when manual upload becomes painful, or when AI extraction work happens elsewhere.

### 14.6 OneDrive auto-sync

Schema has `documents.onedrive_url` but no integration. Future project: implement real auto-sync.

**Trigger:** when document volume justifies it.

### 14.7 Investor drill-down view

Unified per-investor view linking investment payment (Closing) and fee invoice (Invoices) statuses.

**Trigger:** when team frequently flips between tabs to check single investor.

### 14.8 `team_members` backfill

**[NEW IN v3]** The `team_members` table has 0 rows but is referenced by many FK relationships. Names won't render in the UI until backfilled from `auth.users`. Small fix, low priority but worth doing.

### 14.9 Deal title naming convention

**[NEW IN v3.2]** The `deals.title` column added in Stage 2c is currently free-text with no enforced format. Once Juno has been creating deals via the platform for a few months, a naming convention should be designed (likely something like `[Company] [Round] [Suffix]` — e.g. "Cyclr Series B Top-Up") and either enforced via UI helper (suggested format on focus) or via a soft validator (warns on save if the title doesn't match the convention). Convention should NOT be retroactively enforced — old titles stay as-is.

**Trigger to start:** when there are enough real deals in production to make a convention obviously useful (probably 20+ deals).

### 14.10 Recapitalisation event handling

**[NEW IN v3.2]** When a portfolio company recapitalises — restructuring share classes such that what was previously Class B becomes Class C, for example — the platform currently has no proper way to record this. Editing the `share_class` field on past deals would lose historical accuracy. The right model is probably a separate `recapitalisation_events` table that records the transformation (date, from-class, to-class, ratio if applicable) and is used to derive "current" vs "historical" share class views.

This is a non-trivial piece of data modelling work that affects valuations, tax reporting, and exit calculations.

**Trigger to start:** when a portfolio company actually recapitalises and the team needs to record it. Until then, document the gap and warn the team to flag any recap event so we can scope the work properly when it happens.

### 14.11 "Last deal date" in Add Investors picker

**[NEW IN v3.2]** Stage 3a's Add Investors modal currently doesn't show "last deal date" next to each investor in the picker, because that would require an additional query. It's a small UX enhancement for context: helps the team see at a glance "we haven't had X in a deal for 18 months" or "Y was in our last three deals."

Implementation: a separate cached query that aggregates `deal_investors.created_at` MAX per `client_id` across all completed deals. Display as "Last deal: [date]" or "Never" in the picker rows.

**Trigger to start:** when there's enough real deal history to make the date meaningful (i.e. after Phase E data load).

---

*End of specification v3.2.*
