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

## Section 4: Sell and Exit Workflow

### 4.1 Overview

A sell or exit workflow records the disposal of some or all shares held by investors in a portfolio company.

**Disposal types:**
- Partial exit — some or all investors sell some or all of their shares. Some investors may retain a remaining position. The buyer may be a third party or another Juno investor — this is a detail within the deal, not a separate type. Involves a bookbuild process.
- Full exit — all investors sell all shares in a company. All investors are pre-populated. No bookbuild required.

A sale can be initiated by the company, by one or more investors, or by a third party buyer approaching Juno.

**Key principle:** All data entered at any stage must be editable before the deal is closed, without losing data or requiring the team to start again.

**Workflow stages:**
1. Deal setup — recording initial terms
2. Bookbuild — building the seller list and allocating shares
3. Documents and signatures — application forms and deal documents via Documenso
4. Transaction recording — reconciliation and writing to the database
5. Post-completion — transaction statements and deferred payment tracking

---

### 4.2 EIS and SEIS Warnings

Before any sell or exit is recorded, the platform checks whether the investment being sold is EIS or SEIS qualifying and whether it is within the 3-year qualifying holding period.

If within the qualifying period, the team is shown:

"This investment is [EIS/SEIS]-qualifying and was made on [date]. The 3-year qualifying period ends on [date + 3 years]. Disposing of these shares before this date may result in clawback of [EIS/SEIS] relief for this investor. Do you want to continue?"

The team must explicitly confirm before the workflow proceeds. The warning and confirmation are logged against the transaction. The platform does not calculate or advise on tax consequences — it flags the situation only.

Where shares are sold within the qualifying period, the following drafted note is appended to the transaction statement for the team to review and edit before sending:

"Note: This investment was disposed of before the end of the 3-year [EIS/SEIS] qualifying period. This may result in clawback of tax relief previously claimed. Please seek independent tax advice."

---

### 4.3 Stage 1: Deal Setup

Initial deal information captured:
- Disposal type (partial exit / full exit)
- Company
- Estimated completion date
- Estimated price per share, per share class (can be updated at any point before close)
- Total shares available for sale per share class (required for allocation-led mode)
- Notes

Note: the final price per share is often not known until the last moment due to deal fees, retentions, and adjustments. The wizard uses estimated prices for pro forma calculations throughout and updates them when final prices are confirmed.

---

### 4.4 Stage 2: Bookbuild

The bookbuild builds the seller list and calculates allocations. It operates in one of two modes.

#### Investor-led mode
Used when investors decide individually how many shares they want to sell. The wizard pre-populates every investor's current holdings.

For each investor the wizard shows:
- Investor name and fund type
- All share classes held in this company, with shares held per class
- Total shares held across all classes
- EIS/SEIS status per holding
- Estimated gross proceeds (shares x estimated price)
- Auto-calculated fee (see fee section below)
- Estimated net proceeds

The team can:
- Mark as full exit — shares to sell pre-populated automatically with full holding per class
- Enter a specific number of shares to sell per share class
- Leave as not selling — investor excluded from this deal

Bookbuild statuses: Interested / Confirmed / Rejected.

#### Allocation-led mode
Used when a fixed pool of shares is available for sale. The team enters the total available per share class and the wizard calculates each investor's pro rata allocation automatically.

Pro rata calculation: each investor's total shares across all classes as a percentage of Juno's total shares across all classes, applied to the total pool available for sale.

The team can override any individual allocation. An override requires an internal note. Remaining unallocated shares are shown in real time as overrides are made.

Over/under indicator: for each investor, the wizard shows whether they are selling more or less than their pro rata percentage. Displayed as a red or green indicator with an arrow.

Note: rounding will produce small discrepancies. The override mechanism is the intended way to resolve these.

#### Fee auto-calculation
Fees are calculated automatically per investor based on their fund type stored on the client record. The profit fee is calculated on total profit across all share classes combined, not per individual share class line. All calculations can be overridden — an override requires an internal note.

Syndicate clients:
- Fee = % of profit (gain on disposal)
- Rate from client record
- Profit = total net proceeds across all share classes minus total original cost basis (FIFO)

Multi Manager clients:
- Fee = accrued deferred management fee
- Rate: 2% per annum on original cost
- Accrual period: from investment date to disposal date
- Cap: 10% of original cost
- Calculated independently per investor using their investment date and original cost

Each investor's fee calculation shows: gross proceeds, fee basis description, fee £, net proceeds.

#### Bookbuild summary (always visible)
- Total confirmed sellers — £ gross proceeds and number of investors
- Total shares being sold per share class
- Total estimated fees
- Total estimated net proceeds
- If allocation-led: shares allocated, shares unallocated, total available

---

### 4.5 Stage 3: Documents and Signatures

Document requirements vary by deal. The team confirms which documents are required.

Document types:
- Application form to sell — pre-filled with investor details and shares being sold. Investor signs to authorise the sale. Template to be agreed before build.
- Sale agreement or transfer form — sometimes required by lawyers instead of or in addition to the application form.
- POA authority for this transaction — where Juno signs on behalf of the investor, specific authority may be required for this transaction.
- Other documents as specified by lawyers.

Signing:
- Juno signs deal documents on behalf of investors via POA in most cases — configurable per investor per deal.
- Where lawyers require direct investor signatures, documents are sent via Documenso.
- Sometimes lawyers send documents directly to investors — Juno tracks receipt and confirmation on the platform.

For partial exits in investor-led mode, investors confirm shares to sell on the application form. If sale demand exceeds supply, investors are allocated an amount which may differ from their application. The wizard tracks application vs allocation per investor.

---

### 4.6 Stage 4: Transaction Recording and Reconciliation

Before transactions are written to the database, a reconciliation step confirms the final numbers are consistent.

Reconciliation table — team enters final net proceeds per share class. Platform shows:
- Share class
- Total shares sold (from platform)
- Net proceeds entered (£)
- Calculated price per share (net proceeds / shares)
- Estimated price per share (from deal setup)
- Difference (£ and %)

Errors flagged automatically:
- Different prices per share for the same share class across investors
- Total proceeds entered does not match sum of individual investor proceeds
- Total shares different from bookbuild

The team must resolve all errors or explicitly accept them with a note before the transaction can be completed.

Share price confirmation — for each share class involved, the team confirms whether to update the current share price. Each share class may receive a different price per share.

On completion:
- Disposal written to investments table per investor
- Holdings updated immediately — shares removed, proceeds recorded
- Full exit: holding shown as exited, historical record preserved
- Partial exit: remaining holding updated
- Portfolio summary updated immediately
- Updated cap table requested from company

---

### 4.7 Consideration Structure

Recorded per deal. Applies to all investors in the deal.

Consideration types:
- All upfront — full proceeds received at or shortly after completion
- Partial upfront with deferred payments — initial payment at completion plus one or more additional payments

All upfront data:
- Amount (£)
- Payment date
- Payment route per investor (direct to investor / via nominee)

Deferred consideration — initial payment:
- Amount (£)
- Payment date
- Payment route per investor (direct / nominee)

Deferred consideration — for each deferred payment:
- Expected amount (£) — can be marked as contingent if not fixed
- Expected payment date — can be marked as estimated
- Contingency description (free text)
- Payment route per investor (direct / nominee)
- Status: Expected / Received / Overdue / Waived

Note: the platform does not calculate or advise on the tax treatment of deferred payments. It records and presents the information only.

Fee calculation on deferred payments: fees apply only once cumulative proceeds (initial + deferred received to date) exceed the original cost basis. Pro forma fee estimates are shown on the transaction statement for each expected deferred payment. Updated as actual payments are received.

New database table required — deferred_payments:
- id
- investment_id — FK to the sell transaction
- deal_id
- client_id
- expected_amount
- actual_amount — populated when received
- expected_date
- actual_date — populated when received
- contingency_description — nullable
- payment_route — 'direct' or 'nominee'
- status — 'expected', 'received', 'overdue', 'waived'
- created_at
- updated_at

---

### 4.8 Stage 5: Post-completion

#### Transaction statement
Generated automatically per investor when the transaction is recorded. Sent to investor by email via Outlook. Filed to platform and OneDrive.

Contents:
- Juno branding and contact details
- Investor name and address
- Company name
- Deal reference number
- Disposal date
- One row per share class: share class, number of shares sold, price per share, gross proceeds, fee basis description, fee %, fee £, net proceeds
- Total gross proceeds
- Total fees
- Total net proceeds
- Cost basis (FIFO)
- Provisional gain/loss
- EIS/SEIS status and whether qualifying period was met
- If early disposal: drafted note re tax consequences, editable by team before sending

If deferred consideration, three additional sections:
1. Total proceeds received to date — aggregated with date received
2. Current / next deferred payment — line by line per share class, subtotalled, with expected date, contingency note if applicable, pro forma fee estimate, pro forma net proceeds estimate
3. Future expected deferred payments — estimated dates and estimated totals

These three sections are updated each time a deferred payment is received.

#### Deferred payment statement
Generated each time a deferred payment is received and confirmed by the team. One statement per investor. Contains:
- Juno branding
- Investor name and address
- Company name
- Reference to original disposal date and deal reference
- Payment number (e.g. Deferred Payment 1 of 2)
- Amount received
- Payment date
- Payment route
- Fee calculation on this payment (cumulative profit basis)
- Fee £
- Net amount received
- Updated total proceeds received to date
- Updated total fees to date
- Updated provisional gain/loss
- Remaining expected payments if any

Sent to investor by email via Outlook. Filed to platform and OneDrive.

#### Post-completion company actions
Handled by the company, not Juno: cap table update, HMRC notification, share register update.

Juno requests an updated cap table from the company after completion, processed via the cap table workflow in Section 2.7.

---

### 4.9 Secondary Sales and Transfers

#### Secondary sales between Juno investors
Where one Juno investor sells shares to another Juno investor:
- Disposal recorded on the selling investor's record at the agreed price and date
- New holding recorded on the buying investor's record as a buy at the same price and date

#### Transfers
Transfers (spousal, estate) are a separate workflow not covered in this section. In a transfer, the transferor's original buy details (price, date) pass to the recipient. Common scenarios: spousal transfers, estate transfers on death. To be specced separately.

---

### 4.10 Notes for Later

1. Application form template for sell transactions — to be agreed and provided as an example before the sell wizard is built.
2. Example sell transaction statement — to be provided from Juno's current process.
3. Example deferred consideration statement — to be mocked up by Ed.
4. Platform-wide OneDrive naming convention and file metadata — to be agreed as a separate task.
5. Transfer workflow (spousal, estate) — to be specced separately.

---

*End of Section 4. Section 5 (transfer workflow) to follow.*

## Section 8: Outlook Email Integration

### 8.1 Overview

All outbound emails generated by the platform are sent via Microsoft Graph API connected to the relevant Juno Outlook mailbox. Each team member has their own Outlook inbox. The platform sends from the appropriate mailbox depending on context.

### 8.2 Setup

One-time OAuth connection per mailbox in Settings. Each team member connects their Outlook account once. The connection persists until revoked.

### 8.3 Emails sent by the platform

The following emails are sent automatically or on team confirmation:

- Application form sending (with Documenso signature link)
- Transaction statement sending (post-completion, per investor)
- EIS certificate sending (when uploaded, per investor)
- EIS confirmation to company (per completion event)
- Deferred payment statement sending (per payment received)
- Deal-related correspondence generated by the platform

### 8.4 Logging

Every email sent is:
- Logged against the deal record with timestamp, recipient email address, and subject line
- Stored as a sent item in the relevant Outlook mailbox
- Linked to the investor record where applicable

### 8.5 Tracking

Per investor, per document type, the platform tracks:
- Whether the email has been sent
- Date and time sent
- Which mailbox it was sent from
- Recipient email address

This tracking feeds the completion checklist and post-completion status displays.

---

## Section 9: Capital Events Workflow

### 9.1 Overview

A capital event is any corporate action that changes the share class structure of a company, independent of any investment transaction. Capital events must be recorded before any transaction that references the affected share classes.

Capital events include:
- Adding a new share class (even if Juno holds no shares in that class)
- Adjusting preference rankings when a new funding round introduces a new class or demotes existing classes
- Recording changes to existing share class terms negotiated in a new round

### 9.2 When to use this workflow

This workflow is triggered whenever:
- A new funding round introduces a share class not already in the platform
- An existing share class changes its preference ranking due to a new round
- Existing share class terms are renegotiated (e.g. preference multiple changes, board rights added)
- Juno receives an updated cap table showing structural changes

Note: a follow-on round may involve no Juno participation but still change the ranking of shares Juno holds. The capital events workflow must be run in these cases even though no transaction is being recorded.

### 9.3 Data captured

New share class:
- Company
- Share class name (e.g. "Series B Preference")
- Type (ordinary / preference)
- If preference: dividend rate, dividend cumulative (yes/no), dividend payment (paid / rolled up), preference multiple, participating (yes/no)
- Initial preference ranking
- Effective date
- Reason (free text — e.g. "Series B round closed 15 April 2026")

Ranking change to existing share class:
- Company
- Share class affected
- New preference rank
- Effective date
- Reason (free text)

These changes write to company_share_classes and share_class_ranking_history as defined in Section 1.3.

### 9.4 Review before saving

All changes are shown to the team in a summary before being written:
- Full list of share classes for this company after the change
- Ranking order shown visually (rank 1 at top, ordinary at bottom)
- Any classes whose ranking has changed are highlighted
- Team confirms before anything is written to the database

### 9.5 Cap table upload trigger

When a new cap table is uploaded to a company record, the platform prompts the team to run the capital events workflow if Claude detects:
- A share class present in the cap table that does not exist on the platform
- A ranking implied by the cap table that differs from the current platform ranking

Claude flags the specific discrepancies and suggests the changes. The team reviews and confirms before anything is written.

### 9.6 Dependency rule

The capital events workflow must be completed before:
- Any transaction referencing a new share class
- Any follow-on bookbuild where the new round involves a new share class
- Any waterfall calculation (future feature) that depends on current rankings

If a team member attempts to record a transaction against a share class that does not exist in company_share_classes for that company, the platform blocks the transaction and directs them to run the capital events workflow first.

---

*End of Sections 8 and 9. Section 5 (transfer workflow), Section 6 (CLN and dividends), and Section 7 (shared post-completion elements) to follow.*

## Section 5: Transfer Workflow

### 5.1 Overview

A transfer records the movement of shares from one holder to another without a cash transaction at market value. Common scenarios:

- Spousal transfer — investor transfers shares to their spouse or civil partner
- Estate transfer on death — portfolio transferred to estate and subsequently to beneficiaries
- Other gift or restructuring transfers

Transfers are initiated by:
- The investor themselves
- Juno recommending a transfer (e.g. as part of tax planning advice)
- An adviser, estate, lawyer, or family member (in probate scenarios)

No fee is charged by Juno on a transfer.

### 5.2 Key rules

- The recipient takes on the original acquisition price and date of each lot being transferred. They do not get a new acquisition date at the date of transfer.
- A transfer can be partial (some shares) or full (entire holding). Full holding is the most common case.
- A transfer involves two records: the transferor (from) and the transferee (to). Both must be client records on the platform before the transfer can be recorded.
- If the transferee is not yet a client record, the KYC / onboarding workflow must be completed first.

### 5.3 EIS and SEIS

Open question: whether EIS or SEIS status and qualifying period transfer with the shares to the recipient, or whether the transfer resets or voids the qualifying period. To be confirmed with adviser before the transfer workflow is built.

Until confirmed, the platform flags any transfer of EIS or SEIS qualifying shares with a warning:

"These shares are [EIS/SEIS]-qualifying. Please confirm the tax treatment of this transfer before proceeding. The platform will record the transfer but cannot advise on whether EIS/SEIS relief is affected."

### 5.4 Documents

Stock transfer forms are required where shares are held outside a nominee structure (i.e. held directly). Nominee-held shares may not require a stock transfer form — this depends on the nominee's process.

The transfer workflow offers two document handling options:

Option A — Application form approach: generate a transfer application form (similar in structure to the buy/sell application form) showing: transferor name and details, transferee name and details, share class, number of shares, original acquisition price and date, transfer date, reason for transfer. Sent via Documenso for signature where required.

Option B — External documents: lawyers or the nominee handle documents externally. Juno uploads the completed stock transfer form to the deal record when received.

The team selects which option applies at deal setup. Both options can be used together if required (e.g. application form for Juno's records plus external stock transfer form for the registrar).

### 5.5 Workflow stages

1. Deal setup — record transfer details and select document handling option
2. Documents — generate application form and/or upload external documents
3. Transaction recording — write the transfer to both records
4. Post-completion — confirmation to both parties

### 5.6 Stage 1: Deal Setup

Data captured:
- Transfer type (spousal / estate / other gift / restructuring)
- Company
- Transferor (from — FK to clients)
- Transferee (to — FK to clients)
- Share class
- Number of shares (defaults to full holding, can be overridden)
- Transfer date
- Reason (free text)
- Document handling option (application form / external / both)
- Notes

The wizard pre-populates the transferor's current holding for the selected company and share class. The team confirms or overrides the number of shares.

For estate transfers: the transferor may be a deceased investor. The platform supports recording a transfer from a deceased investor's record. A note is added to the record flagging the date of death.

### 5.7 Stage 2: Documents

If application form option selected:
- Platform generates a transfer application form pre-filled with transfer details
- Sent via Documenso if signatures required
- Signed form filed to both the transferor and transferee records on the platform and OneDrive

If external documents option selected:
- Team uploads stock transfer form when received from lawyers or nominee
- Filed to both records on the platform and OneDrive

### 5.8 Stage 3: Transaction Recording

On confirmation, the platform writes two records:

Transferor record:
- Transaction type: transfer_out
- Share class, number of shares, transfer date
- Original acquisition price and date preserved in history
- Holding reduced or closed depending on whether partial or full transfer

Transferee record:
- Transaction type: transfer_in
- Share class, number of shares, transfer date
- Original acquisition price and date: inherited from transferor's original lot(s) — FIFO order
- New holding created on transferee's record

No share price confirmation step — transfers do not update the company share price.

No fee calculation — transfers are fee-free.

### 5.9 Stage 4: Post-completion

Confirmation sent to both transferor and transferee by email via Outlook confirming:
- Transfer date
- Company and share class
- Number of shares transferred
- Original acquisition price and date (for transferee's records)

Filed to both records on the platform and OneDrive.

No transaction statement in the buy/sell format — a simpler transfer confirmation letter is generated instead.

### 5.10 Notes for later

1. EIS/SEIS treatment on transfer — to be confirmed with adviser before build.
2. Documenso applicability for stock transfer forms — to be confirmed based on nominee and registrar requirements.
3. Transfer application form template — to be agreed before build, similar to buy/sell application form.
4. Probate workflow detail — estate transfers may require additional steps (grant of probate, executor authority). To be reviewed if this becomes a common scenario.

---

*End of Section 5. Section 6 (CLN and dividend transactions) to follow.*
