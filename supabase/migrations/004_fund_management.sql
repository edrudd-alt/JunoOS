-- ============================================================
-- Migration 004: Fund management
-- Adds fund_type to clients and investments,
-- creates the fund_types table and seeds it with
-- Syndicate and Multi Manager fund types.
-- ============================================================

-- 1. Add fund_type and active_fund_type to clients
alter table clients
  add column if not exists fund_type text not null default 'syndicate'
    check (fund_type in ('syndicate', 'multi_manager', 'both')),
  add column if not exists active_fund_type text null
    check (active_fund_type in ('syndicate', 'multi_manager'));

-- 2. Add fund_type to investments (per-investment override)
alter table investments
  add column if not exists fund_type text not null default 'syndicate'
    check (fund_type in ('syndicate', 'multi_manager'));

create index if not exists idx_investments_fund_type on investments(fund_type);

-- 3. Create fund_types reference table
create table if not exists fund_types (
  id                        uuid primary key default uuid_generate_v4(),
  name                      text not null,
  code                      text not null unique
                              check (code in ('syndicate', 'multi_manager')),
  description               text,
  annual_management_fee_pct numeric,
  fee_cap_pct               numeric,
  fee_cap_years             integer,
  fee_deferred              boolean,
  fee_basis                 text,
  exit_fee_default_pct      numeric,
  created_at                timestamptz default now()
);

alter table fund_types enable row level security;

create policy "Authenticated users have full access" on fund_types
  for all to authenticated using (true) with check (true);

-- 4. Seed fund_types — safe to re-run
insert into fund_types (
  name, code, description,
  annual_management_fee_pct, fee_cap_pct, fee_cap_years,
  fee_deferred, fee_basis, exit_fee_default_pct
)
values
  (
    'Syndicate', 'syndicate',
    'Entry fee 5% of investment. No annual management fee. No deferred fees.',
    0, 0, 0, false, null, 5
  ),
  (
    'Multi Manager', 'multi_manager',
    'Entry fee varies. Annual management fee 2% of original cost per year, deferred until exit. Capped at 10% of original cost (5 years). Exit fee defaults to 20% of cost.',
    2, 10, 5, true, 'original_cost', 20
  )
on conflict (code) do nothing;
