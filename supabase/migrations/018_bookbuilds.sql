-- ============================================================
-- Migration 018: Bookbuilds
-- Creates the bookbuilds and bookbuild_entries tables as
-- defined in Transaction Workflow Spec Section 2.2.
--
-- One bookbuild per deal. One entry per investor per bookbuild.
-- ============================================================

-- 1. bookbuilds
create table bookbuilds (
  id           uuid          primary key default uuid_generate_v4(),
  deal_id      uuid          not null unique references deals(id) on delete cascade,
  company_id   uuid          not null references companies(id) on delete cascade,
  target_raise numeric(20,2) null,
  status       text          not null default 'open'
    check (status in ('open', 'closed')),
  created_by   uuid          null references auth.users(id) on delete set null,
  created_at   timestamptz   not null default now()
);

create index idx_bookbuilds_deal       on bookbuilds(deal_id);
create index idx_bookbuilds_company    on bookbuilds(company_id);
create index idx_bookbuilds_status     on bookbuilds(status);

alter table bookbuilds enable row level security;

create policy "Authenticated users have full access" on bookbuilds
  for all to authenticated using (true) with check (true);

-- 2. bookbuild_entries
create table bookbuild_entries (
  id                   uuid          primary key default uuid_generate_v4(),
  bookbuild_id         uuid          not null references bookbuilds(id) on delete cascade,
  company_id           uuid          not null references companies(id) on delete cascade,
  client_id            uuid          not null references clients(id) on delete cascade,
  investing_vehicle_id uuid          null references clients(id) on delete set null,
  indicative_amount    numeric(20,2) null,
  status               text          not null default 'interested'
    check (status in ('interested', 'confirmed', 'maybe', 'rejected', 'withdrawn')),
  notes                text          null,
  created_by           uuid          null references auth.users(id) on delete set null,
  updated_by           uuid          null references auth.users(id) on delete set null,
  updated_at           timestamptz   not null default now(),
  created_at           timestamptz   not null default now()
);

create unique index idx_bookbuild_entries_client on bookbuild_entries(bookbuild_id, client_id);

create index idx_bookbuild_entries_bookbuild on bookbuild_entries(bookbuild_id);
create index idx_bookbuild_entries_company   on bookbuild_entries(company_id);
create index idx_bookbuild_entries_client_id on bookbuild_entries(client_id);
create index idx_bookbuild_entries_status    on bookbuild_entries(status);

alter table bookbuild_entries enable row level security;

create policy "Authenticated users have full access" on bookbuild_entries
  for all to authenticated using (true) with check (true);
