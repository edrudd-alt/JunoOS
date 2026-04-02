-- ============================================================
-- Migration 002 — Add missing columns flagged by bulk upload
-- ============================================================

-- companies: add founded_year and country
alter table companies
  add column if not exists founded_year integer,
  add column if not exists country text;

-- clients: add nationality
alter table clients
  add column if not exists nationality text;

-- valuations: add valuation_type
alter table valuations
  add column if not exists valuation_type text;
