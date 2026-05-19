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
--
-- !! TRUNCATE CASCADE is NOT the same as DELETE CASCADE !!
-- TRUNCATE CASCADE propagates the truncation to ALL tables that have a FK
-- pointing into company_share_classes, REGARDLESS of the ON DELETE action
-- defined on the FK. It does not set FK columns to NULL — it wipes the
-- dependent tables entirely.
--
-- Actual cascade when applied to the live database (19 May 2026):
--   company_share_classes (wiped)
--   → investments          (wiped — had FK share_class_id; also had FK to deals)
--   → deals                (wiped — reached via investments FK chain)
--   → deal_investors       (wiped — ON DELETE CASCADE from deals)
--   → bookbuild_entries    (wiped — ON DELETE CASCADE from deals)
--   → deal_action_logs     (wiped — ON DELETE CASCADE from deals)
--   → documents            (wiped — ON DELETE SET NULL from deals, but TRUNCATE ignores this)
--   → dividends            (wiped — was empty; has FK share_class_id)
--   → share_class_ranking_history (wiped — was empty; has FK into share_classes)
--   → cln_positions        (wiped — was empty; has FK into share_classes)
--
-- All affected tables contained test data only. Clients (20 rows) and
-- companies (11 rows) were unaffected — no FK chain from company_share_classes
-- reaches those tables.
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


-- ─── Blocks 8 & 9: Replace views ─────────────────────────────────────────────
--
-- Three views reference company_current_valuations:
--   client_portfolio_summary — the per-client portfolio summary
--   holdings                 — a diagnostic view that also joins on company_id
--
-- Cannot use CREATE OR REPLACE VIEW because the column list of
-- company_current_valuations changes (share_class_id is inserted before
-- share_price, and methodology / source are added). PostgreSQL only allows
-- CREATE OR REPLACE to append columns at the end.
--
-- Strategy: DROP company_current_valuations CASCADE (which automatically drops
-- the two dependent views), then recreate all three.
-- ─────────────────────────────────────────────────────────────────────────────

drop view if exists company_current_valuations cascade;


-- Block 8: Recreate company_current_valuations (new per-share-class version)
--
-- The old view was keyed on company_id only — one row per company, most recent
-- valuation regardless of share class. The new view keys on (company_id,
-- share_class_id) so multi-class companies get separate prices per class.
-- DISTINCT ON picks the first row in the sort order for each unique pair,
-- which — ordered by valuation_date DESC — is always the most recent valuation.
create view company_current_valuations as
select distinct on (company_id, share_class_id)
  company_id,
  share_class_id,
  share_price,
  valuation_date,
  methodology,
  source
from valuations
order by company_id, share_class_id, valuation_date desc;


-- Block 9: Recreate client_portfolio_summary (new spec version)
--
-- The old view joined investments to valuations on company_id only, giving
-- all share classes the same company-level price. The new version joins on
-- (company_id, share_class_id) so each holding gets the price for its class.
--
-- IS NOT DISTINCT FROM handles NULL share_class_id correctly: both sides NULL
-- matches (the CLN pseudo-class pattern); plain "=" would not.
--
-- COALESCE fallback: if no valuation exists, use original_share_price so totals
-- never go to zero just because a class hasn't been priced yet.
create view client_portfolio_summary as
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


-- Recreate holdings (same definition as before; sub-stage 2B.2 will update it
-- to join on share_class_id — see note in PR. Until then this view will
-- produce duplicate rows for multi-class companies because company_current_valuations
-- now returns one row per class rather than one row per company.)
create view holdings as
select
  i.client_id,
  cl.full_name                                                   as client_name,
  i.company_id,
  co.name                                                        as company_name,
  i.share_class,
  i.holding_location,
  i.holding_entity,
  sum(case when i.transaction_type = any(array['buy','transfer_in'])   then i.shares_purchased else 0 end) as shares_in,
  sum(case when i.transaction_type = any(array['sell','transfer_out'])  then i.shares_purchased else 0 end) as shares_out,
  (sum(case when i.transaction_type = any(array['buy','transfer_in'])  then i.shares_purchased else 0 end)
   - sum(case when i.transaction_type = any(array['sell','transfer_out']) then i.shares_purchased else 0 end)) as remaining_shares,
  sum(case when i.transaction_type = any(array['buy','transfer_in'])   then i.sum_subscribed   else 0 end) as total_cost,
  sum(case when i.transaction_type = any(array['sell','transfer_out'])  then i.sum_subscribed   else 0 end) as total_proceeds,
  min(i.investment_date)                                         as first_investment_date,
  coalesce(v.share_price, 0)                                    as current_share_price,
  ((sum(case when i.transaction_type = any(array['buy','transfer_in'])  then i.shares_purchased else 0 end)
    - sum(case when i.transaction_type = any(array['sell','transfer_out']) then i.shares_purchased else 0 end))
   * coalesce(v.share_price, 0))                                as current_value
from investments i
join clients  cl  on cl.id  = i.client_id
join companies co on co.id  = i.company_id
left join company_current_valuations v on v.company_id = i.company_id
group by i.client_id, cl.full_name, i.company_id, co.name,
         i.share_class, i.holding_location, i.holding_entity, v.share_price;
