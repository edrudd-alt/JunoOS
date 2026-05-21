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

## Portfolio statement generation

`portfolio_statement` is a recognised value in `documents.type` (present in the
CHECK constraint since initial schema). Portfolio statements use the dedicated
generation path (`generatePortfolioValuationStatement`) — not the generic
Documenso pipeline. Storage path: `clients/{client_id}/portfolio-statements/{filename}`.
The template version is `portfolioValuationStatement@1.0.0`.

Download links must be signed URLs from the private `documents` bucket with a
short TTL (60s). Never expose `storage_url` directly in the UI.
