-- ============================================================
-- Migration 020: Add completion fields to investments
-- Adds deal_id, completion_date, and bookbuild_id to the
-- investments table as required by Transaction Workflow Spec
-- Section 2.5 (Transaction Recording).
-- ============================================================

alter table investments
  add column if not exists deal_id         uuid null references deals(id)      on delete set null,
  add column if not exists completion_date date null,
  add column if not exists bookbuild_id    uuid null references bookbuilds(id) on delete set null;

create index if not exists idx_investments_deal      on investments(deal_id);
create index if not exists idx_investments_bookbuild on investments(bookbuild_id);
