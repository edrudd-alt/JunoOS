-- Sub-stage 2A.3b: extend bulk_runs for send-type runs
-- 1. Allow the new send-type value
-- 2. Add a structured metadata column for type-specific data (e.g. send template subject/body)

ALTER TABLE bulk_runs
  DROP CONSTRAINT IF EXISTS bulk_runs_type_check,
  ADD CONSTRAINT bulk_runs_type_check
    CHECK (type IN ('portfolio_statement', 'portfolio_statement_send'));

ALTER TABLE bulk_runs
  ADD COLUMN metadata JSONB;

COMMENT ON COLUMN bulk_runs.metadata IS
  'Type-specific run data. For portfolio_statement_send: { subject_template, body_template, source_run_id }. For portfolio_statement (generation): currently unused.';
