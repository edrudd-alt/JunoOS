-- Add nominee_id to deal_investors so the share holding location can be set
-- at confirmation time (during bookbuild), not just at completion. The
-- existing nominees table is the source of truth for nominee identities.
-- NULL means "shares held directly by the legal investor" (no nominee).

ALTER TABLE deal_investors
  ADD COLUMN nominee_id UUID REFERENCES nominees(id) ON DELETE SET NULL;

COMMENT ON COLUMN deal_investors.nominee_id IS
  'Nominee holding the shares for this investment. NULL means "Direct" — held by the legal investor (the deal_investor''s client_id, or its investing_vehicle_id if set). Pre-fills from clients.default_nominee_id at insert time, can be overridden per-investment.';
