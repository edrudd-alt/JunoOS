# Build Prompt — Phase B Entity Model Cleanup, Sub-stage A: Data Model (FINAL, ready to run)

**Reference spec:** `Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md` (in `docs/`)
**Master platform standards:** `CLAUDE.md` and `AGENTS.md`
**Depends on:** None — runs as a standalone foundational fix
**Branch:** `feat/entity-model-cleanup-A`
**Supabase project ref:** `pzfydvwbeeupfgnxkpad`

> **NOTE TO CLAUDE CODE:** This sub-stage performs **schema changes that drop columns and delete a row**. Do NOT apply any of these changes from Claude Code. Your job is to generate the migration SQL, commit it to the branch, push, open a PR, and **stop**. Ed will review and apply each migration manually in the Supabase SQL editor. Only after Ed confirms a step has been applied successfully should you proceed to the next. After all five steps are applied, your final job is to update the TypeScript types file and verify column comments via Supabase MCP.

---

## 0. Pre-flight context (read before doing anything)

This is **Sub-stage A** of a two-part Entity Model Cleanup. Sub-stage A is database-only; Sub-stage B (which follows separately) handles the UI rename, filter restructure, and Settings page fix.

Read `docs/Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md` end to end before starting. The most important context is in:

- **Section 1** — purpose
- **Section 2** — out of scope (lots of things in this list — respect them all)
- **Section 4** — the end-state data model in three tables
- **Section 5** — the five migration steps in order
- **Section 9** — the review checklist that gates Step 1

**Standing rules from the platform (do not violate):**

1. **No PostgREST embedded joins anywhere.** Two-query-then-merge pattern only. Documented in `CLAUDE.md`. This sub-stage doesn't write new queries, but if you find yourself reading data in a verification script, follow the rule.
2. **Plain English alongside technical detail.** Every PR description, every non-trivial code comment, and every block of SQL in the migration files must have plain-English commentary. Ed is not a coder.
3. **Review-before-apply for migrations.** Generate SQL, post in PR, **wait for Ed to apply manually**. Do NOT run migrations from Claude Code. This applies to every one of the five steps individually.
4. **One PR for this sub-stage.** Branch `feat/entity-model-cleanup-A`, one PR.
5. **Internal-only in v1, designed with the investor portal in mind.** This stage's design (separating Lead, Beneficial owner, Legal owner) explicitly supports the future portal.

---

## 1. Current database state (verified 23 May 2026 via Supabase MCP)

Confirmed via direct queries before this prompt was written. You do NOT need to re-verify this state — these facts are accurate as of 23 May 2026:

- `clients` table has 20 rows: 11 leads (`lead_investor_id IS NULL`) and 9 vehicles
- `clients.entity_type` and `clients.vehicle_type` both exist as columns
- The three rows requiring fixes (identified in spec section 5.1):
  - **Nick Brigstocke Multi Manager** (id `eb31afbd-a93a-4c4c-adf9-7d8076f90e73`) — ghost row, to be deleted
  - **Henrietta Hump** (id `040b6f85-e4a2-46aa-9ac7-02b4ccdba58f`) — `entity_type='family'` to be reset to `'own_name'`
  - **Rother House** (id `92e205bd-876c-431c-91a2-7941cc02e946`) — `holding_location` to be set to `'direct'` to preserve the meaning that was implicit in its old `entity_type='own_name'`
- `client_relationships` has 2 rows (Henrietta-Humphrey spouse, Marcus-Nick family). These are untouched in this stage.
- `entity_type` and `vehicle_type` appear ONLY on the `clients` table — nowhere else in the schema.

---

## 2. Task list

Build this sub-stage in eight tasks (Task 0 plus Tasks 1–7). Tasks 1-5 each produce SQL for a single migration step. **Each migration is presented to Ed in the PR description individually with a checkbox**, and Ed applies them in order. Tasks 6 and 7 happen only after all five migrations are confirmed applied.

### Task 0 — Commit the spec to the repo

Before any migration work begins:

1. Copy the file `Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md` (provided to Ed in the outputs of the chat-Claude session) into the repo at `docs/Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md`. Ed will provide the file content or path — confirm with him if it's not immediately available.
2. Commit on the new branch `feat/entity-model-cleanup-A` as the first commit, with message:
   ```
   docs: add Entity Model Cleanup Sub-stage A spec
   ```
3. Do NOT modify the spec contents. It is the approved reference document for this sub-stage.

This is the first commit on the branch. All subsequent task work commits on top of it.

### Task 1 — Generate migration Step 1 SQL (data cleanup)

Create file `supabase/migrations/<YYYYMMDDHHMMSS>_entity_cleanup_step1_data_fix.sql`.

The migration contains exactly the three statements from spec section 5.1 (the DELETE, the two UPDATEs), each with a `--` comment block above it explaining in plain English what it does and why.

**At the top of the file**, add a header comment:

```sql
-- Entity Model Cleanup, Step 1 of 5: Data fix
-- Purpose: Clean up three known-bad rows before any column drops.
-- This step MUST be applied before steps 3-5.
-- Reference: docs/Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md §5.1
--
-- Before applying:
--   - Take a CSV export of the clients table to /tmp/clients_pre_cleanup.csv
--   - Run all verification SELECTs from spec §5.1 in a separate window
--
-- Idempotency: All three statements are idempotent (DELETE WHERE id, UPDATE WHERE id with IS DISTINCT FROM guard).
-- Re-applying this migration on top of itself is a no-op.
```

Below each statement, add a one-paragraph `--` comment explaining the change in plain English suitable for Ed.

**Verification queries** from spec section 5.1 should be included as `-- VERIFICATION (run separately, not as part of migration):` comments at the bottom of the file. These do not execute when the migration runs.

### Task 2 — Generate migration Step 2 SQL (no-op audit script)

There is no actual schema change in Step 2. Instead, create file `scripts/entity_cleanup_step2_audit.sql` (not in `migrations/`, since it doesn't apply anything). This file contains the two audit SELECTs from spec section 5.2, with plain-English commentary.

Add a `--` header explaining: "Run these queries before applying Step 3. If anything unexpected returns, stop and flag with Ed before continuing. Nothing in this file modifies the database."

### Task 3 — Generate migration Step 3 SQL (drop `entity_type`)

Create file `supabase/migrations/<YYYYMMDDHHMMSS>_entity_cleanup_step3_drop_entity_type.sql`.

Two statements: drop the check constraint, then drop the column. Header comment notes that Step 1 must already be applied.

### Task 4 — Generate migration Step 4 SQL (drop fund_type columns)

Create file `supabase/migrations/<YYYYMMDDHHMMSS>_entity_cleanup_step4_drop_clients_fund_type.sql`.

Drops the two check constraints and the two columns (`fund_type`, `active_fund_type`).

Header comment must include the explicit warning:

```sql
-- WARNING: After this migration is applied, the Settings → Fund Management
-- page WILL break until Sub-stage B is shipped. The page reads clients.fund_type
-- to count clients per fund. Do not apply this step unless Sub-stage B is
-- queued to follow immediately, OR the team accepts the temporary breakage.
```

### Task 5 — Generate migration Step 5 SQL (vehicle-lead integrity trigger)

Create file `supabase/migrations/<YYYYMMDDHHMMSS>_entity_cleanup_step5_vehicle_lead_trigger.sql`.

The migration contains exactly the trigger function and trigger from spec section 5.5, with plain-English commentary above explaining what triggers are, why this isn't a CHECK constraint (PostgreSQL CHECK can't reference other tables), and when the trigger fires (BEFORE INSERT OR UPDATE OF the relevant columns).

**Include the pre-check SELECT** from spec section 5.5 as a `-- BEFORE APPLYING:` comment at the top — this is the query that Ed runs to confirm no existing rows already violate the rule.

The trigger fix-test from spec section 5.5 (the BEGIN/INSERT/ROLLBACK) should be in `-- VERIFICATION:` comments at the bottom of the file, with a warning that the example UUIDs in the spec are outdated (Nick Brigstocke Multi Manager is deleted in Step 1, so by Step 5 it no longer exists). The verification example should be rewritten to reference any two clients that don't have a lead-vehicle relationship — Claude Code should pick one valid lead UUID and one valid vehicle UUID that belongs to a *different* lead from the current database state.

### Task 6 — After all migrations applied: update TypeScript types

This task runs only after Ed confirms all five migrations have been applied successfully via Supabase MCP.

1. Regenerate the Supabase TypeScript types file:
   ```bash
   npx supabase gen types typescript --project-id pzfydvwbeeupfgnxkpad > types/supabase.ts
   ```
2. Verify that `entity_type`, `fund_type`, and `active_fund_type` no longer appear in the `clients` table type
3. Run `npm run typecheck` (or equivalent) and **expect failures** — these failures will be the call sites that Sub-stage B must fix. Capture them all in a markdown block in the PR description titled "Type errors found — to be addressed by Sub-stage B". Do NOT attempt to fix them in this sub-stage.

### Task 7 — After all migrations applied: set column comments

Generate file `supabase/migrations/<YYYYMMDDHHMMSS>_entity_cleanup_step7_column_comments.sql` containing the seven `COMMENT ON COLUMN` statements from spec section 6.

Note: this is a sixth migration in practice, but logically it's a "polish" step that follows the five functional steps. It can be applied at any time after Step 5.

Verification via Supabase MCP after Ed applies it:

```sql
SELECT column_name, col_description((table_schema || '.' || table_name)::regclass::oid,
                                    ordinal_position) AS comment
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('clients','deal_investors')
  AND column_name IN ('client_id','investing_vehicle_id','nominee_id',
                      'lead_investor_id','vehicle_type','holding_location',
                      'default_nominee_id')
ORDER BY table_name, column_name;
```

All seven rows should have the comment text from spec section 6.

---

## 3. PR description format

The PR description must include:

1. **Summary** — three to four sentences in plain English describing what the PR does and what it explicitly does NOT do (no code, no UI, no types beyond regeneration)
2. **Migrations included** — one section per migration file, in this format:

   ```
   ### Migration 1 of 6: Step 1 — Data fix
   
   File: supabase/migrations/<filename>.sql
   
   [Plain-English explanation, 1-2 paragraphs]
   
   [Inline the full SQL]
   
   - [ ] Ed: applied via Supabase SQL editor
   - [ ] Ed: verification queries run, all expected results
   ```

3. **TypeScript type errors found** — a markdown code block listing every type error from Task 6, with file paths. This is the input list for Sub-stage B.
4. **Out of scope confirmation** — explicit list of things this PR does NOT change (mirror spec section 2)
5. **Rollback note** — link to spec section 7

---

## 4. Things you do NOT do in this sub-stage

Listed to avoid temptation:

- **Do NOT edit any `.tsx`, `.ts` (other than `types/supabase.ts`), or React component file.** Sub-stage B handles all of this.
- **Do NOT update `CLAUDE.md`, `AGENTS.md`, or any spec other than this one.** Sub-stage B handles documentation.
- **Do NOT touch the `bookbuild` tab code**, the `Add Investors` modal, filter components, or the `Settings → Fund Management` page.
- **Do NOT touch the application form Documenso template** or any document generation code.
- **Do NOT add the new Future Work items (14.16–14.19) to the spec.** That's a documentation change that belongs in Sub-stage B.
- **Do NOT apply any migration via Claude Code or the Supabase MCP.** Generate SQL, wait for Ed.
- **Do NOT proceed past Task 5 until Ed confirms all five migrations are applied successfully.**

---

## 5. Quality bar checklist for the PR

Before pushing and opening the PR:

- [ ] Each migration file has a header comment explaining its purpose, dependencies, and idempotency
- [ ] Each non-trivial SQL block has plain-English commentary
- [ ] Verification queries are present as `-- VERIFICATION:` comments at the bottom of relevant migration files
- [ ] No TypeScript or React code modified (other than `types/supabase.ts`, in Task 6)
- [ ] PR description follows the format in Section 3
- [ ] Branch name is exactly `feat/entity-model-cleanup-A`

---

## 6. What "done" looks like

Sub-stage A is done when:

- Spec committed to `docs/` (Task 0)
- All six migrations (5 functional + 1 comments) applied successfully by Ed
- TypeScript types regenerated and committed
- PR description has a complete list of type errors for Sub-stage B to address
- Ed has signed off after spot-checking via Supabase MCP
- PR merged to `main`

Then we are ready for Sub-stage B.
