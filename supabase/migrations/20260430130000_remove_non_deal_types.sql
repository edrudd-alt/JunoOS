-- Remove deal_type values that are not investment deals.
-- 'kyc', 'side_letter', and 'membership' were added in an earlier iteration
-- when the deals table doubled as a general workflow tracker. These are no
-- longer used: zero rows exist with those values (verified before applying).
-- The new constraint retains only the five actual deal types, and adds
-- 'full_exit' and 'partial_exit' which were missing from the original set.

ALTER TABLE deals DROP CONSTRAINT deals_deal_type_check;
ALTER TABLE deals
  ADD CONSTRAINT deals_deal_type_check
    CHECK (deal_type IN (
      'new_investment',
      'follow_on',
      'full_exit',
      'partial_exit',
      'exit'
    ));
