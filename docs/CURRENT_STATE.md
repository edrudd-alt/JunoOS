# JunoOS — Current State Inventory
**Produced:** 2026-04-07 (Stage 1 re-run, clean branch `rescue-april-2026`)
**Stage:** 1 of Project Rescue Playbook — read-only audit, no code changes made
**Scope:** Every file in `src/`, `supabase/migrations/`, `package.json`, and root config files

---

## 1. Folder Structure

```
JunoOS/
├── src/
│   ├── app/
│   │   ├── (auth)/                           — Unauthenticated routes
│   │   │   ├── login/page.tsx                — Email/password login form
│   │   │   └── auth/callback/route.ts        — Supabase OAuth callback handler
│   │   ├── (app)/                            — Protected routes (require auth)
│   │   │   ├── layout.tsx                    — Auth check, TopNav, main page layout
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx                  — Server: fetches metrics, feed, valuations, news
│   │   │   │   ├── Dashboard.tsx             — Client: renders headline metrics, valuation banner, activity feed
│   │   │   │   └── loading.tsx               — Suspense skeleton
│   │   │   ├── clients/
│   │   │   │   ├── page.tsx                  — Server: fetches clients + activity + portfolio
│   │   │   │   ├── ClientList.tsx            — Client: list with sorting, filtering, pagination, attention panel
│   │   │   │   ├── new/
│   │   │   │   │   ├── page.tsx              — Server: fetches lead investors
│   │   │   │   │   └── NewClientForm.tsx     — Client: create new client or linked entity
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx              — Server: fetches full client record, portfolio, docs, deals
│   │   │   │       ├── ClientRecord.tsx      — Client: renders client detail with tab navigation
│   │   │   │       ├── edit/
│   │   │   │       │   ├── page.tsx          — Server: fetches client
│   │   │   │       │   └── EditClientForm.tsx — Client: edit client form
│   │   │   │       ├── tabs/
│   │   │   │       │   ├── DetailsTab.tsx    — Contact info, KYC, entity details
│   │   │   │       │   ├── OverviewTab.tsx   — Portfolio summary, pending actions
│   │   │   │       │   ├── InvestmentsTab.tsx — Per-investment ledger with filters
│   │   │   │       │   ├── PendingActionsTab.tsx — KYC alerts, unsigned docs, EIS outstanding
│   │   │   │       │   ├── UpdatesSentTab.tsx — Investor updates sent to this client
│   │   │   │       │   ├── NotesTab.tsx      — Internal notes
│   │   │   │       │   └── InvestmentDocsTab.tsx — Documents scoped to this client
│   │   │   │       └── loading.tsx
│   │   │   ├── portfolio/
│   │   │   │   ├── page.tsx                  — Server: fetches companies, valuations, KPIs, portfolio summary
│   │   │   │   ├── PortfolioList.tsx         — Client: company grid with performance indicators
│   │   │   │   ├── new/page.tsx              — Client: add new company form (client component, no server wrapper)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx              — Server: fetches company, investments, valuations, KPIs, notes
│   │   │   │       ├── CompanyPage.tsx       — Client: company detail with tabs
│   │   │   │       ├── SharePriceSection.tsx — Share price display and update trigger
│   │   │   │       ├── UpdateValuationModal.tsx — Modal to add new valuation
│   │   │   │       ├── tabs/
│   │   │   │       │   ├── CompanyOverviewTab.tsx — Summary, description, KPIs, news
│   │   │   │       │   ├── CompanyValuationsTab.tsx — Valuation history table + chart
│   │   │   │       │   └── CompanyInvestorsTab.tsx — Investor holdings grouped by entity
│   │   │   │       ├── kpis/page.tsx         — KPI history page (partial implementation)
│   │   │   │       ├── settings/page.tsx     — Company settings (stub: "coming soon")
│   │   │   │       └── loading.tsx
│   │   │   ├── investments/
│   │   │   │   ├── page.tsx                  — Server: fetches investments (with embedded companies join), companies, clients, valuations
│   │   │   │   ├── InvestmentsLedger.tsx     — Client: three-view ledger (Holdings, Ledger, Sales)
│   │   │   │   ├── HoldingsView.tsx          — Portfolio holdings grouped by company/client
│   │   │   │   ├── LedgerView.tsx            — Full transaction history (all buy/sell/transfer)
│   │   │   │   ├── SalesView.tsx             — Exit/sale records and performance
│   │   │   │   ├── PerformanceView.tsx       — Performance metrics
│   │   │   │   ├── RecordTransactionModal.tsx — Modal to manually add transactions
│   │   │   │   └── ledgerUtils.ts            — Holding calculation helpers
│   │   │   ├── deals/
│   │   │   │   ├── page.tsx                  — Server: fetches deals, deal_investors, clients, companies
│   │   │   │   ├── DealsList.tsx             — Client: deal list with status filtering
│   │   │   │   ├── new/
│   │   │   │   │   ├── page.tsx              — Server: fetches companies, clients, investments
│   │   │   │   │   ├── NewDealPage.tsx       — Client: routes to correct wizard based on deal type
│   │   │   │   │   ├── NewDealWizard.tsx     — Generic 5-step wizard (kyc / side_letter / membership)
│   │   │   │   │   ├── BuyDealWizard.tsx     — Container for buy wizard (new_investment / follow_on)
│   │   │   │   │   ├── SellDealWizard.tsx    — Container for sell wizard (full_exit / partial_exit)
│   │   │   │   │   ├── DealSetupStep.tsx     — Shared setup step (generic wizard)
│   │   │   │   │   ├── DocumentsStep.tsx     — Document selection and upload
│   │   │   │   │   ├── SendStep.tsx          — Send for signature (generic)
│   │   │   │   │   ├── TrackStep.tsx         — Signature tracking (generic)
│   │   │   │   │   ├── CompleteStep.tsx      — Completion step (generic)
│   │   │   │   │   ├── wizardTypes.ts        — Shared types and DEAL_TYPES constant
│   │   │   │   │   ├── wizardHelpers.tsx     — Utility components for wizards
│   │   │   │   │   ├── buy/
│   │   │   │   │   │   ├── SetupStep.tsx     — Company, share class, price, EIS selection
│   │   │   │   │   │   ├── InvestorsStep.tsx — Add/configure investors, derive EIS per client
│   │   │   │   │   │   ├── ReviewStep.tsx    — Summary before sending
│   │   │   │   │   │   ├── SendStep.tsx      — Send documents for signature
│   │   │   │   │   │   ├── TrackStep.tsx     — Track signatures per investor
│   │   │   │   │   │   ├── PostDealStep.tsx  — Post-deal: invoices, EIS certs, notes
│   │   │   │   │   │   ├── CompleteStep.tsx  — Mark deal complete
│   │   │   │   │   │   ├── StepBar.tsx       — Buy wizard progress bar
│   │   │   │   │   │   └── buyWizardTypes.ts — Types: BuyDealType, EisStatus (yes|no|tbc), SetupData, InvestorRow
│   │   │   │   │   └── sell/
│   │   │   │   │       ├── SetupStep.tsx     — Company, share class, proceeds, sale date
│   │   │   │   │       ├── InvestorsStep.tsx — Select investors with existing holdings
│   │   │   │   │       ├── PoAStep.tsx       — Power of attorney collection
│   │   │   │   │       ├── BankDetailsStep.tsx — Bank details collection
│   │   │   │   │       ├── SettlementStep.tsx — Settlement confirmation
│   │   │   │   │       ├── ConsentStep.tsx   — Consent confirmation
│   │   │   │   │       ├── ReviewStep.tsx    — Summary before sending
│   │   │   │   │       ├── SendStep.tsx      — Send documents
│   │   │   │   │       ├── PostDealStep.tsx  — Post-sale steps
│   │   │   │   │       ├── CompleteStep.tsx  — Mark complete
│   │   │   │   │       ├── SellStepBar.tsx   — Sell wizard progress bar
│   │   │   │   │       └── sellWizardTypes.ts — SellDealType (full_exit|partial_exit), SellSetupData
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx              — Server: fetches deal, investors, docs, invoices, clients
│   │   │   │       ├── DealDetail.tsx        — Client: deal display with investors, documents, invoices
│   │   │   │       ├── CompletionChecklist.tsx — Renders completion checklist from completion_checklist JSON
│   │   │   │       ├── GenericChecklist.tsx  — Checklist for non-investment deals
│   │   │   │       ├── SignatureTracking.tsx — Shows signing status per investor
│   │   │   │       ├── dealDetailTypes.ts    — DealDetail type interfaces
│   │   │   │       ├── edit/page.tsx         — Server: fetches deal + clients + investments for edit
│   │   │   │       └── edit/EditInvestorsClient.tsx — Client: re-enter investor step for an existing deal
│   │   │   ├── reports/
│   │   │   │   ├── page.tsx                  — Server: fetches investor_updates (broken embedded join)
│   │   │   │   ├── Reports.tsx               — Client: report menu listing + update drafts
│   │   │   │   ├── investor-update/
│   │   │   │   │   ├── page.tsx              — Server: passes through
│   │   │   │   │   └── InvestorUpdateWizard.tsx — Client: create/edit/send investor update
│   │   │   │   └── portfolio-statement/
│   │   │   │       ├── page.tsx              — Server: passes through
│   │   │   │       └── PortfolioStatementWizard.tsx — Client: portfolio statement wizard
│   │   │   ├── documents/
│   │   │   │   └── page.tsx                  — Stub: "Documents managed per deal/client/company"
│   │   │   ├── settings/
│   │   │   │   ├── page.tsx                  — Settings index (links to fund-management, bulk-upload)
│   │   │   │   ├── fund-management/
│   │   │   │   │   ├── page.tsx              — Server: fetches fund_types, clients
│   │   │   │   │   └── FundManagementClient.tsx — Client: view/edit fund type definitions; assign to clients
│   │   │   │   └── bulk-upload/
│   │   │   │       ├── page.tsx              — Server: passes through
│   │   │   │       └── BulkUploadWizard.tsx  — Client: multi-entity CSV import wizard
│   │   │   ├── error.tsx                     — App error boundary
│   │   │   ├── loading.tsx                   — App-level Suspense skeleton
│   │   │   └── not-found.tsx                 — 404 page
│   │   ├── layout.tsx                        — Root HTML structure (no auth logic)
│   │   ├── page.tsx                          — Root redirect → /dashboard
│   │   ├── global-error.tsx                  — Global uncaught error handler
│   │   └── globals.css                       — Global CSS: .card, .btn, .pill variants, table styles, tokens
│   ├── components/
│   │   ├── nav/
│   │   │   └── TopNav.tsx                    — Sticky navigation bar with sign-out modal
│   │   └── Breadcrumb.tsx                    — Breadcrumb component (exists but not widely used)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                     — createClient() for Client Components (browser)
│   │   │   ├── server.ts                     — createClient() for Server Components (cookies)
│   │   │   └── types.ts                      — TypeScript Database interface + enum types
│   │   ├── services/
│   │   │   ├── signatureService.ts           — STUB: Documenso e-signature (throws if called)
│   │   │   └── pdfService.ts                 — STUB: PDF generation (throws if called)
│   │   └── utils.ts                          — formatCurrency, formatDate, formatPercent, calcGainLoss, getInitials, cn
│   ├── types/
│   │   └── index.ts                          — Canonical component-level TypeScript interfaces
│   └── proxy.ts                              — Auth middleware: checks session, protects routes, redirects
├── supabase/
│   └── migrations/                           — 7 sequential SQL migrations (001–007)
├── package.json
├── tsconfig.json                             — TypeScript config; `@/` → `./src/`
├── next.config.ts                            — Minimal Next.js config (no overrides)
├── eslint.config.mjs
├── postcss.config.mjs
└── .env.local                                — Supabase URL + anon key (committed — contains real credentials)
```

---

## 2. Dependencies

### Production
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.2.1 | App framework (App Router, Server Components, middleware via proxy.ts) |
| `react` | 19.2.4 | UI library |
| `react-dom` | 19.2.4 | React DOM renderer |
| `@supabase/supabase-js` | ^2.101.1 | Supabase client: database queries, auth, realtime |
| `@supabase/ssr` | ^0.10.0 | Server-side Supabase helpers: cookie-based session management |
| `lucide-react` | ^1.7.0 | SVG icon library (buttons, nav, status indicators) |

### Development
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5 | TypeScript compiler |
| `@types/node` | ^20 | Node.js type definitions |
| `@types/react` | ^19 | React type definitions |
| `@types/react-dom` | ^19 | React DOM type definitions |
| `tailwindcss` | ^4 | CSS utility framework — **installed but unused** (all styling is inline) |
| `@tailwindcss/postcss` | ^4 | Tailwind PostCSS plugin |
| `eslint` | ^9 | JavaScript/TypeScript linter |
| `eslint-config-next` | 16.2.1 | Next.js-specific ESLint rules |

**Notable absences:** No form library, no state management library, no data fetching library, no testing framework, no PDF library, no CSV parsing library.

---

## 3. Database Schema

### Migration 001 — `001_initial_schema.sql`
Core tables, views, indexes, and RLS.

#### Table: `clients`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| full_name | text | NOT NULL | |
| investor_reference | text | UNIQUE | e.g. JC-001 |
| email | text | | |
| phone | text | | |
| address_line1 | text | | |
| address_line2 | text | | |
| city | text | | |
| postcode | text | | |
| date_joined | date | | |
| tax_status | text | CHECK IN ('eis','seis','both','neither'), DEFAULT 'neither' | Client-level EIS eligibility |
| kyc_status | text | CHECK IN ('verified','renewal_due','outstanding'), DEFAULT 'outstanding' | |
| kyc_expiry | date | | |
| default_fee_rate | numeric | DEFAULT 5 | Entry fee % |
| report_delivery_email | text | | Defaults to email if null |
| lead_investor_id | uuid | FK clients(id) ON DELETE SET NULL | Parent in entity hierarchy |
| entity_type | text | CHECK IN ('own_name','family','corporate'), DEFAULT 'own_name' | |
| holding_location | text | CHECK IN ('direct','nominee','both'), DEFAULT 'direct' | |
| reporting_entity_defaults | text[] | DEFAULT '{}' | Array of entity IDs for reports |
| report_delivery_method | text | CHECK IN ('email','download_only'), DEFAULT 'email' | |
| notes | text | | |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | Auto-updated via trigger |

Indexes: `idx_clients_lead_investor (lead_investor_id)`, `idx_clients_kyc_status (kyc_status)`
RLS: `"Authenticated users have full access"` — all operations for `auth.role() = 'authenticated'`

#### Table: `companies`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| name | text | NOT NULL | |
| sector | text | | |
| stage | text | CHECK IN ('pre-seed','seed','series_a','series_b','series_c','growth','late_stage') | |
| eis_eligible | boolean | DEFAULT true | |
| logo_url | text | | |
| website | text | | |
| description | text | | |
| share_classes | jsonb | DEFAULT '[]' | Array of `{name, type, rights_summary}` |
| kpi_config | jsonb | DEFAULT '{}' | Unused — scaffolding |
| update_template | jsonb | DEFAULT '{}' | Unused — scaffolding |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |

Indexes: `idx_companies_name (name)`
RLS: `"Authenticated users have full access"`

#### Table: `investments`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| client_id | uuid | FK clients, NOT NULL | |
| company_id | uuid | FK companies, NOT NULL | |
| share_class | text | NOT NULL | |
| investment_date | date | NOT NULL | |
| original_share_price | numeric | NOT NULL | Price paid per share |
| shares_purchased | numeric | NOT NULL | Number of shares |
| sum_subscribed | numeric | NOT NULL | Total amount invested |
| eis_status | text | CHECK IN ('yes','no','tbc'), DEFAULT 'tbc' | Investment-level EIS classification |
| holding_entity | text | | Legal entity name (nominee or SIPP etc.) |
| holding_location | text | CHECK IN ('direct','nominee'), DEFAULT 'direct' | |
| status | text | CHECK IN ('active','pending','exited'), DEFAULT 'pending' | |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |

Indexes: `idx_investments_client`, `idx_investments_company`, `idx_investments_status`
RLS: `"Authenticated users have full access"`

#### Table: `valuations`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| company_id | uuid | FK companies, NOT NULL | |
| share_price | numeric | NOT NULL | |
| valuation_date | date | NOT NULL | |
| updated_by | uuid | FK auth.users | |
| notes | text | | |
| created_at | timestamptz | | |

Indexes: `idx_valuations_company`, `idx_valuations_date (company_id, valuation_date DESC)`
RLS: `"Authenticated users have full access"` ← superseded by migration 007

#### Table: `kpi_data`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| company_id | uuid | FK companies, NOT NULL | |
| kpi_name | text | NOT NULL | |
| period | text | | e.g. "2024-Q3" |
| period_date | date | | For sorting |
| value | numeric | | |
| unit | text | CHECK IN ('£','%','headcount','x','months','other') | |
| source_document_id | uuid | FK documents | |
| auto_extracted | boolean | DEFAULT false | AI extraction — not implemented |
| manually_verified | boolean | DEFAULT false | |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |

Indexes: `idx_kpi_company`, `idx_kpi_company_name (company_id, kpi_name)`
RLS: `"Authenticated users have full access"`

#### Table: `documents`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| type | text | CHECK IN (board_minutes\|management_accounts\|call_notes\|ceo_update\|kpi_spreadsheet\|press_release\|application_form\|eis_certificate\|transaction_statement\|investment_agreement\|side_letter\|invoice\|kyc\|poa\|membership_agreement\|suitability_assessment\|source_of_funds\|portfolio_statement\|company_update\|exit_statement\|other) | |
| company_id | uuid | FK companies | |
| client_id | uuid | FK clients | |
| deal_id | uuid | FK deals | |
| filename | text | NOT NULL | |
| storage_url | text | | Supabase storage |
| onedrive_url | text | | OneDrive link |
| period | text | | e.g. "2024-Q3" |
| document_date | date | | |
| uploaded_by | uuid | FK auth.users | |
| created_at | timestamptz | | |

Indexes: `idx_documents_client`, `idx_documents_company`, `idx_documents_type`
RLS: `"Authenticated users have full access"`

#### Table: `deals`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| deal_type | text | CHECK IN ('new_investment','follow_on','exit','kyc','side_letter','membership') — expanded by 005 | |
| company_id | uuid | FK companies | |
| share_class | text | | |
| investment_amount | numeric | | Total amount |
| share_price | numeric | | |
| shares_calculated | numeric | | |
| investment_date | date | | |
| eis_qualifying | text | CHECK IN ('yes','no','tbc'), DEFAULT 'tbc' | Deal-level EIS flag |
| status | text | CHECK IN ('draft','sent','partially_signed','fully_signed','complete'), DEFAULT 'draft' | |
| completion_checklist | jsonb | DEFAULT '{}' | Stores investor_data JSON at completion |
| created_by | uuid | FK auth.users | |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |

Indexes: `idx_deals_company`, `idx_deals_status`
RLS: `"Authenticated users have full access"`

#### Table: `deal_investors`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| deal_id | uuid | FK deals, NOT NULL | |
| client_id | uuid | FK clients, NOT NULL | |
| amount | numeric | | Investor's share of the deal |
| poa_held | boolean | DEFAULT false | |
| signing_status | text | CHECK IN ('not_reviewed','reviewed','signed','pending'), DEFAULT 'pending' | |
| created_at | timestamptz | | |

Indexes: `idx_deal_investors_deal`, `idx_deal_investors_client`
RLS: `"Authenticated users have full access"`

#### Table: `invoices`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| deal_id | uuid | FK deals | |
| client_id | uuid | FK clients | |
| company_id | uuid | FK companies | |
| investment_amount | numeric | | Gross investment subscribed |
| fee_percentage | numeric | | e.g. 5 (%) |
| fee_amount | numeric | | Calculated fee |
| vat_amount | numeric | DEFAULT 0 | |
| due_date | date | | |
| xero_invoice_id | text | | Xero sync ID |
| xero_invoice_number | text | | |
| status | text | CHECK IN ('draft','sent','paid'), DEFAULT 'draft' | |
| created_at | timestamptz | | |

Indexes: `idx_invoices_client`, `idx_invoices_deal`
RLS: `"Authenticated users have full access"`

#### Table: `company_news`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| company_id | uuid | FK companies, NOT NULL | |
| headline | text | NOT NULL | |
| source | text | | |
| url | text | | |
| published_at | timestamptz | | |
| is_significant | boolean | DEFAULT false | |
| significance_reason | text | | |
| refreshed_at | timestamptz | | |
| created_at | timestamptz | | |

Indexes: `idx_company_news_company`
RLS: `"Authenticated users have full access"`

#### Table: `internal_updates`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| company_id | uuid | FK companies | |
| client_id | uuid | FK clients | Added in schema — no migration number |
| update_type | text | CHECK IN ('valuation','document','deal','note','client','report','invoice') | |
| description | text | NOT NULL | |
| created_by | uuid | FK auth.users | |
| created_at | timestamptz | | |

Indexes: `idx_internal_updates_company`, `idx_internal_updates_created (created_at DESC)`
RLS: `"Authenticated users have full access"`

#### Table: `investor_updates`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| company_id | uuid | FK companies | |
| update_type | text | CHECK IN ('type1','type2','type3') | Meaning undocumented |
| title | text | | |
| narrative_text | text | | |
| data_blocks | jsonb | DEFAULT '[]' | Structured content blocks |
| status | text | CHECK IN ('draft','in_review','approved','sent'), DEFAULT 'draft' | |
| created_by | uuid | FK auth.users | |
| last_edited_by | uuid | FK auth.users | |
| approved_by | uuid | FK auth.users | |
| version_history | jsonb | DEFAULT '[]' | |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |
| sent_at | timestamptz | | |

Indexes: `idx_investor_updates_company`, `idx_investor_updates_status`
RLS: `"Authenticated users have full access"`

#### Table: `investor_update_recipients`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| investor_update_id | uuid | FK investor_updates, NOT NULL | |
| client_id | uuid | FK clients, NOT NULL | |
| included | boolean | DEFAULT true | |
| sent_at | timestamptz | | |
| document_id | uuid | FK documents | |

RLS: `"Authenticated users have full access"`

#### Table: `client_notes`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| client_id | uuid | FK clients, NOT NULL | |
| note_text | text | NOT NULL | |
| created_by | uuid | FK auth.users | |
| created_at | timestamptz | | |

Indexes: `idx_client_notes_client`
RLS: `"Authenticated users have full access"`

#### Table: `team_members`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, FK auth.users | |
| full_name | text | | |
| initials | text | | |
| created_at | timestamptz | | |

RLS: `"Authenticated users have full access"`

---

### Migration 002 — `002_add_missing_columns.sql`
Adds columns to existing tables:
- `clients`: `nationality text`, `country_of_residence text` (no UI currently uses these)
- `companies`: `founded_year int`, `country text` (used in company detail page)
- `valuations`: `valuation_type text` (no UI currently uses this)

---

### Migration 003 — `003_transaction_ledger.sql`
Extends investments table for transaction tracking:
- `investments`: adds `transaction_type text NOT NULL DEFAULT 'buy' CHECK IN ('buy','sell','transfer_in','transfer_out')`, `cost_basis numeric`, `transfer_counterparty_id uuid FK clients`, `transfer_type text CHECK IN ('commercial','gift')`, `notes text`

Creates **`holdings` view**: aggregates investments by (client_id, company_id, share_class, holding_location, holding_entity). Calculates shares_in, shares_out, remaining_shares, total_cost, total_proceeds, first_investment_date, current_share_price, current_value via LEFT JOIN company_current_valuations.

New indexes: `idx_investments_transaction_type`, `idx_investments_counterparty`

Also adds `fund_type text NOT NULL DEFAULT 'syndicate' CHECK IN ('syndicate','multi_manager')` to `investments` (Note: appears in 003 not 004 based on migration content).

---

### Migration 004 — `004_fund_management.sql`
Creates the `fund_types` reference table and seeds it:
- `fund_types`: id, name, code (unique: syndicate|multi_manager), description, annual_management_fee_pct, fee_cap_pct, fee_cap_years, fee_deferred, fee_basis, exit_fee_default_pct, created_at
- Seeded with: Syndicate (5% entry, no annual fee) and Multi Manager (2% annual deferred, 10% cap over 5 years)

Adds to `clients`: `fund_type text NOT NULL DEFAULT 'syndicate' CHECK IN ('syndicate','multi_manager','both')`, `active_fund_type text CHECK IN ('syndicate','multi_manager')`

Index: `idx_investments_fund_type`

---

### Migration 005 — `005_fix_deal_types.sql`
Expands the `deals.deal_type` check constraint to include `full_exit` and `partial_exit`:
```sql
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_deal_type_check;
ALTER TABLE deals ADD CONSTRAINT deals_deal_type_check
  CHECK (deal_type IN ('new_investment','follow_on','exit','full_exit','partial_exit','kyc','side_letter','membership'));
```

---

### Migration 006 — `006_add_valuation_methodology.sql`
Adds to `valuations`:
- `methodology text` (no UI currently populates this)
- `source text DEFAULT 'manual'` (no UI currently uses this)

---

### Migration 007 — `007_valuations_rls.sql`
Re-enables RLS on `valuations` and creates 4 specific policies:
- `"authenticated can select valuations"` — SELECT for authenticated
- `"authenticated can insert valuations"` — INSERT for authenticated
- `"authenticated can update valuations"` — UPDATE for authenticated
- `"authenticated can delete valuations"` — DELETE for authenticated

**Note:** The broad `"Authenticated users have full access"` policy from migration 001 still exists on valuations. There are now 5 overlapping policies on this table.

---

### Views (defined in 001)

#### `company_current_valuations`
Returns one row per company: (company_id, share_price, valuation_date). Uses `DISTINCT ON (company_id) ORDER BY company_id, valuation_date DESC`.

#### `client_portfolio_summary`
Returns aggregated portfolio per (client_id, company_id):
- Columns: client_id, company_id, company_name, sector, total_invested, total_shares, transaction_count, current_value, gain_loss
- Joins: investments → companies → company_current_valuations
- **Known issue:** Sums all investment rows including sells as positive, inflating values for clients with exits.

#### `holdings`
Returns net holdings per (client_id, company_id, share_class, holding_location, holding_entity):
- Distinguishes buy/transfer_in (positive) from sell/transfer_out (negative) via CASE WHEN
- Joins company_current_valuations for current_value

---

## 4. Screens and Routes

| Route | Server data | Purpose |
|-------|-------------|---------|
| `/` | — | Redirect → /dashboard |
| `/login` | — | Email + password login |
| `/auth/callback` | Supabase code exchange | Auth callback handler |
| `/dashboard` | clients, companies, portfolios, valuations, internal_updates, company_news, investments | Metrics, valuation changes, activity feed, news |
| `/clients` | clients, portfolio_summary, companies, internal_updates (**broken query**), investments, deal_investors | Client list with KYC attention panel |
| `/clients/new` | clients (lead investors only) | Create client or linked entity |
| `/clients/[id]` | client + group, portfolio, investments, documents, notes, deals, companies, team | Client record with 6 tabs |
| `/clients/[id]/edit` | client | Edit client form |
| `/portfolio` | companies, valuations, portfolio_summary, kpi_data | Portfolio company grid |
| `/portfolio/new` | — | Add new company form (client component only) |
| `/portfolio/[id]` | company, valuations, investments, portfolio_summary, kpi_data, notes, team | Company detail with 3 tabs |
| `/portfolio/[id]/kpis` | kpi_data | KPI history (partial implementation) |
| `/portfolio/[id]/settings` | company | Company settings (stub: "coming soon") |
| `/investments` | investments (**embedded join**), companies, clients, valuations | Holdings, ledger, sales views |
| `/deals` | deals, deal_investors, clients, companies | Deal list |
| `/deals/new` | companies, clients, investments | Deal type selector + wizard routing |
| `/deals/[id]` | deal, deal_investors, companies, documents, invoices (**broken query**), clients | Deal detail |
| `/deals/[id]/edit` | deal, clients, investments | Edit deal investors |
| `/reports` | investor_updates (**broken embedded join**) | Report menu + draft updates list |
| `/reports/investor-update` | — | Investor update wizard |
| `/reports/portfolio-statement` | — | Portfolio statement wizard |
| `/documents` | — | Stub: "coming soon" |
| `/settings` | — | Settings index |
| `/settings/fund-management` | fund_types, clients | Fund type management + client assignment |
| `/settings/bulk-upload` | — | CSV bulk import wizard |

---

## 5. Server Functions and API Endpoints

**No API routes exist.** The only route handler is `/auth/callback/route.ts` (exchanges Supabase auth code for session).

All data operations use Supabase client directly:
- **Server Components:** `await createClient()` from `lib/supabase/server.ts` — used for initial page data fetches
- **Client Components:** `createClient()` from `lib/supabase/client.ts` — used for mutations and form submissions

No Server Actions. No tRPC. No custom API routes.

---

## 6. Scheduled Jobs

**None exist.** No cron jobs, background tasks, Supabase Edge Functions, or scheduled operations are configured.

---

## 7. Third-Party Integrations

| Service | Status | How Used |
|---------|--------|----------|
| **Supabase** | Active | PostgreSQL database, auth, RLS, cookie-based sessions via `@supabase/ssr` |
| **Vercel** | Deployment target | Next.js hosting, environment variables |
| **Documenso** | Stub only | `signatureService.ts` — throws "not configured" if called |
| **PDF generation** | Stub only | `pdfService.ts` — throws "not configured" if called |
| **Xero** | Planned | Referenced in settings page and `invoices.xero_invoice_id` column; no integration code |
| **OneDrive** | Planned | Referenced in settings page and `documents.onedrive_url` column; no integration code |
| **Anthropic API** | Not present | No code references found |

---

## 8. Authentication and Permission Model

**Login:** Supabase email/password via `supabase.auth.signInWithPassword()`. No OAuth or SSO.

**Session:** Stored in cookies using `@supabase/ssr` helpers (`createServerClient`, `createBrowserClient`).

**Route protection:**
- `src/proxy.ts` acts as Next.js middleware
- Calls `supabase.auth.getUser()` on every request
- Unauthenticated requests to protected routes → redirect to `/login`
- Authenticated requests to `/login` → redirect to `/dashboard`
- Public routes: `/login`, `/auth/*`
- **Note:** `proxy.ts` exists but is not wired up as Next.js middleware (no `middleware.ts` or `middleware.js` export file found). Auth check in `/(app)/layout.tsx` is the only active gate.

**Permission model:**
- All authenticated users have equal access — no roles, no teams, no multi-tenancy
- RLS policies: all tables use generic `"Authenticated users have full access"` allowing all operations
- No row-level ownership or org isolation

---

## 9. Known Issues

| # | Severity | Location | Description |
|---|----------|----------|-------------|
| 1 | **Critical** | `deals/[id]/page.tsx:37` + `DealDetail.tsx` | Invoices query selects `amount` and `issued_at` — these columns don't exist. Actual columns are `fee_amount` and `created_at`. Invoice section will silently return no data. |
| 2 | **Critical** | `clients/page.tsx:32,105–106` + `clients/[id]/page.tsx:118–119` | Queries filter `internal_updates` on `entity_id` and `entity_type` — neither column exists. Table uses `company_id` and `client_id`. Activity data always returns empty. |
| 3 | **Critical** | `investments/page.tsx` | Uses embedded PostgREST join syntax `companies(id, name)` in `.select()`. Platform rule prohibits this pattern (unreliable with this Supabase version). |
| 4 | **Critical** | `reports/page.tsx` | Uses embedded join `companies(id, name)` and `investor_update_recipients(id)` in `.select()` on investor_updates. Same prohibited pattern. |
| 5 | **Critical** | `deals/[id]/edit/page.tsx` | Uses embedded join `companies(id, name)` in deals select. Same prohibited pattern. |
| 6 | **High** | `src/proxy.ts` | Auth middleware file exists but is not exported as Next.js middleware — no `src/middleware.ts` file exists. Routes are only protected by the layout.tsx auth check (client-side redirect), not true middleware. |
| 7 | **High** | `client_portfolio_summary` view | Sums all investment rows as positive. Rows with `transaction_type = 'sell'` or `'transfer_out'` inflate the total. Clients who have partially exited show inflated portfolio values. |
| 8 | **High** | `deals/new/buy/InvestorsStep.tsx` | `deriveEis()` function: when `dealEis === 'yes'` it should return `'yes'` only if client is EIS-eligible, otherwise `'no'`. Current logic always returns `dealEis` regardless of client tax_status, meaning ineligible clients get incorrectly marked as EIS. |
| 9 | **High** | `supabase/migrations/001_initial_schema.sql:332` + `007_valuations_rls.sql` | Valuations table has 5 overlapping RLS policies: one broad `"Authenticated users have full access"` from 001 plus four specific operation policies from 007. |
| 10 | **Medium** | `lib/supabase/types.ts:7` | `DealType` union is missing `'full_exit'` and `'partial_exit'` — added in DB by migration 005, used throughout sell wizard code, but absent from the TypeScript type. |
| 11 | **Medium** | `clients/[id]/tabs/InvestmentsTab.tsx:170–171` | EIS filter: checks `eis_status !== 'yes'` / `=== 'yes'`. If eis_status values change, this breaks silently. |
| 12 | **Medium** | `clients/[id]/tabs/OverviewTab.tsx:219` | EIS certificate check: `eis_status === 'yes' \|\| eis_status === 'tbc'`. Same hardcoded string dependency. |
| 13 | **Medium** | `deals/new/NewDealWizard.tsx:199` | Sets `eis_status: eisQualifying` on investment rows. `eisQualifying` is a deal-level flag (`'yes'/'no'/'tbc'`) being stored directly into `investments.eis_status`. These are semantically different fields, though both use the same string values currently. |
| 14 | **Medium** | `Breadcrumb.tsx` | Component exists and is used in ~8 places (NewClientForm, ClientRecord, EditClientForm, BuyDealWizard, SellDealWizard, DealDetail, CompanyPage, reports wizards, settings). Not used in all pages where it logically should appear (e.g. `/portfolio/new`, `/portfolio/[id]/kpis`). |
| 15 | **Low** | `lib/services/signatureService.ts` + `pdfService.ts` | Both throw `Error("not yet configured")`. Will cause runtime crash if any deal code path calls them. |
| 16 | **Low** | `deals/new/NewDealWizard.tsx` + `wizardTypes.ts` | Generic wizard exposes `'exit'` as a deal type option in the UI. SellDealWizard uses `'full_exit'`/`'partial_exit'` instead. Two different exit paths exist with no clear boundary on when to use which. |
| 17 | **Low** | `deals/[id]/page.tsx` | No `notes` column is fetched from `deals` table, but `DealDetail.tsx` references a notes field. `deals.notes` column does not exist in any migration. |
| 18 | **Low** | `.env.local` committed | Environment file with real Supabase credentials is in the repository. |

---

## 10. Open Questions

| # | Question |
|---|----------|
| OQ-1 | **`internal_updates` schema:** Code queries columns `entity_id` and `entity_type` that don't exist. Were these intentionally removed from the schema, or was the schema never updated to match the code? |
| OQ-2 | **`deals.notes` column:** `DealDetail.tsx` references a notes field but no migration adds this column. Should it be added via migration, or is it already stored inside `completion_checklist` JSON? |
| OQ-3 | **`reports/page.tsx` update types:** `investor_updates.update_type` has values `'type1'`, `'type2'`, `'type3'`. What do these represent? (Monthly update? Quarterly? Annual? Something else?) |
| OQ-4 | **Middleware activation:** `proxy.ts` is a complete and correct auth middleware, but it's not exported as `middleware.ts`. Was this intentional (deferred), or an oversight? Should it be activated? |
| OQ-5 | **`client_portfolio_summary` view fix:** View inflates values for clients with exits. Should the view use CASE WHEN to subtract sell rows? Or should the view be option A (unrealised holdings only) or option B (total return including realised proceeds)? |
| OQ-6 | **Breadcrumb rollout:** `Breadcrumb.tsx` is used in ~8 places. Should it be added to all remaining pages (e.g. `/portfolio/new`, `/portfolio/[id]/kpis`, settings sub-pages)? |
| OQ-7 | **`fund_type` propagation:** `clients.fund_type` stores the client's fund type. `investments.fund_type` stores per-investment. When creating a new investment in the buy deal wizard, should the client's fund_type be automatically copied to the investment row? Or is it always set manually? |
| OQ-8 | **EIS model design:** `clients.tax_status` has values `eis`/`seis`/`both`/`neither`. `investments.eis_status` has `yes`/`no`/`tbc`. `deals.eis_qualifying` has `yes`/`no`/`tbc`. These three fields represent different levels (deal level, client eligibility, investment classification). Should SEIS be a separate client tax_status, or is it always equivalent to EIS from an eligibility standpoint? |
| OQ-9 | **Generic wizard vs. sell wizard for exit:** Two paths exist for exits: `NewDealWizard` (simple 5-step, no investment rows) and `SellDealWizard` (9-step, creates investment sell rows). The `wizardTypes.ts` still lists `'exit'` as an option in `DEAL_TYPES`. When a user selects "Exit / sale of shares," which wizard should they use? |
| OQ-10 | **Bulk upload wizard scope:** `BulkUploadWizard.tsx` exists but the scope is unclear. What entities can be imported? What CSV format is expected? Is there any data transformation or validation? |
| OQ-11 | **Environment variables:** `.env.local` is committed with real credentials. Is this intentional (single-user local dev)? Should `.env.local` be added to `.gitignore`? |
| OQ-12 | **`deriveEis` logic in InvestorsStep:** The function is meant to default each investor's EIS status based on the deal's EIS qualifying flag and the client's own tax_status. The current logic ignores the client's tax_status entirely. What is the correct derivation rule? (e.g. "if deal is EIS-qualifying AND client is EIS-eligible → EIS; otherwise → no") |

---

*End of document. No code changes were made during this audit.*
