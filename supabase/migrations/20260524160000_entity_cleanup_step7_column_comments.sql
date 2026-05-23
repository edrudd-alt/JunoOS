-- Entity Model Cleanup, Step 6 (polish): Column comments
-- Purpose: Set descriptive comments on seven columns across clients and
--          deal_investors. These appear in Supabase Studio and psql (\d+)
--          and help developers and data engineers understand the data model
--          at a glance. Not user-facing.
-- Can be applied at any time after Step 5.
-- Reference: docs/specs/Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md §6
--
-- Idempotency: COMMENT ON COLUMN is always idempotent — re-running replaces
--              the previous comment with no side effects.


-- ─── deal_investors columns ───────────────────────────────────────────────────

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


-- ─── clients columns ──────────────────────────────────────────────────────────

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


-- ─── VERIFICATION (run separately after applying) ─────────────────────────────
--
-- All seven rows should have the comment text above:
-- SELECT column_name,
--        col_description(
--          (table_schema || '.' || table_name)::regclass::oid,
--          ordinal_position
--        ) AS comment
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('clients', 'deal_investors')
--   AND column_name IN (
--     'client_id', 'investing_vehicle_id', 'nominee_id',
--     'lead_investor_id', 'vehicle_type', 'holding_location', 'default_nominee_id'
--   )
-- ORDER BY table_name, column_name;
