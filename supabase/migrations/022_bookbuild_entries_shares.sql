-- ============================================================
-- Migration 022: Add indicative_shares to bookbuild_entries
-- ============================================================

alter table bookbuild_entries
  add column if not exists indicative_shares numeric(20,4) null;
