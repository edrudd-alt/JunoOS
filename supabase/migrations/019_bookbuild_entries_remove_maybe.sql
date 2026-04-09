-- Migration 019: Remove 'maybe' from bookbuild_entries status constraint
alter table bookbuild_entries
  drop constraint if exists bookbuild_entries_status_check;

alter table bookbuild_entries
  add constraint bookbuild_entries_status_check
  check (status in ('interested', 'confirmed', 'rejected', 'withdrawn'));
