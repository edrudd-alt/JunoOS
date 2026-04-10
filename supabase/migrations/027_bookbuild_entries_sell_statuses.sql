-- Migration 027: Add sell-deal statuses to bookbuild_entries status constraint
-- Sell deals use: 'undecided' (default), 'selling' (≡ confirmed), 'not_selling' (≡ rejected), 'withdrawn'

alter table bookbuild_entries
  drop constraint if exists bookbuild_entries_status_check;

alter table bookbuild_entries
  add constraint bookbuild_entries_status_check
  check (status in (
    'interested', 'confirmed', 'rejected', 'withdrawn',
    'undecided', 'selling', 'not_selling'
  ));
