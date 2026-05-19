-- ============================================================
-- Migration: 20260519110000_drop_redundant_valuation_indexes
-- Drop two pre-existing single-column / two-column indexes on
-- valuations that are now made redundant by the composite index
-- added in 20260519100000_share_prices_foundation.
--
-- idx_valuations_company  ON valuations(company_id)
-- idx_valuations_date     ON valuations(company_id, valuation_date desc)
--
-- Both are strict prefixes of the new composite index:
--   idx_valuations_company_class_date
--   ON valuations(company_id, share_class_id, valuation_date desc)
--
-- PostgreSQL can use the composite index to satisfy any query that
-- would have used either of the old indexes (by scanning the leading
-- column(s) only). Keeping the old indexes wastes a small amount of
-- write overhead on every INSERT / UPDATE / DELETE to valuations.
--
-- Not blocking — safe to apply at any time.
-- ============================================================

drop index if exists idx_valuations_company;
drop index if exists idx_valuations_date;
