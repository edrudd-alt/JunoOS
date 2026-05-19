-- ============================================================
-- Migration: 20260519100000_share_prices_foundation
-- Sub-stage 2B.1 — Share prices foundation: schema rebuild
--
-- !! READ BEFORE APPLYING !!
-- This migration wipes the `valuations` and `company_share_classes`
-- tables. All rows in both tables are confirmed test data (Ed, 19 May
-- 2026). The wipe is safe. Run the seed migration immediately after
-- (20260519100001_share_prices_seed.sql).
--
-- Apply manually in the Supabase SQL editor.
-- Do NOT apply via `supabase db push` without re-reading the wipe blocks.
-- ============================================================


-- ─── Block 1: Add four columns to valuations ─────────────────────────────────
--
-- These four columns are needed for the per-share-class pricing model.
-- They must be added BEFORE the truncate so the column structure is ready
-- for the re-seed that follows this migration.
--
--   share_class_id — links a valuation to one specific share class. NULL
--     means "company-wide price" (reserved for CLN/loan-note pseudo-classes).
--   methodology    — free text describing how the price was derived, e.g.
--     "Series B round", "Board approved", "409A valuation".
--   source         — where the valuation came from: 'manual', 'deal_setup',
--     or 'bulk_upload'. Defaults to 'manual'.
--   updated_at     — last-edited timestamp, distinct from created_at.
--     Kept current on every UPDATE by the trigger in Block 3.
-- ─────────────────────────────────────────────────────────────────────────────
alter table valuations
  add column if not exists share_class_id uuid null
    references company_share_classes(id) on delete set null,
  add column if not exists methodology    text null,
  add column if not exists source         text null default 'manual',
  add column if not exists updated_at     timestamptz null default now();


-- ─── Block 2: Add index for latest-price-per-class queries ───────────────────
--
-- The most common query on valuations is "what is the latest price for
-- this (company, share class) pair?" Without this index the database scans
-- every valuation row every time the share-prices page or portfolio summary
-- loads. With it, the lookup is fast even as the history grows.
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_valuations_company_class_date
  on valuations(company_id, share_class_id, valuation_date desc);


-- ─── Block 3: Add updated_at trigger to valuations ───────────────────────────
--
-- Whenever a valuation row is changed, this trigger automatically sets
-- updated_at to the current time. Saves application code from having to
-- remember to pass updated_at on every UPDATE.
--
-- set_updated_at() was defined in migration
-- 20260430120000_deal_page_restructure_foundation. We reuse it here —
-- we do NOT redefine it.
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists valuations_set_updated_at on valuations;
create trigger valuations_set_updated_at
  before update on valuations
  for each row
  execute function set_updated_at();


-- ─── Block 4: Add instrument_type to company_share_classes ───────────────────
--
-- A single discriminator column that tells the platform whether a share-
-- class row represents equity (normal, editable) or a CLN/loan-note holding
-- (read-only at principal value in v1).
--
--   'equity'    — standard equity share class. Default for all existing rows.
--   'cln'       — convertible loan note pseudo-class. Read-only; price
--                 is always £1.00 per £1 of principal until conversion.
--   'loan_note' — loan note pseudo-class. Same read-only treatment as CLN.
--
-- Defaults to 'equity' so all existing rows are unaffected by this change.
-- ─────────────────────────────────────────────────────────────────────────────
alter table company_share_classes
  add column if not exists instrument_type text not null default 'equity'
    check (instrument_type in ('equity', 'cln', 'loan_note'));


-- ─── Block 5: Wipe valuations ────────────────────────────────────────────────
--
-- All rows in valuations are test data (confirmed Ed, 19 May 2026).
-- The wipe clears the table so the seed can populate it with clean,
-- per-share-class prices. No real investor data has ever been stored here.
-- ─────────────────────────────────────────────────────────────────────────────
truncate table valuations;


-- ─── Block 6: Wipe company_share_classes (CASCADE) ───────────────────────────
--
-- All rows in company_share_classes are test data (confirmed Ed, 19 May 2026).
-- CASCADE propagates the wipe to any FK columns that reference this table:
--   investments.share_class_id        → set to NULL
--   deals.share_class_id              → set to NULL
--   dividends.share_class_id          → set to NULL (table empty)
--   share_class_ranking_history.*     → set to NULL (one test row)
--   cln_positions.share_class_id      → set to NULL (table empty)
-- CASCADE does NOT delete rows in those tables — it only nulls the FK column.
-- ─────────────────────────────────────────────────────────────────────────────
truncate table company_share_classes cascade;


-- ─── Block 7: Drop the legacy companies.share_classes JSONB column ───────────
--
-- companies.share_classes was the original store for share-class data,
-- defined in the initial schema as a JSONB array. The proper relational
-- table (company_share_classes) is now the single authoritative source.
-- Sub-stage 2B.2 will update any remaining code that still reads from this
-- column. Dropping it here ensures no new code can accidentally use it.
-- ─────────────────────────────────────────────────────────────────────────────
alter table companies
  drop column if exists share_classes;


-- ─── Block 8: Replace company_current_valuations view ────────────────────────
--
-- The old view was keyed on company_id only — it returned one row per company,
-- the most recent valuation regardless of share class. This works for single-
-- class companies but loses precision for multi-class companies.
--
-- The new view is keyed on (company_id, share_class_id). DISTINCT ON picks
-- the first row in the sort order for each unique pair, which — with the
-- ORDER BY valuation_date DESC — is always the most recent valuation.
--
-- Rows where share_class_id IS NULL represent a "company-wide" price; the
-- view handles these correctly (NULL and NULL form a match in DISTINCT ON).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view company_current_valuations as
select distinct on (company_id, share_class_id)
  company_id,
  share_class_id,
  share_price,
  valuation_date,
  methodology,
  source
from valuations
order by company_id, share_class_id, valuation_date desc;


-- ─── Block 9: Replace client_portfolio_summary view ──────────────────────────
--
-- The old view joined investments to valuations on company_id only, which
-- meant all share classes for a company got the same single company-level price.
-- For multi-class companies (e.g. Ball Co Ordinary vs B Preference) this gave
-- wrong portfolio values.
--
-- The new view joins on both company_id AND share_class_id, so each holding
-- gets the price for its specific class.
--
-- "IS NOT DISTINCT FROM" instead of "=" handles NULL share_class_id correctly:
-- if both the investment and the valuation have a NULL share_class_id (the CLN
-- pseudo-class pattern), they match. A plain "=" would not match NULL = NULL.
--
-- COALESCE fallback: if no valuation exists for a (company, class) pair, use
-- the investment's original share price. This means portfolio totals never go
-- to zero just because a price hasn't been set yet — a zero would be misleading.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view client_portfolio_summary as
select
  i.client_id,
  i.company_id,
  i.share_class_id,
  c.name  as company_name,
  c.sector,
  sum(i.sum_subscribed)                                                              as total_invested,
  sum(i.shares_purchased)                                                            as total_shares,
  count(*)                                                                           as transaction_count,
  sum(i.shares_purchased * coalesce(v.share_price, i.original_share_price))         as current_value,
  sum(i.shares_purchased * coalesce(v.share_price, i.original_share_price))
    - sum(i.sum_subscribed)                                                          as gain_loss
from investments i
join companies c on c.id = i.company_id
left join company_current_valuations v
  on  v.company_id     = i.company_id
  and v.share_class_id is not distinct from i.share_class_id
where i.status = 'active'
group by i.client_id, i.company_id, i.share_class_id, c.name, c.sector;
