# Transaction Workflow Specification
**Version:** 1.0 draft
**Date:** April 2026
**Status:** Section 1 agreed — Section 2 onwards in progress

---

## Section 1: Transaction Types and Data Model

### 1.1 Transaction Categories

Every transaction belongs to one of two categories: **equity** or **debt**.

**Equity transactions:**
- Buy — purchase of shares at a given price per share
- Sell — disposal of some or all shares held
- Transfer in — shares received from another holder, not a cash purchase
- Transfer out — shares moved to another holder, not a cash sale
- Full exit — complete disposal of all shares held in a company
- Partial exit — disposal of some shares, retaining a remaining position
- Rights issue / follow-on — additional shares in a subsequent round, treated as a buy flagged as follow-on

**Debt transactions:**
- CLN investment — initial loan note issued
- CLN interest — periodic interest accrual, paid or rolled up
- CLN conversion — loan note converts to equity, creates a buy transaction and closes the debt position
- CLN repayment — loan note repaid in cash, closes the debt position
- Dividend — cash payment from company to shareholders

---

### 1.2 Data captured per transaction type

**All transactions:**
- Transaction date
- Company
- Investor (client record)
- Held by (entity — own name, family member, corporate vehicle)
- Location (direct or nominee — if nominee, which nominee)
- Transaction type
- Transaction category (equity or debt)
- Status (pending / complete)
- Notes (free text)
- Created by (team member)
- Created at (timestamp)

**Equity buy / follow-on / rights issue adds:**
- Share class (FK to company_share_classes)
- Number of shares
- Price per share
- Total amount subscribed
- EIS qualifying (yes / no / TBC)
- Fee rate (pre-populated from client default, editable)
- Fee amount (calculated)

**Equity sell / partial exit / full exit adds:**
- Share class (FK to company_share_classes)
- Number of shares sold
- Price per share at sale
- Total proceeds
- Gain/loss (calculated against FIFO cost basis)
- Whether proceeds go to investor directly or via nominee

**Transfer in / transfer out adds:**
- Share class (FK to company_share_classes)
- Number of shares
- Transfer price (can be nil)
- Counterparty (who shares are moving to/from)

**CLN investment adds:**
- Principal amount
- Interest rate (% per annum)
- Interest type (paid / rolled up / hybrid)
- Maturity date
- Conversion terms (discount rate, valuation cap — optional)
- Loan document reference

**CLN interest adds:**
- Period covered (from / to dates)
- Interest amount
- Whether paid or rolled up
- If rolled up: new principal balance (calculated)

**CLN conversion adds:**
- Conversion date
- Shares issued (number and class)
- Conversion price per share
- Original CLN reference
- Simultaneously creates a buy transaction and closes the CLN position

**CLN repayment adds:**
- Repayment amount
- Whether full or partial
- Original CLN reference

**Dividend adds:**
- Amount per share
- Total dividend amount
- Payment date
- Payment route (direct to investor / via nominee)
- Tax voucher reference (optional)

---

### 1.3 Database changes required

**Additions to `investments` table:**
- `transaction_category` — 'equity' or 'debt'
- `held_by_entity_id` — FK to clients table (specific entity holding the shares)
- `nominee_id` — nullable, identifies nominee if location is nominee
- `fee_rate` — decimal, fee percentage applied
- `fee_amount` — decimal, calculated fee
- `proceeds` — decimal, for sell transactions
- `gain_loss` — decimal, calculated at completion
- `counterparty` — text, for transfers

**New `company_share_classes` table:**
One row per share class per company. Share class names are not global — "B Ordinary" in one company is completely separate from "B Ordinary" in another. Terms are always defined at company + share class level, never generically.

Columns:
- `id`
- `company_id` — FK to companies, non-nullable
- `name` — e.g. "B Ordinary", "Preference A"
- `type` — 'ordinary' or 'preference'
- `dividend_rate` — decimal, nullable. Annual rate e.g. 0.08 for 8%. Preference only.
- `dividend_cumulative` — boolean, nullable. Preference only.
- `dividend_payment` — 'paid' or 'rolled_up', nullable. Preference only.
- `preference_multiple` — decimal, nullable. e.g. 1.0, 2.0, 3.0, 4.0. Preference only.
- `participating` — boolean, nullable. Preference only.
- `created_at`

Note: preference_rank is NOT stored on this table. It is stored in share_class_ranking_history to support changes over time.

**New `share_class_ranking_history` table:**
Tracks how preference rankings change over time as new funding rounds occur. This is necessary because a follow-on round may introduce a new share class that demotes existing classes, even if Juno does not participate in that round.

Columns:
- `id`
- `company_id`
- `share_class_id` — FK to company_share_classes
- `preference_rank` — integer, nullable. Null for ordinary shares. Lower number = paid first in waterfall. Multiple classes can share the same rank (pari passu).
- `effective_from` — date this ranking took effect
- `reason` — text, e.g. "Series B round — Series A demoted from rank 1 to rank 2"
- `created_by`
- `created_at`

To find the current ranking of any share class: look up the most recent row for that share_class_id.
To find the ranking at any historical date: filter by effective_from <= that date.

**New `cln_positions` table:**
Tracks the life of each convertible loan note.

Columns:
- `id`
- `investment_id` — FK to the originating CLN investment transaction
- `company_id`
- `client_id`
- `principal_amount` — original loan amount
- `current_balance` — updates as interest rolls up
- `interest_rate`
- `interest_type` — 'paid', 'rolled_up', or 'hybrid'
- `maturity_date`
- `conversion_terms` — JSONB, stores discount rate and valuation cap if applicable
- `status` — 'active', 'converted', or 'repaid'
- `created_at`

**New `dividends` table:**

Columns:
- `id`
- `company_id`
- `client_id`
- `investment_id` — FK to the original buy transaction
- `amount_per_share`
- `total_amount`
- `payment_date`
- `payment_route` — 'direct' or 'nominee'
- `tax_voucher_ref` — nullable
- `status`
- `created_at`

---

### 1.4 Waterfall calculation rules

These rules govern how exit proceeds are distributed. They are recorded here for use in future waterfall modelling features.

**Non-participating preference waterfall:**
1. Work through each preference rank in order (1, 2, 3…) using rankings effective at the exit date
2. At each rank, distribute the preference multiple pro rata among all share classes sharing that rank
3. Once all preference ranks exhausted, ordinary shareholders catch up to the same per-share return as preference holders
4. Then all shareholders share remaining proceeds pro rata

**Participating preference waterfall:**
1. Work through each preference rank in order (1, 2, 3…) using rankings effective at the exit date
2. At each rank, distribute the preference multiple pro rata among all share classes sharing that rank
3. Once all preference ranks exhausted, the remaining pool is shared pro rata across all shareholders including preference holders
4. Ordinary shareholders' share is based on their percentage of total share count

**General rules:**
- Multiple share classes can share the same preference rank and receive proceeds pro rata at that level
- Catch-up applies only to non-participating preference
- CLN positions that have not yet converted are treated as debt and rank ahead of all equity in waterfall calculations
- Rankings are always evaluated at the date of the exit event using share_class_ranking_history

---

### 1.5 Capital events workflow

A separate workflow is required to record corporate events that change the share class structure of a company, independent of any transaction. This includes:

- Adding a new share class (even if Juno holds no shares in that class)
- Adjusting preference rankings when a new funding round demotes existing classes
- Recording the effective date and reason for the change

This workflow writes to company_share_classes and share_class_ranking_history. It does not create investment transactions. It must be built alongside or immediately before the transaction wizard, as accurate rankings depend on it.

---

*End of Section 1. Section 2 (wizard flow) to follow.*
