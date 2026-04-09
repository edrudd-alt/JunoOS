-- ============================================================
-- Migration 015: Deferred payments
-- Creates the deferred_payments table as defined in
-- Transaction Workflow Spec Section 4.7.
--
-- One row per expected or received deferred payment,
-- linked to the sell transaction on the investments table.
-- ============================================================

create table deferred_payments (
  id                       uuid          primary key default uuid_generate_v4(),
  investment_id            uuid          not null references investments(id) on delete cascade,
  deal_id                  uuid          null references deals(id) on delete set null,
  client_id                uuid          not null references clients(id) on delete cascade,
  expected_amount          numeric(20,2) not null,
  actual_amount            numeric(20,2) null,        -- populated when received
  expected_date            date          not null,
  actual_date              date          null,        -- populated when received
  contingency_description  text          null,        -- nullable: not all payments are contingent
  payment_route            text          not null check (payment_route in ('direct', 'nominee')),
  status                   text          not null default 'expected'
    check (status in ('expected', 'received', 'overdue', 'waived')),
  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now()
);

create index idx_deferred_payments_investment on deferred_payments(investment_id);
create index idx_deferred_payments_deal       on deferred_payments(deal_id);
create index idx_deferred_payments_client     on deferred_payments(client_id);
create index idx_deferred_payments_status     on deferred_payments(status);

alter table deferred_payments enable row level security;

create policy "Authenticated users have full access" on deferred_payments
  for all to authenticated using (true) with check (true);
