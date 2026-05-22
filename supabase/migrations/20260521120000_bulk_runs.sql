-- Sub-stage 2A.2: Bulk portfolio statement run infrastructure
-- Three tables: bulk_runs, bulk_run_items, bulk_run_presets
-- Plus indexes and RLS policies.

-- ── bulk_runs ─────────────────────────────────────────────────────────────────

CREATE TABLE bulk_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            TEXT NOT NULL CHECK (type IN ('portfolio_statement')),
  period_date     DATE,
  status          TEXT NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'completed', 'cancelled', 'failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  started_by      UUID REFERENCES team_users(id),
  total_items     INTEGER NOT NULL,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  preset_id       UUID,
  notes           TEXT
);

CREATE INDEX bulk_runs_status_idx ON bulk_runs (status, started_at DESC);
CREATE INDEX bulk_runs_type_idx   ON bulk_runs (type, period_date);

-- ── bulk_run_items ────────────────────────────────────────────────────────────

CREATE TABLE bulk_run_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bulk_run_id   UUID NOT NULL REFERENCES bulk_runs(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES clients(id),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'succeeded', 'failed', 'skipped')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  document_id   UUID REFERENCES documents(id),
  error_message TEXT,
  retry_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX        bulk_run_items_run_status_idx ON bulk_run_items (bulk_run_id, status);
CREATE UNIQUE INDEX bulk_run_items_run_client_idx ON bulk_run_items (bulk_run_id, client_id);

-- ── bulk_run_presets ──────────────────────────────────────────────────────────

CREATE TABLE bulk_run_presets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          TEXT NOT NULL CHECK (type IN ('portfolio_statement')),
  name          TEXT NOT NULL,
  client_ids    UUID[] NOT NULL,
  filter_state  JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES team_users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES team_users(id)
);

CREATE UNIQUE INDEX bulk_run_presets_type_name_idx ON bulk_run_presets (type, name);
CREATE INDEX        bulk_run_presets_type_idx       ON bulk_run_presets (type, created_at DESC);

-- ── RLS policies ──────────────────────────────────────────────────────────────

ALTER TABLE bulk_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_run_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_run_presets ENABLE ROW LEVEL SECURITY;

-- bulk_runs: select/insert/update only (no delete — historical runs are permanent)
CREATE POLICY "team can read bulk_runs"   ON bulk_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "team can insert bulk_runs" ON bulk_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team can update bulk_runs" ON bulk_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- bulk_run_items: select/insert/update only
CREATE POLICY "team can read bulk_run_items"   ON bulk_run_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "team can insert bulk_run_items" ON bulk_run_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team can update bulk_run_items" ON bulk_run_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- bulk_run_presets: select/insert/update/delete (team members can delete presets)
CREATE POLICY "team can read bulk_run_presets"   ON bulk_run_presets FOR SELECT TO authenticated USING (true);
CREATE POLICY "team can insert bulk_run_presets" ON bulk_run_presets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team can update bulk_run_presets" ON bulk_run_presets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team can delete bulk_run_presets" ON bulk_run_presets FOR DELETE TO authenticated USING (true);
