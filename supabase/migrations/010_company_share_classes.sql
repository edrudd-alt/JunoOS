-- ============================================================
-- Migration 010: Company share classes
-- Creates the company_share_classes table as defined in
-- Transaction Workflow Spec Section 1.3.
--
-- Note: preference_rank is NOT stored here. It lives in
-- share_class_ranking_history (Migration 011) to support
-- changes over time as new funding rounds occur.
-- ============================================================

create table company_share_classes (
  id                   uuid primary key default uuid_generate_v4(),
  company_id           uuid not null references companies(id) on delete cascade,
  name                 text not null,
  type                 text not null check (type in ('ordinary', 'preference')),

  -- Preference-only columns — all nullable, only populated when type = 'preference'
  dividend_rate        numeric(8,6)  null,  -- e.g. 0.08 for 8% p.a.
  dividend_cumulative  boolean       null,
  dividend_payment     text          null check (dividend_payment in ('paid', 'rolled_up')),
  preference_multiple  numeric(6,2)  null,  -- e.g. 1.0, 2.0, 3.0, 4.0
  participating        boolean       null,

  created_at           timestamptz not null default now()
);

create unique index idx_share_classes_company_name on company_share_classes(company_id, name);

-- RLS
alter table company_share_classes enable row level security;

create policy "Authenticated users have full access" on company_share_classes
  for all to authenticated using (true) with check (true);
