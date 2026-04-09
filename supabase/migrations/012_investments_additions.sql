-- ============================================================
-- Migration 012: Additions to investments table
-- Adds columns defined in Transaction Workflow Spec Section 1.3
-- and extends the transaction_type check constraint to include
-- the full set of transaction types required by the spec.
-- ============================================================

-- 1. New columns
alter table investments
  add column if not exists transaction_category  text         null
    check (transaction_category in ('equity', 'debt')),
  add column if not exists held_by_entity_id     uuid         null
    references clients(id) on delete set null,
  add column if not exists nominee_id            uuid         null
    references clients(id) on delete set null,
  add column if not exists fee_rate              numeric(5,2) null,
  add column if not exists fee_amount            numeric(20,2) null,
  add column if not exists proceeds              numeric(20,2) null,
  add column if not exists gain_loss             numeric(20,2) null,
  add column if not exists counterparty          text         null;

-- 2. Extend transaction_type check constraint
--    Migration 003 added the column with: 'buy', 'sell', 'transfer_in', 'transfer_out'
--    Migration 005 only touched deals.deal_type — investments is unchanged.
--    All seven new types are added here.
alter table investments
  drop constraint if exists investments_transaction_type_check;

alter table investments
  add constraint investments_transaction_type_check
  check (transaction_type in (
    'buy', 'sell', 'transfer_in', 'transfer_out',
    'full_exit', 'partial_exit',
    'cln_investment', 'cln_interest', 'cln_conversion', 'cln_repayment',
    'dividend'
  ));

-- 3. Indexes on new FK columns
create index if not exists idx_investments_held_by_entity on investments(held_by_entity_id);
create index if not exists idx_investments_nominee        on investments(nominee_id);
