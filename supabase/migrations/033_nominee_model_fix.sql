-- Fix existing data: any client tagged as 'nominee' vehicle type becomes 'corporate'
update clients set vehicle_type = 'corporate' where vehicle_type = 'nominee';

-- Update vehicle_type check constraint to remove 'nominee' as a valid value
alter table clients drop constraint if exists clients_vehicle_type_check;
alter table clients add constraint clients_vehicle_type_check
  check (vehicle_type in ('corporate', 'trust', 'estate', 'pension'));

-- Rename nominee_id to default_nominee_id on clients
alter table clients rename column nominee_id to default_nominee_id;

