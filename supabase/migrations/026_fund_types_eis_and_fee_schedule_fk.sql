-- Migration 026: add EIS fund type and default_fee_schedule_id to fund_types
-- Also widens the fund_type check constraint on clients and investments to include 'eis'.

-- 1. Widen code check on fund_types
alter table fund_types
  drop constraint if exists fund_types_code_check;

alter table fund_types
  add constraint fund_types_code_check
    check (code in ('syndicate', 'multi_manager', 'eis'));

-- 2. Widen fund_type check on clients
alter table clients
  drop constraint if exists clients_fund_type_check;

alter table clients
  add constraint clients_fund_type_check
    check (fund_type in ('syndicate', 'multi_manager', 'eis', 'both'));

-- 3. Widen fund_type check on investments
alter table investments
  drop constraint if exists investments_fund_type_check;

alter table investments
  add constraint investments_fund_type_check
    check (fund_type in ('syndicate', 'multi_manager', 'eis'));

-- 4. Add default_fee_schedule_id FK to fund_types
alter table fund_types
  add column default_fee_schedule_id uuid references fee_schedules(id) on delete set null;

-- 5. Seed EIS Fund row
insert into fund_types (name, code, description)
values ('EIS Fund', 'eis', null)
on conflict (code) do nothing;
