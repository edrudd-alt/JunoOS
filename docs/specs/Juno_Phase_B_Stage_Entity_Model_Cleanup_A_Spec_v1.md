# Juno Phase B — Entity Model Cleanup, Sub-stage A: Data Model

**Status:** Draft v1 — for Ed's review before Claude Code prompt is written
**Depends on:** No prior sub-stages; runs as a standalone foundational fix
**Position in plan:** Foundational data-model cleanup before further sell-deal, client record, and investor portal work
**Companion stage:** Sub-stage B (UI + terminology rename) — depends on this stage landing first

---

## 1. Purpose

JunoOS has accumulated a small number of conceptual frictions in how investments are modelled. None of them is breaking anything today, but together they will get progressively harder to fix as data and dependent features grow. This stage cleans up the data model in three coordinated moves, all of which preserve the existing canonical Client / Vehicle / Location pattern (which Sub-stage B will rename to **Lead investor / Beneficial owner / Legal owner**) but enforce it more cleanly at the database level.

The three moves:

1. **Retire `clients.entity_type`** — a column whose meaning silently shifts depending on whether the row is a lead investor or a vehicle, leading to data that is correct under one reading and wrong under another.
2. **Retire `clients.fund_type` and `clients.active_fund_type`** — fund type is a property of each transaction, not of the relationship-holder. Keeping it on `clients` has already led to one ghost row ("Nick Brigstocke Multi Manager") that exists purely to work around the column.
3. **Add a referential integrity check** between `deal_investors.investing_vehicle_id` and `clients.lead_investor_id`, so a vehicle on a deal must actually belong to that deal's lead investor.

This is a database-only stage. No TypeScript, React, or route file is touched. Sub-stage B handles the code-side work after this lands.

---

## 2. Out of scope

- **Renaming any database columns.** `client_id`, `investing_vehicle_id`, `nominee_id` keep their existing names for code-compatibility reasons. Only comments change.
- **UI changes.** The bookbuild, client record, filters, and modal labels are unchanged in this stage. Sub-stage B handles all of that.
- **Any code changes whatsoever.** No TypeScript edits. No React edits. No route changes. Pure migration + data fix.
- **Touching `client_relationships`** as a structural concern. The only `client_relationships` work here is conceptual — confirming that human-to-human links (spouse, family) live in this table and nowhere else. The full implementation of family-relationship workflows is Future Work.
- **Refreshing the application form PDF template.** The PDF wording stays as v1.1.0. Reviewing the legal language used in the form is Future Work.
- **Saved filter views.** Future Work.

---

## 3. The problem in plain English

### 3.1 `entity_type` carries two meanings

The `clients.entity_type` column has values: `own_name`, `family`, `pension`, `corporate`, `trust`. The spec describes these as "what kind of entity is this", but in practice the column gets read differently depending on the row:

- **On a lead investor row** (`lead_investor_id IS NULL`), `entity_type = 'own_name'` means "this is a real human investing as themselves". But the other values (`family`, `pension`, `corporate`, `trust`) don't naturally apply to a lead, because a lead is always a real human. The only lead row in the database with a non-`own_name` value is Henrietta Hump (`entity_type = 'family'`), which is a data error — her family connection to Humphrey TheCamel is correctly stored in the `client_relationships` table already.

- **On a vehicle row** (`lead_investor_id` is set), `entity_type = 'own_name'` means "shares are normally allotted directly to this vehicle, not via a nominee". This is a sensible thing to record, but it's not about the vehicle's identity — it's about the **default holding location** when this vehicle is used in a deal.

So the same column means two different things on two different kinds of row. Worse, the meaningful information on vehicle rows (default holding direct vs via nominee) is already representable using the existing `holding_location` and `default_nominee_id` columns. So `entity_type` carries no information that isn't either already elsewhere or just wrong.

### 3.2 `fund_type` on clients is a category error

`clients.fund_type` (with `clients.active_fund_type` for the `both` case) tries to designate a client as "a Syndicate client" or "a Multi Manager client". But in practice:

- A client can have investments under different fund types simultaneously (the `both` value exists to cover this).
- Fund type is *already* recorded per-investment on `investments.fund_type`.
- The Add Investors modal's fund filter (per the Stage 2A.2 spec) already looks at investments, not clients, to determine which clients have which funds.
- The Settings → Fund Management page is the only place that reads `clients.fund_type` for counting purposes.

In the test data, this has already produced one ghost row: "Nick Brigstocke Multi Manager" (a separate client record set up as a corporate vehicle of Nick, purely to track his Multi Manager investments). This row should never have existed — Nick Brigstocke is a single lead investor with Multi Manager fee terms on some of his investments. The fund is a property of each investment, not a kind of vehicle.

### 3.3 No integrity check between vehicle and lead

Today, `deal_investors.investing_vehicle_id` is a foreign key to `clients` — it just has to be *some* client. There's no constraint that the vehicle actually belongs to the lead investor on the same row. The UI prevents this from happening (the Vehicle dropdown only shows the lead's linked entities), but a bad data import or direct SQL change could create a deal_investors row where "Nigel Rudd" is the lead but "Barry's SIPP" is the vehicle. Adding the constraint makes this impossible at the database level.

---

## 4. The end-state data model

After this stage, the data model is:

### 4.1 On `clients`

| Column | Purpose | Lead value | Vehicle value |
|---|---|---|---|
| `id` | Primary key | UUID | UUID |
| `full_name` | Name | Real human's name | Vehicle's legal name |
| `lead_investor_id` | Identifies the role | NULL | UUID of the lead |
| `vehicle_type` | What kind of legal vehicle | NULL | corporate / pension / trust / estate / nominee |
| `holding_location` | Default for the Legal owner dropdown when this row is used | direct / nominee / both | direct / nominee / both |
| `default_nominee_id` | Pre-fills the Legal owner dropdown | nominee UUID or NULL | nominee UUID or NULL |
| `fee_schedule_id` | Which fee schedule applies to this client | UUID or NULL | n/a (not used for vehicles) |
| (other columns: email, address, etc.) | Unchanged | | |

`entity_type` is gone.
`fund_type` and `active_fund_type` are gone.

### 4.2 On `deal_investors` and `investments`

No changes to columns. Just one new constraint on `deal_investors`:

```
CHECK: investing_vehicle_id IS NULL
   OR EXISTS (SELECT 1 FROM clients
              WHERE id = investing_vehicle_id
                AND lead_investor_id = deal_investors.client_id)
```

(Implemented as a trigger or check function — see Section 6.)

### 4.3 Existing columns whose purpose is now clearer

| Column | What it means after this stage |
|---|---|
| `deal_investors.client_id` | Lead investor (always a real human) |
| `deal_investors.investing_vehicle_id` | Beneficial owner. NULL means "the lead is also the beneficial owner". When set, must be a client whose `lead_investor_id` equals `client_id`. |
| `deal_investors.nominee_id` | Legal owner. NULL means "the beneficial owner is also the legal owner". When set, references the `nominees` table. |
| `investments.fund_type` | Fund regime applied to this specific transaction. Sole source of truth for fund-type questions. |

---

## 5. Migration plan

The migration is split into four steps. Each is presented as a separate `apply_migration` call so it can be reviewed and approved independently. Steps must be applied in order.

### 5.1 Step 1 — Data fix: clean up the three known-bad rows

Before any column drops, the three rows with miscategorised data are fixed:

```sql
-- Migration: 20260523_step1_entity_data_cleanup

-- 5.1.1 Delete the "Nick Brigstocke Multi Manager" ghost row.
-- This row represents nothing real — Nick is a single lead investor,
-- and his Multi Manager fee terms belong on his investments, not on
-- a separate client record. Test data only; no production references.
DELETE FROM clients
WHERE id = 'eb31afbd-a93a-4c4c-adf9-7d8076f90e73';

-- 5.1.2 Henrietta Hump: drop the misleading entity_type='family' value.
-- Her family relationship to Humphrey TheCamel is already recorded
-- in client_relationships. Reset her to entity_type='own_name' so
-- she's consistent with other leads before we drop the column.
-- (This UPDATE is mainly defensive — the column drop in Step 3 makes
-- the value irrelevant, but updating first means no row dies with
-- a "wrong" value visible in any backup or audit log.)
UPDATE clients
SET entity_type = 'own_name'
WHERE id = '040b6f85-e4a2-46aa-9ac7-02b4ccdba58f';

-- 5.1.3 Rother House and Nick Brigstocke Multi Manager (already deleted in 5.1.1):
-- Rother House's entity_type='own_name' was trying to say "shares for
-- Rother House are usually held direct". This is already representable
-- via holding_location and default_nominee_id, both of which already
-- exist on the clients table. Verify Rother House's holding_location
-- is set correctly before the column drops:
UPDATE clients
SET holding_location = 'direct'
WHERE id = '92e205bd-876c-431c-91a2-7941cc02e946'
  AND holding_location IS DISTINCT FROM 'direct';
```

**Plain English:**

- The "Nick Brigstocke Multi Manager" client row is deleted because it's a workaround for a problem the next steps make go away. Test data only, no consequence.
- Henrietta's `entity_type` is reset to `own_name` purely so that no backup or audit log shows a row dying with a misleading value. The column gets dropped two steps later anyway.
- Rother House's holding location is confirmed as `direct`, which preserves the information that was implicitly stored in its old `entity_type='own_name'` value. Other vehicles in the database don't need this kind of fix because their existing values already happen to be consistent.

**Verification queries** (run after applying):

```sql
-- Should return 0 rows
SELECT * FROM clients WHERE full_name = 'Nick Brigstocke Multi Manager';

-- Should show entity_type='own_name' for Henrietta
SELECT id, full_name, entity_type FROM clients
WHERE id = '040b6f85-e4a2-46aa-9ac7-02b4ccdba58f';

-- Should show holding_location='direct' for Rother House
SELECT id, full_name, holding_location FROM clients
WHERE id = '92e205bd-876c-431c-91a2-7941cc02e946';

-- Should now show only entity_type='own_name' across the board on leads,
-- and consistent values on vehicles
SELECT
  CASE WHEN lead_investor_id IS NULL THEN 'lead' ELSE 'vehicle' END AS role,
  entity_type, vehicle_type, COUNT(*)
FROM clients
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
```

### 5.2 Step 2 — Migrate fund_type usage off `clients`

Before dropping the column, any code that reads `clients.fund_type` for *real* logic (not just display) needs to be confirmed as either deprecated or already migrated to use `investments.fund_type`. The actual code changes happen in Sub-stage B; this step's job is to verify nothing on the database side depends on `clients.fund_type`.

Audit query:

```sql
-- Check no constraints, indexes, or generated columns depend on clients.fund_type
SELECT pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'clients'
  AND pg_get_constraintdef(c.oid) ILIKE '%fund_type%';
-- Expected: returns one row (the fund_type check constraint itself)

SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'clients' AND indexdef ILIKE '%fund_type%';
-- Expected: no rows
```

If anything unexpected appears, **stop and flag** before continuing. (No code change yet — that's all Sub-stage B's job.)

### 5.3 Step 3 — Drop `entity_type` from `clients`

```sql
-- Migration: 20260523_step3_drop_entity_type

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_entity_type_check;
ALTER TABLE clients DROP COLUMN entity_type;
```

**Plain English:** Remove the constraint that enforced the allowed values, then remove the column itself. Two statements rather than one because PostgreSQL needs the constraint dropped explicitly before the column can go.

**Verification:**

```sql
-- Should return 0 rows
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='entity_type';
```

### 5.4 Step 4 — Drop `fund_type` and `active_fund_type` from `clients`

```sql
-- Migration: 20260523_step4_drop_clients_fund_type

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_fund_type_check;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_active_fund_type_check;
ALTER TABLE clients DROP COLUMN fund_type;
ALTER TABLE clients DROP COLUMN active_fund_type;
```

**Plain English:** Same pattern as Step 3, but for both fund-type columns. After this, fund type only exists in one place: `investments.fund_type`.

**Verification:**

```sql
-- Should return 0 rows
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients'
  AND column_name IN ('fund_type', 'active_fund_type');
```

### 5.5 Step 5 — Add the vehicle-lead integrity check on `deal_investors`

```sql
-- Migration: 20260523_step5_vehicle_lead_integrity

-- Before adding the constraint, confirm no existing rows violate it.
-- If any row does, STOP and report — we'd need to investigate before
-- enforcing this rule.
SELECT di.id, di.client_id, di.investing_vehicle_id,
       v.lead_investor_id AS vehicle_actual_lead
FROM deal_investors di
JOIN clients v ON v.id = di.investing_vehicle_id
WHERE di.investing_vehicle_id IS NOT NULL
  AND v.lead_investor_id IS DISTINCT FROM di.client_id;
-- Expected: 0 rows

-- Add the constraint as a trigger (CHECK constraints can't reference
-- other rows, so a trigger is the standard PostgreSQL pattern here).
CREATE OR REPLACE FUNCTION enforce_vehicle_belongs_to_lead()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.investing_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM clients
      WHERE id = NEW.investing_vehicle_id
        AND lead_investor_id = NEW.client_id
    ) THEN
      RAISE EXCEPTION
        'investing_vehicle_id % does not belong to client_id %',
        NEW.investing_vehicle_id, NEW.client_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vehicle_belongs_to_lead
BEFORE INSERT OR UPDATE OF investing_vehicle_id, client_id ON deal_investors
FOR EACH ROW
EXECUTE FUNCTION enforce_vehicle_belongs_to_lead();
```

**Plain English:**

- First we check whether any existing row already breaks the rule we're about to enforce. If something does, we stop and look at it before adding the rule (otherwise the next insert/update on that row would fail).
- PostgreSQL's plain `CHECK` constraints can't look at other tables. The standard way to enforce a cross-table rule is a small function that runs automatically before any insert or update — a trigger. The function raises an error if the vehicle doesn't belong to the lead.
- The trigger only fires when `investing_vehicle_id` or `client_id` changes (or on insert), so it adds negligible overhead.

**Verification:**

```sql
-- Try to insert a deliberately bad row — should fail.
-- Don't run this in production; only run in a transaction you'll rollback.
BEGIN;
  INSERT INTO deal_investors (deal_id, client_id, investing_vehicle_id, lifecycle_status)
  VALUES (
    (SELECT id FROM deals LIMIT 1),
    'a43f7d8c-2137-4581-8213-e0b811e8888e',  -- Nigel Rudd
    'eb31afbd-a93a-4c4c-adf9-7d8076f90e73',  -- (deleted in Step 1, will already fail FK; use any vehicle not belonging to Nigel instead)
    'soft_circled'
  );
ROLLBACK;
-- Expected: ERROR or transaction rollback
```

---

## 6. Updating column comments

After all migrations land, set the new column comments. These are for developer/data-engineer clarity — they appear in tools like Supabase Studio and `\d+ deal_investors` in psql. They're not user-facing.

```sql
COMMENT ON COLUMN deal_investors.client_id IS
  'Lead investor — the real human Juno has the relationship with. Always set.';

COMMENT ON COLUMN deal_investors.investing_vehicle_id IS
  'Beneficial owner. NULL means the lead investor is also the beneficial owner.
   When set, must be a clients row whose lead_investor_id equals client_id
   (enforced by trg_vehicle_belongs_to_lead).';

COMMENT ON COLUMN deal_investors.nominee_id IS
  'Legal owner — the entity registered on the share register.
   NULL means the beneficial owner is also the legal owner (held direct).
   When set, references the nominees table.';

COMMENT ON COLUMN clients.lead_investor_id IS
  'Identifies whether this row is a lead investor (NULL) or a legal wrapper
   belonging to another client (UUID of that lead).';

COMMENT ON COLUMN clients.vehicle_type IS
  'When this row is a vehicle (lead_investor_id IS NOT NULL), what kind of legal
   entity: corporate / pension / trust / estate / nominee. NULL on leads.';

COMMENT ON COLUMN clients.holding_location IS
  'Default Legal owner setting when this client (lead or vehicle) appears
   in a deal: direct (no nominee), nominee (use default_nominee_id), or both.';

COMMENT ON COLUMN clients.default_nominee_id IS
  'Pre-fills the Legal owner dropdown when this client appears in a deal,
   if holding_location is nominee or both.';
```

---

## 7. Rollback plan

If anything goes wrong mid-stage, each step is independently reversible:

- **Step 1 rollback:** Re-insert the deleted "Nick Brigstocke Multi Manager" row from the row data captured before the migration. (Capture it during the dry-run — see Section 9.)
- **Step 3 rollback:** Re-add the `entity_type` column with its check constraint. All existing data was either `own_name` (default for the column) or already wrong, so a column re-add with `DEFAULT 'own_name'` would restore the schema. The original Henrietta value cannot be recovered, but it was a bad value anyway.
- **Step 4 rollback:** Re-add `fund_type` and `active_fund_type` with their check constraints and defaults. Original values would need to be re-derived from `investments.fund_type` (highest-frequency value per client, with `both` if mixed).
- **Step 5 rollback:** Drop the trigger and function. Zero impact on data.

In all cases, the rollback is more painful than the forward migration, so the principle is: run each step, verify thoroughly, then proceed.

---

## 8. Future Work additions

This stage opens (or formalises) the following Future Work items, to be added to the platform spec's Future Work register:

- **14.16 Application form PDF wording review.** Confirm that the v1.1.0 Documenso template uses appropriate legal terminology (Applicant, Beneficial Owner, Nominee/Custodian) consistent with the new internal vocabulary. If wording changes are warranted, ship v1.2.0 of the template.
- **14.17 client_relationships structural workflow.** Build the UI for adding, editing, and viewing human-to-human relationships (spouse, family, other) on the client record. Migrate any remaining historical "family" categorisations off `entity_type` (already done in this stage) into properly structured `client_relationships` rows.
- **14.18 Saved filter views on the bookbuild.** Allow team members to save a named filter combination (e.g. "All Rother House via City Nominees") and reload it across deals or sessions. Mirror the saved-preset pattern from the portfolio statement bulk run.
- **14.19 Investor portal beneficial-owner view.** When the investor portal arrives, decide how a lead investor (e.g. Nigel) can view holdings filtered by beneficial owner (Rother House vs his own name vs other vehicles). The data model supports this cleanly after this stage; the UI is the question.

---

## 9. Risk and review checklist

Before applying Step 1, the following are required:

1. **Dry-run inspection.** Run all SELECT queries from each step in order. Confirm the expected row counts and values. No SELECT should surface an unexpected row.
2. **Backup snapshot of `clients`.** Supabase auto-backups exist, but for this stage, also export the `clients` table to a CSV in `/tmp/clients_pre_cleanup.csv` so any row data needed for rollback is immediately to hand.
3. **Ed approves each step's SQL** before `apply_migration` is called. Standard review-before-apply discipline.
4. **No deal page is open in a browser session** while migrations run — the team is paused for the duration.

After applying all steps:

5. **Re-run all verification queries.** All "Expected: 0 rows" queries must return 0 rows.
6. **Spot-check the bookbuild renders.** Open the Cyclr test deal. Confirm rows display normally despite the schema change. (The frontend may still reference `entity_type` in code at this point — that's Sub-stage B's job to clean up. If the page errors, note where and continue.)
7. **Spot-check the Fund Management settings page.** It will likely break, since it reads `clients.fund_type`. This is expected; Sub-stage B fixes it. Note any error for Sub-stage B's prompt.

---

## 10. What this stage does NOT change

Recap for clarity:

- The bookbuild table columns: still "Client / Vehicle / Location". Sub-stage B renames them.
- Filter UI: still "Vehicle" filter as it is today. Sub-stage B replaces it.
- Add Investors modal: unchanged. Sub-stage B renames its labels.
- Application form PDF: unchanged. Future Work 14.16 reviews wording.
- Settings → Fund Management page: probably broken after Step 4; Sub-stage B fixes.
- `client_relationships` table: untouched. Future Work 14.17 builds the workflow.
- CLAUDE.md and AGENTS.md: untouched. Sub-stage B updates them as part of the rename.

---

## 11. Sub-stage B preview

So this spec is complete in itself, here's a sketch of what Sub-stage B will cover (a fuller spec to follow once this lands):

1. Rename throughout code and UI: Client → Lead investor, Vehicle → Beneficial owner, Location → Legal owner.
2. Filter restructure: multi-select Beneficial owner filter; new multi-select Legal owner filter.
3. Fund Management settings page: read fund counts from `investments.fund_type`, not `clients.fund_type`.
4. Spec documentation sweep: v3.6 deal page spec, section_9 client record, transaction workflow spec, CLAUDE.md, AGENTS.md.
5. Historical build prompts get a one-line note at the top noting the terminology change.

---

## 12. Acceptance criteria

This sub-stage is done when:

- All four migration steps applied without error
- All verification queries return expected results
- Column comments updated
- Spec is checked into the repo under `/docs/` (this file)
- Future Work items 14.16–14.19 added to the platform spec
- Ed has signed off after spot-checking the database state via Supabase MCP
