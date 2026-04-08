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

## Section 2: New Investment Workflow

### 2.1 Overview

A new investment workflow has six stages:

1. Bookbuild — tracking investor interest before the deal is finalised
2. Application form — generating, sending, and processing signed forms
3. Completion tracking — managing rolling completions and generating company documents
4. Transaction recording — writing the deal to the database at completion
5. Post-completion immediate — transaction statement and EIS confirmation
6. Post-completion ongoing — legal documents, EIS certificates, cap table

Each stage is described in detail below.

---

### 2.2 Stage 1: Bookbuild

#### Purpose
Track investor interest and commitment levels before the deal is finalised. Replaces the current spreadsheet. Each deal has exactly one bookbuild.

#### Access
Created automatically when a new deal is started. Accessible from the deal record.

#### Data captured per investor entry
- Investor (FK to clients)
- Investing vehicle (which entity — own name, family member, corporate vehicle)
- Indicative amount (£)
- Status: Interested / Confirmed / Maybe / Rejected / Withdrawn
- Notes (free text)
- Last updated (timestamp)
- Updated by (team member)

#### Bookbuild summary (always visible)
- Total confirmed (£ and number of investors)
- Total interested (£ and number of investors)
- Total including interested (£)
- Target raise (£) — set when deal is created
- % of target confirmed
- % of target including interested

#### Actions
- Add investor to bookbuild
- Change status of any investor
- Edit indicative amount
- Add note
- Export bookbuild as CSV or PDF for sending to company

#### Status rules
- An investor can move between any statuses at any time
- Only Confirmed investors proceed to application form stage
- Rejected and Withdrawn investors are retained in the bookbuild for record but excluded from all totals except a separate excluded count

#### Transition to Stage 2
When the team is ready to send application forms, they select one or more Confirmed investors and trigger Send application forms. This can be done in batches — not all confirmed investors need to be sent forms at the same time.

---

### 2.3 Stage 2: Application Form

#### Purpose
Generate a pre-filled application form for each investor, send for e-signature via Documenso, process the returned signed form, and update the deal record if the investor has made changes.

#### Application form content
The form is a reusable template pre-filled with:
- Investor full name and address
- Investing vehicle (if different from own name)
- Payment instructions: company or nominee bank details for investment amount, Juno bank details for fee
- Investment table: amount (£), share price (£), number of shares (calculated), fee % (from client default), fee £ (calculated)
- Reference to standing POA
- Deal reference number
- Company name and deal date

Note: final share price may not be confirmed at this stage. If unconfirmed, the form is generated with the indicative price and flagged as indicative. When the final price is confirmed, affected forms are flagged for review and regeneration if not yet signed.

#### Sending
- One form per investor
- Sent via Documenso
- Juno signs on behalf of investor via POA in most cases — configurable per investor
- Where POA not held, investor signs directly
- Sending is logged against the deal and the investor record

#### On return of signed form
1. Documenso notifies the platform that a form has been signed
2. Claude reads the signed PDF and compares it against the original sent version
3. If no differences: form is filed automatically, investor status updated to Signed
4. If differences detected: team is notified with a summary of what changed (amount, vehicle, other fields)
5. Team reviews each difference and confirms whether to update the deal record
6. On confirmation: deal record updated, change logged with timestamp and team member
7. Signed form filed to: platform (deal record and client investment docs) and OneDrive (following naming convention)

#### Tracking
Per investor, per form:
- Status: Not sent / Sent / Viewed / Signed / Changes detected / Confirmed
- Sent date
- Signed date
- Whether changes were made and confirmed
- Link to signed document

#### Investor cash
Cash receipt is tracked manually — team marks each investor as Paid when funds received. This is separate from the form signature and can happen before or after.

---

### 2.4 Stage 3: Completion Tracking

#### Purpose
Manage rolling completions. Some investors may complete earlier than others. Track who has completed, generate documents for the company, and manage the EIS confirmation process.

#### Rolling completions
- A deal can have multiple completion events
- Each completion event has a date and a list of investors completing on that date
- An investor appears in exactly one completion event
- The deal remains open until all investors have completed or been withdrawn

#### Completion checklist per investor
- Application form signed — auto-ticked when Documenso confirms
- Cash received — manually ticked by team
- Completion — manually triggered by team when both above are true
- Transaction statement sent — auto-ticked when generated and sent
- Share certificate received — manually uploaded when received from company
- EIS certificate received — manually uploaded when received (typically 2-8 weeks post-completion)
- EIS certificate sent to investor — auto-ticked when sent

#### Documents generated at completion stage

**Shareholder list for company:**
Generated on demand. Lists all investors who have completed or are confirmed, showing: investor name, address, investing vehicle, amount, shares, share class. Used by company lawyers for legal documents and HMRC EIS application. Can be regenerated at any time as the list changes.

**EIS confirmation list:**
Separate document listing only EIS-qualifying investors: name, address, amount invested. Sent to company for HMRC submission. Generated on demand.

Both documents export as PDF and CSV.

---

### 2.5 Stage 4: Transaction Recording

#### Purpose
Write the completed investment to the database so it appears on the client record, portfolio, and all reports.

#### When
Triggered per investor when the team marks their completion checklist as complete (application signed and cash received).

#### Data written to investments table
All fields from Section 1.2 for an equity buy transaction, plus:
- deal_id — FK to the deal record
- completion_date — date of this investor's completion
- bookbuild_id — FK to the bookbuild entry

#### Share price confirmation step
Before the transaction is written, the team is shown:

This transaction will update the share price for [Company] to £[transaction price]. Is this correct?
- Yes, update to £[transaction price]
- No, keep the current price of £[current price]
- Enter a different price manually

The team's choice is recorded alongside the transaction. The valuations table is updated accordingly.

#### On completion
- Investment appears on client record immediately
- Portfolio summary updated immediately
- Deal marked as partially or fully complete depending on whether all investors have now completed

---

### 2.6 Stage 5: Post-completion (immediate)

#### Purpose
Generate and send the transaction statement to the investor. Send EIS confirmation to the company.

#### Transaction statement
Generated automatically when a transaction is recorded. Contains:
- Juno branding and contact details
- Investor name and address
- Company name
- Share class
- Investment date (completion date)
- Number of shares
- Price per share
- Total amount invested
- Fee % and fee £
- EIS status
- Deal reference number
- Footer: Juno Capital Partners LLP, address

Sent to investor by email via Outlook. Filing:
- Saved to platform (client investment docs tab, under company and year)
- Saved to OneDrive (YYYY-MM-DD — Investor — Company — Transaction Statement.pdf)
- Marked as sent in the investor's completion checklist

#### EIS confirmation to company
Sent once per completion event (not per investor). Lists all EIS-qualifying investors completing on that date: name, address, amount. Sent by email to company contact. Logged against the deal.

#### Tracking
Per investor:
- Transaction statement: generated date, sent date, sent to (email address)
Per completion event:
- EIS confirmation: sent date, sent to (email address)

---

### 2.7 Stage 6: Post-completion (ongoing)

#### Purpose
Receive, store, and extract key information from legal documents. Manage EIS certificates. Maintain the cap table.

#### Legal documents
Received from company lawyers after completion. Documents include:
- Share certificate
- Articles of association
- Subscription agreement
- Investment agreement
- Loan documents (if debt component)
- Others as applicable

Each document is uploaded to the deal record, filed to OneDrive, and stored against the company in the company documents tab.

Claude extracts the following from legal documents automatically:
- Share class and full rights including preference terms if applicable
- Juno board seat (yes/no and any conditions)
- Investor consent rights and majority thresholds
- Board rights
- Investor director rights

Extracted terms are reviewed by the team before saving. On confirmation they are stored against the company share class record, updating company_share_classes. If preference terms are present, preference_multiple, participating, dividend_rate, dividend_cumulative, and dividend_payment are populated from extraction. Terms are also stored in a deal terms summary on the company page.

Share certificates are stored on the platform and in OneDrive. They are not sent to investors.

#### EIS certificates
- Received from company (typically 2-8 weeks post-completion)
- Uploaded to platform against the deal and the relevant investor
- Copy sent to investor by email
- Original retained on platform and OneDrive
- Investor completion checklist updated automatically on upload and send
- Platform tracks outstanding EIS certificates — any investor with EIS-qualifying investment and no certificate received is flagged on the deal record

#### Cap table
- Final cap table received from company after completion
- Uploaded to company record
- Claude reads cap table and identifies all share classes present, confirms or creates share class records, identifies preference stack and prompts team to confirm or update rankings in share_class_ranking_history, and flags any discrepancies between the cap table and the platform's recorded shareholdings
- Team reviews and confirms before any changes are written
- When a new funding round occurs even if Juno does not participate: team uploads updated cap table, Claude identifies new share classes and ranking changes, team confirms updates, share_class_ranking_history updated with effective date and reason

---

### 2.8 Outlook email integration

All outbound emails from the workflow are sent via Microsoft Graph API connected to the relevant Juno Outlook mailbox. Covers:
- Application form sending (with Documenso link)
- Transaction statement sending
- EIS certificate sending
- EIS confirmation to company
- Any other deal-related correspondence generated by the platform

Each email sent is logged against the deal record with timestamp, recipient, and subject, stored as a sent item in the relevant Outlook mailbox, and linked to the investor record where applicable.

Setup: one-time OAuth connection per mailbox in Settings.

---

*End of Section 2. Section 3 (follow-on investment workflow) to follow.*

## Section 3: Follow-on Investment Workflow

### 3.1 Overview

A follow-on investment is an additional investment into a company already in the portfolio. The company already exists on the platform. The workflow shares the same application form, completion, and post-completion stages as a new investment but differs significantly in the bookbuild stage.

Stages:
1. Bookbuild — starts from existing shareholdings, calculates pro rata entitlements
2. Application form — same as new investment workflow
3. Completion tracking — same as new investment workflow
4. Transaction recording — same as new investment workflow
5. Post-completion immediate — same as new investment workflow
6. Post-completion ongoing — may involve updates to existing share class terms, new share classes, or ranking changes rather than full setup from scratch

---

### 3.2 Stage 1: Follow-on Bookbuild

#### Purpose
Build the subscription list for a follow-on round, starting from existing investor holdings and calculating pro rata entitlements. More involved than a new investment bookbuild because the starting position is known and the allocation logic is more complex.

#### Starting position
When a follow-on bookbuild is created, the platform automatically populates it with all existing investors in the company, showing for each:
- Investor name
- All share classes held
- Number of shares per class
- Original investment amount per class
- Total amount invested in this company
- Current % ownership of the company (by total shares, across all classes)
- Pro rata entitlement for this round (calculated as: investor % ownership x total raise target)

New investors not currently in the company can be added manually. They receive no pro rata entitlement by default — their allocation is set manually.

#### Pro rata redistribution
If an investor declines or takes less than their pro rata entitlement, the unallocated amount is redistributed pro rata among investors who have confirmed participation. Redistribution is recalculated automatically each time a status changes. The team can override any individual allocation manually.

#### Share class for the follow-on
The team specifies which share class the follow-on investment will be in. This may be:
- An existing share class at a new price
- A new share class (requires capital events workflow to be completed first — see Section 9)

If a new share class is involved, the bookbuild can be started but application forms cannot be sent until the share class is defined and its ranking confirmed in share_class_ranking_history.

#### Down round or complex terms
Where the follow-on involves a down round or significantly dilutive terms, the platform provides a one-click export of the current holdings data to a clean spreadsheet (investor name, share class, shares held, original price, current valuation, % ownership, pro rata entitlement) for offline analysis. This export is available at any time from the bookbuild screen. The platform does not perform the waterfall or breakeven modelling itself at this stage — that is done offline using the exported data.

#### Bookbuild statuses
Same as new investment: Interested / Confirmed / Maybe / Rejected / Withdrawn.

#### Bookbuild summary
Same as new investment, plus:
- Total existing investor allocation (£)
- Total new investor allocation (£)
- Unallocated from declined pro rata (£)
- Redistribution applied (£)

#### Transition to Stage 2
Same as new investment — team selects Confirmed investors and triggers Send application forms.

---

### 3.3 Stages 2-5: Application, Completion, Recording, Post-completion immediate

Identical to Sections 2.3 through 2.6. No differences.

---

### 3.4 Stage 6: Post-completion ongoing (follow-on specific differences)

A follow-on may involve:
- No new share class — existing class at new price. No share class setup required. Legal documents may include updated subscription agreement only.
- New share class — requires share class record created and ranking confirmed before completion. Legal documents will include articles amendment or new class rights document. Claude extracts terms as per Section 2.7.
- Changes to existing share class terms — e.g. a new round negotiates changes to existing preference terms or adds/removes board rights. Claude extracts changes from legal documents and prompts team to confirm updates to existing company_share_classes records.
- Ranking changes — existing preference classes may be demoted by a new class. Team is prompted to update share_class_ranking_history with effective date and reason.
- Updated cap table — received from company after completion. Processed as per Section 2.7.

---

*End of Section 3. Section 4 (sell and exit workflow) to follow.*
