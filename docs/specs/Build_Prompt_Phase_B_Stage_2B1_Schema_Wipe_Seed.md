# Build Prompt — Phase B Stage 2B.1: Share Prices Foundation (FINAL, ready to run)

**Reference spec:** `Juno_Phase_B_Stage_2_Share_Prices_Spec_v1.md`
**Master platform standards:** `CLAUDE.md` and `AGENTS.md`
**Depends on:** existing `companies`, `company_share_classes`, `valuations`, `investments`, `cln_positions`, `loan_notes`, `share_class_ranking_history`
**Branch:** `feat/share-prices-foundation`
**Supabase project ref:** `pzfydvwbeeupfgnxkpad`

> **NOTE TO CLAUDE CODE:** This sub-stage involves database changes that **wipe** two tables and **drop a column**. Do NOT apply these changes from Claude Code. Generate the migration and seed SQL, post them in the PR description with full plain-English explanation of every block, and stop. Ed will review and apply manually in the Supabase SQL editor. Only after Ed confirms the migration has run successfully should you proceed to verify the database state and update the TypeScript types file.

---

## 0. Pre-flight context (read before doing anything)

This is the **first of three sub-stages** in Phase B Stage 2 (B-side: Share Prices). The overall stage rebuilds the foundation for share classes and valuations, then adds a dedicated Settings page where the team updates share prices per share class. Sub-stage 2B.1 is the foundation rebuild only — no UI changes happen here.

Read `Juno_Phase_B_Stage_2_Share_Prices_Spec_v1.md` end to end before starting. The most important context is in:

- Section 1 — the diagnostic finding three problems with the current wiring
- Section 2 — the 14 decisions Ed took during Q&A (locked, not up for discussion)
- Section 5 — the full scope of this sub-stage

**Standing rules from the platform (do not violate):**

1. **No PostgREST embedded joins anywhere.** Two-query-then-merge pattern only. Documented in `CLAUDE.md`.
2. **Plain English alongside technical detail.** Every PR description and every non-trivial code comment must explain reasoning in plain English. Ed is not a coder.
3. **Review-before-apply for migrations.** Generate SQL, post in PR, wait for Ed to apply manually. Do NOT run migrations from Claude Code.
4. **Branch per sub-stage, PR per sub-stage.** Do not combine 2B.1 with 2B.2.
5. **Two-layer review.** You build and self-check; chat-Claude verifies via Supabase MCP; Ed reviews preview.
6. **Internal-only in v1, designed with the investor portal in mind.**
7. **Fees never hardcoded.** Not in scope for this sub-stage but the rule is permanent.

---

## 1. Current database state (verified 19 May 2026 via Supabase MCP)

Confirmed via direct queries before this prompt was written. You do NOT need to re-verify this state before generating the migration — these facts are accurate as of 19 May 2026:

- `valuations` table has 7 columns: `id`, `company_id`, `share_price`, `valuation_date`, `updated_by`, `notes`, `created_at`. No `share_class_id`, no `methodology`, no `source`, no `updated_at`.
- `company_share_classes` table has 6 rows, covering 6 of 11 companies. Five companies (Edozo, Obrizum Group Ltd, Purple, Sky Medical, Synchtank) have zero rows in this table.
- `companies.share_classes` JSONB column exists and is populated for all 11 companies with a different (and partly contradictory) set of classes.
- `investments` table has 8 rows. Four have `share_class_id` set (Cyclr), four are NULL (Edozo, Synchtank).
- `deals` table has 2 rows. Both have `share_class_id` set.
- `cln_positions`, `loan_notes`, `dividends`, `share_class_ranking_history` — `share_class_ranking_history` has 1 row, the rest are empty.

All of this is test data. The wipe is safe.

**Live migration history starts at `20260430105825_deal_page_restructure_foundation`.** Repo migrations `001`-`022` are from an old history that was reset. Do not assume any repo migration before April 2026 has been applied.

---

## 2. Task list

Build this sub-stage in five tasks. **Tasks 1 and 2 produce SQL that does not run until Ed applies it manually.** Tasks 3 onwards begin only after Ed confirms the SQL has been applied successfully.

### Task 1 — Generate the migration SQL

Create file `supabase/migrations/<YYYYMMDDHHMMSS>_share_prices_foundation.sql` containing all the schema changes described in spec section 5.1. The migration must:

**Block 1: Add four columns to `valuations`**

```sql
alter table valuations
  add column if not exists share_class_id uuid null
    references company_share_classes(id) on delete set null,
  add column if not exists methodology text null,
  add column if not exists source text null default 'manual',
  add column if not exists updated_at timestamptz null default now();
```

**Plain English in the PR for this block:**
*Adds four new columns to the `valuations` table. `share_class_id` is the link to a specific share class — NULL means "company-wide price" (which we use for CLN/loan-note pseudo-classes). `methodology` records how the price was derived (e.g. "Series B round", "Board approved"). `source` records where the valuation came from (e.g. `manual`, `deal_setup`, `bulk_upload`). `updated_at` is the last-edited timestamp, distinct from `created_at`.*

**Block 2: Add the index**

```sql
create index if not exists idx_valuations_company_class_date
  on valuations(company_id, share_class_id, valuation_date desc);
```

**Plain English:**
*Speeds up the most common query: "what's the latest price for this company and share class?" Without this index, the database would scan every valuation row every time the dashboard or share-prices page loads.*

**Block 3: Add the `updated_at` trigger**

```sql
-- Reuse the existing set_updated_at() function defined in the
-- 20260430105825_deal_page_restructure_foundation migration.
-- Do NOT redefine it here.
drop trigger if exists valuations_set_updated_at on valuations;
create trigger valuations_set_updated_at
  before update on valuations
  for each row
  execute function set_updated_at();
```

**Plain English:**
*Whenever a valuation row is updated, this trigger automatically updates the `updated_at` column to the current time. Saves the application from having to remember to set it on every update.*

**Block 4: CLN/loan-note instrument type (see spec 5.3)**

The spec says to add an `instrument_type` column to `company_share_classes` as the default approach. Do this:

```sql
alter table company_share_classes
  add column if not exists instrument_type text not null default 'equity'
    check (instrument_type in ('equity', 'cln', 'loan_note'));
```

**Plain English:**
*Adds a discriminator to share classes so the platform knows which rows represent equity (the normal case, editable) vs CLN or loan-note holdings (read-only at principal value in v1). Defaults to `equity` so existing equity classes are unaffected.*

**Block 5: Wipe `valuations`**

```sql
truncate table valuations;
```

**Plain English:**
*Removes all rows from the valuations table. This is test data only; no real investor data has ever been stored here. Without the wipe, existing rows would have NULL `share_class_id` and we'd carry test pollution into the new model. After this, the table is empty and ready for the seed.*

**Block 6: Wipe `company_share_classes` (CASCADE)**

```sql
truncate table company_share_classes cascade;
```

**Plain English:**
*Removes all rows from the share-classes table and, via CASCADE, sets to NULL the `share_class_id` columns on related tables (`investments`, `deals`, `dividends`, `share_class_ranking_history`, `cln_positions`). The CASCADE keyword cascades only the FK-related side effects — it does NOT delete rows in those other tables. After this, the share-classes table is empty and ready for the seed.*

**Block 7: Drop the JSONB column**

```sql
alter table companies
  drop column if exists share_classes;
```

**Plain English:**
*Removes the legacy `share_classes` JSONB column from the `companies` table. This was the old store, before the proper `company_share_classes` table existed. Sub-stage 2B.2 will update any remaining code that reads from it. Dropping the column now ensures no new code can accidentally use it.*

**Block 8: Replace the `company_current_valuations` view**

```sql
create or replace view company_current_valuations as
select distinct on (company_id, share_class_id)
  company_id, share_class_id, share_price, valuation_date, methodology, source
from valuations
order by company_id, share_class_id, valuation_date desc;
```

**Plain English:**
*Recreates the "latest price per share class" view. The new version is keyed on both company_id AND share_class_id (the old one was keyed only on company_id). `distinct on` is a Postgres feature that picks the first row in the sort order for each combination — here, the most recent valuation by date.*

**Block 9: Replace the `client_portfolio_summary` view**

Use the definition in spec section 5.5 verbatim.

**Plain English:**
*Recreates the per-client portfolio summary view to match valuations to investments by both company AND share class. The `is not distinct from` operator (instead of `=`) handles NULL share-class IDs correctly: when an investment has no share-class FK (legacy data) we still match it to a NULL-class valuation if one exists. Falls back to original purchase price when no valuation exists, so portfolio totals never go to zero just because a price hasn't been set.*

### Task 2 — Generate the seed SQL

Create file `supabase/migrations/<YYYYMMDDHHMMSS+1>_share_prices_seed.sql`. Note: this is a data seed, not a schema change. Use a timestamp one second after the foundation migration so they apply in order if both are run via `supabase db push`. But since Ed runs migrations manually, the order is whatever order Ed runs them — make sure the seed begins with a comment block saying it depends on the foundation migration having run first.

The seed must:

**Block A: Insert share classes for all 11 companies**

Use the table in spec section 5.2 verbatim. Use literal company UUIDs from the live database (Claude Code will need to query for these IDs; the values from the diagnostic on 19 May 2026 are below for reference, but you should verify they're still current):

```
AI Forge Ltd        f913f80e-0c95-4e39-9e27-0c66e5e5f278
Ball Co             fa970935-df6f-42fb-aeda-e9c4c2584ff5
Cyclr               edc1fd3d-ffe1-48c9-b6bc-f71740d38d65
Domainex Ltd        5162864d-c6a5-496e-a381-de1ac21fda85
Edozo               ad994bca-41d5-4ba8-ac45-dc886d854637
Groovance           15738685-5b7d-4390-9b11-604f8b8d7492
Mishipay Ltd        7d0c3e1f-d09b-409a-99c5-377833825a3c
Obrizum Group Ltd   e8527add-653e-47aa-b5b7-455d27b96339
Purple              7aebe7d7-94be-40c8-bed0-a88f21d948ca
Sky Medical         3a2b7140-15d7-432c-a933-3242243ce632
Synchtank           beb31f57-2929-45ec-b43e-e3377f0ae3fb
```

Insert preference fields where the spec says preference (Ball Co B Preference, Domainex D Preference): `type = 'preference'`, `preference_multiple = 4.00`, `participating = true`. For CLN pseudo-classes (AI Forge CLN, Sky Medical CLN): `type = 'ordinary'`, `instrument_type = 'cln'`. Everything else: `type = 'ordinary'`, `instrument_type = 'equity'`.

**Block B: Insert valuations**

For each newly-inserted **equity** share class (skip CLN pseudo-classes, which are read-only at principal), insert one valuation:
- One third dated within the last 30 days (fresh)
- One third dated 1–6 months ago (mid-staleness)
- One third dated more than 6 months ago (stale)

Set `methodology` to a plausible string (e.g. "Series B round", "Board approved", "Last priced round", "409A valuation"). Set `source = 'manual'`. Leave `updated_by` NULL or set to Ed's user ID (`71b8ef49-8d32-4d0b-baa8-8aa8f9a42fae`).

Use share prices in roughly the same ballpark as the Barry O'Brien report figures shown in the spec — they don't need to be exact, just plausible.

**Deliberately leave the following two classes with NO valuation** (to exercise the empty-row rendering on the future share-prices page):
- Groovance · Ordinary
- Edozo · A Ordinary

**Block C: Backfill `investments.share_class_id`**

For each `investments` row where `share_class_id IS NULL`, attempt to populate it by matching the row's free-text `share_class` to a newly-seeded `company_share_classes.name` for the same `company_id`:

```sql
update investments i
set share_class_id = csc.id
from company_share_classes csc
where i.share_class_id is null
  and csc.company_id = i.company_id
  and lower(trim(csc.name)) = lower(trim(i.share_class));
```

**Plain English:**
*For investment rows that don't have a share-class FK, find a matching share class in the new table by company and (case-insensitive, whitespace-trimmed) name, and set the FK. Rows that don't find a match stay NULL — those will need manual cleanup or will be reseeded separately later.*

### Task 3 — Update TypeScript types (DO ONLY AFTER ED HAS APPLIED THE MIGRATION)

After Ed confirms the migration has run, update `src/lib/supabase/types.ts`:

- `valuations` Row type: add `share_class_id: string | null`, `methodology: string | null`, `source: string | null`, `updated_at: string | null`. (Or regenerate via `supabase gen types typescript` if that's how the team usually does it.)
- `company_share_classes` Row type: add `instrument_type: 'equity' | 'cln' | 'loan_note'`.
- `companies` Row type: remove `share_classes` (the JSONB field).
- `company_current_valuations` View Row type: add `share_class_id: string | null`, `methodology: string | null`, `source: string | null`.
- `client_portfolio_summary` View Row type: add `share_class_id: string | null`.

Run `npm run build` to confirm the types compile.

### Task 4 — Update `CLAUDE.md`

Append the section described in spec section 6.1 (the "Share class & valuation model" block). This is part of 2B.1 because it documents the foundation we've just built; subsequent stages will reference it.

### Task 5 — Verification queries for the PR

Before opening the PR, include in the PR description the SQL queries that chat-Claude (separate review session) should run via Supabase MCP to confirm the foundation is correctly in place:

```sql
-- 1. valuations columns
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='valuations'
ORDER BY ordinal_position;
-- Expect: id, company_id, share_price, valuation_date, updated_by, notes, created_at,
--         share_class_id, methodology, source, updated_at

-- 2. companies.share_classes column should NOT exist
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='companies' AND column_name='share_classes';
-- Expect: empty result

-- 3. company_share_classes row counts
SELECT c.name, COUNT(csc.id) AS class_count
FROM companies c
LEFT JOIN company_share_classes csc ON csc.company_id = c.id
GROUP BY c.name ORDER BY c.name;
-- Expect: every company has at least one row; counts match the table in spec 5.2.

-- 4. valuations row count and coverage
SELECT c.name, csc.name AS class_name, csc.instrument_type,
  v.share_price, v.valuation_date, v.methodology
FROM company_share_classes csc
JOIN companies c ON c.id = csc.company_id
LEFT JOIN company_current_valuations v
  ON v.company_id = csc.company_id AND v.share_class_id = csc.id
ORDER BY c.name, csc.name;
-- Expect: every equity class has a valuation EXCEPT Groovance Ordinary and Edozo A Ordinary.
-- CLN classes (AI Forge CLN, Sky Medical CLN) have no valuation (and won't, by design).

-- 5. investments share_class_id backfill
SELECT
  COUNT(*) FILTER (WHERE share_class_id IS NOT NULL) AS with_fk,
  COUNT(*) FILTER (WHERE share_class_id IS NULL)     AS without_fk,
  COUNT(*) AS total
FROM investments;
-- Expect: with_fk should equal total OR be one short (depending on whether
-- text class names match). without_fk should be 0 or close to 0.
```

---

## 3. PR description template

Title: `Sub-stage 2B.1 — Share prices foundation: schema rebuild + wipe + reseed`

Body sections:

1. **What this PR does** — one-paragraph plain-English summary
2. **Migration SQL with plain-English explanations** — full SQL from Task 1, each block annotated
3. **Seed SQL with plain-English explanations** — full SQL from Task 2, each block annotated
4. **What's not in this PR** — explicitly call out that this is foundation only; the page comes in 2B.3
5. **Verification queries** — the SQL from Task 5, for chat-Claude to run via Supabase MCP after Ed applies the migration
6. **Decisions for Ed to confirm** — any open questions where you took a default in the spec but the alternative was defensible (e.g. `instrument_type` column vs deriving from `cln_positions`/`loan_notes` — see spec 5.3)

---

## 4. Acceptance criteria (matches spec 5.6)

Before requesting review:

1. Migration SQL is in `supabase/migrations/` and posted in the PR with plain-English explanation of every block.
2. Seed SQL is in `supabase/migrations/` and posted in the PR with plain-English explanation of every block.
3. The TypeScript types are updated (Task 3) AFTER the migration is applied, not before.
4. `npm run build` passes locally with the new types.
5. The PR description includes the verification queries from Task 5.
6. `CLAUDE.md` has the new "Share class & valuation model" section.

---

## 5. Workflow

1. Read this prompt + the spec end-to-end.
2. Create the branch `feat/share-prices-foundation`.
3. Generate the migration SQL (Task 1) and seed SQL (Task 2). **Do NOT run them.**
4. Open a draft PR with everything from Section 3 above.
5. **Stop. Wait for Ed.** Tell Ed in the PR description that the SQL is ready for his review.
6. Ed reviews the SQL, applies it manually in the Supabase SQL editor.
7. Chat-Claude (separate session) runs the verification queries via Supabase MCP and confirms the state matches expectations.
8. Once Ed and chat-Claude both confirm "yes, foundation is in place", proceed to Task 3 (TypeScript types) and Task 4 (CLAUDE.md update).
9. Push the TypeScript and CLAUDE.md changes to the same branch / same PR.
10. Mark the PR ready for review.
11. Ed reviews the preview (no UI changes in this sub-stage, but the build must compile cleanly).
12. Merge to `main`. Sub-stage 2B.2 begins on a new branch.

---

*End of build prompt. Total estimated effort: small (mostly SQL writing + plain-English commentary). The biggest risk is generating clean, readable SQL that Ed can review confidently — take the time to make the comments excellent.*
