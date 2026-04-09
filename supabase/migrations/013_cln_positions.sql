-- ============================================================
-- Migration 013: CLN positions and shared interest adjustments
-- Creates the cln_positions table (shared for ASA and standard
-- CLN) and the loan_note_interest_adjustments table shared
-- between straight loan notes (Section 6.1) and CLN positions.
--
-- Based on Transaction Workflow Spec Section 6.2.
-- ============================================================

-- 1. cln_positions — one row per ASA or CLN position per investor
create table cln_positions (
  id                        uuid primary key default uuid_generate_v4(),
  type                      text not null check (type in ('asa', 'cln')),
  company_id                uuid not null references companies(id) on delete cascade,
  client_id                 uuid not null references clients(id) on delete cascade,
  held_by_entity_id         uuid null references clients(id) on delete set null,
  location                  text not null check (location in ('direct', 'nominee')),
  nominee_id                uuid null references clients(id) on delete set null,
  principal_amount          numeric(20,2) not null,   -- fixed, never changes
  interest_rate             numeric(8,6)  null,        -- null for ASA
  interest_treatment        text          null         -- null for ASA
    check (interest_treatment in ('rolled_up', 'paid')),
  investment_date           date          not null,
  conversion_deadline       date          null,        -- ASA only: investment_date + 6 months
  maturity_date             date          null,        -- CLN only
  discount_rate             numeric(8,6)  null,        -- e.g. 0.20 for 20%
  valuation_cap             numeric(20,2) null,        -- e.g. 5000000.00 for £5m
  conversion_price          numeric(20,6) null,        -- populated at conversion
  conversion_share_class_id uuid          null
    references company_share_classes(id) on delete set null,
  conversion_triggers       jsonb         null,        -- CLN only
  status                    text          not null default 'active'
    check (status in ('active', 'converted', 'repaid')),
  eis_qualifying            boolean       not null default false,
  conversion_date           date          null,        -- populated on conversion
  eis_start_date            date          null,        -- ASA only: set to conversion_date
  fee_rate                  numeric(5,2)  not null,
  fee_amount                numeric(20,2) not null,
  notes                     text          null,
  created_at                timestamptz   not null default now()
);

create index idx_cln_positions_company on cln_positions(company_id);
create index idx_cln_positions_client  on cln_positions(client_id);
create index idx_cln_positions_status  on cln_positions(status);

alter table cln_positions enable row level security;

create policy "Authenticated users have full access" on cln_positions
  for all to authenticated using (true) with check (true);


-- 2. loan_note_interest_adjustments
--    Shared between straight loan notes (Section 6.1) and CLN positions.
--    Exactly one of loan_note_id or cln_position_id is populated per row.
--    loan_note_id FK constraint is not added here — loan_notes table does not
--    yet exist and will be created in a later migration. The FK will be added
--    then via ALTER TABLE.
create table loan_note_interest_adjustments (
  id                         uuid          primary key default uuid_generate_v4(),
  loan_note_id               uuid          null,   -- FK to loan_notes, added in later migration
  cln_position_id            uuid          null
    references cln_positions(id) on delete cascade,
  effective_date             date          not null,
  confirmed_accrued_interest numeric(20,2) not null,
  notes                      text          null,
  created_by                 uuid          null references auth.users(id) on delete set null,
  created_at                 timestamptz   not null default now(),

  constraint chk_interest_adj_one_parent check (
    (loan_note_id is not null)::int + (cln_position_id is not null)::int = 1
  )
);

create index idx_interest_adj_cln_position on loan_note_interest_adjustments(cln_position_id);
create index idx_interest_adj_loan_note    on loan_note_interest_adjustments(loan_note_id)
  where loan_note_id is not null;

alter table loan_note_interest_adjustments enable row level security;

create policy "Authenticated users have full access" on loan_note_interest_adjustments
  for all to authenticated using (true) with check (true);
