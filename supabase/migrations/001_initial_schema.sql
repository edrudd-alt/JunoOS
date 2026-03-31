-- ============================================================
-- Juno Capital Partners — Database Schema v1
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- CLIENTS
-- ============================================================
create table clients (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  investor_reference text unique,
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  postcode text,
  date_joined date,
  tax_status text check (tax_status in ('eis', 'seis', 'both', 'neither')) default 'neither',
  kyc_status text check (kyc_status in ('verified', 'renewal_due', 'outstanding')) default 'outstanding',
  kyc_expiry date,
  default_fee_rate numeric(5,2) default 5.00,
  report_delivery_email text,
  -- Entity hierarchy: lead_investor_id null = this IS the lead
  lead_investor_id uuid references clients(id) on delete set null,
  entity_type text check (entity_type in ('own_name', 'family', 'corporate')) default 'own_name',
  holding_location text check (holding_location in ('direct', 'nominee', 'both')) default 'direct',
  -- Reporting defaults: JSON array of entity IDs to include by default
  reporting_entity_defaults jsonb default '[]',
  report_delivery_method text check (report_delivery_method in ('email', 'download_only')) default 'email',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_clients_lead_investor on clients(lead_investor_id);
create index idx_clients_kyc_status on clients(kyc_status);

-- ============================================================
-- COMPANIES
-- ============================================================
create table companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sector text,
  stage text check (stage in ('pre-seed', 'seed', 'series_a', 'series_b', 'series_c', 'growth', 'late_stage')),
  eis_eligible boolean default false,
  logo_url text,
  website text,
  description text,
  -- Share classes stored as JSON array: [{name, type, rights_summary}]
  share_classes jsonb default '[]',
  -- KPI config: which KPIs to track for this company
  kpi_config jsonb default '[]',
  -- Claude template for investor updates
  update_template jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_companies_name on companies(name);

-- ============================================================
-- INVESTMENTS (TRANSACTIONS)
-- ============================================================
create table investments (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  share_class text not null,
  investment_date date not null,
  original_share_price numeric(20,6) not null,
  shares_purchased numeric(20,4) not null,
  sum_subscribed numeric(20,2) not null,
  eis_status text check (eis_status in ('yes', 'no', 'tbc')) default 'tbc',
  -- Which entity within the lead investor group holds this
  holding_entity text,
  holding_location text check (holding_location in ('direct', 'nominee')) default 'direct',
  status text check (status in ('active', 'pending', 'exited')) default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_investments_client on investments(client_id);
create index idx_investments_company on investments(company_id);
create index idx_investments_status on investments(status);

-- ============================================================
-- VALUATIONS
-- ============================================================
create table valuations (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  share_price numeric(20,6) not null,
  valuation_date date not null,
  updated_by uuid references auth.users(id),
  notes text,
  created_at timestamptz default now()
);

create index idx_valuations_company on valuations(company_id);
create index idx_valuations_date on valuations(company_id, valuation_date desc);

-- ============================================================
-- KPI DATA
-- ============================================================
create table kpi_data (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  kpi_name text not null,
  period text,             -- e.g. "Q1 2026", "Mar 2026"
  period_date date,        -- canonical date for sorting
  value numeric(20,4),
  unit text,               -- e.g. "£", "%", "headcount"
  source_document_id uuid, -- references documents(id), set after document table created
  auto_extracted boolean default false,
  manually_verified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_kpi_company on kpi_data(company_id);
create index idx_kpi_company_name on kpi_data(company_id, kpi_name);

-- ============================================================
-- DOCUMENTS
-- ============================================================
create table documents (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in (
    'board_minutes', 'management_accounts', 'call_notes', 'ceo_update',
    'kpi_spreadsheet', 'press_release', 'application_form', 'eis_certificate',
    'transaction_statement', 'investment_agreement', 'side_letter', 'invoice',
    'kyc', 'poa', 'membership_agreement', 'suitability_assessment',
    'source_of_funds', 'portfolio_statement', 'company_update', 'exit_statement', 'other'
  )),
  company_id uuid references companies(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  deal_id uuid,            -- references deals(id), set after deals table created
  filename text not null,
  storage_url text,
  onedrive_url text,
  period text,
  document_date date,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index idx_documents_client on documents(client_id);
create index idx_documents_company on documents(company_id);
create index idx_documents_type on documents(type);

-- Add FK from kpi_data to documents now that documents table exists
alter table kpi_data
  add constraint fk_kpi_source_document
  foreign key (source_document_id) references documents(id) on delete set null;

-- ============================================================
-- DEALS
-- ============================================================
create table deals (
  id uuid primary key default uuid_generate_v4(),
  deal_type text not null check (deal_type in (
    'new_investment', 'follow_on', 'exit', 'kyc', 'side_letter', 'membership'
  )),
  company_id uuid references companies(id) on delete set null,
  share_class text,
  investment_amount numeric(20,2),
  share_price numeric(20,6),
  shares_calculated numeric(20,4),
  investment_date date,
  eis_qualifying text check (eis_qualifying in ('yes', 'no', 'tbc')) default 'tbc',
  status text check (status in (
    'draft', 'sent', 'partially_signed', 'fully_signed', 'complete'
  )) default 'draft',
  completion_checklist jsonb default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_deals_company on deals(company_id);
create index idx_deals_status on deals(status);

-- Add FK from documents to deals now that deals table exists
alter table documents
  add constraint fk_document_deal
  foreign key (deal_id) references deals(id) on delete set null;

-- ============================================================
-- DEAL INVESTORS
-- ============================================================
create table deal_investors (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid not null references deals(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  amount numeric(20,2),
  poa_held boolean default false,
  signing_status text check (signing_status in (
    'not_reviewed', 'reviewed', 'signed', 'pending'
  )) default 'pending',
  created_at timestamptz default now()
);

create index idx_deal_investors_deal on deal_investors(deal_id);
create index idx_deal_investors_client on deal_investors(client_id);

-- ============================================================
-- INVOICES
-- ============================================================
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid references deals(id) on delete set null,
  client_id uuid not null references clients(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  investment_amount numeric(20,2) not null,
  fee_percentage numeric(5,2) not null default 5.00,
  fee_amount numeric(20,2) not null,
  vat_amount numeric(20,2) not null default 0,
  due_date date,
  xero_invoice_id text,
  xero_invoice_number text,
  status text check (status in ('draft', 'sent', 'paid')) default 'draft',
  created_at timestamptz default now()
);

create index idx_invoices_client on invoices(client_id);
create index idx_invoices_deal on invoices(deal_id);

-- ============================================================
-- COMPANY NEWS
-- ============================================================
create table company_news (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  headline text not null,
  source text,
  url text,
  published_at timestamptz,
  is_significant boolean default false,
  significance_reason text,
  refreshed_at timestamptz default now(),
  created_at timestamptz default now()
);

create index idx_company_news_company on company_news(company_id);

-- ============================================================
-- INTERNAL UPDATES (activity feed)
-- ============================================================
create table internal_updates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  update_type text check (update_type in ('valuation', 'document', 'deal', 'note', 'client', 'report')),
  description text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index idx_internal_updates_company on internal_updates(company_id);
create index idx_internal_updates_created on internal_updates(created_at desc);

-- ============================================================
-- INVESTOR UPDATES (drafts workflow)
-- ============================================================
create table investor_updates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  update_type text check (update_type in ('type1', 'type2', 'type3')) not null,
  title text,
  narrative_text text,
  data_blocks jsonb default '[]',
  status text check (status in ('draft', 'in_review', 'approved', 'sent')) default 'draft',
  created_by uuid references auth.users(id),
  last_edited_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  version_history jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  sent_at timestamptz
);

create index idx_investor_updates_company on investor_updates(company_id);
create index idx_investor_updates_status on investor_updates(status);

-- ============================================================
-- INVESTOR UPDATE RECIPIENTS
-- ============================================================
create table investor_update_recipients (
  id uuid primary key default uuid_generate_v4(),
  investor_update_id uuid not null references investor_updates(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  included boolean default true,
  sent_at timestamptz,
  document_id uuid references documents(id)
);

-- ============================================================
-- CLIENT NOTES
-- ============================================================
create table client_notes (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  note_text text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index idx_client_notes_client on client_notes(client_id);

-- ============================================================
-- TEAM MEMBERS (user profiles extending auth.users)
-- ============================================================
create table team_members (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  initials text,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- All tables: only authenticated users can access
alter table clients enable row level security;
alter table companies enable row level security;
alter table investments enable row level security;
alter table valuations enable row level security;
alter table kpi_data enable row level security;
alter table documents enable row level security;
alter table deals enable row level security;
alter table deal_investors enable row level security;
alter table invoices enable row level security;
alter table company_news enable row level security;
alter table internal_updates enable row level security;
alter table investor_updates enable row level security;
alter table investor_update_recipients enable row level security;
alter table client_notes enable row level security;
alter table team_members enable row level security;

-- Policies: authenticated users can do everything (no role separation in v1)
do $$
declare
  tbl text;
  tables text[] := array[
    'clients', 'companies', 'investments', 'valuations', 'kpi_data',
    'documents', 'deals', 'deal_investors', 'invoices', 'company_news',
    'internal_updates', 'investor_updates', 'investor_update_recipients',
    'client_notes', 'team_members'
  ];
begin
  foreach tbl in array tables loop
    execute format(
      'create policy "Authenticated users have full access" on %I
       for all to authenticated using (true) with check (true)',
      tbl
    );
  end loop;
end$$;

-- ============================================================
-- HELPFUL VIEWS
-- ============================================================

-- Current share price per company (latest valuation)
create view company_current_valuations as
select distinct on (company_id)
  company_id,
  share_price,
  valuation_date
from valuations
order by company_id, valuation_date desc;

-- Client portfolio summary view
create view client_portfolio_summary as
select
  i.client_id,
  i.company_id,
  c.name as company_name,
  c.sector,
  sum(i.sum_subscribed) as total_invested,
  sum(i.shares_purchased) as total_shares,
  count(*) as transaction_count,
  -- Current value calculated against latest share price
  sum(i.shares_purchased * coalesce(v.share_price, i.original_share_price)) as current_value,
  sum(i.shares_purchased * coalesce(v.share_price, i.original_share_price)) - sum(i.sum_subscribed) as gain_loss
from investments i
join companies c on c.id = i.company_id
left join company_current_valuations v on v.company_id = i.company_id
where i.status = 'active'
group by i.client_id, i.company_id, c.name, c.sector;
