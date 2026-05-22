-- Sub-stage 2A.3b: email_sends audit table
-- Captures every email send attempt made by JunoOS across all pathways:
-- per-document single send (14.44), bulk send (2A.3b), and future send types.

CREATE TABLE email_sends (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id             UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  client_id               UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sent_by_team_member_id  UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  sent_from_email         TEXT NOT NULL,
  recipient_email         TEXT NOT NULL,
  subject                 TEXT NOT NULL,
  body_text               TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('queued','sending','succeeded','failed','cancelled')),
  graph_response_status   INTEGER,
  error_message           TEXT,
  bulk_run_id             UUID REFERENCES bulk_runs(id),
  attempted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ
);

CREATE INDEX email_sends_document_idx ON email_sends (document_id, completed_at DESC);
CREATE INDEX email_sends_bulk_run_idx ON email_sends (bulk_run_id) WHERE bulk_run_id IS NOT NULL;
CREATE INDEX email_sends_status_idx   ON email_sends (status);

ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

-- RLS: platform-wide authenticated full access, matching bulk_runs, outlook_connections, etc.
-- Token/data security relies on application-layer controls, not row-level isolation.
CREATE POLICY "authenticated full access on email_sends"
  ON email_sends FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
