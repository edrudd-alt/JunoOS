-- ============================================================
-- Migration 011: Share class ranking history
-- Creates the share_class_ranking_history table as defined in
-- Transaction Workflow Spec Section 1.3.
--
-- Tracks how preference rankings change over time as new
-- funding rounds occur. preference_rank is stored here, not
-- on company_share_classes, to support changes over time.
--
-- To find current ranking: most recent row for share_class_id
-- To find ranking at a date: filter effective_from <= that date
-- ============================================================

create table share_class_ranking_history (
  id               uuid primary key default uuid_generate_v4(),
  company_id       uuid not null references companies(id) on delete cascade,
  share_class_id   uuid not null references company_share_classes(id) on delete cascade,
  preference_rank  integer null,  -- null for ordinary shares; lower = paid first
  effective_from   date not null,
  reason           text not null,
  created_by       uuid null references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index idx_ranking_history_share_class on share_class_ranking_history(share_class_id, effective_from desc);
create index idx_ranking_history_company     on share_class_ranking_history(company_id, effective_from desc);

-- RLS
alter table share_class_ranking_history enable row level security;

create policy "Authenticated users have full access" on share_class_ranking_history
  for all to authenticated using (true) with check (true);
