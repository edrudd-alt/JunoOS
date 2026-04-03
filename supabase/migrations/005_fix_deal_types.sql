-- Fix deal_type check constraint to include full_exit and partial_exit
-- The app uses 'full_exit' and 'partial_exit' for sale deals, but the original
-- constraint only allowed 'exit'. This widens the constraint to accept both.

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_deal_type_check;
ALTER TABLE deals ADD CONSTRAINT deals_deal_type_check
  CHECK (deal_type IN ('new_investment', 'follow_on', 'exit', 'full_exit', 'partial_exit', 'kyc', 'side_letter', 'membership'));
