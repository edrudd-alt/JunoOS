-- Entity Model Cleanup, Step 5 of 5: Vehicle-lead integrity trigger
-- Purpose: Add a database-level rule that prevents a deal_investors row from
--          using a vehicle that doesn't belong to the row's lead investor.
--          Today the UI prevents this; this step makes it impossible at the
--          database level, so a bad data import or direct SQL change can't
--          create an inconsistent row.
-- Depends on: Steps 1–4 should already be applied, but this step has no
--             hard schema dependency on them. It can be applied independently.
-- Reference: docs/specs/Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md §5.5
--
-- Why a trigger rather than a CHECK constraint?
--   PostgreSQL's CHECK constraints cannot look up rows in other tables.
--   The rule we need — "the vehicle must be a clients row whose lead_investor_id
--   equals this row's client_id" — crosses tables, so a trigger function is the
--   standard PostgreSQL pattern. The trigger runs automatically before any insert
--   or update that touches the relevant columns, adding negligible overhead.


-- ─── BEFORE APPLYING: confirm no existing rows already violate the rule ───────
--
-- Run this SELECT in a separate window before applying this migration.
-- If it returns any rows, STOP and investigate — those rows would cause
-- errors on the next insert/update that touches them.
--
-- SELECT di.id,
--        di.client_id,
--        di.investing_vehicle_id,
--        v.lead_investor_id AS vehicle_actual_lead
-- FROM deal_investors di
-- JOIN clients v ON v.id = di.investing_vehicle_id
-- WHERE di.investing_vehicle_id IS NOT NULL
--   AND v.lead_investor_id IS DISTINCT FROM di.client_id;
-- Expected: 0 rows


-- ─── Trigger function ─────────────────────────────────────────────────────────
--
-- Plain English:
--   This function is called automatically by PostgreSQL before every insert
--   and every update that changes client_id or investing_vehicle_id on the
--   deal_investors table. It checks whether the vehicle (if one is set) actually
--   belongs to the lead investor. If not, it raises an error and the change is
--   rejected. If the vehicle column is NULL (meaning the lead is investing
--   directly, with no vehicle), the check is skipped entirely.
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
        'Vehicle % does not belong to lead investor %. '
        'The vehicle must be a clients row whose lead_investor_id matches the deal_investors.client_id.',
        NEW.investing_vehicle_id, NEW.client_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── Trigger ──────────────────────────────────────────────────────────────────
--
-- Plain English:
--   Wire the function to the table. BEFORE means the check runs before the
--   change is saved — if it fails, nothing is written. FOR EACH ROW means
--   the check runs once per affected row (as opposed to once per statement).
--   The OF clause limits the trigger to only fire when the relevant columns
--   change, which keeps overhead minimal.
DROP TRIGGER IF EXISTS trg_vehicle_belongs_to_lead ON deal_investors;

CREATE TRIGGER trg_vehicle_belongs_to_lead
BEFORE INSERT OR UPDATE OF investing_vehicle_id, client_id ON deal_investors
FOR EACH ROW
EXECUTE FUNCTION enforce_vehicle_belongs_to_lead();


-- ─── VERIFICATION (run in a transaction you will ROLLBACK — do not commit) ────
--
-- This test attempts to insert a deliberately invalid row.
-- The trigger should reject it with an error. Roll back regardless.
--
-- Note on UUIDs used below:
--   - Lead: Nigel Rudd (a43f7d8c-2137-4581-8213-e0b811e8888e)
--   - Wrong vehicle: Humphrey SIPP (2e9736eb-786d-4ddc-8e67-f0012a6e4772)
--     which belongs to Humphrey TheCamel, NOT to Nigel.
--   This combination should be rejected by the trigger.
--
-- BEGIN;
--   INSERT INTO deal_investors (deal_id, client_id, investing_vehicle_id, lifecycle_status)
--   VALUES (
--     (SELECT id FROM deals LIMIT 1),
--     'a43f7d8c-2137-4581-8213-e0b811e8888e',  -- Nigel Rudd (lead)
--     '2e9736eb-786d-4ddc-8e67-f0012a6e4772',  -- Humphrey SIPP (belongs to Humphrey, not Nigel)
--     'soft_circled'
--   );
-- ROLLBACK;
-- Expected: ERROR — "Vehicle ... does not belong to lead investor ..."
