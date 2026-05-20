-- ============================================================
-- Migration: 20260520120000_seed_test_investments
--
-- PURPOSE: Seed test investment data so that the portfolio
-- valuation statement (sub-stage 2A.1) has real holdings to
-- render. The investments table was emptied during the 2B.1
-- schema rebuild.
--
-- CLIENTS SEEDED (first three alphabetically with references):
--   Barry O'Brien III  (investor_reference: BoBIII)  — 9 lots
--   Bibi Netanahu      (investor_reference: Bibs1)   — 6 lots
--   Bob Bigballs       (investor_reference: dsadasd) — 5 lots
--
-- COMPANIES USED: AI Forge Ltd, Ball Co, Cyclr, Domainex Ltd,
-- Edozo, Mishipay Ltd, Obrizum Group Ltd, Purple, Sky Medical,
-- Synchtank.
--
-- CLN POSITIONS INCLUDED: AI Forge CLN (Barry), Sky Medical CLN
-- (Barry) — these will render at £1.00 principal since no
-- valuation override exists.
--
-- All share_class_id values are real IDs from company_share_classes.
-- All original_share_price × shares_purchased = sum_subscribed
-- (verified arithmetically before committing).
--
-- Safe to apply at any time: inserts only, no schema changes.
-- ============================================================

BEGIN;

-- ── Barry O'Brien III ──────────────────────────────────────────────────────
-- client_id: 1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e
-- 9 lots across: AI Forge (Ordinary + CLN), Cyclr A Ordinary,
--                Domainex Ordinary, Sky Medical (A Ordinary + CLN), Purple Ordinary

-- AI Forge Ltd — Ordinary shares (2 lots, EIS qualifying)
-- Current price: £2.50  |  Original buy-in at £1.00 then £1.75
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e',
   'f913f80e-0c95-4e39-9e27-0c66e5e5f278',
   'c61c6096-7acc-47c3-8cdb-31bdff29a47a', 'Ordinary',
   '2023-09-15', 1.00, 10000, 10000.00,
   'yes', 'active', 'buy', 'syndicate'),

  ('1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e',
   'f913f80e-0c95-4e39-9e27-0c66e5e5f278',
   'c61c6096-7acc-47c3-8cdb-31bdff29a47a', 'Ordinary',
   '2024-06-30', 1.75, 5000, 8750.00,
   'yes', 'active', 'buy', 'syndicate');

-- AI Forge Ltd — CLN (1 lot, not EIS)
-- Held at £1.00 principal; no valuation override exists so the
-- statement will show £1.0000 (principal) for this position.
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e',
   'f913f80e-0c95-4e39-9e27-0c66e5e5f278',
   '09aa1fd8-9ef8-482c-a55d-4716d6f01e8b', 'CLN',
   '2024-03-01', 1.00, 25000, 25000.00,
   'no', 'active', 'buy', 'syndicate');

-- Cyclr — A Ordinary (2 lots, EIS qualifying)
-- Current price: £1.75  |  Original buy-ins at £0.50 then £1.00
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e',
   'edc1fd3d-ffe1-48c9-b6bc-f71740d38d65',
   '8b1713a3-75ed-444f-a2ba-56a85febb275', 'A Ordinary',
   '2022-11-10', 0.50, 20000, 10000.00,
   'yes', 'active', 'buy', 'syndicate'),

  ('1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e',
   'edc1fd3d-ffe1-48c9-b6bc-f71740d38d65',
   '8b1713a3-75ed-444f-a2ba-56a85febb275', 'A Ordinary',
   '2024-01-15', 1.00, 10000, 10000.00,
   'yes', 'active', 'buy', 'syndicate');

-- Domainex Ltd — Ordinary (1 lot, EIS qualifying)
-- Current price: £0.50  |  Original buy-in at £0.25 (down-round comparison)
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e',
   '5162864d-c6a5-496e-a381-de1ac21fda85',
   '09b981d1-81b7-4209-9f70-f08cf1e5daf5', 'Ordinary',
   '2023-04-20', 0.25, 40000, 10000.00,
   'yes', 'active', 'buy', 'syndicate');

-- Sky Medical — A Ordinary (1 lot, EIS qualifying)
-- Current price: £1.25  |  Original buy-in at £0.75
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e',
   '3a2b7140-15d7-432c-a933-3242243ce632',
   '912293a4-b08d-4f62-9df5-557660bd2b01', 'A Ordinary',
   '2024-07-05', 0.75, 15000, 11250.00,
   'yes', 'active', 'buy', 'syndicate');

-- Sky Medical — CLN (1 lot, not EIS)
-- Held at £1.00 principal. Tests dual-CLN rendering alongside AI Forge CLN.
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e',
   '3a2b7140-15d7-432c-a933-3242243ce632',
   '6502e195-b7e6-4d35-b1ad-13426471bd58', 'CLN',
   '2024-02-14', 1.00, 15000, 15000.00,
   'no', 'active', 'buy', 'syndicate');

-- Purple — Ordinary (1 lot, EIS qualifying)
-- Current price: £1.50  |  Original buy-in at £0.80
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e',
   '7aebe7d7-94be-40c8-bed0-a88f21d948ca',
   '2147c755-1c35-447a-9b28-bf12ada00536', 'Ordinary',
   '2023-06-01', 0.80, 12500, 10000.00,
   'yes', 'active', 'buy', 'syndicate');


-- ── Bibi Netanahu ──────────────────────────────────────────────────────────
-- client_id: de1c5f87-d943-4af4-8f8b-45d107f0a342
-- 6 lots across: Cyclr (A Ordinary + C Ordinary), Mishipay,
--                Obrizum (2 lots), Ball Co B Preference

-- Cyclr — A Ordinary (1 lot, EIS qualifying)
-- Shares the same round date as Barry's first Cyclr lot (same deal)
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('de1c5f87-d943-4af4-8f8b-45d107f0a342',
   'edc1fd3d-ffe1-48c9-b6bc-f71740d38d65',
   '8b1713a3-75ed-444f-a2ba-56a85febb275', 'A Ordinary',
   '2022-11-10', 0.50, 10000, 5000.00,
   'yes', 'active', 'buy', 'syndicate');

-- Cyclr — C Ordinary (1 lot, not EIS)
-- Current price: £4.20  |  Different share class from the A Ordinary above
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('de1c5f87-d943-4af4-8f8b-45d107f0a342',
   'edc1fd3d-ffe1-48c9-b6bc-f71740d38d65',
   'cb077b57-b052-4652-8117-34bd4630ee6c', 'C Ordinary',
   '2024-06-15', 2.00, 5000, 10000.00,
   'no', 'active', 'buy', 'syndicate');

-- Mishipay Ltd — Ordinary (1 lot, EIS qualifying)
-- Current price: £2.10  |  Bought at £1.00 — good growth example
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('de1c5f87-d943-4af4-8f8b-45d107f0a342',
   '7d0c3e1f-d09b-409a-99c5-377833825a3c',
   'b67c1270-b9ec-483d-a313-26a692d580cf', 'Ordinary',
   '2023-08-22', 1.00, 10000, 10000.00,
   'yes', 'active', 'buy', 'syndicate');

-- Obrizum Group Ltd — Ordinary (2 lots, both EIS qualifying)
-- Current price: £0.80  |  Follow-on at a higher price — tests two-lot rendering
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('de1c5f87-d943-4af4-8f8b-45d107f0a342',
   'e8527add-653e-47aa-b5b7-455d27b96339',
   '7ec2c296-0764-4e40-bc41-4d883f890a9b', 'Ordinary',
   '2022-06-15', 0.40, 25000, 10000.00,
   'yes', 'active', 'buy', 'syndicate'),

  ('de1c5f87-d943-4af4-8f8b-45d107f0a342',
   'e8527add-653e-47aa-b5b7-455d27b96339',
   '7ec2c296-0764-4e40-bc41-4d883f890a9b', 'Ordinary',
   '2023-11-30', 0.60, 10000, 6000.00,
   'yes', 'active', 'buy', 'syndicate');

-- Ball Co — B Preference (1 lot, not EIS)
-- Current price: £3.50  |  Preference class tests the badge rendering
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('de1c5f87-d943-4af4-8f8b-45d107f0a342',
   'fa970935-df6f-42fb-aeda-e9c4c2584ff5',
   'd63ffdc8-77a9-4574-a2f1-6e219941173e', 'B Preference',
   '2023-02-28', 2.00, 5000, 10000.00,
   'no', 'active', 'buy', 'syndicate');


-- ── Bob Bigballs ───────────────────────────────────────────────────────────
-- client_id: 14dd98e1-611f-49d8-aa5b-5b95e18834bd
-- 5 lots across: AI Forge Ordinary, Edozo Ordinary (2 lots),
--                Purple A Ordinary, Synchtank Ordinary

-- AI Forge Ltd — Ordinary (1 lot, EIS qualifying)
-- Same round date as Barry's first AI Forge lot
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('14dd98e1-611f-49d8-aa5b-5b95e18834bd',
   'f913f80e-0c95-4e39-9e27-0c66e5e5f278',
   'c61c6096-7acc-47c3-8cdb-31bdff29a47a', 'Ordinary',
   '2023-09-15', 1.00, 5000, 5000.00,
   'yes', 'active', 'buy', 'syndicate');

-- Edozo — Ordinary (2 lots, both EIS qualifying)
-- Current price: £3.00  |  Strong performer; tests multi-lot company grouping
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('14dd98e1-611f-49d8-aa5b-5b95e18834bd',
   'ad994bca-41d5-4ba8-ac45-dc886d854637',
   'ded8e01c-8168-4cd0-a121-52ae49cfb564', 'Ordinary',
   '2022-05-01', 1.00, 10000, 10000.00,
   'yes', 'active', 'buy', 'syndicate'),

  ('14dd98e1-611f-49d8-aa5b-5b95e18834bd',
   'ad994bca-41d5-4ba8-ac45-dc886d854637',
   'ded8e01c-8168-4cd0-a121-52ae49cfb564', 'Ordinary',
   '2023-10-15', 2.00, 3000, 6000.00,
   'yes', 'active', 'buy', 'syndicate');

-- Purple — A Ordinary (1 lot, EIS qualifying)
-- Current price: £3.00  |  Tests Purple's multi-class company (A/B/Ordinary)
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('14dd98e1-611f-49d8-aa5b-5b95e18834bd',
   '7aebe7d7-94be-40c8-bed0-a88f21d948ca',
   '80d0e01e-6739-4f7e-9040-889d50d860a4', 'A Ordinary',
   '2023-01-20', 1.50, 8000, 12000.00,
   'yes', 'active', 'buy', 'syndicate');

-- Synchtank — Ordinary (1 lot, EIS status NULL = TBC)
-- Current price: £0.75  |  NULL eis_status tests the "empty EIS column" rendering
INSERT INTO investments
  (client_id, company_id, share_class_id, share_class,
   investment_date, original_share_price, shares_purchased, sum_subscribed,
   eis_status, status, transaction_type, fund_type)
VALUES
  ('14dd98e1-611f-49d8-aa5b-5b95e18834bd',
   'beb31f57-2929-45ec-b43e-e3377f0ae3fb',
   '2d0e4ef8-9c6a-4c5c-ba8f-d806701feb8b', 'Ordinary',
   '2024-04-10', 0.40, 25000, 10000.00,
   NULL, 'active', 'buy', 'syndicate');

COMMIT;
