-- Migration 031: add vehicle_type required constraint
-- All existing linked entities have been assigned a vehicle_type in migration 030.
-- This constraint now enforces that any future linked entity must also have one.

alter table clients
  add constraint chk_vehicle_type_required
  check (
    lead_investor_id is null
    or vehicle_type is not null
  );
