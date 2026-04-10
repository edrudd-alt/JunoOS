-- Migration 024: fee_schedules and fee_schedule_items tables
-- Stores named fee schedule templates and their line items for use across
-- client records and deal types.

create table fee_schedules (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index fee_schedules_active_idx on fee_schedules (active);

alter table fee_schedules enable row level security;

create policy "authenticated full access"
  on fee_schedules
  for all
  to authenticated
  using (true)
  with check (true);


create table fee_schedule_items (
  id               uuid        primary key default gen_random_uuid(),
  fee_schedule_id  uuid        not null references fee_schedules(id) on delete cascade,
  fee_type         text        not null check (fee_type in ('buy', 'exit_profit_share', 'annual_management', 'other')),
  label            text        not null,
  basis            text        not null check (basis in ('percentage_of_profit', 'percentage_of_cost', 'percentage_of_proceeds', 'fixed')),
  rate             numeric(8,4) not null,
  cap_rate         numeric(8,4),
  cap_years        integer,
  display_order    integer     not null default 0,
  active           boolean     not null default true,
  created_at       timestamptz not null default now()
);

create index fee_schedule_items_fee_schedule_id_idx on fee_schedule_items (fee_schedule_id);
create index fee_schedule_items_fee_type_idx        on fee_schedule_items (fee_type);

alter table fee_schedule_items enable row level security;

create policy "authenticated full access"
  on fee_schedule_items
  for all
  to authenticated
  using (true)
  with check (true);
