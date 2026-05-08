ALTER TABLE deal_investors
  DROP CONSTRAINT deal_investors_signing_status_check;

ALTER TABLE deal_investors
  ADD CONSTRAINT deal_investors_signing_status_check
  CHECK (signing_status IN ('not_reviewed', 'reviewed', 'signed', 'pending', 'created_not_sent'));
