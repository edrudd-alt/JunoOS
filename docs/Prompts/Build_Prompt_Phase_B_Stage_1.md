# Build Prompt — Phase B Stage 1: Client Record Page (FINAL, ready to run)

**Reference spec:** `docs/section_9_client_record.md` (replaces Section 9 in the master spec)
**Reference prototype:** `docs/client_record_v2.html`
**Master platform standards:** `CLAUDE.md` and `AGENTS.md`
**Depends on:** existing `clients`, `companies`, `investments`, `deals`, `deal_investors`, `documents`, `client_notes`, `client_relationships`, `nominees`, `fund_types`, `fee_schedules`, `fee_schedule_items`
**Branch:** `feat/client-record-v1`
**Supabase project ref:** `pzfydvwbeeupfgnxkpad`

> **NOTE TO CLAUDE CODE:** The Stage 1.1 database migration described in this prompt has already been **applied to production** on 18 May 2026. Verify the database state matches what's documented in section 2 below before starting on sub-stage 1.2. If the state does not match, stop and ask Ed.

-----

## 0. Pre-flight context (read before doing anything)

This is the first stage of **Phase B**. Phase A (the deal page restructure, Stages 1 through 6c) is complete and merged. Phase B builds out the client record page — the team's home base for managing one investor relationship.

**Standing rules from the platform (do not violate):**

1. **No PostgREST embedded joins anywhere.** Use the two-query-then-merge pattern documented in `CLAUDE.md`. Fetch parent rows, then fetch related rows via `.in(...)`, then merge in JavaScript with Map lookups. Embedded joins silently fail and return null for the joined fields — they cannot be used.
2. **Plain English alongside technical detail.** Every PR description and every non-trivial code comment must explain the reasoning in plain English. Ed is not a coder.
3. **Review-before-apply for any new migrations.** Stage 1.1's migration is already done. If subsequent sub-stages need further schema changes, generate the migration file, post the SQL in the PR description with a plain-English explanation of every line, and wait for Ed's review before he applies it manually in the Supabase SQL editor. Do NOT apply migrations from Claude Code.
4. **Branch per sub-stage, PR per sub-stage.** Do not roll multiple sub-stages into one PR.
5. **Two-layer review.** Claude Code (this agent) builds and self-checks. Chat-Claude (separate session) verifies via Supabase MCP and reads the spec. Ed reviews the deployed Vercel preview.
6. **Internal-only in v1, but design with the investor portal in mind.** The page is for the team only. However, future investor-portal access is planned (same app, separate route, different layout, investors see only their own data). The right way to design for this is at the **database query layer**, not at the component-folder level — see section 4 ("Query layer separation") below.
7. **Fees are never hardcoded.** Read from `clients.fee_schedule_id` → `fee_schedule_items`, fallback `clients.default_fee_rate`, further fallback `fund_types.exit_fee_default_pct`. Never write a percentage as a constant.

-----

## 1. The lead-investor model used by this page

**This is the single most important thing to internalise before writing any query in this stage.** Get this wrong and the whole page misbehaves.

The `clients` table represents two different things in the same shape:

- **Leads** — real people. The "top" of a tree. A lead has `lead_investor_id IS NULL`.
- **Linked entities** — vehicles belonging to a lead (SIPPs, Ltd companies, trusts, estates, family-member accounts). A linked entity has `lead_investor_id` pointing at the lead's id.

The database already enforces a safety rule called `chk_vehicle_type_required`: *if `lead_investor_id IS NOT NULL`, then `vehicle_type` must also be NOT NULL.* In plain English: every linked entity must declare what kind of vehicle it is. Do not break this rule by writing code or migrations that would put non-null values in `lead_investor_id` for leads, or non-null values in `vehicle_type` for leads.

**Aggregation query pattern** — to fetch "the lead plus everything linked to it":

```typescript
// Lead + all linked entities
// WHY THE OR: leads in our database have lead_investor_id = NULL (they're
// the top of their own tree). Linked entities point at their lead. So to
// fetch "Barry + everyone linked to Barry" we need BOTH: the row where
// id = Barry, AND rows where lead_investor_id = Barry.
const { data: clientGroup } = await supabase
  .from('clients')
  .select('*')
  .or(`id.eq.${leadId},lead_investor_id.eq.${leadId}`);
```

**Direct-link redirect** — if a user opens `/clients/[clientId]` and that client's `lead_investor_id IS NOT NULL` (i.e. it's a linked entity, not a lead), redirect **server-side** to `/clients/[lead_investor_id]?entity=[clientId]`. This means the team always works from the lead's page; the entity filter narrows the view.

This solves the "Barry has five client records" fragmentation problem — the team works from one page; the entity filter narrows the view.

-----

## 2. Database state (verified 18 May 2026 — confirmed AFTER migration applied)

The Stage 1.1 migration has already been applied. Before starting sub-stage 1.2, run these checks to confirm the database matches expectations:

```sql
-- Should return one row
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients'
  AND column_name='report_delivery_frequency';

-- Should return two rows
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='client_notes'
  AND column_name IN ('flag_for_followup','updated_at');

-- Should show all five allowed entity_type values
SELECT pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'clients' AND con.conname = 'clients_entity_type_check';

-- Should return 0 (legacy clients.notes column wiped, kept as column for now)
SELECT COUNT(*) FROM clients WHERE notes IS NOT NULL;
```

### 2.1 Columns on `clients` that this page will use

| Column                                                                              | Notes                                                                                                                                          |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `lead_investor_id` (UUID, FK → clients.id, **NULL for leads**)                      | Used to identify leads and link entities back to their lead. Do NOT write self-referencing values.                                              |
| `entity_type` (text, **NOT NULL**, values: own_name, family, pension, corporate, trust) | Drives the entity-badge labelling on linked-entity rows.                                                                                       |
| `holding_location` (text, default `direct`, values: direct, nominee, both)          | Used as supplementary info.                                                                                                                    |
| `reporting_entity_defaults` (jsonb, default `[]`)                                   | Structured shape — see section 3 below for Option B model.                                                                                     |
| `report_delivery_method` (text, default `email`, values: email, download_only)      | Note the underscore in `download_only`.                                                                                                        |
| `report_delivery_email` (text)                                                      | Reports-go-to address.                                                                                                                         |
| `report_delivery_frequency` (text, default `quarterly`, values: quarterly, half_yearly, annual, manual) | Added by Stage 1.1 migration.                                                                                       |
| `default_nominee_id` (UUID, FK → nominees.id)                                       | Used for nominee pre-fill on deal join.                                                                                                        |
| `default_fee_rate` (numeric, default 5.00)                                          | Legacy fee fallback. Read at the bottom of the fee lookup chain.                                                                               |
| `fee_schedule_id` (UUID, FK → fee_schedules.id)                                     | Primary fee lookup.                                                                                                                            |
| `active_fund_type` (text)                                                           | Drives fund-type display.                                                                                                                      |
| `fund_type` (text)                                                                  | Underlying client-level fund-type designation.                                                                                                 |
| `is_favourite` (boolean)                                                             | Add Investors modal favourites tab.                                                                                                            |
| `kyc_status`, `kyc_expiry`, `tax_status`                                            | Drive status strip pills.                                                                                                                      |
| `vehicle_type` (text, NULL for leads, mandatory for linked entities)                | Describes what kind of vehicle a linked entity is.                                                                                             |
| `notes` (text, **DO NOT USE**)                                                      | Legacy free-text column, now wiped. Do not surface anywhere on the page. Do not write to it. Scheduled for column-drop in a follow-up migration. |

### 2.2 `client_notes` table — columns this page will use

```
id, client_id, note_text, flag_for_followup, created_by, created_at, updated_at
```

All notes capture goes via this table. The page reads it, writes to it, and uses `flag_for_followup` to drive the status-strip "flagged notes" pill.

### 2.3 `documents` table — membership docs already supported

The `documents.type` check constraint already covers all five membership categories: `kyc`, `poa`, `membership_agreement`, `suitability_assessment`, `source_of_funds`. Use these values as-is. Plus the existing versioning columns (`version`, `superseded`, `superseded_at`, `superseded_reason`, `superseded_by_id`) and the Documenso signing columns. No schema work required for membership documents.

-----

## 3. Reporting Defaults — the storage shape

The `reporting_entity_defaults` column on `clients` is jsonb. Store it as a JSON array of objects, one per entity in the client's tree, each with at least an `entity_id` and an `include` boolean:

```json
[
  {"entity_id": "uuid-of-barry",       "include": true},
  {"entity_id": "uuid-of-barrys-sipp", "include": true},
  {"entity_id": "uuid-of-barrys-ltd",  "include": false}
]
```

**Rules for the page code:**

1. **When a new linked entity is added** to the tree, append a row to `reporting_entity_defaults` for that entity with `include: true` by default. (Sensible default: a newly-added entity is part of the client's universe, so unless explicitly excluded it gets reported.)
2. **When a linked entity is removed** from the tree, remove the corresponding row in `reporting_entity_defaults`. No dangling rows pointing at non-existent entities.
3. **Reading**: "is entity E included in reports?" = "find the row in the array where `entity_id = E`; if it exists and `include = true`, yes; otherwise no." Missing rows mean *not included*.
4. **Build the TypeScript type as an open object**, not a strict tuple, so future per-entity properties can be added without a schema migration:

```typescript
type ReportingEntityDefault = {
  entity_id: string;
  include: boolean;
  // future per-entity settings go here:
  // delivery_email?: string;
  // summary_only?: boolean;
  // exclude_eis_detail?: boolean;
};
```

**WHY this shape over a plain array of UUIDs:** Ed wants room for per-entity settings later (delivery routing, content variants). The structured shape means future settings are an array-item addition, not a column migration.

-----

## 4. Query layer separation (investor-portal readiness)

The investor portal will be a separate route in the same Next.js app with its own layout. Internal page components will not be reused as-is on the portal. Therefore:

**DO NOT** create `_components/team-only/` subfolders or tag internal components in any special way. All components under `/clients/[id]` are internal by default.

**DO** group query functions in `_lib/queries.ts` into two clearly-named sections using comment headers. This pattern is mandatory:

```typescript
// ────────────────────────────────────────────────────────────────
// INTERNAL-ONLY QUERIES — never call these from an investor route.
// These return data the team uses internally that should not be
// exposed to investors (status strip, internal notes, fee context).
// ────────────────────────────────────────────────────────────────

export async function getInternalStatusStrip(...) { ... }
export async function getFlaggedNotesCount(...) { ... }
export async function getInternalNotes(...) { ... }
export async function getClientFeeContext(...) { ... }


// ────────────────────────────────────────────────────────────────
// SHARED QUERIES — safe to reuse on a future investor portal.
// These only return data ABOUT the client themselves (their own
// holdings, valuations, documents, EIS certificates).
// ────────────────────────────────────────────────────────────────

export async function getPortfolioByCompany(...) { ... }
export async function getPortfolioByTransaction(...) { ... }
export async function getPortfolioByEntity(...) { ... }
export async function getClientDocuments(...) { ... }
```

**Why this approach:** the folder convention adds noise without protecting anything. *All* the internal page components will be team-only by definition. The query-layer split shows clear intent — when the investor portal route is built, the developer can lift "shared" queries across with confidence and knows not to touch "internal-only" ones.

**Important** — these comment headers are signposts, not locks. Real protection against accidental misuse comes from Row Level Security (RLS) policies, which we are NOT adding now. RLS is on the Future Work list (section 8) and will be applied before the investor portal goes live.

-----

## 5. Sub-stage build order

Five sub-stages. One PR each. Wait for review before moving to the next.

### Sub-stage 1.1 — Schema migration

**Status: ALREADY APPLIED on 18 May 2026.** Confirm the database matches section 2 before starting 1.2. No new work required.

The applied migration made seven changes: (1) widened `entity_type` constraint to 5 values; (2) made `entity_type` NOT NULL; (3) added `report_delivery_frequency` to `clients`; (4) added `flag_for_followup` to `client_notes`; (5) added `updated_at` to `client_notes`; (6) added two indexes; (7) wiped legacy `clients.notes` column.

### Sub-stage 1.2 — Page shell, header, status strip, headline stats

**Route:** `/clients/[id]` (Next.js dynamic segment).

**Files:**

- `app/clients/[id]/page.tsx` — server component, fetches data
- `app/clients/[id]/_components/client-header.tsx`
- `app/clients/[id]/_components/status-strip.tsx`
- `app/clients/[id]/_components/headline-stats.tsx`
- `app/clients/[id]/_components/entity-filter.tsx`
- `app/clients/[id]/_lib/queries.ts` — all DB queries (grouped per section 4 above)
- `app/clients/[id]/_lib/aggregations.ts` — pure functions for computing headline stats etc.

**Query pattern (mandatory two-query-then-merge):**

```typescript
// 1. Lead + all linked entities
// (See section 1 above for why we use OR here)
const { data: clientGroup } = await supabase
  .from('clients')
  .select('*')
  .or(`id.eq.${leadId},lead_investor_id.eq.${leadId}`);

// 2. All investments for those entities
const entityIds = clientGroup.map(c => c.id);
const { data: investments } = await supabase
  .from('investments')
  .select('*')
  .in('client_id', entityIds);

// 3. Companies referenced
const companyIds = [...new Set(investments.map(i => i.company_id).filter(Boolean))];
const { data: companies } = await supabase
  .from('companies')
  .select('*')
  .in('id', companyIds);

// 4. Latest valuations (most-recent per company) — fetch separately, derive in JS
const { data: valuations } = await supabase
  .from('valuations')
  .select('*')
  .in('company_id', companyIds)
  .order('valuation_date', { ascending: false });

// 5. Merge via Maps
```

**Status strip logic:** compute in `aggregations.ts`. Each pill (KYC, POA, membership agreement, suitability, flagged notes) has a colour rule from the spec section 9.3.3. Plain English in code comments.

**Entity filter state:** URL query param `?entity=[id]` or `?entity=all`. Use `useSearchParams` in a small client wrapper. Default = `all` (aggregated view).

**Direct-link redirect:** see section 1 above for the rule.

**Plain-English reminder to include in the PR:** explain why we always render from the lead's page, even when the URL points at a linked entity.

**Stop condition:** Ed reviews preview deployment for layout, status strip behaviour, and entity filter wiring.

### Sub-stage 1.3 — Overview tab

**Files:**

- `app/clients/[id]/_tabs/overview.tsx`
- `app/clients/[id]/_components/contact-details-panel.tsx`
- `app/clients/[id]/_components/membership-docs-panel.tsx`
- `app/clients/[id]/_components/linked-entities-panel.tsx`
- `app/clients/[id]/_components/reporting-defaults-panel.tsx`
- `app/clients/[id]/_components/edit-client-modal.tsx`

**Edit Client Details modal:** mirror the Stage 2c Edit Deal Details modal pattern. Fields: email, phone, address (single textarea built from `address_line1` + `address_line2` + `city` + `postcode`), tax status, default fee rate, report email, report frequency. Save → updates `clients` row → revalidate server component.

**+ Add entity flow:** modal as per spec section 9.13. On save:
- Create a new `clients` row with `lead_investor_id = currentLeadId` and the chosen `entity_type` and `vehicle_type`.
- **Append a corresponding row** to the lead's `reporting_entity_defaults` array with `{entity_id: newEntityId, include: true}`.

**Linked Entities panel:** reads from `clients` filtered by `lead_investor_id = leadId`. Does NOT consult `client_relationships`. (A future "Connections" panel may surface relationship data — see Future Work section 8.)

**Reporting defaults panel:** binds to:
- `reporting_entity_defaults` (jsonb array of `{entity_id, include}` objects per section 3 above)
- `report_delivery_method` (`email` / `download_only`)
- `report_delivery_email`
- `report_delivery_frequency` (added in 1.1)

**Performance placeholder panel:** static dashed-border panel with placeholder text. No data binding in v1.

**Membership docs panel:** read from `documents` table filtered by `client_id = leadId OR client_id IN (linkedEntityIds)` and `type IN ('kyc','poa','membership_agreement','suitability_assessment','source_of_funds')`. Show one row per type with the latest non-superseded version, an "Upload" action for missing ones, and a "Replace" action for existing ones.

**Stop condition:** Ed reviews — particularly linked entities table and reporting defaults flow.

### Sub-stage 1.4 — Investments tab

**Files:**

- `app/clients/[id]/_tabs/investments.tsx`
- `app/clients/[id]/_components/investments-by-company.tsx`
- `app/clients/[id]/_components/investments-by-transaction.tsx`
- `app/clients/[id]/_components/investments-by-entity.tsx`

**Three views, switchable via tab strip inside the Investments tab:**

1. **By Company** — one row per (company × share_class) with subscribed cost, current valuation, valuation change, cumulative dividends. Avg cost computed as Σ(sum_subscribed) / Σ(shares_purchased) across all matching rows in `investments`.
2. **By Transaction** — flat list mirroring the portfolio summary PDF layout (company, share class, EIS, date, original price, shares, subscribed, current price, current valuation, change, cumulative dividends).
3. **By Entity** — grouped by linked entity (e.g. "Own name", "BO'B SIPP", "Holdings Ltd"), with the company breakdown inside each group.

**EIS pill** uses spec colours: bg `#e1f5ee` text `#085041`.
**Nominee pill** uses bg `#eeedfe` text `#3c3489`.
**All numeric cells** use `font-variant-numeric: tabular-nums`.

**Important business rule:** EIS status lives at the transaction level (`investments.eis_status`), not at the company level. A single company can have both EIS and non-EIS rows simultaneously. Do not aggregate EIS status up to the company row.

**Stop condition:** Ed reviews — this is the highest-risk sub-stage. Particular attention to average-cost figures and sub-table column alignment.

### Sub-stage 1.5 — Documents, Notes, Activity tabs

**Documents tab:** filter `documents` by `client_id IN (entityIds)`. Show a flat table with type pill, filename, document date, version, and download link. Filter chips for type. No upload in v1 (uploads happen on the deal page and the membership docs panel).

**Notes tab:** list of `client_notes` for the lead + linked entities. Add-note form (textarea + flag-for-followup checkbox). Edit-in-place if needed. Delete with confirm.

**Important:** **DO NOT** surface the legacy `clients.notes` field anywhere on this tab or anywhere else on the page. It has been wiped and is scheduled for column-drop in a follow-up migration. The Notes tab uses the `client_notes` table only.

**Activity tab:** list of `internal_updates` filtered by `client_id IN (entityIds)`, ordered by `created_at` desc. Read-only.

**Stop condition:** Ed reviews end-to-end before merge to main.

-----

## 6. Acceptance criteria

Before merge:

1. All three Investments views render correctly across a client with multiple linked entities (use Barry O'Brien-style test data — multiple companies, multiple share classes, EIS and non-EIS mixed).
2. Entity filter persists across tab switches (verify via URL).
3. Status strip pills compute correctly for all five conditions (KYC, POA, membership agreement, suitability, flagged notes) across multiple test clients.
4. Adding a note appears in the list immediately, persists across reload, and increments the status-strip flagged-notes pill if flagged.
5. Linking and unlinking an entity updates the headline figures, the entity filter chips, **AND the `reporting_entity_defaults` array** (new linked entity → appended with `include: true`; unlinked entity → removed from array).
6. No PostgREST embedded joins anywhere in the new code (grep check before opening final PR).
7. Page renders correctly at viewport widths 1280px+ (no responsive mobile layout in v1).
8. Edit Client Details modal saves and the page reflects changes on revalidate.
9. Membership docs panel correctly identifies the latest non-superseded version of each document type.
10. Direct-link redirect from linked-entity URL to lead URL works server-side (no client-side flash).
11. Legacy `clients.notes` field is not displayed anywhere on the page.
12. Queries in `_lib/queries.ts` are grouped under the two comment headers (Internal-only / Shared) per section 4.

-----

## 7. Review checkpoints

| Stage                            | Reviewer                                      | Focus                                                                                 |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1.1 (schema)                     | DONE — verified by chat-Claude via Supabase MCP on 18 May 2026 | n/a |
| 1.2 (shell, header, status strip) | Ed (preview)                                  | Layout, status strip behaviour, entity filter wiring                                  |
| 1.3 (Overview)                   | Ed (preview)                                  | Linked entities table, reporting defaults flow, membership docs panel                 |
| 1.4 (Investments)                | Ed (preview)                                  | Avg cost figures, sub-table column alignment, EIS pill placement, three-view switching |
| 1.5 (Documents, Notes, Activity) | Ed (preview)                                  | End-to-end before merge to main; verify legacy notes field is not displayed           |

-----

## 8. Future Work items to add to the spec

Add these to the Future Work section of `section_9_client_record.md` when this stage merges:

1. **Connections panel** — surface `client_relationships` (spouses, family connections, beneficiaries, trustees) in a separate panel on the Client Record page when KYC linkage tracking or beneficiary visibility is needed.

2. **Per-entity reporting overrides** — define and surface per-entity settings (delivery email, summary-only, content variant) in the Reporting Defaults panel UI. The `reporting_entity_defaults` jsonb shape already supports this; only UI and write logic needed.

3. **Drop legacy `clients.notes` column** — once a code grep confirms no remaining references. Target: one deploy cycle after this stage merges.

4. **Row Level Security policies** — before the investor portal goes live, define and apply RLS on every table an investor will read. Policies must guarantee that an investor's session can only return rows belonging to their own client tree. Without RLS, the comment-header convention in `_lib/queries.ts` is the only thing standing between an investor session and another investor's data — that is not adequate security for production.

-----

## 9. Spec & version-history discipline

When this stage merges to main:

1. Add an entry to the spec's Section 15 version history.
2. Update Section 12 (build sequence table) to mark Phase B Stage 1 as "Merged [date]".
3. If anything in the build differs from `section_9_client_record.md`, update that document **in the same PR**. Drift accumulates fast.
4. Add the four Future Work items from section 8 above.

-----

*End of build prompt. This document is complete and ready to hand to Claude Code without further edits. Total estimated effort: roughly 35–50% of Phase A Stages 2b–3b combined.*
