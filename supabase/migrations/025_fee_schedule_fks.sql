-- Migration 025: add fee_schedule_id FK to clients, deals, investments
-- All columns are nullable — existing rows are unaffected.
-- On delete set null — deleting a fee schedule clears the FK without removing the record.

alter table clients
  add column fee_schedule_id uuid references fee_schedules(id) on delete set null;

alter table deals
  add column fee_schedule_id uuid references fee_schedules(id) on delete set null;

alter table investments
  add column fee_schedule_id uuid references fee_schedules(id) on delete set null;

create index clients_fee_schedule_id_idx     on clients     (fee_schedule_id);
create index deals_fee_schedule_id_idx       on deals       (fee_schedule_id);
create index investments_fee_schedule_id_idx on investments (fee_schedule_id);
