-- ============================================================
-- Migration 017: Share class FKs and deal price confirmation audit
--
-- 1. investments — add share_class_id FK to company_share_classes.
--    Existing share_class text column is retained as a display-name cache.
-- 2. deals — add share_class_id FK and price confirmation audit columns.
-- ============================================================

-- 1. investments.share_class_id
alter table investments
  add column if not exists share_class_id uuid null
    references company_share_classes(id) on delete set null;

create index if not exists idx_investments_share_class_id on investments(share_class_id);

-- 2. deals.share_class_id
alter table deals
  add column if not exists share_class_id uuid null
    references company_share_classes(id) on delete set null;

-- 3. deals — price confirmation audit columns
alter table deals
  add column if not exists price_confirmed_at_setup boolean null,
  add column if not exists price_confirmation_choice text null
    check (price_confirmation_choice in ('updated', 'kept', 'custom'));
