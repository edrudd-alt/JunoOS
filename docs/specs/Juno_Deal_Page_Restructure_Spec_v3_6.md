# Juno OS — Deal Page Restructure Specification (v3.6)

> **Spec scope note:** This document covers the deal page redesign (primary scope, Sections 1–10 and 12) and the document generation infrastructure (Section 11, platform-wide scope). The master platform spec covering all transaction types — buy, sell, transfer, CLN, ASA, dividends, capital events — is `docs/specs/TRANSACTION_WORKFLOW_SPEC.md`. Where the two specs touch the same topic, this deal page spec takes precedence for anything relating to buy deals, application form signing, and document generation.

**Version:** 3.6
**Date:** 15 May 2026
**Status:** Buildable — Stages 1–6c complete and merged. Stage 6d (client-section proof-of-concept) not yet designed. Stage 7 (cutover) ahead.
**Supersedes:** v1, v2, v3, v3.1, v3.2, v3.3, v3.4, v3.5

**What's new in v3.6:**

Stage 6c (transaction statement PDF generation, template `transactionStatement@1.0.0`) was built and merged on 12 May 2026, on the same day v3.5 was finalised and therefore not captured in v3.5. This version reconciles the spec with what was actually built. Key updates: Stage 6c marked as merged in the build sequence (Section 12) and Future Work registry (Section 14); a new Stage 6c subsection added to the Stage 6 architectural design (Section 11) documenting the actual implementation — manual trigger from the Completion tab row menu rather than automatic generation, dedicated `generateTransactionStatement()` function with its own context type (deliberately outside the generic `ContextMap` registry from Stage 6a), regeneration with supersedure logic, and the post-merge fixes (em dash sanitisation in Supabase Storage keys, menu section visibility fix). The `sanitiseStorageKey()` pattern is documented as platform-wide guidance since any new document type will face the same Supabase Storage constraints (Section 11). Three new Future Work items added: 14.16 (deprecate `InvestmentCockpit` and legacy `statementGenerator.ts`), 14.17 (platform-wide storage key sanitisation policy), 14.18 (reconcile Stage 6c divergence from the generic document registry — accept as pattern or refactor). The Stage 6c stub in old Section 14 has been removed since the work is now done; the architectural detail lives in Section 11 alongside 6a and 6b.

**What was new in v3.5:**

Stage 6b (Documenso integration with application form template v1.1.0) has been built and merged (11 May 2026). This version reconciles the spec with what was actually built. Key updates: Documenso removed from the not-in-scope list (Section 1.3); the two-step envelope creation/distribution flow and `created_not_sent` partial-failure state documented (Section 5.3, 5.10); dual `signing_status` field updates and declined/cancelled webhook behaviour documented (Section 5.4); Stage 6b design summary updated with confirmed implementation details including the nil UUID webhook actor pattern, auth guard path exception for `/api/webhooks/`, and idempotent signed PDF upload (Section 11); Stage 6b marked as merged in the build table (Section 11) and build sequence (Section 12); Documenso marked as done in Future Work (Section 14.3). A header scope note has been added clarifying the relationship between this spec and `TRANSACTION_WORKFLOW_SPEC.md`. The POA-signing contradiction in `TRANSACTION_WORKFLOW_SPEC.md` Section 7.6 has been corrected in that file.

**What was new in v3.4:**

Substantial cleanup of the document generation story. Section 5 ("Edit-before-send modal") fully rewritten as **Review-before-send modal** — application form content is now fully data-derived with no per-investor editorial fields, the modal contains an inline PDF preview + recipient email + CC list only, and the flow uses real Documenso integration with synchronous send and full rollback on failure. POA-held investments deliberately go through the same Documenso flow because Juno's POAs are scoped to managing existing investments, not signing new application forms — clients always sign their own. Bank details fields added to `companies` and `nominees` tables (5 fields each) so application forms can include the recipient bank account, conditionally selected based on whether the investment is held directly or via a nominee. The trailing "Note on Stage 6 — re-scoped 6 May 2026" placeholder replaced with a proper Stage 6 architectural design section reflecting all decisions settled through the design conversation. Future Work item 14.2 (Application form PDF generation) marked CLOSED — the work is happening in Stage 6b. Stage 6a's actual built behaviour documented for reference.

**What was new in v3.3:**

Section 6 (Closing tab) and Section 7 (Completion tab) substantially rewritten to reflect Stage 4a's actual built behaviour and the agreed Stage 4b design. Key additions: the **bookbuild auto-lock derivation** (Section 6.3) — a computed-on-read state that locks Bookbuild when all non-declined investors are signed-or-beyond; the **"+ Add late addition" override** (Section 6.9) for the rare post-lock investor addition; the **5-item completion checklist with EIS auto-disable** (Section 7.3); the **Mark complete modal with manual `investment_date` and `completion_date` entry** (Section 7.5) — distinct legal dates that are usually the same for single-close rounds but differ for rolling closes; the **manual "Close the deal" action** (Section 7.8) at the deal level once all investors are complete. Section 6's "Mark payment received" updated to confirmation modal (single click → confirm → state change + audit log immediate, no 5-second undo). New Future Work item 14.13 (rolling-close UX). Note: payment reconciliation is deliberately out of scope permanently — JunoOS does not capture bank references or payment dates beyond the team's manual confirmation.

**What was new in v3.2:**

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
- Review-before-send modal with inline PDF preview, recipient email, and CC list (Section 5)
- Backwards-step support with audit logging
- Document versioning with superseded badges
- Mock-button behaviour for M365 and Xero (Documenso now real — Section 11)
- "Edit deal details" as a modal (not a separate page)
- "Chase" status auto-fires after 10 days of inactivity (lifecycle-wide)
- KYC visibility (no workflow blocking)

### 1.3 What is NOT in scope (deferred — see Section 14)

- Actual M365 Graph API integration
- Actual Xero API integration for invoice push
- Investor drill-down view linking investment payment with fee invoice
- Xero webhooks for automatic paid status (decided: not built — Section 9.5)
- Bulk AI matching for share certificate uploads
- Sell deal page redesign (Section 14.1)
- KYC request workflow

**[UPDATED IN v3.5]** Documenso e-signature integration has been removed from this list. It was originally deferred; Stage 6b (merged 11 May 2026) delivered the full Documenso integration for application form signing. See Section 11 for the architectural detail and Section 14.3 for the updated Future Work entry.

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

## 5. Review-before-send modal

**[REWRITTEN IN v3.4]** This section was originally titled "Edit-before-send modal" and described an editable design with free-text fields and Outlook email integration. That framing was reconsidered during Stage 6 design (7 May 2026) and replaced with a simpler model. The application form's content is fully derived from data — there are no per-investor editorial fields — so the modal is now a **review-and-send** modal, not an edit modal. Real PDF generation, real Documenso signing integration, and real webhook-driven status tracking are built in Stage 6b (see Section 11 for the architectural design and Section 14.2's removal note for context).

### 5.1 When it appears

Opens whenever the user clicks any "Send application form" action:
- Next-step button on a Bookbuild row whose status is `confirmed`
- Equivalent action from the row "⋯" menu
- "Re-issue application form" action on a previously-sent row

Does NOT appear for the transaction statement flow (Section 7) or for chaser actions — those produce documents/emails without a review step.

### 5.2 Modal structure

A single-pane modal (no sub-tabs). Layout from top to bottom:

1. **PDF preview** — inline rendered preview of the auto-generated application form using PDF.js or a comparable browser-side renderer. The preview reflects exactly what the investor will receive. Approximately 60% of the modal's vertical space.
2. **Recipient field** — single email address, pre-filled from `clients.email`, editable. The team can correct an out-of-date email or override for unusual cases.
3. **CC field** — multi-input (chips/pills) for additional email addresses, empty by default. Useful for adding the investor's accountant, advisor, or assistant.
4. **Footer actions** — Cancel (secondary) and "Send for signing" (primary, green).

There are no editable text fields beyond recipient and CC. Custom_terms, free-text clauses, and editable email body are explicitly NOT part of this design — see Section 11.2 for the rationale.

### 5.3 What "Send for signing" does

The primary button executes a synchronous flow (Section 11.4 has the full architectural detail):

1. Generate the PDF via the document generation service (Section 11)
2. Upload the PDF to Supabase Storage in the documents bucket (private)
3. Create a `documents` row with `template_version='applicationForm@x.y.z'`, `signing_status='pending'`, `recipient_email`, `cc_emails`
4. Create a Documenso signing envelope addressed to the recipient + CCs, **then distribute it**. These are two separate Documenso API calls — `POST /envelopes` (creates the envelope) followed by `POST /envelopes/{id}/send` (distributes it, triggering the email to the investor). If the distribute call fails after the envelope has been created, the document enters `created_not_sent` state — see Section 5.10.
5. Store the Documenso `envelope_id` on the document row
6. Update `deal_investors.lifecycle_status='app_form_sent'`
7. Write an audit log entry
8. Show a success toast and close the modal

If any step fails, the entire flow rolls back atomically — no document, no row, no envelope, no lifecycle change. The modal stays open with an error message and the user can retry.

### 5.4 Lifecycle and signing state

The lifecycle ladder for a deal_investor is unchanged: `confirmed → app_form_sent → signed → paid → complete`. The new architectural piece is **`documents.signing_status`** which tracks the granular signing state independently:

- `pending` — sent to Documenso, awaiting investor signature
- `signed` — investor has signed (set by webhook handler, see below)
- `declined` — investor declined to sign (rare)
- `cancelled` — envelope cancelled (e.g. document re-issued)

**`envelope.signed` webhook event — JunoOS:**
- Updates `documents.signing_status = 'signed'` and downloads the signed PDF
- Updates `deal_investors.lifecycle_status = 'signed'`
- Updates `deal_investors.signing_status = 'signed'` — the `deal_investors` table maintains its own `signing_status` field (the original pre-restructure field) in parallel with `documents.signing_status`. Both fields must be updated together by the webhook handler. They are denormalized representations of the same underlying fact.
- Writes an audit log entry

**`envelope.declined` webhook event — JunoOS:**
- Updates `documents.signing_status = 'declined'`
- Updates `deal_investors.signing_status = 'declined'`
- Does **NOT** change `deal_investors.lifecycle_status` — it stays at `app_form_sent`. The team follows up manually (re-issue, contact investor, or decline the investor).
- Writes an audit log entry

**`envelope.cancelled` webhook event — JunoOS:**
- Updates `documents.signing_status = 'cancelled'`
- Updates `deal_investors.signing_status = 'cancelled'`
- Does **NOT** change `deal_investors.lifecycle_status` — same pattern as declined. Manual team follow-up.
- Writes an audit log entry

`deal_investors.lifecycle_status='app_form_sent'` therefore means "Documenso envelope created and distributed, awaiting signature." `lifecycle_status='signed'` means "investor signed; document is final."

### 5.5 KYC informational reminder

When the modal opens and the investor's KYC is `outstanding` or `renewal_due`, an amber callout appears above the recipient field:

> ⚠ **KYC outstanding** — Consider sending a KYC request alongside the application form. KYC handling is currently outside JunoOS (see Future Work 14.4).

Does NOT block sending. Informational only.

### 5.6 Re-issue

If a deal_investor row needs the application form re-sent (fee changed, typo, investor request), the team uses the existing row "⋯" menu's re-issue action:

1. The previous document is marked `superseded=TRUE`
2. The Documenso envelope from the old document is cancelled (if Documenso supports this; otherwise left to expire)
3. A new PDF is generated with current data
4. A new Documenso envelope is created and sent
5. Investor receives a new email with the new envelope link
6. The old document remains in the documents tab as a superseded version

The old signed PDF (if signed) is preserved unchanged — the audit trail captures both versions.

### 5.7 Bank details requirement

The application form template includes the recipient bank details (where investors send funds — see Section 11.5 for how this is selected based on direct vs nominee-held investments). If the relevant bank details are missing, the modal blocks sending with an error:

> ⛔ **Bank details required.** Cyclr's bank details have not been added. Investors won't know where to send funds. Please add bank details in the company record before sending.

The "Send for signing" button is disabled until the relevant bank record (companies or nominees) has the required fields populated.

### 5.8 POA-held investments

POAs at Juno are deliberately scoped to **managing existing investments** and do NOT extend to **signing new application forms**. Clients always sign their own application forms. POA-held investments therefore go through Documenso normally — the investor receives the email and signs.

This is intentional: it preserves client comfort that Juno's authority is sensibly restricted, and ensures clients are always involved in the initial commitment to a new investment.

**[v3.5 note]** This decision is the canonical rule for Juno's POA scope. `TRANSACTION_WORKFLOW_SPEC.md` Section 7.6 previously stated the opposite (Juno signs on behalf of investors via POA) and has been corrected to reference this section.

### 5.9 Documenso configuration

JunoOS connects to Documenso via API key stored as a server-side environment variable (`DOCUMENSO_API_KEY`). The webhook URL is registered in Documenso pointing at `/api/webhooks/documenso`. Webhook signatures are validated.

The `/api/webhooks/` path **must be excluded from the Next.js middleware auth guard** — Documenso cannot present user credentials when calling webhooks, so any auth guard running on this path will block all incoming events. See Section 11 for the confirmed implementation pattern.

Free tier limitations should be reviewed before substantial use (envelope volume, branding on signing emails). See Section 11.7 for operational notes.

### 5.10 The `created_not_sent` partial-failure state

**[NEW IN v3.5]** The two-step Documenso send (envelope creation + distribution) creates a window where the first call can succeed and the second can fail. If this happens:

- The Documenso envelope exists but has not been distributed — the investor has not received an email
- The `documents` row is created with `signing_status='created_not_sent'`
- `deal_investors.signing_status` is set to `'created_not_sent'`
- `deal_investors.lifecycle_status` remains at `'app_form_sent'` (the row did advance — an envelope exists)

**Recovery:** the row "⋯" menu shows a **"Retry send"** action for rows in `created_not_sent` state. Clicking it re-attempts the distribute call against the existing envelope. If distribution succeeds, both `signing_status` fields are updated to `'pending'` and the flow proceeds normally. If it fails again, the action can be retried indefinitely until Documenso is reachable.

**Why not roll back?** Unlike a clean initial-send failure (where no envelope exists), rolling back a `created_not_sent` state would require cancelling the already-created Documenso envelope. The Retry path is simpler and safer than cancellation-then-recreate.

---

## 6. Closing tab

### 6.1 Definition

**Closing = the phase between signing and full completion.** An investor enters Closing when they reach `signed` (i.e. their application form has been received signed). They leave Closing when they reach `complete` (which happens via the Completion tab — see Section 7).

### 6.2 Active vs past rows

**Active rows (above divider, full opacity):**
- `lifecycle_status = 'signed'` (awaiting payment)
- `lifecycle_status = 'paid'` (paid, awaiting completion items — these are simultaneously active in the Completion tab)

**Past rows (below divider, ~45% opacity):**
- `lifecycle_status = 'complete'`

**Hidden:**
- Anyone not yet signed (still active in Bookbuild)
- Declined (only ever visible in Bookbuild)

Sort active rows by status priority (signed before paid), then within same status by `updated_at` ascending.

### 6.3 Bookbuild auto-lock derivation

**[NEW IN v3.3]** When all non-declined investors on the deal have reached `signed` or beyond, the Bookbuild tab auto-locks. This is a **derived state computed on read** — no stored flag.

Helper function (in `dealUtils.ts`):

```typescript
export function isBookbuildLocked(
  dealInvestors: Pick<DealInvestorFull, 'lifecycle_status'>[]
): boolean {
  const nonDeclined = dealInvestors.filter(di => di.lifecycle_status !== 'declined')
  if (nonDeclined.length === 0) return false
  return nonDeclined.every(di =>
    di.lifecycle_status === 'signed' ||
    di.lifecycle_status === 'paid' ||
    di.lifecycle_status === 'complete',
  )
}
```

When `isBookbuildLocked()` returns true:
- Bookbuild tab shows an info banner at the top: "Bookbuild auto-locked: all investors are signed or beyond. To add a late investor, go to the Closing tab and use '+ Add late addition'."
- Bookbuild's "+ Add investors" button is **disabled** with tooltip: "Bookbuild auto-locked — all investors signed. Use Closing tab's '+ Add late addition' for exceptions."
- All Next-step buttons in Bookbuild remain functional (someone in app_form_sent can still be marked signed via the existing flow)

When `isBookbuildLocked()` returns false:
- Bookbuild behaves normally; Closing tab's "+ Add investors" button mirrors Bookbuild's

### 6.4 Table columns

In order, left to right (13 columns):

1. Checkbox (28px wide, disabled for past rows)
2. **Client** — primary investor name + KYC indicator (🟢 verified / 🟡 renewal due / 🔴 outstanding). min-width 160px
3. **Vehicle** — `investing_vehicle_id` → "Own name" if NULL, otherwise vehicle's `full_name`
4. **Location** — `nominee_id` → "Direct" if NULL, otherwise nominee's `name`
5. **Confirmed (£)** — right-aligned, tabular numerals (no soft-circle column — irrelevant for Closing)
6. **Shares** — right-aligned, tabular numerals
7. **Fee (%)** — right-aligned, always shown (always with 🔒 since fee is locked at this stage); no override possible
8. **Status** — coloured badge (Signed / Paid / Complete)
9. **Days since signed** — calculated from `updated_at`. Format: "3 days" / "12 days". Amber styling if > 14 days for signed rows. Empty for paid/complete rows.
10. **POA** — purple "POA" badge if `poa_held = TRUE`
11. **EIS** — green "EIS" badge if `deal.eis_qualifying = 'yes'`
12. **Next step** — see Section 6.5
13. **Action ("⋯")** — see Section 6.7

### 6.5 Next step logic

| Status | Next step rendering | Action |
|---|---|---|
| signed, ≤ 10 days since updated_at | Italic grey "Awaiting payment" | (none — passive label) |
| signed, > 10 days since updated_at | Amber button "Send payment chaser" | Resets `updated_at` (clears 10-day chase timer); audit log entry with `action_type='send_payment_chaser'`, `is_mock=true` |
| paid | Italic grey "In Completion tab" | (none — completion happens in Completion tab) |
| complete | Italic grey "Complete" | (none — past row) |

The "Mark as paid" action is NOT in the Next step column. It lives in the row "⋯" menu (Section 6.7).

### 6.6 Mark payment received

When the user opens the "⋯" menu on a signed row and clicks "Mark payment as received":

1. A confirmation modal opens: **"Confirm cash received for [Investor name] (£X)?"** with Cancel / Confirm buttons
2. On Confirm:
   - Update row: `lifecycle_status = 'paid'`, `updated_at = NOW()`, `updated_by = current user`
   - Insert into `deal_action_logs`: `action_type='mark_paid'`, `is_mock=false` (real state change, no external send)
   - Toast: "[Investor name] marked as paid"
   - Modal closes; row re-renders

**No date entry, no amount entry, no bank reference, no notes.** Deliberate design — financial reconciliation lives in the team's bank statement, not in JunoOS. Audit trail captures *who* clicked *when*, which is sufficient for a high-trust internal workflow.

### 6.7 Row "⋯" menu

**For signed rows:**
- View investor record
- Edit deal details for this investor (amount only — fee is locked)
- Move backwards to app_form_sent — confirmation modal, on confirm sets `lifecycle_status='app_form_sent'`, audit log
- **Mark payment as received** — see Section 6.6

**For paid rows:**
- View investor record
- Edit deal details for this investor (amount only — fee is locked)
- Move backwards to signed — confirmation modal, on confirm sets `lifecycle_status='signed'`, audit log
- **Go to Completion tab** — navigates to `?tab=completion` (the actual Mark complete action lives there, see Section 7)

**For complete (past) rows:**
- View investor record
- Go to Completion tab
- Move backwards to paid — confirmation modal. Note: this does NOT auto-delete the `investments` row; orphans it for review. Audit log captures the move.

### 6.8 Toolbar

Same pattern as Bookbuild's toolbar (Section 4.8):

1. **Search input** — placeholder "Search investors, vehicles, or locations..."
2. **Status filter dropdown** — checkboxes for: Signed, Paid, Complete
3. **Vehicle filter dropdown** — same as Bookbuild
4. **"+ Add investors" / "+ Add late addition" button** — see Section 6.9

Filtering: substring search across client name, vehicle name, nominee name, POA holder name. Filters reset when navigating to a different deal.

Empty state: "No investors match your filters. [Clear filters]"

### 6.9 "+ Add investors" / "+ Add late addition" override

**[NEW IN v3.3]** The Closing tab toolbar always has an Add button, but its label and behaviour vary based on whether `isBookbuildLocked()` is true:

**When NOT locked (some investors still in Bookbuild stages):**
- Button label: **"+ Add investors"**
- Click: opens the standard Add Investors modal (same component as Bookbuild's, see Section 4.x)
- Investors added go to `lifecycle_status = 'soft_circled'` and appear in Bookbuild
- Identical behaviour to Bookbuild's add flow

**When locked (everyone is signed or beyond):**
- Button label: **"+ Add late addition"**
- Click: opens an extra confirmation FIRST: "Bookbuild is auto-locked because all investors are signed or beyond. Adding a late investor is an exception that should only be done with deliberate intent. Continue?"
- If user confirms: opens the same Add Investors modal as before
- Investors added still go to `lifecycle_status = 'soft_circled'` and appear in Bookbuild (their lifecycle proceeds normally from there)
- Audit log entry: `action_type='late_addition'`, with `details` JSONB capturing the deal's pre-add state for traceability

Late additions are exceptions, not a separate flow. They use the same lifecycle and modals as normal additions.

### 6.10 Bulk actions

Same pattern as Bookbuild (Section 4.9). When ≥1 row checked, sticky navy footer appears.

**For signed rows selected (all same status):**
- Primary action: "Mark as paid (N)" — opens bulk confirmation: "Confirm cash received for [N] selected investors (£X total)?" → on confirm, updates all rows + writes audit log per row

**For paid rows selected:**
- No bulk action available (Completion tab handles their progression)
- Footer can show: "These rows are managed in the Completion tab. [Go to Completion tab]"

**For mixed selections:**
- Primary action disabled; warning: "Selected rows have different statuses."

**For complete (past) rows:**
- Their checkboxes are disabled (consistent with Bookbuild's past rows)

---

## 7. Completion tab

### 7.1 Definition

**Completion = the phase after payment.** An investor enters the Completion tab when they reach `lifecycle_status = 'paid'`. They leave when marked `complete` — at which point a row is created in the `investments` table with the legal investment data.

### 7.2 Active vs past rows

**Active rows (above divider, full opacity):**
- `lifecycle_status = 'paid'` — paid investors with completion items still pending

**Past rows (below divider, ~45% opacity):**
- `lifecycle_status = 'complete'` — all completion items done, `investments` row created

**Hidden:**
- Anyone not yet paid (still active in Bookbuild or Closing)

### 7.3 The 5-item completion checklist

**[NEW IN v3.3]** Each row in the Completion tab has a per-investor checklist with 5 default items:

| # | Item | Notes |
|---|---|---|
| 1 | Share certificate filed | Physical or digital share cert exists in JunoOS |
| 2 | EIS3 certificate issued | **Auto-disabled** if `deal.eis_qualifying != 'yes'` (no EIS, no cert needed) |
| 3 | Transaction statement sent to investor | The formal "this is what you bought" doc, sent to investor |
| 4 | Investment record created | Auto-managed — created when row marked complete (Section 7.5) |
| 5 | Documents archived to OneDrive | Manual flag for now; auto-handled when OneDrive integration lands (Future Work 14.6) |

Each item per investor is **independently disable-able** by the team. For example, a non-EIS investment auto-disables item 2; an unusual investment might have item 5 manually disabled.

UI: checklist visible inline in the Completion tab row (or expandable side panel — design choice in build). Each item has an icon: ✓ done / ○ pending / ⌛ awaiting third party / — disabled.

### 7.4 Table columns

In order (12 columns):

1. Checkbox
2. **Client** — primary investor name + KYC indicator. min-width 160px
3. **Vehicle** — same as Closing (Section 6.4)
4. **Location** — same as Closing
5. **Confirmed (£)** — the amount that came in
6. **Shares** — calculated count
7. **Checklist progress** — visual bar e.g. "3 of 5" or icons inline (design choice)
8. **POA** — same as Closing
9. **EIS** — same as Closing
10. **Days since paid** — calculated from `updated_at`. Format: "5 days" / "21 days"
11. **Next step** — see Section 7.5
12. **Action ("⋯")** — see Section 7.7

### 7.5 Next step logic and Mark complete

| Active checklist items | Next step rendering |
|---|---|
| At least one item pending (excluding item 4) | Items shown inline; user ticks each as completed |
| All non-disabled items 1-3 and 5 ticked | Green button "Mark complete" enabled |
| All non-disabled items 1-5 ticked | Green button "Mark complete" enabled (functionally same as above — item 4 is auto-handled) |
| `lifecycle_status = 'complete'` (past row) | Italic grey "Complete" |

**Mark complete action — opens a modal:**

```
┌─────────────────────────────────────────────┐
│ Mark complete: [Investor name]              │
│                                             │
│ Confirm all checklist items are done.       │
│ ✓ Share certificate filed                   │
│ ✓ EIS3 certificate issued (or — if N/A)     │
│ ✓ Transaction statement sent                │
│ ✓ Documents archived                        │
│                                             │
│ ───────────────────────────────────────     │
│ Investment date (legal):                    │
│ [ DD / MM / YYYY ]                          │
│ The legal investment date for HMRC, share   │
│ register, and EIS3 purposes. Often the same │
│ as completion date for single-close rounds. │
│                                             │
│ Completion date (round close):              │
│ [ DD / MM / YYYY ]                          │
│ The date the whole funding round formally   │
│ closed. Same across all investors on this   │
│ deal (rolling closes are an exception).     │
│                                             │
│        [ Cancel ]  [ Mark complete ]        │
└─────────────────────────────────────────────┘
```

On Confirm:
1. **Create a row in `investments` table** with:
   - `deal_investor_id` = this row's id
   - `client_id`, `investing_vehicle_id`, `nominee_id` = from the deal_investors row
   - `amount` = `confirmed_amount`
   - `shares` = the deal_investors row's `shares` value
   - `share_class_id` / `share_class` = from the deal
   - `investment_date` = user-entered (per Section 7.5 modal — legal date)
   - `completion_date` = user-entered (per Section 7.5 modal — round close date)
   - `eis_qualifying` = inherited from deal at investment level (per spec — see 7.6)
2. **Update deal_investors row:** `lifecycle_status = 'complete'`, `updated_at = NOW()`, `updated_by = current user`
3. **Audit log:** `action_type='mark_complete'`, `is_mock=false`, `details` JSONB capturing the entered dates and the auto-disabled checklist items
4. **Toast:** "[Investor name] marked complete"
5. **Modal closes; row moves to past section (greyed below divider)**

**Important:** the Mark complete action is the ONLY way an `investments` row gets created. The investments table is the canonical record of completed investments — it doesn't exist in earlier states.

### 7.6 EIS at investment level

EIS qualifying is a **deal-level flag** (`deals.eis_qualifying`) but the EIS-qualifying status of each *individual* investment lives on the `investments` row (set when complete). This allows for the rare case where a deal has both EIS and non-EIS portions (e.g. EIS allowance exhausted partway through a raise) — though most deals don't.

For now (v1), the investment inherits the deal's EIS status at Mark complete time. Future Work 14.x may revisit this if needed.

### 7.7 Row "⋯" menu

**For paid (active) rows:**
- View investor record
- Edit deal details for this investor
- Toggle checklist items (each can be checked/unchecked manually outside the Mark complete flow)
- Disable/enable specific checklist items (e.g. "this investor doesn't need a transaction statement")
- Move backwards to signed — confirmation, on confirm reverts to `signed` (re-enters Closing tab as active, leaves Completion tab)
- Mark complete (same as Next step button — convenience)

**For complete (past) rows:**
- View investor record
- Move backwards to paid — confirmation. **Important:** this does NOT auto-delete the `investments` row. The orphaned investments row remains for audit; team can manually decide whether to delete it via direct database access, or live with the orphan.

### 7.8 The "Close the deal" action

**[NEW IN v3.3]** Once **all active (non-declined) investors are marked complete**, a prominent button appears at the top of the Completion tab: **"Close the deal"**.

- Disabled and greyed out until all active investors are complete
- When enabled, click opens confirmation modal: "All investors are complete. Mark this deal as closed?"
- On confirm:
  - Update `deals.status = 'complete'`
  - Audit log: `action_type='close_deal'`, `is_mock=false`
  - Toast: "Deal closed"
  - Deal becomes read-only across all tabs (no more state changes possible without explicit re-open)

**This is the deliberate end-of-deal moment.** Until clicked, the deal remains in a "ready to close" state where last-minute changes are still possible.

### 7.9 Manual signature upload (legacy reference)

Note: "Mark as signed (manual upload)" lives in the Bookbuild "⋯" menu (Section 4.7), not Completion. Reference here for completeness — it handles hand-signed forms posted back, uploads the PDF, marks status `signed`. Audit log: `action_type='manual_signature_upload'`.

### 7.10 Bulk upload (deferred)

Bulk upload of share certs / EIS3 certs (e.g. when HMRC sends a batch of EIS3s for an entire deal) is deferred. v1 is per-investor manual upload. Bulk AI matching deferred to Future Work 14.5.

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

In v1, M365 / Xero integrations NOT wired. But buttons that will trigger them are real components. Documenso is now fully wired (Stage 6b, 11 May 2026) — see Section 11 (Document Generation Architecture) below for detail.

### 11.2 Mock-button behaviour

When clicked:
1. Logs intended action in `deal_action_logs` with `is_mock = true`
2. Shows toast notification:
   - "Email drafted in Outlook — coming soon" (M365)
   - "Invoice queued for Xero — coming soon" (Xero)
3. Updates UI state as if action succeeded (status moves forward)

### 11.3 Mock-action banner

Rows where most recent mock action is unresolved show small amber banner above Next step column:

> ⚠ Mock action — actual email/integration not sent.

Banner appears because `deal_action_logs` query for that row returns `is_mock = true` for the most recent matching action_type. When integrations go live and a real action fires (`is_mock = false`), the banner clears.

### 11.4 Buttons affected

**Mock buttons:**
- Send chaser
- Send payment chaser
- Send to Xero

**Not mock (real integrations or manual flips):**
- Send application form → (real Documenso integration — Stage 6b)
- Mark payment received
- Mark as paid
- Mark as signed (manual upload) — real upload, no mock

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

**Note:** The "Send application form →" button was initially built as a mock in Stage 3b (writing to `deal_action_logs` with `is_mock=true`). It was replaced with the real Documenso integration in Stage 6b (merged 11 May 2026).

### Stage 4 — Closing and Completion tabs (4-5 days)

- Closing: active/past split, cash received marking with 5-sec undo toast (new richer pattern than existing toast)
- Completion: 4-item checklist rows, icon states
- Backwards steps: confirmation modal, audit log writes
- Manual signature upload flow

### Stage 5 — Documents and Invoices tabs (3-4 days)

- Documents: three view groupings, Final-only/All-docs filter, superseded badges, manual upload
- Invoices: auto-draft on confirmation trigger, table with override indicators, mock "Send to Xero", "Mark as paid" with undo toast
- Mock-action banner on relevant rows

### Stage 6 — Document generation and Documenso integration

- **Stage 6a — Merged 7 May 2026.** Service infrastructure: React-pdf, per-domain context, immutable PDFs in private Supabase Storage, template versioning, type-safe API.
- **Stage 6b — Merged 11 May 2026.** Application form template (`applicationForm@1.1.0`), Review-before-send modal (Section 5), Documenso integration, webhook handlers for signed/declined/cancelled events.
- **Stage 6c — Merged 12 May 2026.** Transaction statement template (`transactionStatement@1.0.0`), manual generation from Completion tab row menu, manual mark-as-sent action, regeneration with supersedure of prior statements. Generation-only — no signing, no email send. See Section 11 for architectural detail and the `sanitiseStorageKey()` pattern.
- **Stage 6d** — Client-section proof-of-concept: not yet designed.

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
- **App form sent** — application form emailed to investor for signature (envelope created and distributed via Documenso)
- **created_not_sent** — partial failure state: Documenso envelope created but distribution (send) failed; recoverable via Retry send action
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
- **Nil UUID** — `00000000-0000-0000-0000-000000000000`, used as `actioned_by` sentinel for webhook-triggered audit log entries where there is no human actor

---

## 14. Future work registry

### 14.1 Sell deal page redesign

The new tabbed page applies to buy deals only. Sell deals continue using existing implementation.

A future project will redesign the sell deal page using the same tabbed pattern, adapted for sell-specific flow: FIFO lot matching, deferred consideration, tranche schedules, and statuses (selling / not selling / undecided).

**[UPDATED IN v3.2]** When the sell deal redesign happens, it should inherit the **Client / Vehicle / Location three-dimensional model** documented in Section 4.3. The model applies identically to sells: the seller has a client (relationship-holder), a vehicle (legal entity actually selling — own name or vehicle), and a location (where the shares are currently held — direct or nominee). FIFO lot matching needs to respect the Vehicle dimension (Bob's own-name shares are a separate lot from Bob's vehicle's shares) and may need to respect Location too if shares were originally bought via different nominees.

The sell deal table should have similar three-column structure for the seller identity, plus sell-specific columns (proceeds, current holding, FIFO lot mapping, etc.).

**Trigger to start:** when sell deal volume justifies the work, or inconsistency between buy/sell becomes painful.

**[NEW IN v3]** Note: 16 sell deals exist as test data. Both routes will coexist immediately.

### 14.2 Application form PDF generation — CLOSED, MOVED TO STAGE 6b

**[CLOSED IN v3.4 — 7 May 2026]** This was originally a Future Work item describing the eventual replacement of PandaDoc with in-house PDF generation. Now superseded:

- Stage 6a (merged 7 May 2026) built the document generation infrastructure (React-pdf, per-domain context fetcher, immutable PDFs in private Supabase Storage, template versioning).
- Stage 6b (merged 11 May 2026) implemented the real application form template (`applicationForm@1.1.0`), the Review-before-send modal (Section 5), and Documenso integration for e-signature.

The architectural pattern is documented in the Stage 6 section below. This entry is retained as a CLOSED Future Work item rather than removed entirely, so that future readers can trace how the design evolved.

### 14.3 M365 / Xero integrations (Documenso now live)

**[UPDATED IN v3.5]**

**Documenso — DONE (11 May 2026).** Application form e-signature via Documenso is live as of Stage 6b. Webhook handlers for signed/declined/cancelled events are implemented. See Section 11 for architectural detail.

Still pending:
- **Microsoft 365 Graph API** — email drafting for chasers and deal-related correspondence. Application form delivery is currently handled by Documenso directly (investor receives the Documenso signature email). M365 integration would add team-initiated emails: payment chasers, ad hoc correspondence. Mock buttons for these remain in place.
- **Xero API for invoice push** — manual paid status remains; permanent decision per Section 9.5.

**Trigger:** when the deal page is live and team is ready for the remaining integrations.

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

### 14.13 Rolling-close UX

**[NEW IN v3.3]** The Mark complete modal (Section 7.5) asks for `investment_date` and `completion_date` per investor. For most deals (single-close rounds) these are the same date and entering them per-investor is repetitive. For rolling closes, they genuinely differ per investor.

A future enhancement: at the deal level, allow setting a default `completion_date` once. When marking individual investors complete, the modal pre-fills `completion_date` from the deal-level default — only the per-investor `investment_date` differs.

For rolling closes specifically, the team can override the pre-fill and enter different dates per investor.

**Trigger to start:** when rolling closes become common enough to feel the friction. Until then, repeated manual entry of the same date is acceptable.

### 14.14 Share class onboarding workflow

**[NEW IN v3.3]** When and how should share classes be set up for a portfolio company? The current platform has no enforced moment. Share classes can be created any time via the company record page, but there's no requirement to set them up before a deal is created or before investments are completed.

This surfaced as a real issue during Stage 4b testing: the Cyclr test deal initially had no share class FK because Cyclr had no rows in `company_share_classes`. The deal record fell back to free-text (`deals.share_class = 'Ordinary'`) with a NULL `share_class_id`. When Mark complete fired and created the first `investments` row, that row also got a free-text label and NULL FK — creating fragile string-match-only linkage rather than the canonical FK relationship the schema is designed for. Manual cleanup was required to retroactively create the share class record and backfill both `deals.share_class_id` and `investments.share_class_id`.

A robust workflow should probably enforce setup at one of three points:
- **Pre-onboarding:** when a company is first added to JunoOS, all known share classes are required as part of the company setup wizard
- **Pre-deal:** when a new deal is created, the wizard requires either picking an existing share class or creating a new one inline
- **Pre-completion:** Mark complete blocks (or warns prominently) if the deal lacks a `share_class_id` FK

Probably a hybrid — pre-onboarding for the typical case, pre-deal for new classes that emerge from a specific funding round, and pre-completion as a safety net.

**Why it matters:** clean share class FK linkage is essential for valuation tracking (a single valuation update needs to know which share class it applies to — text matching is fragile, especially with class names like "Ordinary" that recur across many companies). It also matters for share-class-level analytics, EIS qualifying status validation, and any future work involving cap-table integrity.

**Trigger to start:** when valuation tracking is being designed (Phase D Reports), since clean share class linkage is essential for that to work properly. Or earlier if a real portfolio company gets onboarded and data hygiene becomes important.

### 14.15 Share certificate one-to-many model

**[NEW IN v3.3]** Share certificates are uploaded manually by the team (PDFs received from the company's registrar) and represent share ownership at the legal share-register level. Unlike most documents in JunoOS (application forms, EIS3 certificates, transaction statements — each tied to a single investor), **a share certificate can represent multiple investors simultaneously.** For example, a certificate issued to "City Partnership Nominees Ltd" might cover the underlying holdings of 5 different investors who all hold via that nominee.

The current `documents` table cannot represent this: it has a single `client_id` and `deal_investor_id` column, forcing a one-to-one relationship. Additionally, the `documents.type` constraint does not currently include `share_certificate` as a valid value — a smaller schema gap that confirms share certificates were never properly modelled in v1.

**A proper share certificate model needs:**
- A new `share_certificates` table (or extension of `documents` with a flag) storing the certificate-level metadata (PDF, issue date, certificate number, holder name as printed)
- A junction table — perhaps `share_certificate_investments` — linking one certificate to many `investments` rows
- An upload UI that lets the team multi-select investors when uploading a certificate
- A view UI that shows "covered investors" alongside the certificate, with the ability to drill into each underlying investment
- The Completion tab's "Share certificate filed" checklist item (Section 7.3) needs revisiting once this model exists — checking the box per investor should derive from whether that investor's investment has any covering share certificate, rather than being a free-standing flag

**Why deferred:** the design needs care. Registrar conventions vary, certificate numbering schemes vary, partial coverage cases exist (e.g. one investor's holding is split across two certs because of fractional rounding rules), and the relationship between certificates and the holding structure (own name vs vehicle vs nominee) needs explicit thought. Stage 5a (Documents tab) handles only the one-to-one document types (`application_form`, `eis_certificate`, `transaction_statement`, `investment_agreement`). Share certificates are intentionally excluded.

**Trigger to start:** when real share certificates start being received from registrars and the team needs to file them. Before then, manual filing in OneDrive folders is the workaround.

### 14.16 Deprecate `InvestmentCockpit` and legacy `statementGenerator.ts`

**[NEW IN v3.6]** Stage 6c left in place a legacy jsPDF-based statement generator at `src/lib/services/statementGenerator.ts`. It is no longer the platform's primary path for generating transaction statements (that is now `src/services/document-generation/templates/transactionStatement.tsx` via the React-pdf pipeline), but it is still imported by `InvestmentCockpit.tsx` and therefore still in production code. The file carries a `LEGACY` marker comment so developers know not to add to it.

Removal is a single PR: delete the legacy generator, remove the `InvestmentCockpit.tsx` import, and replace whatever still calls into it. This was deferred because the cleaner moment is when `InvestmentCockpit` itself is deprecated or replaced, rather than as a one-off file removal that leaves a dangling component.

**Trigger to start:** whenever `InvestmentCockpit` is next touched substantively, or as a small housekeeping PR if 6 months pass without that happening.

### 14.17 Platform-wide storage key sanitisation policy

**[NEW IN v3.6]** Stage 6c discovered (the hard way, at runtime, ~1 hour after merge) that Supabase Storage rejects em dashes and certain other Unicode characters in object keys. The fix was `sanitiseStorageKey()` in `src/services/document-generation/storage.ts`, applied at the upload site for transaction statements. The pattern is documented in Section 11.

The open question is whether to **enforce** this across the platform rather than relying on developers to remember to apply it. Options:

- **Lint rule** — a custom ESLint rule that flags any direct call to `supabase.storage.from(...).upload(...)` whose path argument hasn't passed through `sanitiseStorageKey()`. Catches the issue at development time.
- **Typed wrapper** — a `uploadDocument()` helper that always sanitises its path argument internally, and use of the raw Supabase Storage client is discouraged via a code-review convention. Catches the issue by construction.
- **Status quo** — convention-only, documented in `AGENTS.md` and Section 11. Cheap but relies on memory.

The wider list of forbidden characters beyond em dash also needs codifying — the current `sanitiseStorageKey()` may not catch every edge case. Worth a short audit when this work happens.

**Trigger to start:** when the next new document type (engagement letter / EIS certificate / exit statement) is being scoped — gives a natural point to lift the pattern from a one-off helper into a platform-wide policy. Or sooner if a second instance of the same Storage key bug bites in production.

### 14.18 Reconcile Stage 6c divergence from generic document registry

**[NEW IN v3.6]** Stage 6a (merged 7 May 2026) established a generic document generation pipeline: a `ContextMap` type, a `generateDocument<T>()` entry point, per-template context fetchers. Stage 6b (application forms) used this pipeline.

Stage 6c deliberately did **not** use it. `TransactionDocumentContext` sits outside `ContextMap`; there is a dedicated `generateTransactionStatement()` function with its own data-fetching path. A comment in `types.ts` documents this as intentional. The reason given at the time: transaction statements are lightweight, generation-only, read from `investments` rather than `deal_investors`, and don't fit the pipeline's signing/envelope concerns cleanly.

This leaves the platform with **two parallel pipelines** for document generation. That is fine if it's the deliberate pattern — "use the registry for documents that need signing and complex context; use the dedicated path for generation-only documents with simple context." But it should be a settled architectural choice, not an accident.

**Decision needed:** either (a) write the divergence up as the deliberate pattern and document the rule for which path new document types take, or (b) refactor Stage 6c to fit the registry, accepting that the registry types need to flex slightly to accommodate context types that don't need signing fields.

**Trigger to start:** when Stage 6d (or any subsequent new document type) is being scoped — the question of "which pipeline does this go in" forces the decision. Before then, the current state is liveable.

---

## Stage 6 — Document Generation Architecture (settled 7 May 2026; Stage 6c merged 12 May 2026)

**[REWRITTEN IN v3.4; UPDATED IN v3.5 AND v3.6]** This section captures the architectural design for the platform's document generation system. Originally framed as a deal-page-only "Edit-before-send modal" feature, Stage 6 was re-scoped on 6 May 2026 to be reusable infrastructure consumed by deal, client, and portfolio sections. Stage 6a (the service layer) merged 7 May 2026. Stage 6b (application forms — first real consumer) merged 11 May 2026. Stage 6c (transaction statements — generation-only) merged 12 May 2026. Stage 6d (client-section proof-of-concept) follows.

### Stage 6 build series

| Stage | Scope | Status |
|---|---|---|
| **6a** | Service infrastructure: React-pdf, per-domain context, immutable PDFs in private Supabase Storage, template versioning, type-safe API. | **Merged 7 May 2026** |
| **6b** | Application form: real template (`applicationForm@1.1.0`), Review-before-send modal (Section 5), Documenso integration, webhook handlers for signed/declined/cancelled events. | **Merged 11 May 2026** |
| **6c** | Transaction statement: real template (`transactionStatement@1.0.0`), generation-only flow (no edit, no signing, no email send), manual trigger from Completion tab row ⋯ menu, regeneration with supersedure of prior statements. | **Merged 12 May 2026** |
| **6d** | Client-section proof-of-concept: 1-2 client-domain document templates (e.g. engagement letter, welcome pack) demonstrating the infrastructure works for non-deal entities. | Not yet designed. |

### Stage 6a — what was built (reference)

The document generation service lives at `/src/services/document-generation/`. Its public API:

```typescript
async function generateDocument<T extends TemplateId>(
  templateId: T,
  context: ContextFor<T>,
  options?: GenerationOptions
): Promise<GenerationResult>
```

Internally:
1. Looks up the template in `templateRegistry`
2. Fetches the appropriate domain context (currently only `DealDocumentContext` is implemented; client/portfolio contexts deferred to 6d onwards)
3. Renders the React-pdf template component to a PDF buffer
4. Uploads to the private `documents` bucket in Supabase Storage at `deals/{deal_id}/{filename}.pdf`
5. Inserts a `documents` row with `template_version='templateId@x.y.z'`, `version=1`, `superseded=false`
6. Returns `{ documentId, storageUrl, templateVersion, pdfBuffer }`

Key design decisions locked in 6a:
- **Template format:** React components using `@react-pdf/renderer` — `.tsx` files in `/src/services/document-generation/templates/`
- **Merge fields:** Standard JSX expressions (no separate templating language)
- **Storage:** Code-only. Templates committed to repo; changes via Git + code review + deploy. No admin UI for editing templates.
- **Versioning:** Documents are immutable PDFs once generated. Old documents NEVER regenerate when a template changes. New template version produces new documents; old documents reflect what was sent at the time.
- **Data fetching:** Per-domain contexts. Each template declares which context it needs; service fetches the whole context once (DealDocumentContext, ClientDocumentContext, etc.).
- **Migration applied (Stage 6a):** `documents.template_version TEXT NULL`
- **Storage policies (Stage 6a):** Bucket changed from public to private; permissive policies removed; replaced with strict authenticated-only read and upload policies scoped to the documents bucket.

### Stage 6b — what was built (reference)

The first real consumer of the infrastructure. Replaces Stage 3b's "Send application form" mock button with a real flow.

**Flow:**

1. User clicks "Send application form" on a Bookbuild row
2. The Review-before-send modal opens (Section 5)
3. PDF preview rendered inline
4. User reviews recipient email (pre-filled from `clients.email`, editable) and CC list (empty by default)
5. User clicks "Send for signing"
6. Synchronous flow (full rollback on any failure):
   - Generate PDF via `generateDocument('applicationForm', { dealInvestorId })`
   - Upload to Storage; create `documents` row with `signing_status='pending'`, `recipient_email`, `cc_emails`
   - Create Documenso envelope (`POST /envelopes`), then distribute it (`POST /envelopes/{id}/send`). If distribute fails, document enters `created_not_sent` state with retry path (Section 5.10).
   - Store `documenso_envelope_id` on the document row
   - Update `deal_investors.lifecycle_status='app_form_sent'`
   - Audit log entry
7. Documenso emails the investor; investor signs; Documenso fires webhook
8. JunoOS webhook handler updates `documents.signing_status='signed'`, downloads signed PDF, updates both `deal_investors.lifecycle_status='signed'` and `deal_investors.signing_status='signed'`, writes audit log

**Key design decisions confirmed at build:**

- **No editable content per investor.** Application forms are fully derived from data. Per-investor variation comes from existing data fields (e.g. `deal_investors.fee_pct` for fee overrides), not from edit-before-send custom fields.
- **Modal is review-only.** PDF preview + recipient email + CC list. No editable text fields beyond email addresses.
- **POA does not extend to app form signing.** Clients always sign their own application forms via Documenso, including for POA-held investments. See Section 5.8.
- **Documenso for e-signature.** Free tier signed up; integration via API key + webhook. JunoOS does not counter-sign — investor signs alone.
- **Bank details on application form.** Selected conditionally based on `deal_investors.nominee_id`:
  - If `nominee_id IS NULL` (Direct): use `companies.bank_*`
  - If `nominee_id IS NOT NULL` (via nominee): use `nominees.bank_*`
- **Bank details required.** Sending is blocked if the relevant bank details (companies or nominees) aren't populated.
- **Reference format:** Hard-coded as `JUNO-{client_surname}` in the template. Juno-wide convention.
- **Synchronous send with full rollback.** If any step before "distribute" fails, no document, no row, no envelope, no lifecycle change. Modal stays open for retry.
- **Re-issue:** Old document marked `superseded=TRUE`, old Documenso envelope cancelled (if API supports), new PDF generated, new envelope created, investor receives new email.
- **Template version in production:** `applicationForm@1.1.0`. The initial build (`applicationForm@1.0.0`) was immediately restructured to a professional layout (new page order, header, footer with page numbers, improved fee-line rendering). `applicationForm@1.1.0` is the current production version.
- **Webhook auth path exception:** `/api/webhooks/` is excluded from the Next.js middleware auth guard. Documenso cannot present user credentials, so the path must be auth-exempt. Future webhook endpoints must follow this pattern — add the path to the auth guard's exclusion matcher.
- **Webhook actor pattern:** Webhook-triggered `deal_action_logs` entries use the nil UUID (`00000000-0000-0000-0000-000000000000`) as `actioned_by`. This is the canonical sentinel for automated events with no human actor. The value is recognisable as non-human and does not collide with real user UUIDs. Future webhook handlers must follow this pattern. The `metadata` JSONB on the log entry should record relevant event identifiers (e.g. `documenso_id`) for traceability.
- **Idempotent signed PDF upload:** The `handleCompletedEvent` webhook handler guards against duplicate signed PDF uploads if Documenso retries the webhook. If the document is already `signing_status='signed'` when the handler fires a second time, the upload and status updates are skipped. This prevents duplicate documents and inconsistent state.
- **Webhook `signing_status` dual-field update:** Webhook handlers update **both** `documents.signing_status` and `deal_investors.signing_status`. The `deal_investors` table retains its original `signing_status` field as a denormalized convenience field kept in sync by webhook handlers. Both fields must always be updated together. For `envelope.signed`: both set to `'signed'`. For `envelope.declined`/`envelope.cancelled`: both set accordingly, but `deal_investors.lifecycle_status` is NOT changed (manual team follow-up).

**Pre-build migrations (Stage 6b, applied 7–8 May 2026):**

```sql
-- Bank details on companies and nominees
ALTER TABLE companies ADD COLUMN bank_account_name TEXT, ADD COLUMN bank_sort_code TEXT, ADD COLUMN bank_account_number TEXT, ADD COLUMN bank_iban TEXT, ADD COLUMN bank_swift_bic TEXT;
ALTER TABLE nominees ADD COLUMN bank_account_name TEXT, ADD COLUMN bank_sort_code TEXT, ADD COLUMN bank_account_number TEXT, ADD COLUMN bank_iban TEXT, ADD COLUMN bank_swift_bic TEXT;

-- Document signing fields
ALTER TABLE documents ADD COLUMN signing_status TEXT, ADD COLUMN documenso_envelope_id TEXT, ADD COLUMN recipient_email TEXT, ADD COLUMN cc_emails TEXT[];
```

### Stage 6c — transaction statement (merged 12 May 2026)

**[NEW IN v3.6 — replaces previous "not yet designed" stub]**

Stage 6c built the transaction statement template (`transactionStatement@1.0.0`) and its surrounding generation flow. Smaller scope than 6b — generation-only, no signing, no email send. PDF is generated to Supabase Storage; the team delivers it to the investor manually.

**Trigger.** Manual, not automatic. The user clicks "Generate transaction statement" from the row ⋯ menu on a Completion tab row. Two preconditions gate the menu item:

- `deal_investors.lifecycle_status = 'complete'`
- `investments.eis_status` is not `'tbc'` (EIS outcome must be confirmed as yes or no before a statement can be issued)

A separate "Mark as sent" action — also in the row ⋯ menu — is a second manual step the team takes after sending the PDF to the investor by email. It sets `completion_checklist.transaction_statement_sent = true` and writes an audit log entry. The corresponding checklist pill on the Completion tab is rendered as a read-only `<span>` rather than a toggle: it can only be flipped via the "Mark as sent" menu action, not via the standard checklist toggle pattern used elsewhere.

**Storage and database linkage.**

PDF is stored in the existing private `documents` bucket. Path pattern: `deals/{deal_id}/transaction-statements/{storageKey}`. The `documents` row carries:

- `type = 'transaction_statement'`
- `deal_id`, `client_id`, `deal_investor_id` (all three FKs populated)
- `filename` — human-facing display name (em-dashed)
- `storage_url` — the sanitised storage key path
- `template_version = 'transactionStatement@1.0.0'`
- `superseded = false`
- Signing-related columns (`signing_status`, `documenso_envelope_id`, `recipient_email`, `cc_emails`) are **NULL** — this document type is generation-only

**File naming (two separate forms).**

The two forms exist because Supabase Storage rejects certain characters (notably em dashes) in object keys, but the human-facing filename should still use em dashes as separators for readability.

| | Pattern | Example |
|---|---|---|
| **Human-facing** (stored in `documents.filename`) | `YYYY-MM-DD — Investor — Company — Transaction Statement.pdf` | `2026-05-12 — Bob Smith — Acme Ltd — Transaction Statement.pdf` |
| **Storage key** (stored in `documents.storage_url`) | Sanitised — em/en dashes → hyphens, spaces → underscores, non-word chars stripped | `2026-05-12-Bob_Smith-Acme_Ltd-Transaction_Statement.pdf` |

The `sanitiseStorageKey()` helper lives in `src/services/document-generation/storage.ts`. See platform-wide note below — this pattern applies to every document type going forward.

**Regeneration and supersedure.**

If a transaction statement needs regenerating (e.g. an EIS status correction after the original was issued), generating a new statement marks any prior non-superseded statement for the same `(deal_id, client_id)` as `superseded = true`, sets `superseded_at` and `superseded_by_id`, and renames the old file in storage with a `_superseded_YYYYMMDD-HHMMSS` suffix. The storage rename is best-effort: if it fails, the DB row is still marked superseded at the original path. The new statement is uploaded fresh under its own filename.

**Deliberate divergences from the v3.5 stub.**

The v3.5 stub described the eventual implementation. The actual build diverged in several intentional ways, captured here so future readers understand why the live code does not look like the original sketch:

- **Trigger:** stub said "generated when an investor reaches complete status" (implying automatic). Built as fully manual — generate and mark-as-sent are both discrete row menu actions.
- **Integration point:** stub said "wired into Mark complete." It was not. Generation sits alongside Mark complete but is independent of it. Mark complete does not generate a statement.
- **Generation pipeline:** the implementation does **not** use the generic `generateDocument<T>()` registry pipeline from Stage 6a. `TransactionDocumentContext` is explicitly outside the `ContextMap` type, and there is a dedicated `generateTransactionStatement()` function with its own data-fetching path (reading from `investments`, not from the generic `DealDocumentContext`). A comment in `types.ts` documents this as intentional. The decision to either accept this as the pattern for "lightweight" generation-only document types, or refactor it back into the registry, is open (see Future Work 14.18).

**Legacy code retained.**

The legacy `src/lib/services/statementGenerator.ts` (jsPDF-based) was not deleted in this stage. It is still imported by `InvestmentCockpit.tsx` and carries a `LEGACY` marker comment. Removal is deferred to the PR that deprecates `InvestmentCockpit` (see Future Work 14.16).

**Post-merge fixes (all in production).**

| Commit | Date | Fix |
|---|---|---|
| `04be2d6` | 12 May 2026 (~1 hour post-merge) | **Em dash sanitisation in Storage keys.** Every upload was failing because Supabase Storage rejects em dashes in object keys. Added `sanitiseStorageKey()` and threaded it through the upload path. Display filename unchanged; only the storage path uses the sanitised form. |
| `e8001ae` | 12 May 2026 | **Transaction statement menu section visibility.** Generate and Mark as sent items were incorrectly nested inside the `if (status === 'paid')` block, so they never appeared for `complete` rows (the primary use case). Extracted into `if (status === 'paid' \|\| status === 'complete')`. |

### Platform-wide note: Supabase Storage key sanitisation

**[NEW IN v3.6]**

Stage 6c surfaced a Supabase Storage constraint that applies platform-wide: certain characters that are perfectly legal in filenames are rejected when used in storage object keys. The most common offender is the em dash (U+2014), which the platform uses as a separator in human-facing filenames following the convention `YYYY-MM-DD — [Document type] — [Optional descriptor].pdf`.

**The rule:** every document upload to Supabase Storage must pass its filename through `sanitiseStorageKey()` (in `src/services/document-generation/storage.ts`) before constructing the storage path. The `documents` table retains two columns:

- `filename` — the human-facing display name, with em dashes preserved (this is what users see in download UI, what gets used as the email attachment name)
- `storage_url` — the sanitised storage key path (this is the actual Supabase Storage location)

Future document types (engagement letters, EIS certificates, exit statements, etc.) must follow this pattern from the start, not discover it the hard way as Stage 6c did. See Future Work 14.17 for the open question of whether to enforce this via a typed wrapper around the Storage client.

### Stage 6d — client-section proof-of-concept (not yet designed)

When client-section work begins, Stage 6d builds 1-2 client-domain document templates (e.g. engagement letter, welcome pack) to prove the infrastructure works for non-deal entities. Will require building a `ClientDocumentContext` and `fetchClientContext` alongside the templates.

Trigger: client-section work scheduled within 2-3 weeks of Phase A completion.

### Open items

- Documenso free tier limits not yet verified for production volumes (envelope volume, branding on signing emails) — verify before substantial use
- Stage 6d full design deferred until client-section work begins

---

## 15. Version history

- **v3.6 (15 May 2026)** — Stage 6c reconciliation. Transaction statement template `transactionStatement@1.0.0` documented as built (merged 12 May 2026). Manual trigger from Completion tab row menu, regeneration with supersedure logic, dedicated generation pipeline outside the generic `ContextMap` registry. Two-form filename pattern (em-dashed display name + sanitised storage key) documented. Em dash sanitisation in Supabase Storage keys lifted to platform-wide guidance. Three new Future Work items: 14.16 (deprecate `InvestmentCockpit` and legacy `statementGenerator.ts`), 14.17 (platform-wide storage key sanitisation policy), 14.18 (reconcile Stage 6c divergence from the generic document registry).
- **v3.5 (12 May 2026)** — Stage 6b reconciliation. Documenso integration documented as built. Application form template `applicationForm@1.1.0` in production. Webhook patterns (auth path exception, nil UUID actor, idempotency, dual signing_status update) documented. `created_not_sent` partial-failure state documented. POA-signing contradiction with `TRANSACTION_WORKFLOW_SPEC.md` flagged and corrected in that file.
- **v3.4 (7 May 2026)** — Stage 6b designed. Review-before-send modal fully rewritten. Documenso integration designed end-to-end. Bank details fields added to companies and nominees. Stage 6 architectural design section added.
- **v3.3** — Bookbuild auto-lock, 5-item completion checklist, Mark complete modal, Close the deal action, rolling-close UX, share certificate one-to-many model, share class onboarding workflow.
- **v3.2** — Three-dimensional investor identity model (Client / Vehicle / Location). Bookbuild table expanded to 13 columns.
- **v3.1** — deal_investors unique constraint correction.
- **v3** — Full Supabase schema inspection. All v2 assumptions verified or corrected. Migration plan tightened.

---

*End of specification v3.6.*
