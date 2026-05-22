-- Sub-stage 2A.3a: Microsoft Outlook OAuth foundation
-- Two tables: outlook_connections, oauth_pending
-- Plus indexes and RLS policies.

-- ── outlook_connections ───────────────────────────────────────────────────────

CREATE TABLE outlook_connections (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id           UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  microsoft_user_id        TEXT NOT NULL,
  microsoft_user_email     TEXT NOT NULL,
  encrypted_access_token   TEXT NOT NULL,
  encrypted_refresh_token  TEXT NOT NULL,
  access_token_expires_at  TIMESTAMPTZ NOT NULL,
  connected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refresh_failed_at   TIMESTAMPTZ,
  last_refresh_failure     TEXT
);

CREATE UNIQUE INDEX outlook_connections_team_member_idx ON outlook_connections (team_member_id);
CREATE INDEX outlook_connections_email_idx ON outlook_connections (microsoft_user_email);

-- ── oauth_pending ─────────────────────────────────────────────────────────────

CREATE TABLE oauth_pending (
  state          TEXT PRIMARY KEY,
  code_verifier  TEXT NOT NULL,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX oauth_pending_created_idx ON oauth_pending (created_at);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE outlook_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_pending       ENABLE ROW LEVEL SECURITY;

-- RLS trust model: matches the platform-wide pattern (bulk_runs, documents, team_members)
-- of granting any authenticated session full row access. Per-user row isolation is not
-- implemented in JunoOS's current schema — auth.uid() does not map to team_members.id.
-- Token confidentiality is enforced at the application layer: encrypted_access_token and
-- encrypted_refresh_token store AES-256-GCM ciphertext only; the key lives in the
-- MICROSOFT_TOKEN_ENCRYPTION_KEY Vercel env var and never touches the database.
-- Future Work 14.48: revisit per-user RLS if JunoOS adds a reliable auth.uid() <->
-- team_members.id mapping.

CREATE POLICY "authenticated full access on outlook_connections"
  ON outlook_connections FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated full access on oauth_pending"
  ON oauth_pending FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
