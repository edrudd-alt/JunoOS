-- 14.49: Database-backed editable email templates
-- One row per sendable document type. Seeded with defaults.

CREATE TABLE email_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_type   TEXT NOT NULL UNIQUE,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID REFERENCES team_members(id) ON DELETE SET NULL
);

CREATE INDEX email_templates_type_idx ON email_templates (document_type);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated full access on email_templates"
  ON email_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Trigger: update updated_at and clear is_default on any edit
CREATE OR REPLACE FUNCTION trigger_set_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.is_default = FALSE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_templates_updated_at();

-- Seed default templates for 16 sendable types
INSERT INTO email_templates (document_type, subject, body, is_default) VALUES
  ('portfolio_statement',
   'Portfolio statement as at {{period}}',
   E'Dear {{client_first_name}},\n\nPlease find attached your portfolio statement as at {{period}}.\n\nKind regards,\n{{sender_first_name}}\nJuno Capital Partners LLP',
   TRUE),
  ('transaction_statement',
   'Transaction statement — {{period}}',
   E'Hi {{client_first_name}},\n\nPlease find your transaction statement attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('application_form',
   'Signed application form — {{company_name}}',
   E'Hi {{client_first_name}},\n\nPlease find your signed application form attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('eis_certificate',
   'EIS3 certificate — {{company_name}}',
   E'Hi {{client_first_name}},\n\nPlease find your EIS3 certificate for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('investment_agreement',
   'Investment agreement — {{company_name}}',
   E'Hi {{client_first_name}},\n\nPlease find your signed investment agreement attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('side_letter',
   'Side letter — {{company_name}}',
   E'Hi {{client_first_name}},\n\nPlease find your signed side letter attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('membership_agreement',
   'Membership agreement',
   E'Hi {{client_first_name}},\n\nPlease find your membership agreement attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('ceo_update',
   '{{company_name}} — CEO update',
   E'Hi {{client_first_name}},\n\nPlease find the latest CEO update from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('press_release',
   '{{company_name}} — Press release',
   E'Hi {{client_first_name}},\n\nPlease find the latest press release from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('company_update',
   '{{company_name}} — Update',
   E'Hi {{client_first_name}},\n\nPlease find the latest update from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('exit_statement',
   'Exit statement — {{company_name}}',
   E'Hi {{client_first_name}},\n\nPlease find your exit statement for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('board_minutes',
   '{{company_name}} — Board minutes',
   E'Hi {{client_first_name}},\n\nPlease find the latest board minutes from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('management_accounts',
   '{{company_name}} — Management accounts',
   E'Hi {{client_first_name}},\n\nPlease find the latest management accounts for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('kpi_spreadsheet',
   '{{company_name}} — KPI report',
   E'Hi {{client_first_name}},\n\nPlease find the latest KPI report for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('invoice',
   'Invoice — {{reference}}',
   E'Hi {{client_first_name}},\n\nPlease find your invoice attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('other',
   'Document — {{filename}}',
   E'Hi {{client_first_name}},\n\nPlease find attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE);
