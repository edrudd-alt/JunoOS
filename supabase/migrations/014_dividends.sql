-- ============================================================
-- Migration 014: Dividends
-- Creates the dividends table as defined in
-- Transaction Workflow Spec Section 6.3.
--
-- One row per investor per dividend event.
-- Section 6.3 supersedes the simpler definition in Section 1.3.
-- ============================================================

create table dividends (
  id                     uuid          primary key default uuid_generate_v4(),
  company_id             uuid          not null references companies(id) on delete cascade,
  client_id              uuid          not null references clients(id) on delete cascade,
  share_class_id         uuid          not null references company_share_classes(id) on delete restrict,
  shares_held            numeric(20,4) not null,    -- snapshot at record date, not live
  amount_per_share       numeric(20,6) not null,
  total_amount           numeric(20,2) not null,    -- stored: shares_held x amount_per_share
  record_date            date          not null,    -- date determining eligible shareholders
  payment_date           date          null,        -- expected at declaration, confirmed at Stage 3
  payment_route          text          not null check (payment_route in ('direct', 'nominee')),
  bank_details_sent      boolean       not null default false,
  bank_details_sent_date date          null,
  confirmation_sent      boolean       not null default false,
  confirmation_sent_date date          null,
  status                 text          not null default 'pending'
    check (status in ('pending', 'bank_details_sent', 'paid', 'confirmed')),
  notes                  text          null,
  created_at             timestamptz   not null default now()
);

create index idx_dividends_company     on dividends(company_id);
create index idx_dividends_client      on dividends(client_id);
create index idx_dividends_share_class on dividends(share_class_id);
create index idx_dividends_status      on dividends(status);

alter table dividends enable row level security;

create policy "Authenticated users have full access" on dividends
  for all to authenticated using (true) with check (true);
