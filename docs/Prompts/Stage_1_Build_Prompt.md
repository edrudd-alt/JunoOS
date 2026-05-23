*Historical reference. Terminology updated in Sub-stage B of the Entity Model Cleanup (PR #19, May 2026): Client → Lead investor, Vehicle → Beneficial owner, Location → Legal owner. The `entity_type`, `fund_type`, and `active_fund_type` columns on the `clients` table were removed in Sub-stage A. See the current platform spec for live terminology and schema.*

# Prompt for Claude Code — Stage 1: Foundation Migration

Copy and paste the text between the `===PROMPT START===` and `===PROMPT END===` lines into Claude Code. The spec file (`Juno_Deal_Page_Restructure_Spec_v3.md`) should already be saved in the repo at `/docs/`.

---

===PROMPT START===

I want to start Stage 1 of the deal page restructure. This is the foundation migration only — no code changes, no UI changes. Just database schema additions.

## Documents to read

Read these in order before doing anything:

1. `/docs/Juno_Deal_Page_Restructure_Spec_v3.md` — the canonical spec, end to end
2. `/docs/Deal_Page_Restructure_Decision_Log.md` — the why (note: Section 8.3's Xero polling reference is superseded by spec Section 9.5 — manual only)
3. The relevant section of `CLAUDE.md` covering the two-query Supabase pattern and any other rules

## What you're doing

Stage 1 (per spec Section 12 and Section 3.9). The whole stage is a single coherent migration plus a data wipe of transactional tables. After this stage, the platform should look and behave identically to today — only the database schema is changed (additively).

## Your task, in order

### Step 1 — Verify the live schema matches what v3 assumes

Use the Supabase MCP (which you've just connected to) to verify the current state of:

- `deal_investors` columns (v3 assumes: id, deal_id, client_id, amount, poa_held, signing_status, created_at — and nothing else)
- `documents` columns (v3 assumes: no version, no superseded, no deal_investor_id)
- `invoices` columns (v3 assumes: no deal_investor_id, no issued_at)
- Whether `deal_investors` has any unique constraint (v3 assumes: none)
- Whether `deal_action_logs` exists (v3 assumes: doesn't)

If anything differs from what v3 assumes, STOP and report the discrepancies. Don't proceed until the spec and the database agree.

### Step 2 — Propose the Stage 1 migration

Write a single migration SQL covering everything in spec Section 3.9. The migration should be additive — no DROP statements, no destructive changes. Specifically:

1. Add `lifecycle_status`, `soft_circle_amount`, `confirmed_amount`, `shares`, `investing_vehicle_id`, `updated_at`, `updated_by` to `deal_investors` (per Section 3.1)
2. Add fee fields to `deal_investors` (per Section 3.2)
3. Add an `updated_at` trigger on `deal_investors`
4. Add unique constraint `(deal_id, client_id, investing_vehicle_id)` on `deal_investors` (per Section 3.7)
5. Add versioning fields and `deal_investor_id` to `documents` (per Section 3.3)
6. Add `deal_investor_id` and `issued_at` to `invoices` (per Sections 3.6 and 3.8)
7. Create `deal_action_logs` table with indexes (per Section 3.4)

Plus the data wipe step from spec Section 12 Stage 1: TRUNCATE the transactional tables (deal_investors, bookbuild_entries, investments, deal_action_logs, invoices, deal_deferred_notes, deferred_payments) but keep reference data (clients, companies, fee_schedules, fee_schedule_items, fund_types, nominees, share_classes, etc.).

### Step 3 — Show me the migration before applying

Present the full migration SQL in your response, with a plain-English explanation alongside each block (since Ed reviews and is non-technical). Each ALTER TABLE / CREATE TABLE / TRUNCATE block should have a short note saying what it does and why.

The migration name should be `20260430_deal_page_restructure_foundation`.

### Step 4 — STOP and wait for explicit approval

Do NOT apply the migration. Do NOT call `apply_migration`. Do NOT call `execute_sql` for anything other than read queries. Wait for me to say something explicit like "yes apply" or "go ahead and apply".

If anything is unclear, ASK. Don't guess.

### Step 5 — After approval, apply and verify

Once I say go, do these things in order:

1. Apply the migration via `apply_migration` (which tracks it in the platform's migration log)
2. Verify the schema changes took by querying the affected tables
3. Confirm the truncate worked (zero rows in transactional tables, reference data intact)
4. Report back with what changed and any warnings

## Important constraints

- DO NOT touch any application code in this stage. No edits to TypeScript, React, route files, anything. Stage 1 is migrations only.
- DO NOT propose schema changes outside what spec Section 3.9 specifies. If you think something is missing, flag it as a question — don't quietly add it.
- DO NOT use `execute_sql` for the migration itself — use `apply_migration` so it gets tracked.
- DO NOT make any commits to the repo. The migration is applied via Supabase, not committed as a code change. (If you want to add the SQL to the repo's `supabase/migrations/` folder for version control, that's separate — ask first.)
- If you encounter an error during apply, STOP and report. Don't try to "fix and retry" without telling me.
- The user (Ed) is non-technical. Always explain what each piece of SQL does in plain English before showing the SQL.

When you've finished Step 3, stop and wait for my response.

===PROMPT END===

---

## After Claude Code responds

When Claude Code shows you the migration:

1. **Read its plain-English explanations** for each block — make sure they make sense.
2. **Look for anything surprising** — extra columns it added, things it skipped, anything that doesn't match v3 Section 3.9.
3. **Paste the response back here** — I'll review it from this end too, including running my own verification queries on the database to make sure what's proposed matches what's needed.
4. **Only then approve** — once we both agree the migration is right.

This is deliberately slow. The migration will eventually run on real investor data after the importers are built — getting it right now is much cheaper than fixing it later.
