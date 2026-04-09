-- ============================================================
-- Migration 021: Unique constraint on deal_investors(deal_id, client_id)
-- Required for upsert when re-confirming a bookbuild entry.
-- ============================================================

alter table deal_investors
  add constraint deal_investors_deal_client_unique unique (deal_id, client_id);
