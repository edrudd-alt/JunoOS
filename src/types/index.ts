/**
 * Canonical component-level types for JunoOS.
 *
 * These are derived from the actual DB schema and represent the shapes that
 * components work with after fetching data from Supabase. They intentionally
 * include all fields any component uses — optional fields reflect cases where
 * a query doesn't select every column.
 *
 * These are NOT Supabase client types. Keep the Database interface in
 * lib/supabase/types.ts for query typing.
 */

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * Canonical shape of the clients table. This is the source of truth for column
 * names — use it when writing selects or inline form interfaces.
 *
 * DROPPED COLUMNS (do not re-add; will cause silent PostgREST failures):
 *   - entity_type         (dropped Entity Model Cleanup Sub-stage A, 23 May 2026)
 *   - fund_type           (dropped same; fund type lives on investments.fund_type)
 *   - active_fund_type    (dropped same)
 */
export interface Client {
  id: string
  full_name: string
  investor_reference: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postcode: string | null
  date_joined: string | null
  tax_status: string
  kyc_status: string
  kyc_expiry: string | null
  default_fee_rate: number
  report_delivery_email: string | null
  lead_investor_id: string | null
  holding_location: string
  reporting_entity_defaults: string[]
  report_delivery_method: string
  notes: string | null
  fee_schedule_id: string | null
  vehicle_type: string | null
  default_nominee_id: string | null
}

/**
 * Alias kept for files that haven't been migrated yet.
 * New code should import Client directly.
 */
export type ClientRow = Client

// ─── Company ──────────────────────────────────────────────────────────────────

/** Full row from the companies table. */
export interface Company {
  id: string
  name: string
  sector: string | null
  stage: string | null
  eis_eligible: boolean
  logo_url: string | null
  website: string | null
  description: string | null
}

// ─── Investment ───────────────────────────────────────────────────────────────

/** Row from the investments table, with optional joined relations. */
export interface Investment {
  id: string
  client_id: string
  company_id: string
  share_class: string
  investment_date: string
  original_share_price: number
  shares_purchased: number
  sum_subscribed: number
  eis_status: string
  holding_entity: string | null
  holding_location: string
  status: string
  /** 'buy' | 'sell' | 'transfer_in' | 'transfer_out' */
  transaction_type: string
  cost_basis: number | null
  transfer_counterparty_id: string | null
  transfer_type: string | null
  notes: string | null
  fund_type: string
  // Joined relations — present only when selected in the query
  companies: { id: string; name: string; sector?: string | null; stage?: string | null } | null
  clients: { id: string; full_name: string; lead_investor_id: string | null; email?: string | null } | null
}

// ─── Valuation ────────────────────────────────────────────────────────────────

/**
 * Row from the valuations table. When querying the company_current_valuations
 * view the id field will not be present at runtime, but it is not accessed in
 * those contexts.
 */
export interface Valuation {
  id: string
  company_id: string
  share_class_id: string | null
  share_price: number
  valuation_date: string
  methodology: string | null
  source: string | null
  notes: string | null
  updated_at: string | null
}

// ─── Deal ─────────────────────────────────────────────────────────────────────

/** Row from the deals table with standard joins. */
export interface Deal {
  id: string
  deal_type: string
  status: string
  created_at: string
  investment_date: string | null
  investment_amount: number | null
  share_price: number | null
  share_class: string | null
  eis_qualifying: string | null
  completion_checklist: Record<string, unknown> | null
  company_id: string | null
  companies: { id: string; name: string } | null
  deal_investors: DealInvestor[]
}

// ─── DealInvestor ─────────────────────────────────────────────────────────────

/** Row from the deal_investors table with clients join. */
export interface DealInvestor {
  id: string
  client_id: string
  deal_id?: string
  amount: number | null
  poa_held: boolean
  /** May be absent when queried without this column (e.g. in deal wizard forms). */
  signing_status?: string
  clients: { id: string; full_name: string; email: string | null } | null
}

// ─── Document ─────────────────────────────────────────────────────────────────

/** Row from the documents table. */
export interface Document {
  id: string
  type: string
  filename: string
  storage_url: string | null
  document_date: string | null
  period: string | null
  client_id?: string | null
  company_id: string | null
  companies: { id?: string; name: string } | null
}

// ─── KpiDataRow ───────────────────────────────────────────────────────────────

/** Row from the kpi_data table. */
export interface KpiDataRow {
  id: string
  company_id?: string
  kpi_name: string
  period: string | null
  period_date: string | null
  value: number
  unit: string | null
  auto_extracted: boolean
  manually_verified: boolean
}

// ─── InternalUpdate ───────────────────────────────────────────────────────────

/** Row from the internal_updates table with optional joins. */
export interface InternalUpdate {
  id: string
  update_type: string
  description: string | null
  created_at: string
  entity_type?: string | null
  entity_id?: string | null
  company_id?: string | null
  companies: { id?: string; name: string } | null
  team_members: { full_name: string | null } | null
}

// ─── CompanyNews ──────────────────────────────────────────────────────────────

/** Row from the company_news table with optional companies join. */
export interface CompanyNews {
  id: string
  company_id: string
  headline: string
  source: string | null
  url: string | null
  published_at: string | null
  is_significant: boolean
  significance_reason?: string | null
  companies: { id?: string; name: string } | null
}

// ─── DeferredPayment ─────────────────────────────────────────────────────────

/** Row from the deferred_payments table. */
export interface DeferredPayment {
  id: string
  investment_id: string
  deal_id: string | null
  client_id: string | null
  expected_amount: number | null
  actual_amount: number | null
  expected_date: string | null
  actual_date: string | null
  contingency_description: string | null
  payment_route: 'direct' | 'nominee' | null
  status: 'expected' | 'received' | 'overdue' | 'waived'
  tranche_number: number | null
  is_final_tranche: boolean | null
  created_at: string | null
  updated_at: string | null
}

// ─── Asset State ─────────────────────────────────────────────────────────────

/**
 * Three-state asset classification, derived on read.
 * See docs/specs/Juno_Asset_Register_ThreeState_Spec_v1.md §3.
 */
export type AssetState = 'owned' | 'contingent' | 'disposed'

// ─── PortfolioRow ─────────────────────────────────────────────────────────────

/** Row from the client_portfolio_summary view. */
export interface PortfolioRow {
  client_id: string
  company_id: string
  share_class_id: string | null
  company_name: string
  sector: string | null
  total_shares: number
  total_invested: number
  transaction_count: number
  current_value: number
  gain_loss: number
}
