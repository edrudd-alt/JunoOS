@AGENTS.md

## Share class & valuation model

Share classes live in `company_share_classes`. The `companies.share_classes`
JSONB column has been removed (dropped in migration 20260519100000).

Valuations live in `valuations`, keyed by `(company_id, share_class_id)`.
A NULL `share_class_id` represents a CLN/loan-note pseudo-class — those rows
are read-only at principal value. The `instrument_type` column on
`company_share_classes` is the discriminator: `'equity'` = editable,
`'cln'` / `'loan_note'` = read-only.

Latest price per (company, share class) is read from the
`company_current_valuations` view. The `client_portfolio_summary` view
joins on `(company_id, share_class_id IS NOT DISTINCT FROM)` so NULL
share_class_id matches correctly.
