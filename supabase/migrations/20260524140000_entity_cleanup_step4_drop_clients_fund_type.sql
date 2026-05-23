-- Entity Model Cleanup, Step 4 of 5: Drop clients.fund_type and clients.active_fund_type
-- Purpose: Remove the fund_type columns from clients. Fund type is a property
--          of each individual investment (investments.fund_type), not of the
--          client relationship. After this migration, investments.fund_type is
--          the sole source of truth for all fund-type questions.
-- Depends on: Step 1 must already be applied (ghost row deleted).
-- Reference: docs/specs/Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md §5.4
--
-- WARNING: After this migration is applied, the Settings → Fund Management
-- page WILL break until Sub-stage B is shipped. The page reads clients.fund_type
-- to count clients per fund. Do not apply this step unless Sub-stage B is
-- queued to follow immediately, OR the team accepts the temporary breakage.
--
-- Idempotency: All statements use IF EXISTS, so re-running is safe.


-- ─── Drop the check constraints first ────────────────────────────────────────
--
-- Plain English:
--   Both columns have constraints restricting their allowed values. PostgreSQL
--   requires these to be removed before the columns can be dropped.
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_fund_type_check;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_active_fund_type_check;


-- ─── Drop the columns ─────────────────────────────────────────────────────────
--
-- Plain English:
--   With the constraints gone, remove both columns. After this, fund type
--   only exists in one place in the entire schema: investments.fund_type.
--   The Add Investors modal already reads fund type from investments (not
--   clients), so it continues to work correctly after this step.
ALTER TABLE clients DROP COLUMN IF EXISTS fund_type;
ALTER TABLE clients DROP COLUMN IF EXISTS active_fund_type;


-- ─── VERIFICATION (run separately after applying) ─────────────────────────────
--
-- Should return 0 rows — confirms both columns are gone:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'clients'
--   AND column_name IN ('fund_type', 'active_fund_type');
