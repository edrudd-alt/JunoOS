-- Entity Model Cleanup, Step 3 of 5: Drop clients.entity_type
-- Purpose: Remove the entity_type column now that its data has been cleaned
--          (Step 1) and its remaining information is captured elsewhere:
--          - For leads: the concept of "is a real human" is implicit in
--            lead_investor_id IS NULL.
--          - For vehicles: the holding-location meaning is now in holding_location.
-- Depends on: Step 1 must already be applied.
-- Reference: docs/specs/Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md §5.3
--
-- Idempotency: Both statements use IF EXISTS, so re-running is safe.


-- ─── Drop the check constraint first ─────────────────────────────────────────
--
-- Plain English:
--   PostgreSQL requires the constraint enforcing allowed values ('own_name',
--   'family', 'pension', etc.) to be removed before the column itself can be
--   dropped. This is a two-step operation.
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_entity_type_check;


-- ─── Drop the column ──────────────────────────────────────────────────────────
--
-- Plain English:
--   With the constraint gone, we can now remove the column entirely.
--   After this lands, entity_type no longer exists anywhere in the schema.
--   Sub-stage B will remove any remaining TypeScript references.
ALTER TABLE clients DROP COLUMN IF EXISTS entity_type;


-- ─── VERIFICATION (run separately after applying) ─────────────────────────────
--
-- Should return 0 rows — confirms the column is gone:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'clients'
--   AND column_name = 'entity_type';
