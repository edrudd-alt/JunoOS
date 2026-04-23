-- Migration 030: add vehicle_type to clients
-- Classifies linked entities (lead_investor_id is not null) by legal vehicle.
-- Primary clients always have vehicle_type = null.

alter table clients
  add column vehicle_type text null
  check (vehicle_type in ('nominee', 'corporate', 'trust', 'estate', 'pension'));

-- NOTE: the enforcement constraint (chk_vehicle_type_required) is intentionally
-- omitted here. It will be added in migration 031 after all existing linked
-- entities have been assigned a vehicle_type value.
