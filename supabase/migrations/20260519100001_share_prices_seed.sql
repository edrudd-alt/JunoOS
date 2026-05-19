-- ============================================================
-- Seed: 20260519100001_share_prices_seed
-- Sub-stage 2B.1 — Re-seed share classes, valuations, and
--                  investments.share_class_id backfill
--
-- !! DEPENDS ON: 20260519100000_share_prices_foundation.sql !!
-- Apply the foundation migration first (it wipes both tables
-- and adds the columns). Then apply this seed to repopulate.
--
-- Apply manually in the Supabase SQL editor.
-- ============================================================


-- ─── Block A: Insert share classes for all 11 portfolio companies ─────────────
--
-- One row per share class per company. The spread of classes is based on
-- the Barry O'Brien report and the decisions locked in spec section 2.
--
-- instrument_type:
--   'equity'  — standard equity class. The share-prices page shows these as
--               editable rows where the team can enter a new price.
--   'cln'     — convertible loan note pseudo-class. The page shows these as
--               read-only rows, always priced at £1.00 per £1 of principal.
--
-- preference_multiple and participating are only populated for preference
-- classes. All other rows leave those columns NULL.
--
-- The unique index on (company_id, name) means if this seed is accidentally
-- run twice, Postgres will reject the duplicate rows — no silent doubling.
-- ─────────────────────────────────────────────────────────────────────────────
insert into company_share_classes
  (id, company_id, name, type, instrument_type, preference_multiple, participating)
values
  -- ── AI Forge Ltd ─────────────────────────────────────────────────────────
  (gen_random_uuid(), 'f913f80e-0c95-4e39-9e27-0c66e5e5f278', 'Ordinary', 'ordinary', 'equity', null, null),
  (gen_random_uuid(), 'f913f80e-0c95-4e39-9e27-0c66e5e5f278', 'CLN',      'ordinary', 'cln',    null, null),

  -- ── Ball Co ──────────────────────────────────────────────────────────────
  -- B Preference: 4× liquidation multiple, fully participating.
  (gen_random_uuid(), 'fa970935-df6f-42fb-aeda-e9c4c2584ff5', 'Ordinary',     'ordinary',   'equity', null, null),
  (gen_random_uuid(), 'fa970935-df6f-42fb-aeda-e9c4c2584ff5', 'B Preference', 'preference', 'equity', 4.00, true),

  -- ── Cyclr ────────────────────────────────────────────────────────────────
  (gen_random_uuid(), 'edc1fd3d-ffe1-48c9-b6bc-f71740d38d65', 'Ordinary',   'ordinary', 'equity', null, null),
  (gen_random_uuid(), 'edc1fd3d-ffe1-48c9-b6bc-f71740d38d65', 'A Ordinary', 'ordinary', 'equity', null, null),
  (gen_random_uuid(), 'edc1fd3d-ffe1-48c9-b6bc-f71740d38d65', 'C Ordinary', 'ordinary', 'equity', null, null),

  -- ── Domainex Ltd ─────────────────────────────────────────────────────────
  -- D Preference: 4× liquidation multiple, fully participating.
  (gen_random_uuid(), '5162864d-c6a5-496e-a381-de1ac21fda85', 'Ordinary',     'ordinary',   'equity', null, null),
  (gen_random_uuid(), '5162864d-c6a5-496e-a381-de1ac21fda85', 'B Ordinary',   'ordinary',   'equity', null, null),
  (gen_random_uuid(), '5162864d-c6a5-496e-a381-de1ac21fda85', 'D Preference', 'preference', 'equity', 4.00, true),

  -- ── Edozo ────────────────────────────────────────────────────────────────
  -- A Ordinary: deliberately left with no valuation (tests empty-row rendering).
  (gen_random_uuid(), 'ad994bca-41d5-4ba8-ac45-dc886d854637', 'Ordinary',   'ordinary', 'equity', null, null),
  (gen_random_uuid(), 'ad994bca-41d5-4ba8-ac45-dc886d854637', 'A Ordinary', 'ordinary', 'equity', null, null),

  -- ── Groovance ────────────────────────────────────────────────────────────
  -- Ordinary: deliberately left with no valuation (tests empty-row rendering).
  (gen_random_uuid(), '15738685-5b7d-4390-9b11-604f8b8d7492', 'Ordinary', 'ordinary', 'equity', null, null),

  -- ── Mishipay Ltd ─────────────────────────────────────────────────────────
  (gen_random_uuid(), '7d0c3e1f-d09b-409a-99c5-377833825a3c', 'Ordinary', 'ordinary', 'equity', null, null),

  -- ── Obrizum Group Ltd ────────────────────────────────────────────────────
  (gen_random_uuid(), 'e8527add-653e-47aa-b5b7-455d27b96339', 'Ordinary', 'ordinary', 'equity', null, null),

  -- ── Purple ───────────────────────────────────────────────────────────────
  (gen_random_uuid(), '7aebe7d7-94be-40c8-bed0-a88f21d948ca', 'Ordinary',   'ordinary', 'equity', null, null),
  (gen_random_uuid(), '7aebe7d7-94be-40c8-bed0-a88f21d948ca', 'A Ordinary', 'ordinary', 'equity', null, null),
  (gen_random_uuid(), '7aebe7d7-94be-40c8-bed0-a88f21d948ca', 'B Ordinary', 'ordinary', 'equity', null, null),

  -- ── Sky Medical ──────────────────────────────────────────────────────────
  (gen_random_uuid(), '3a2b7140-15d7-432c-a933-3242243ce632', 'Ordinary',   'ordinary', 'equity', null, null),
  (gen_random_uuid(), '3a2b7140-15d7-432c-a933-3242243ce632', 'A Ordinary', 'ordinary', 'equity', null, null),
  (gen_random_uuid(), '3a2b7140-15d7-432c-a933-3242243ce632', 'CLN',        'ordinary', 'cln',    null, null),

  -- ── Synchtank ────────────────────────────────────────────────────────────
  (gen_random_uuid(), 'beb31f57-2929-45ec-b43e-e3377f0ae3fb', 'Ordinary',   'ordinary', 'equity', null, null),
  (gen_random_uuid(), 'beb31f57-2929-45ec-b43e-e3377f0ae3fb', 'C Ordinary', 'ordinary', 'equity', null, null);


-- ─── Block B: Insert valuations for equity share classes ─────────────────────
--
-- One valuation per equity class, spread across three staleness bands so the
-- share-prices page (in sub-stage 2B.3) exercises all three visual states:
--   FRESH   — last 30 days       (7 rows)
--   MID     — 1 to 6 months ago  (6 rows)
--   STALE   — more than 6 months (6 rows)
--
-- Two equity classes are intentionally left with NO valuation:
--   • Groovance · Ordinary
--   • Edozo · A Ordinary
-- These exercise the "Never valued" empty-row rendering.
--
-- CLN classes (AI Forge CLN, Sky Medical CLN) get no valuation — they
-- are always read-only at £1.00 per £1 of principal by design.
--
-- The CTE joins on (company name, class name) to resolve the share_class_id
-- without hardcoding UUIDs that were just generated above.
-- ─────────────────────────────────────────────────────────────────────────────
with valuation_inputs (company_name, class_name, share_price, valuation_date, methodology) as (
  values
    -- ── FRESH — priced within the last 30 days ───────────────────────────
    ('AI Forge Ltd',       'Ordinary',     2.50::numeric,  '2026-05-08'::date, 'Series A round'),
    ('Ball Co',            'Ordinary',     1.00::numeric,  '2026-04-30'::date, 'Board approved'),
    ('Cyclr',              'A Ordinary',   1.75::numeric,  '2026-05-12'::date, 'Series B round'),
    ('Domainex Ltd',       'D Preference', 5.00::numeric,  '2026-04-22'::date, 'Last funding round'),
    ('Mishipay Ltd',       'Ordinary',     2.10::numeric,  '2026-05-01'::date, 'Board approved'),
    ('Purple',             'B Ordinary',   4.50::numeric,  '2026-05-15'::date, 'Series C round'),
    ('Sky Medical',        'A Ordinary',   1.25::numeric,  '2026-04-25'::date, '409A valuation'),

    -- ── MID — priced 1 to 6 months ago ──────────────────────────────────
    ('Ball Co',            'B Preference', 3.50::numeric,  '2026-03-10'::date, 'Series A round'),
    ('Cyclr',              'Ordinary',     0.25::numeric,  '2026-02-14'::date, 'Board approved'),
    ('Domainex Ltd',       'Ordinary',     0.50::numeric,  '2026-01-20'::date, 'Last funding round'),
    ('Obrizum Group Ltd',  'Ordinary',     0.80::numeric,  '2026-03-28'::date, 'Board approved'),
    ('Purple',             'Ordinary',     1.50::numeric,  '2026-02-03'::date, 'Series B round'),
    ('Synchtank',          'C Ordinary',   2.25::numeric,  '2026-04-05'::date, 'Board approved'),

    -- ── STALE — priced more than 6 months ago ────────────────────────────
    ('Cyclr',              'C Ordinary',   4.20::numeric,  '2025-10-30'::date, 'Series B round'),
    ('Domainex Ltd',       'B Ordinary',   1.20::numeric,  '2025-09-15'::date, 'Board approved'),
    ('Edozo',              'Ordinary',     3.00::numeric,  '2025-11-01'::date, 'Series A round'),
    ('Purple',             'A Ordinary',   3.00::numeric,  '2025-08-20'::date, 'Board approved'),
    ('Sky Medical',        'Ordinary',     0.50::numeric,  '2025-10-10'::date, 'Last funding round'),
    ('Synchtank',          'Ordinary',     0.75::numeric,  '2025-07-22'::date, 'Board approved')
)
insert into valuations
  (company_id, share_class_id, share_price, valuation_date, methodology, source, updated_by)
select
  csc.company_id,
  csc.id           as share_class_id,
  vi.share_price,
  vi.valuation_date,
  vi.methodology,
  'manual',
  '71b8ef49-8d32-4d0b-baa8-8aa8f9a42fae'   -- Ed's user ID
from valuation_inputs vi
join companies c             on c.name   = vi.company_name
join company_share_classes csc
  on  csc.company_id = c.id
  and csc.name       = vi.class_name;


-- ─── Block C: Backfill investments.share_class_id ────────────────────────────
--
-- The CASCADE truncate in the foundation migration nulled out share_class_id
-- on all investments rows. This block re-links each investment to its share
-- class by matching the free-text share_class column against the newly-seeded
-- class names for the same company.
--
-- Matching is case-insensitive and whitespace-trimmed so minor formatting
-- differences don't break the link. Rows that don't find a match stay NULL
-- and will need manual cleanup or a separate follow-up.
-- ─────────────────────────────────────────────────────────────────────────────
update investments i
set    share_class_id = csc.id
from   company_share_classes csc
where  i.share_class_id is null
  and  csc.company_id          = i.company_id
  and  lower(trim(csc.name))   = lower(trim(i.share_class));
