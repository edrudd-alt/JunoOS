-- Entity Model Cleanup, Step 1 of 5: Data fix
-- Purpose: Clean up three known-bad rows before any column drops.
--          Steps 3, 4, and 5 depend on this step being applied first.
-- Reference: docs/specs/Juno_Phase_B_Stage_Entity_Model_Cleanup_A_Spec_v1.md §5.1
--
-- Before applying:
--   1. Export the clients table to a backup:
--      COPY clients TO '/tmp/clients_pre_cleanup.csv' WITH (FORMAT csv, HEADER);
--      (or use Supabase Studio → Table Editor → Export to CSV)
--   2. Run all VERIFICATION queries from §5.1 in a separate window to confirm
--      expected values before making any changes.
--   3. Confirm no deal page is open in any browser session.
--
-- Idempotency: All three statements are idempotent.
--   - DELETE WHERE id: safe to re-run if the row is already gone.
--   - UPDATE WHERE id ... AND IS DISTINCT FROM: only updates if the value
--     differs from what we're setting; no-op on a second run.


-- ─── 5.1.1  Delete the "Nick Brigstocke Multi Manager" ghost row ──────────────
--
-- Plain English:
--   This client record was created as a workaround to track Nick Brigstocke's
--   Multi Manager investments as if they belonged to a separate "vehicle".
--   That concept is wrong — Nick is a single lead investor, and fund type is a
--   property of each individual investment (recorded in investments.fund_type),
--   not a reason to create a separate client row. This row will not be missed:
--   it has no deal_investors rows linking to it and no other foreign-key
--   references. Deleting it is the first step before we drop the fund_type
--   column that made it seem necessary.
DELETE FROM clients
WHERE id = 'eb31afbd-a93a-4c4c-adf9-7d8076f90e73';


-- ─── 5.1.2  Henrietta Hump: reset entity_type to 'own_name' ──────────────────
--
-- Plain English:
--   Henrietta's row currently has entity_type='family', which was intended to
--   signal her family connection to Humphrey TheCamel. But that relationship is
--   already correctly stored in the client_relationships table — it doesn't need
--   to be recorded a second time on entity_type. More importantly, 'family' is
--   not a valid entity_type for a lead investor (a real human). We reset her
--   to 'own_name' so that no backup or audit log shows a row dying with a
--   misleading value when we drop the entity_type column in Step 3.
UPDATE clients
SET entity_type = 'own_name'
WHERE id = '040b6f85-e4a2-46aa-9ac7-02b4ccdba58f';


-- ─── 5.1.3  Rother House: confirm holding_location='direct' ──────────────────
--
-- Plain English:
--   Rother House currently has entity_type='own_name'. On a vehicle row, this
--   was used to mean "shares for this vehicle are normally held direct — not
--   via a nominee". That meaning is already representable (and is the right
--   place for it) in the holding_location column. This UPDATE ensures that
--   information is preserved before we drop entity_type. The IS DISTINCT FROM
--   guard means this is a no-op if holding_location is already 'direct'.
UPDATE clients
SET holding_location = 'direct'
WHERE id = '92e205bd-876c-431c-91a2-7941cc02e946'
  AND holding_location IS DISTINCT FROM 'direct';


-- ─── VERIFICATION (run separately after applying — do not include in migration) ──
--
-- 1. Nick Brigstocke Multi Manager row should be gone (returns 0 rows):
-- SELECT * FROM clients WHERE id = 'eb31afbd-a93a-4c4c-adf9-7d8076f90e73';
--
-- 2. Henrietta Hump should now have entity_type='own_name':
-- SELECT id, full_name, entity_type FROM clients
-- WHERE id = '040b6f85-e4a2-46aa-9ac7-02b4ccdba58f';
--
-- 3. Rother House should now have holding_location='direct':
-- SELECT id, full_name, holding_location FROM clients
-- WHERE id = '92e205bd-876c-431c-91a2-7941cc02e946';
--
-- 4. Overview of all clients: all leads should have entity_type='own_name';
--    vehicles may have various values — confirm nothing unexpected:
-- SELECT
--   CASE WHEN lead_investor_id IS NULL THEN 'lead' ELSE 'vehicle' END AS role,
--   entity_type, vehicle_type, COUNT(*)
-- FROM clients
-- GROUP BY 1, 2, 3
-- ORDER BY 1, 2, 3;
