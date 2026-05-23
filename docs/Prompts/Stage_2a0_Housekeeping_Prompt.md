*Historical reference. Terminology updated in Sub-stage B of the Entity Model Cleanup (PR #19, May 2026): Client → Lead investor, Vehicle → Beneficial owner, Location → Legal owner. The `entity_type`, `fund_type`, and `active_fund_type` columns on the `clients` table were removed in Sub-stage A. See the current platform spec for live terminology and schema.*

# Prompt for Claude Code — Stage 2a.0: Housekeeping

Copy and paste the text between the `===PROMPT START===` and `===PROMPT END===` lines into Claude Code.

---

===PROMPT START===

Stage 2a.0 — housekeeping only. No frontend work. Three small, verifiable tasks.

## Context

Yesterday's Stage 1 migration was applied via Supabase MCP but not committed to Git, leaving a tracking gap. Going forward, all migrations must live in Git first (in `supabase/migrations/`) and then be applied. This prompt fixes today's gap and starts that discipline. There's also a small constraint cleanup to do (Stage 1.1) and a codebase audit task.

## Task 1 — Retrospectively commit the Stage 1 migration to Git

The Stage 1 migration was applied to Supabase yesterday with name `20260429_deal_page_restructure_foundation`. The SQL needs to live in the repo so the codebase reflects the database state.

1. Create a new file at `supabase/migrations/20260430120000_deal_page_restructure_foundation.sql`. The timestamp prefix follows Supabase's standard format (YYYYMMDDHHMMSS). Use a date/time that reflects when this is being committed (today, 30 April 2026), not yesterday's apply.
2. Populate the file with the EXACT SQL that was applied yesterday — every block, in order: data wipe, deal_investors lifecycle fields, fee fields, updated_at trigger, unique constraint replacement, documents versioning, invoices investor link, invoices issued_at, deal_action_logs table, RLS policy. The fee_pct column should be NUMERIC(6,4) (the corrected version, not the original 5,4).
3. Add a header comment at the top of the file explaining that this migration was applied directly via MCP on 29 April 2026, and is being added to Git retrospectively for proper tracking.
4. Commit the file to Git on a new branch called `housekeeping/stage-2a0-tracking-and-constraint`. Do not merge to main yet.

## Task 2 — Stage 1.1 constraint cleanup (deal_type)

The existing `deal_type` check constraint on `deals` allows values that are not actually deals: `kyc`, `side_letter`, `membership`. These are leftover from an earlier iteration and need to be removed.

The new constraint should allow only:
- `new_investment`
- `follow_on`
- `full_exit`
- `partial_exit`
- `exit`

In that exact order.

Steps:

1. Create a new file at `supabase/migrations/20260430130000_remove_non_deal_types.sql` (timestamp slightly after Task 1's file).
2. The migration should:
   - Drop the existing deal_type CHECK constraint on `deals` (find its name first via information_schema)
   - Add a new CHECK constraint allowing only the 5 values above
3. Add a header comment explaining the rationale.
4. Commit the file to the same `housekeeping/stage-2a0-tracking-and-constraint` branch.
5. STOP and show me the SQL before applying it. I want to review before you call `apply_migration`.

## Task 3 — Audit the codebase for deprecated deal_type references

The constraint change above will reject any code that still tries to insert or filter by `'kyc'`, `'side_letter'`, or `'membership'` as a deal_type. Find all such references and FLAG them — do NOT remove them automatically.

Specifically:

1. Search the entire codebase (excluding node_modules, .next, dist, build, and the supabase/migrations folder) for the strings: `'kyc'`, `'side_letter'`, `'membership'`, `"kyc"`, `"side_letter"`, `"membership"`, plus variants in `deal_type` enum/union types if any exist.
2. For each occurrence, report:
   - File path
   - Line number
   - Surrounding context (5 lines before and after)
   - Your assessment of whether it's:
     (a) Dead code (safe to remove later)
     (b) Live code that needs updating before the constraint can be applied
     (c) Unrelated use of the same string (e.g. `'kyc'` could appear in client KYC status, which is a different concept)
3. Show me the report. Do NOT make any edits or removals.

## Task 4 — Wait for explicit approval, then apply

After Tasks 1-3 are done and reported:

1. STOP. Wait for me to review the constraint SQL and the codebase audit.
2. Once I say "go" with explicit approval:
   - Apply the Task 2 migration via `apply_migration` with name matching the file name
   - Verify it took effect by querying the constraint
   - Report back

3. After verification, push the housekeeping branch to GitHub. Do NOT merge to main yet — that's a separate decision.

## Important constraints

- DO NOT touch any application code (TypeScript, React, etc.) in this stage. Only:
  - Create the two `.sql` files in `supabase/migrations/`
  - Generate the codebase audit report
  - Apply the constraint migration after explicit approval
- DO NOT remove or modify any `'kyc'`, `'side_letter'`, `'membership'` references found in the codebase audit. Only flag them.
- The migration files must use the timestamp prefix format `YYYYMMDDHHMMSS_name.sql` so Supabase's CLI tooling recognises them in order.
- The user (Ed) is non-technical. Explain things in plain English, especially the audit findings.

When you've completed Tasks 1, 2 (file ready but not applied), and 3, stop and wait for my response.

===PROMPT END===

---

## What to do with the response

When Claude Code reports back:

1. **Read the audit report carefully.** This is the part that needs your judgement — Claude Code will flag references but you decide what to do about them. Common scenarios:
   - References in test data (safe to leave)
   - References in old wizard code paths that we'll remove during Stage 2a.1 anyway
   - References in legitimate other contexts (e.g. `kyc` as a client status — completely different concept, safe)

2. **Read the constraint migration SQL** — it should be very short (drop one constraint, add another).

3. **Paste Claude Code's response back into this chat.** I'll do my own checks from this side and we'll decide together whether to approve the constraint change.

4. **Don't approve until we've discussed any concerning audit findings.** The constraint change is small but irreversible without effort — better to be sure first.
