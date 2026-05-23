# Section 9 — Client Record (Replacement)

**Replaces:** Existing Section 9 in `Juno_Platform_Specification_v1.md` (v3.2)
**Status:** Locked — informs Phase B build (Client Record + Portfolio Workflows)
**Prototype:** `client_record_v2.html`

## 9.1 Purpose

The client record is the team's home base for managing one investor relationship. Three jobs of equal weight:

1. **Quick status check** — is everything in order for this client?
2. **Drill into investments** — view holdings, generate reports
3. **Service the client** — find docs, log notes, answer queries

The platform is internal-only in v1. The page is designed so that, when the investor portal is added in a future phase, the client-facing surfaces (holdings, valuations, documents) can be reused while team-only surfaces (notes, fee rate, internal flags) are hidden.

## 9.2 Entity Aggregation Model

### 9.2.1 Lead Investor Concept

Every client record belongs to exactly one **lead investor**. A lead may have linked entities:

- Their own name (always implicit — the lead client itself)
- Family members (e.g. spouse) — separate client records, linked
- Pension vehicles (e.g. SIPP) — separate client records, linked
- Corporate vehicles (e.g. Holdings Ltd) — separate client records, linked
- Trusts — separate client records, linked

This is implemented via a `lead_client_id` column on the `clients` table that points to the lead's own client ID. A lead investor's `lead_client_id` equals their own ID; linked entities point to the lead.

### 9.2.2 Aggregated View by Default

When a team member opens a lead investor's client record, all linked entities' holdings appear by default, aggregated into the headline figures. This solves the "Barry has five client records" fragmentation problem.

A linked entity (e.g. "BO'B SIPP") still has its own client record reachable directly — useful for editing entity-specific details. But the lead's record is the day-to-day working surface.

### 9.2.3 Three-Dimensional Identity

The platform-wide three-dimensional investor identity model applies here unchanged:

- **Lead investor** — principal investor (always a real person; the lead)
- **Beneficial owner** — legal entity through which the investment is made (NULL = the lead is also the beneficial owner)
- **Legal owner** — where the shares are physically held (NULL = direct/no nominee)

In the client record UI, the lead investor dimension is the page itself. Beneficial owner and legal owner surface as tags on individual transaction rows.

*Vocabulary updated Entity Model Cleanup Sub-stage B, 23 May 2026. Database column names unchanged.*

## 9.3 Page Header

### 9.3.1 Top Row

- Client avatar (initials, navy/teal background, 48px circle)
- Full name (19px, navy, weight 500)
- Meta row immediately below name:
  - Investor reference
  - Date joined
  - Tag: `Lead · N entities` (only on lead records; "Individual" if no linked entities)
  - Tag: EIS qualifying tax status (green pill)
  - Tag: KYC status (green if verified, amber if expiring within 90 days, red if outstanding)

### 9.3.2 Right-Aligned Action Cluster

- **Generate report** — primary navy button (most-used action)
- **+ Add investment** — secondary white button
- **Actions menu (⋯)** — opens dropdown grouped by:
  - *Reporting:* Generate portfolio statement · Generate investor update letter · Generate EIS confirmation
  - *Documents & signatures:* Send document for signature · Upload document
  - *Client:* Add note · Edit client details

### 9.3.3 Status Strip (new)

A horizontal row of status pills directly under the header content, separated by a thin top border. Each pill: small coloured dot + short text. Designed for at-a-glance health check.

Default pills (all five always shown):

| Pill | Green (OK) | Amber (warn) | Red (problem) |
|---|---|---|---|
| KYC | "KYC verified · expires [date]" | Expires within 90 days | Expired or outstanding |
| Signatures | "All signatures complete" | "N signatures pending" | "N overdue" |
| Documents | "All investment docs filed" | "N missing this quarter" | — |
| Notes | "No notes flagged" | "N flagged for follow-up" | — |
| POA | "POA on file" | — | "POA not on file" |

The status strip is **computed on read** (no scheduled jobs) using the same pattern as `getDisplayedStatus()` in the deals workflow.

## 9.4 Headline Stats (4 cards)

Identical pattern to the deal page summary cards. Each card: small grey label, 20px navy value, small sub-line.

1. **Total invested** — sum across all entities · sub: "across N entities"
2. **Current valuation** — sub: ± £change (± %) — green if positive, red if negative
3. **Companies invested** — count of distinct portfolio companies · sub: "N holdings total"
4. **Pending actions** — count · sub-line breakdown (e.g. "2 signatures · 1 note")

Stats reflect the currently filtered entity scope (see 9.5). Switching the entity filter recomputes the cards.

## 9.5 Entity Filter Bar

Above the tabs strip, a row of chip buttons:

- "All entities · N" (default, active)
- One chip per linked entity, format: `[Entity name] · N` where N is holding count

Single-select. Active chip is navy background, white text. The filter persists across all five tabs — switching from Investments to Documents keeps the same entity filter applied.

The filter affects: headline stats, Investments tab, Investment docs tab, Updates sent tab. It does **not** affect Notes (notes are about the whole client relationship).

## 9.6 Tabs Structure

Five tabs. Tab strip uses the same pattern as the deal page (URL-synced state, navy underline on active).

**Overview · Investments · Investment docs · Updates sent · Notes**

Tab counts shown after labels where useful (e.g. "Investments 17", "Notes 6").

## 9.7 Overview Tab

Two-column layout, equal width.

### 9.7.1 Left Column

**Contact details panel**

Email · Phone · Address · Date joined · Tax status · Investor reference · Default fee rate · Report email

- Field list pattern: 110px label column, value column
- "Edit" link in panel title opens the Edit Client Details modal

**Membership documents panel** (below contact details)

- Compact list, one row per document
- Each row: type tag (KYC, POA, Membership, Suitability, Source of funds), document name, date, View link
- "+ Upload" link in panel title

### 9.7.2 Right Column

**Linked entities panel**

- Table format: Entity · Invested · Current value · Change
- Each row shows the entity name with two tags: entity-type tag (Own name / Pension / Corporate / Family / Trust) and holding-location tag (Direct / Nominee, where applicable at the entity level)
- Total row at the bottom (light grey background, weight 500)
- "+ Add entity" link in panel title — opens entity creation flow (see 9.13)
- Click entity row → navigates to that entity's own client record

**Reporting defaults panel**

- Header text: "Entities included in routine portfolio statements:"
- One checkbox row per entity (entity name, Direct/Nominee tag right-aligned)
- Below: Delivery method (email / download only) and frequency (Quarterly / Half-yearly / Annual / Manual)
- "Edit" link in panel title

### 9.7.3 Performance Placeholder

Below the two-column area, a single full-width panel with dashed border and grey-tinted background. Title "Performance metrics" in muted colour. Body text: "Realised P&L, unrealised P&L, MOIC and IRR will appear here once the performance reporting feature is built." This reserves layout space for the later Performance Reporting feature (see Future Work in Section 9.14).

## 9.8 Investments Tab

The most data-dense view in the page. Three view modes selectable from a segmented control at the top right of the toolbar.

### 9.8.1 Toolbar

**Left side — three filter dropdowns:**

- Held by: All entities / [each entity]
- Location: Direct + nominee / Direct only / Nominee only
- EIS: All / EIS only / Non-EIS only

**Right side — view toggle (segmented button, 3 options):**

- By company (default)
- By share class
- Flat list

Far right: count summary, e.g. "17 holdings · 11 companies".

### 9.8.2 View 1 — By Company (default)

One row per company. Click a row to expand.

**Company-level columns:**

| Column | Notes |
|---|---|
| Company | Logo placeholder + name + sub-line "[sector] · N transactions" |
| Share classes | Tags showing each share class held (e.g. "Ord" "A Ord" "C Ord") |
| Shares | Total shares held across all transactions, weighted-sum |
| Avg cost | Weighted average cost per share across all transactions |
| Invested | Sum subscribed |
| Current value | Sum of (current price × shares) per share class |
| Change | £ change · % change below |
| (count pill) | "N tx" — small grey pill on far right |

**Avg cost calculation:** `total invested / total shares`. Weighted by purchase volume. Works correctly across multiple share classes because price is per-share, regardless of class.

**Total row at the bottom** (across all rows, regardless of expansion state): label "Total · 11 companies · 17 transactions", with totals for shares, invested, current value, change. Avg cost is blank on the total row (averaging across companies has no meaningful interpretation).

**Expanded row reveals a sub-table:**

| Column | Notes |
|---|---|
| Date | Investment date, right-aligned |
| Share class | Plain text (e.g. "A Ordinary") |
| EIS | Pill: green "EIS" or grey "Non-EIS" |
| Orig price | Original share price |
| Shares | Shares purchased |
| Invested | Sum subscribed |
| Curr price | Current share price (per share class) |
| Curr value | Current value of this lot |
| Change | £ change |
| Held by | Entity name + Direct/Nominee tag |

Below the sub-table (still inside the expanded area, light grey background): a meta strip showing:

- Cumulative dividend paid: £X (only displayed when > £0; otherwise "£0.00")
- First investment date · Most recent investment date
- Optional warnings (e.g. "Note: Current price below original on both lots") — generated when conditions are met

The dividend line answers the deferred question from the column-design discussion: dividend is hidden by default at the company-list level and shown only on expansion.

### 9.8.3 View 2 — By Share Class

Within each company, transactions are grouped by share class. Layout pattern:

- Company header row (logo + company name, light grey background)
- One row per share class held in that company, with EIS tag inline
- Share-class subtotal columns: Shares · Avg cost · Invested · Current value · Change
- Company subtotal row (italic, light grey)
- Each share-class row is expandable to reveal the individual transactions within that class (same sub-table structure as 9.8.2)

This view is useful when thinking about share-class-level performance (different rights, different prices, different exit timings).

### 9.8.4 View 3 — Flat List

One row per transaction. No expansion. All transaction-level columns shown directly.

**Columns (sortable):**

- Date (default sort, descending)
- Company
- Share class
- EIS
- Orig price
- Shares
- Invested
- Curr price
- Curr value
- Change
- Held by

Sortable columns: clicking a column header sorts the table by that column. Active column shows a directional arrow. Clicking again reverses direction. The filter toolbar still applies (Held by / Location / EIS).

This view is useful for ad-hoc questions like "biggest single investment", "all 2021 transactions", "everything held in the SIPP".

### 9.8.5 EIS Status Reminder

EIS status is at the transaction level only, never at the company level. A company can have both EIS and non-EIS transactions simultaneously. The UI must never imply "Cyclr is EIS" — only "this transaction is EIS".

## 9.9 Investment Docs Tab

Two-level expansion: Company → Year → Documents.

### 9.9.1 Toolbar

- Filter: Company (All / each)
- Filter: Type (All / Application form / EIS certificate / Transaction statement / Side letter / Invoice / Exit statement / Valuations and updates sent)
- Filter: Year (All / each year)
- Right side: total count

### 9.9.2 Tree Layout

- Company row (collapsed by default): logo + name + count "N documents · N years"
- Year row (one level indented): "[Year] · N documents"
- Document row (two levels indented): type tag + filename + date + View link

### 9.9.3 File Naming

Convention from Section 25 applies: `YYYY-MM-DD — [Document type] — [Optional descriptor].pdf`. The platform displays the friendly name; OneDrive stores under `[Company] / [Investor] / [category]`.

### 9.9.4 Document Categories

- Application form
- EIS certificate
- Transaction statement (= confirmation statement)
- Exit statement
- Side letter
- Valuations and updates sent
- Invoice (5% fee invoice)

## 9.10 Updates Sent Tab

Chronological list, newest first. Each row:

- Coloured dot (green = portfolio statement, amber = company update, blue = EIS letter)
- Title (e.g. "Q1 2026 Portfolio Statement")
- Meta line: "Emailed to [address] · [date] · sent by [team initials]"
- Type tag right-aligned

### 9.10.1 Toolbar

- Filter: Type (All / Portfolio statements / Investor update letters / EIS confirmations)
- Filter: Year
- Right side: total count

### 9.10.2 Click Behaviour

Click a row → opens the sent document (PDF preview). The original is fetched from the same store as the OneDrive sync.

## 9.11 Notes Tab

### 9.11.1 Add Note Block (top of tab)

- Textarea (placeholder: "Add a note about [client]… (call notes, email summary, follow-up items, etc.)")
- Below textarea: "Flag for follow-up" checkbox (left), "Cancel" + "Add note" buttons (right)
- "Add note" is primary navy button

### 9.11.2 Notes List

Chronological, newest first. Each note:

- Purple dot (Claude-coloured)
- Author initials + name
- "Flagged" tag (amber) if `flag_for_followup = true`
- Date right-aligned
- Note body text indented under the header

### 9.11.3 Flagged Notes Behaviour

- Notes with `flag_for_followup = true` render with a soft amber background (`#fef7eb`) and a 3px left border
- The count of flagged notes feeds the "Notes" pill in the status strip (9.3.3)
- A note can be unflagged by editing it (placeholder: editing flow not in v1; team workaround is to add a follow-up note resolving it)

## 9.12 Reporting Defaults

Per 10.4 of the spec (unchanged): each lead investor has a saved default for which entities are included in routine reports, plus delivery method (email or download only) and frequency. The default pre-populates the report generation screen but can be overridden per report without changing the default.

The Reporting Defaults panel on Overview (9.7.2) is where this default is edited.

## 9.13 Add Entity Flow (referenced from 9.7.2)

Triggered from "+ Add entity" link on the Linked Entities panel.

**Modal form:**

- Entity type: Own name (disabled — that's the lead) / Family / Pension / Corporate / Trust
- Entity name (free text)
- Date the entity was set up
- Default holding location (Direct / Nominee)
- Default reporting inclusion (Yes / No)
- KYC status (Verified / Renewal due / Outstanding)
- POA status (On file / Not on file)
- Notes (optional)

On save: creates a new client record with `lead_client_id` set to the lead's ID. The lead's "N entities" tag in the header increments.

## 9.14 Future Work (Phase B+)

Items deliberately deferred from v1 of the client record:

- **Performance metrics** (P&L realised/unrealised, MOIC, IRR) — placeholder reserved on Overview (see 9.7.3). Requires the full performance reporting feature scoped separately.
- **Sortable column headers in Flat List view** — visual indicators present, sort logic to follow if not already in v1
- **Note editing** — v1 supports add only. Edit/delete to follow.
- **Bulk operations** (e.g. tag multiple notes, archive old documents) — not required at current scale.
- **Entity-level KYC/POA** — currently inherited from lead; may need separate tracking per entity later.
- **"Last contacted" pill** in status strip — useful but requires interaction logging not yet built.
- **Investor portal carve-out** — when investor read-only access ships (Phase 4), a flag per panel/tab determines client-facing vs team-only visibility. The Notes tab and team-only fields (Default fee rate) are team-only by default.

## 9.15 Database Schema Changes

Proposed schema modifications. Final shape to be reviewed by Claude Code against existing tables before SQL is applied.

### 9.15.1 New columns on clients

```sql
-- Already may exist; verify:
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS lead_client_id UUID REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS entity_type TEXT
    CHECK (entity_type IN ('own_name','family','pension','corporate','trust'));

-- For lead investors: lead_client_id = id (self-reference)
-- For linked entities: lead_client_id points to the lead's id
-- entity_type defaults to 'own_name' for new clients
```

**Why self-referencing:** lets a single query (`WHERE lead_client_id = X`) return the lead and all linked entities. Alternative would be a separate junction table, which adds an extra query for no benefit at this scale.

### 9.15.2 Reporting defaults

Two columns on `clients` are sufficient (no separate table needed at this scale):

```sql
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS reporting_default_entities UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reporting_default_delivery TEXT
    DEFAULT 'email' CHECK (reporting_default_delivery IN ('email','download'));

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS reporting_default_frequency TEXT
    DEFAULT 'quarterly'
    CHECK (reporting_default_frequency IN ('quarterly','half_yearly','annual','manual'));
```

`reporting_default_entities` is an array of client IDs (which entities to include). For a single-entity client this contains just their own ID.

### 9.15.3 Notes table (new)

```sql
CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  flag_for_followup BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_client_notes_client_id ON client_notes(client_id);
CREATE INDEX idx_client_notes_followup
  ON client_notes(client_id) WHERE flag_for_followup = TRUE;
```

The partial index on flagged notes makes the status-strip count fast.

### 9.15.4 Membership documents (likely already exists)

If a `documents` table exists with a `category` field, membership doc types just need to be valid values:

- `kyc`
- `poa`
- `membership_agreement`
- `suitability`
- `source_of_funds`

If no such structure exists, propose a `client_documents` table separate from investment-related documents.

### 9.15.5 Status strip computation

Computed on read in JavaScript, not stored. Pseudocode:

```javascript
function getClientStatus(client, entities, transactions, documents, notes) {
  return {
    kyc: kycPillFor(client, entities),    // green/amber/red
    signatures: pendingSignaturesFor(transactions),
    documents: missingDocsFor(transactions, documents),
    notes: flaggedNotesCount(notes),
    poa: client.poa_on_file ? 'green' : 'red',
  };
}
```

Same pattern as `getDisplayedStatus()` for the deal page. No scheduled jobs.

## 9.16 Routing

URL pattern: `/clients/[client_id]?tab=[tab]&entity=[entity_id]`

- `client_id`: lead investor or any entity (URL works for both — but linked entity URLs redirect to lead with `entity=` filter pre-applied)
- `tab`: `overview` (default) / `investments` / `docs` / `updates` / `notes`
- `entity`: optional, defaults to "all"

Browser back/forward must work cleanly. Tab and entity filter both URL-synced.

## 9.17 Performance & Query Pattern

Per `CLAUDE.md`: PostgREST embedded joins must not be used. The page should fetch in two passes:

1. **Lead client + linked entities:** `SELECT * FROM clients WHERE lead_client_id = $1`
2. **Related data, parallel queries:**
   - Transactions: `SELECT * FROM transactions WHERE client_id = ANY($1)` (where `$1` is the array of entity IDs)
   - Documents, notes, valuations: same pattern, all keyed off the entity ID array
3. **Merge in JavaScript** via Map lookups keyed by client ID and transaction ID.

All headline figures, the status strip, and the per-tab content are computed in the client (browser) from these three queries. No server-side aggregation needed at v1 scale.

---

*Section 9 ends here. Sections 10 onwards (Linked Accounts, Report Generation, etc.) remain unchanged from v3.2.*
