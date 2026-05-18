/**
 * PRESERVED LOGIC FOR SUB-STAGE 1.3
 *
 * This file contains commented-out code from the old DetailsTab.tsx and
 * OverviewTab.tsx that will be needed when building the Overview tab in 1.3.
 *
 * Do NOT import or use anything from this file — it exists solely so the
 * logic is preserved during the 1.2 → 1.3 transition.
 */

// ─── FROM DetailsTab.tsx ──────────────────────────────────────────────────────
//
// Linked entities panel — needed for 9.7.2 right column (Linked entities panel)
//
// function LinkedEntityRow({ name, vehicleType, nomineeName, holdingLocation, portfolio, linkId, bold, onEdit })
//   Renders one row in the linked entities table: entity name (linked),
//   vehicle-type tag, nominee name, invested/current-value/change columns, location tag, Edit button.
//   Uses formatCurrency, formatPercent, calcGainLoss from @/lib/utils.
//
// function portfolioByEntityAgg(portfolioRows: PortfolioRow[])
//   Aggregates client_portfolio_summary rows by client_id into
//   { totalInvested, currentValue, gainLoss } per entity.
//
// AddLinkedEntityModal — "Add linked entity" form (see 9.13):
//   Fields: full_name, vehicle_type, email (optional).
//   On save: inserts a new clients row with lead_investor_id = leadClientId.
//   NOTE: 1.3 will extend this with entity_type, date_joined, kyc_status, POA, etc. per spec 9.13.
//
// AddRelationshipModal — "Add relationship" form:
//   Fields: client (search), relationship_type (spouse/family/other), notes.
//   On save: inserts into client_relationships.
//
// EditVehicleTypeModal — inline vehicle-type editor for linked entities.
//
// Fee schedule selector (inline in Contact details panel):
//   Reads from fee_schedules table, updates clients.fee_schedule_id.
//
// AccruedFeeCard — indicative Multi Manager accrued management fee table:
//   Only rendered when fund_type is 'multi_manager' or 'both'.
//   Calculates years_held and 2%/year fee (max 10%) per investment.
//   NOTE: fee logic comes from database fee_schedules in production; this is indicative only.
//
// ─── FROM OverviewTab.tsx ─────────────────────────────────────────────────────
//
// Holdings summary panel (9.7.1 left col, below contact details):
//   netByCompany Map — buy/sell netting per company (sharesIn - sharesOut = remaining).
//   costOfRemaining — weighted avg cost × remaining shares.
//   Current value — remaining × current share price from company_current_valuations.
//   Filterable by account (fund_type || holding_location || holding_entity key).
//   Shows up to 8 companies; "+ N more" overflow link.
//
// Outstanding requirements panel (9.7.2 right col):
//   Checks: KYC expiry (<today or <60 days), POA missing, suitability missing,
//   EIS certificates outstanding (investment has eis_status yes/tbc but no eis_certificate doc).
//   Each requirement renders as a coloured dot + text + action link.
//
// Pending deals panel:
//   Reads from activeDeals prop (pre-fetched by page.tsx, keyed to this client via deal_investors).
//   Renders deal status pill + "Continue / View" buttons.
//
// Chart placeholders (BarChartSvg, DonutChartSvg, LineChartSvg):
//   Static SVG placeholders — will be replaced with real chart data in a later phase.
//   Kept here in case the 1.3 build reuses them.
//
// isBuyTx / isSellTx helpers:
//   isBuyTx: transaction_type in ('buy', 'transfer_in')
//   isSellTx: transaction_type in ('sell', 'transfer_out')
