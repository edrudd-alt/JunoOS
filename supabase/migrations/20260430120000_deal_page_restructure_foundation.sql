-- Migration applied directly via Supabase MCP on 29 April 2026.
-- Added to Git retrospectively on 30 April 2026 for proper tracking.
-- Migration name used at apply time: 20260429_deal_page_restructure_foundation

-- Block 1: Data wipe
-- Truncate all tables that need a clean slate for the new lifecycle model.
-- investment_fee_items must come first due to FK reference to investments.
TRUNCATE TABLE
  investment_fee_items,
  deal_investors,
  bookbuild_entries,
  investments,
  invoices,
  deal_deferred_notes,
  deferred_payments;

-- Block 2: deal_investors lifecycle fields
ALTER TABLE deal_investors
  ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'soft_circled'
    CHECK (lifecycle_status IN (
      'soft_circled', 'confirmed', 'app_form_sent', 'signed',
      'paid', 'complete', 'declined', 'superseded', 'chase'
    )),
  ADD COLUMN soft_circle_amount   NUMERIC,
  ADD COLUMN confirmed_amount     NUMERIC,
  ADD COLUMN shares               NUMERIC,
  ADD COLUMN investing_vehicle_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN updated_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Block 3: deal_investors fee fields
ALTER TABLE deal_investors
  ADD COLUMN fee_pct             NUMERIC(6,4),
  ADD COLUMN fee_overridden      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN fee_override_reason TEXT,
  ADD COLUMN fee_override_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN fee_override_at     TIMESTAMP WITH TIME ZONE,
  ADD COLUMN fee_locked_at       TIMESTAMP WITH TIME ZONE;

-- Block 4: updated_at trigger on deal_investors
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deal_investors_set_updated_at
  BEFORE UPDATE ON deal_investors
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Block 5: unique constraint replacement
-- Old constraint covered (deal_id, client_id) only — could not represent
-- the same client investing via two different vehicles in one deal.
-- New constraint covers (deal_id, client_id, investing_vehicle_id).
ALTER TABLE deal_investors DROP CONSTRAINT deal_investors_deal_client_unique;
ALTER TABLE deal_investors
  ADD CONSTRAINT deal_investors_deal_client_vehicle_unique
    UNIQUE (deal_id, client_id, investing_vehicle_id);

-- Block 6: documents versioning
ALTER TABLE documents
  ADD COLUMN version           INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN superseded        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN superseded_at     TIMESTAMP WITH TIME ZONE,
  ADD COLUMN superseded_reason TEXT,
  ADD COLUMN superseded_by_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN deal_investor_id  UUID REFERENCES deal_investors(id) ON DELETE SET NULL;

-- Block 7: invoices investor link
ALTER TABLE invoices
  ADD COLUMN deal_investor_id UUID REFERENCES deal_investors(id) ON DELETE SET NULL;

-- Block 8: invoices issued_at (fixes live bug where page.tsx queried this non-existent column)
ALTER TABLE invoices
  ADD COLUMN issued_at TIMESTAMP WITH TIME ZONE;

-- Block 9: deal_action_logs table
CREATE TABLE deal_action_logs (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          UUID    NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  deal_investor_id UUID    REFERENCES deal_investors(id) ON DELETE SET NULL,
  document_id      UUID    REFERENCES documents(id) ON DELETE SET NULL,
  invoice_id       UUID    REFERENCES invoices(id) ON DELETE SET NULL,
  action_type      TEXT    NOT NULL,
  action_subtype   TEXT,
  is_mock          BOOLEAN NOT NULL DEFAULT TRUE,
  from_status      TEXT,
  to_status        TEXT,
  reason           TEXT,
  metadata         JSONB,
  actioned_by      UUID    NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actioned_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_deal_action_logs_deal     ON deal_action_logs(deal_id);
CREATE INDEX idx_deal_action_logs_investor ON deal_action_logs(deal_investor_id);
CREATE INDEX idx_deal_action_logs_recent   ON deal_action_logs(actioned_at DESC);

-- Block 10: RLS for deal_action_logs
ALTER TABLE deal_action_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON deal_action_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
