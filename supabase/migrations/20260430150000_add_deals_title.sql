-- Add a deals.title column for internal team labels.
-- This is a working label used by the team, not shown on documents to investors.
-- Examples: "Cyclr Q2 Top-Up", "Sky Medical Series C", "Buyapowa Bridge Round".
-- Free-text, no enforced convention (Future Work 14.9 may add one later).

ALTER TABLE deals
  ADD COLUMN title TEXT;

COMMENT ON COLUMN deals.title IS
  'Internal team-facing label for the deal. Not shown on investor-facing documents (application forms, transaction statements, EIS certs, invoices, emails). Free text, optional.';
