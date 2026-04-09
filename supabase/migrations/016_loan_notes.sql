-- ============================================================
-- Migration 016: Loan notes
-- Creates the loan_notes and loan_note_repayments tables as
-- defined in Transaction Workflow Spec Section 6.1, and adds
-- the deferred FK from loan_note_interest_adjustments.loan_note_id
-- that could not be created in migration 013.
--
-- Note: no current_balance on loan_notes — principal is fixed
-- and interest is always calculated dynamically.
-- ============================================================

-- 1. loan_notes — one row per loan note per investor
create table loan_notes (
  id                       uuid          primary key default uuid_generate_v4(),
  company_id               uuid          not null references companies(id) on delete cascade,
  client_id                uuid          not null references clients(id) on delete cascade,
  held_by_entity_id        uuid          null references clients(id) on delete set null,
  location                 text          not null check (location in ('direct', 'nominee')),
  nominee_id               uuid          null references clients(id) on delete set null,
  principal_amount         numeric(20,2) not null,   -- fixed, never updated
  interest_rate            numeric(8,6)  not null,   -- e.g. 0.080000 for 8% p.a.
  interest_treatment       text          not null check (interest_treatment in ('rolled_up', 'paid')),
  issue_date               date          not null,
  maturity_date            date          null,
  status                   text          not null default 'active'
    check (status in ('active', 'partially_repaid', 'repaid')),
  loan_document_reference  text          null,
  notes                    text          null,
  created_at               timestamptz   not null default now()
);

create index idx_loan_notes_company on loan_notes(company_id);
create index idx_loan_notes_client  on loan_notes(client_id);
create index idx_loan_notes_status  on loan_notes(status);

alter table loan_notes enable row level security;

create policy "Authenticated users have full access" on loan_notes
  for all to authenticated using (true) with check (true);


-- 2. loan_note_repayments — one row per repayment event
create table loan_note_repayments (
  id                uuid          primary key default uuid_generate_v4(),
  loan_note_id      uuid          not null references loan_notes(id) on delete cascade,
  company_id        uuid          not null references companies(id) on delete cascade,
  client_id         uuid          not null references clients(id) on delete cascade,
  repayment_date    date          not null,
  principal_repaid  numeric(20,2) not null,
  interest_repaid   numeric(20,2) not null,
  total_repaid      numeric(20,2) not null,   -- stored: principal_repaid + interest_repaid
  full_repayment    boolean       not null default false,
  payment_route     text          not null check (payment_route in ('direct', 'nominee')),
  created_at        timestamptz   not null default now()
);

create index idx_loan_note_repayments_loan_note on loan_note_repayments(loan_note_id);
create index idx_loan_note_repayments_client    on loan_note_repayments(client_id);

alter table loan_note_repayments enable row level security;

create policy "Authenticated users have full access" on loan_note_repayments
  for all to authenticated using (true) with check (true);


-- 3. Add the deferred FK from loan_note_interest_adjustments
--    Deferred in migration 013 because loan_notes did not exist yet.
alter table loan_note_interest_adjustments
  add constraint fk_interest_adj_loan_note
  foreign key (loan_note_id) references loan_notes(id) on delete cascade;
