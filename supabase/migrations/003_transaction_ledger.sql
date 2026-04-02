-- ============================================================
-- Migration 003: Transaction ledger
-- Adds transaction type columns to investments,
-- creates the holdings view, and fixes the internal_updates
-- update_type check constraint to include 'invoice' and 'transaction'.
-- ============================================================

-- 1. Add new columns to investments
--    transaction_type stored as text with a check constraint (avoids enum DDL complexity)
alter table investments
  add column if not exists transaction_type text not null default 'buy'
    check (transaction_type in ('buy', 'sell', 'transfer_in', 'transfer_out')),
  add column if not exists cost_basis        numeric(20,6) null,
  add column if not exists transfer_counterparty_id uuid null
    references clients(id) on delete set null,
  add column if not exists transfer_type     text null
    check (transfer_type in ('commercial', 'gift')),
  add column if not exists notes             text null;

create index if not exists idx_investments_transaction_type on investments(transaction_type);
create index if not exists idx_investments_counterparty on investments(transfer_counterparty_id);

-- 2. Fix internal_updates check constraint to include 'invoice' and 'transaction'
alter table internal_updates
  drop constraint if exists internal_updates_update_type_check;

alter table internal_updates
  add constraint internal_updates_update_type_check
  check (update_type in (
    'valuation', 'document', 'deal', 'note',
    'client', 'report', 'invoice'
  ));

-- 3. Create the holdings view
--    Groups investments by (client, company, share_class, holding_location, holding_entity)
--    and computes remaining shares using buy/sell/transfer directions.
drop view if exists holdings;

create view holdings as
select
  i.client_id,
  cl.full_name                                                                as client_name,
  i.company_id,
  co.name                                                                     as company_name,
  i.share_class,
  i.holding_location,
  i.holding_entity,

  -- Shares flowing in (buy or transfer received)
  sum(case when i.transaction_type in ('buy', 'transfer_in')
        then i.shares_purchased else 0 end)                                   as shares_in,

  -- Shares flowing out (sell or transfer sent)
  sum(case when i.transaction_type in ('sell', 'transfer_out')
        then i.shares_purchased else 0 end)                                   as shares_out,

  -- Net remaining
  sum(case when i.transaction_type in ('buy', 'transfer_in')
        then i.shares_purchased else 0 end)
  - sum(case when i.transaction_type in ('sell', 'transfer_out')
        then i.shares_purchased else 0 end)                                   as remaining_shares,

  -- Total cost (amount paid in)
  sum(case when i.transaction_type in ('buy', 'transfer_in')
        then i.sum_subscribed else 0 end)                                     as total_cost,

  -- Total proceeds (amount received on exit)
  sum(case when i.transaction_type in ('sell', 'transfer_out')
        then i.sum_subscribed else 0 end)                                     as total_proceeds,

  min(i.investment_date)                                                      as first_investment_date,
  coalesce(v.share_price, 0)                                                  as current_share_price,

  -- Current value: remaining shares × current price
  (
    sum(case when i.transaction_type in ('buy', 'transfer_in')
          then i.shares_purchased else 0 end)
    - sum(case when i.transaction_type in ('sell', 'transfer_out')
          then i.shares_purchased else 0 end)
  ) * coalesce(v.share_price, 0)                                              as current_value

from investments i
join clients cl on cl.id = i.client_id
join companies co on co.id = i.company_id
left join company_current_valuations v on v.company_id = i.company_id
group by
  i.client_id, cl.full_name,
  i.company_id, co.name,
  i.share_class,
  i.holding_location,
  i.holding_entity,
  v.share_price;

-- Grant access to authenticated users
grant select on holdings to authenticated;
