-- TEST SEED — Stage 2a.1 development only.
-- This deal will be wiped when real production data is loaded via importers.
-- Do not build any permanent logic that depends on the UUIDs generated here.
--
-- Creates: one Cyclr new_investment deal + corresponding bookbuilds row.
-- Company: Cyclr (edc1fd3d-ffe1-48c9-b6bc-f71740d38d65)
-- Created by: erudd@junocapital.co.uk (71b8ef49-8d32-4d0b-baa8-8aa8f9a42fae)
-- Cyclr has no rows in company_share_classes, so share_class_id is NULL
-- and share_class is hardcoded to 'Ordinary' per the spec instruction.

BEGIN;

WITH new_deal AS (
  INSERT INTO deals (
    deal_type,
    company_id,
    share_class_id,
    share_class,
    share_price,
    eis_qualifying,
    status,
    created_by
  ) VALUES (
    'new_investment',
    'edc1fd3d-ffe1-48c9-b6bc-f71740d38d65',
    NULL,
    'Ordinary',
    2.99,
    'yes',
    'draft',
    '71b8ef49-8d32-4d0b-baa8-8aa8f9a42fae'
  )
  RETURNING id
)
INSERT INTO bookbuilds (deal_id, company_id, target_raise, status)
SELECT
  id,
  'edc1fd3d-ffe1-48c9-b6bc-f71740d38d65',
  200000,
  'open'
FROM new_deal;

COMMIT;
