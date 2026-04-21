-- Migration 029: investment_fee_items
-- Records the actual fee line items applied to a specific investment,
-- copied from the fee schedule at time of recording and stored immutably.

create table investment_fee_items (
  id                   uuid          primary key default gen_random_uuid(),
  investment_id        uuid          not null references investments(id) on delete cascade,
  fee_schedule_item_id uuid          null     references fee_schedule_items(id) on delete set null,
  label                text          not null,
  fee_type             text          not null check (fee_type in ('buy', 'exit_profit_share', 'annual_management', 'other')),
  basis                text          not null check (basis in ('percentage_of_profit', 'percentage_of_cost', 'percentage_of_proceeds', 'fixed')),
  rate                 numeric(8,4)  not null,
  amount               numeric(20,2) not null,
  overridden           boolean       not null default false,
  created_at           timestamptz   not null default now()
);

create index investment_fee_items_investment_id_idx on investment_fee_items (investment_id);

alter table investment_fee_items enable row level security;

create policy "authenticated full access"
  on investment_fee_items
  for all
  to authenticated
  using (true)
  with check (true);
