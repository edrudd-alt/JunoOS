-- Entity Model Cleanup, Step 2: Audit script (read-only)
-- Purpose: Confirm that no database-level constraints or indexes depend on
--          clients.fund_type or clients.active_fund_type beyond the check
--          constraints we already know about.
--
-- IMPORTANT: Nothing in this file modifies the database. These are read-only
-- SELECT queries. Run them before applying Step 3 (drop entity_type) and
-- Step 4 (drop fund_type columns).
--
-- If anything unexpected appears in the results, STOP and flag with Ed
-- before continuing to Steps 3 and 4.
--
-- Reference: docs/specs/Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md §5.2


-- ─── Audit 1: Constraints that reference fund_type ────────────────────────────
--
-- Expected result: exactly one row — the clients_fund_type_check constraint.
-- If you see anything else (a trigger, a foreign key, a generated column),
-- stop and investigate before dropping the column.
SELECT pg_get_constraintdef(c.oid) AS constraint_definition,
       c.conname                   AS constraint_name,
       c.contype                   AS constraint_type
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'clients'
  AND pg_get_constraintdef(c.oid) ILIKE '%fund_type%';


-- ─── Audit 2: Indexes that reference fund_type ────────────────────────────────
--
-- Expected result: 0 rows.
-- An index here would need to be dropped separately before the column drop.
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'clients'
  AND indexdef ILIKE '%fund_type%';


-- ─── Audit 3: Constraints that reference entity_type ─────────────────────────
--
-- Expected result: exactly one row — the clients_entity_type_check constraint.
SELECT pg_get_constraintdef(c.oid) AS constraint_definition,
       c.conname                   AS constraint_name
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'clients'
  AND pg_get_constraintdef(c.oid) ILIKE '%entity_type%';


-- ─── Audit 4: Indexes that reference entity_type ─────────────────────────────
--
-- Expected result: 0 rows.
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'clients'
  AND indexdef ILIKE '%entity_type%';
