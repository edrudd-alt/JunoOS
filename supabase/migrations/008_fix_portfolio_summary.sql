-- Fix client_portfolio_summary view to correctly subtract sell and transfer_out
-- rows instead of summing all transaction types as positive values.
-- See: 003_transaction_ledger.sql for the transaction_type column definition.

create or replace view client_portfolio_summary as
select
  i.client_id,
  i.company_id,
  c.name as company_name,
  c.sector,
  sum(case when i.transaction_type in ('buy', 'transfer_in')   then i.sum_subscribed   else 0 end)
  - sum(case when i.transaction_type in ('sell', 'transfer_out') then i.sum_subscribed else 0 end)
    as total_invested,
  sum(case when i.transaction_type in ('buy', 'transfer_in')   then i.shares_purchased else 0 end)
  - sum(case when i.transaction_type in ('sell', 'transfer_out') then i.shares_purchased else 0 end)
    as total_shares,
  count(*) as transaction_count,
  -- Current value of remaining shares at latest share price
  sum(
    case when i.transaction_type in ('buy', 'transfer_in')   then  i.shares_purchased
         when i.transaction_type in ('sell', 'transfer_out') then -i.shares_purchased
         else 0 end
    * coalesce(v.share_price, i.original_share_price)
  ) as current_value,
  sum(
    case when i.transaction_type in ('buy', 'transfer_in')   then  i.shares_purchased
         when i.transaction_type in ('sell', 'transfer_out') then -i.shares_purchased
         else 0 end
    * coalesce(v.share_price, i.original_share_price)
  )
  - (
    sum(case when i.transaction_type in ('buy', 'transfer_in')   then i.sum_subscribed   else 0 end)
    - sum(case when i.transaction_type in ('sell', 'transfer_out') then i.sum_subscribed else 0 end)
  ) as gain_loss
from investments i
join companies c on c.id = i.company_id
left join company_current_valuations v on v.company_id = i.company_id
where i.status = 'active'
group by i.client_id, i.company_id, c.name, c.sector;
