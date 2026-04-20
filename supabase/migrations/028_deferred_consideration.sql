-- Migration 028: Deferred consideration support
-- Adds deferred payment tracking to deals, payment tranche fields, and a notes table.

alter table deals
  add column deferred_consideration    boolean     not null default false,
  add column total_proceeds_cap        numeric(20,2) null,
  add column deferred_period_months    integer     null,
  add column deferred_closed_out       boolean     not null default false,
  add column deferred_closed_out_at    timestamptz null,
  add column deferred_closed_out_by    uuid        null references auth.users(id) on delete set null;

alter table deferred_payments
  add column tranche_number    integer not null default 1,
  add column is_final_tranche  boolean not null default false;

create table deal_deferred_notes (
  id          uuid        primary key default gen_random_uuid(),
  deal_id     uuid        not null references deals(id) on delete cascade,
  note        text        not null,
  created_by  uuid        null references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index deal_deferred_notes_deal_id_idx   on deal_deferred_notes (deal_id);
create index deal_deferred_notes_created_at_idx on deal_deferred_notes (created_at desc);

alter table deal_deferred_notes enable row level security;

create policy "authenticated full access"
  on deal_deferred_notes
  for all
  to authenticated
  using (true)
  with check (true);
