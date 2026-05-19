# Phase B Stage 2 — Share Prices & Valuations: Spec v1

**Date:** 19 May 2026
**Status:** Approved by Ed for build
**Scope:** Foundation rebuild for share classes and valuations, plus a dedicated Settings page where the team updates share prices per share class
**Precedes:** Phase B Stage 2 (A-side) — Portfolio valuation statement PDF
**Companion docs:** `CLAUDE.md`, `AGENTS.md`, `Juno_Deal_Page_Restructure_Spec_v3_6.md`

---

## 0. Why this stage exists

Phase B Stage 1 (Client Record page) is complete. The next planned deliverable is the portfolio valuation statement PDF (the "Barry O'Brien report" equivalent). That PDF depends entirely on accurate, current share prices in the database. The current share-price wiring is not fit for that purpose — see Section 1 — so this stage cleans the foundation **before** the statement PDF gets built on top of it.

This stage is split into three sub-stages, each its own branch and PR. Each must be reviewed before the next begins.

---

## 1. The diagnostic (what we found, why a rebuild is needed)

A diagnostic review of the live database and the existing codebase on 19 May 2026 found three concrete problems with the current share-price and share-class wiring:

### Problem 1 — Share classes live in two parallel stores

- `companies.share_classes` (JSONB column on `companies`) — legacy store, populated for all 11 companies.
- `company_share_classes` (proper relational table) — populated for only 6 of 11 companies. The two stores disagree on contents (e.g. Synchtank's JSONB says class "C Ordinary" type `preferred`, but `preferred` isn't a valid value in the proper table — the constraint only allows `ordinary` or `preference`).
- Different parts of the codebase read from different stores. Result: the platform doesn't agree with itself on which share classes a company has.

### Problem 2 — `valuations` table has no share-class link

Live schema is `id, company_id, share_price, valuation_date, updated_by, notes, created_at`. There is **no `share_class_id`**, no `methodology`, no `source`, no `updated_at`. The database therefore physically cannot store the per-share-class pricing model Ed has confirmed he wants. Every valuation today is implicitly "the company's price" — which works for some companies but not for others (e.g. Sky Medical Ordinary at £0.50 vs CLN at £1.00).

### Problem 3 — Code references columns that don't exist

`CompanyValuationsTab.tsx` and `portfolio/[id]/page.tsx` both query `methodology` and `source` from `valuations`. The repo `supabase/migrations/` folder contains migrations (002, 006) that would add these columns — but those migrations are **not in the live database's migration history**, which begins at the 30 April 2026 "deal page restructure foundation" baseline. The columns are missing from production.

### Implication

A new share-price input page built on top of this would inherit all three problems. Hence the three-sub-stage rebuild below.

---

## 2. Decisions taken with Ed

The following decisions were reached through Q&A on 19 May 2026 and are locked for this stage:

| # | Decision |
|---|---|
| 1 | **Primary purpose of the new page:** data hygiene before generating statements. Not a routine workflow. |
| 2 | **Usage cadence:** ad hoc when prices change, not batch quarterly runs. |
| 3 | **Valuation dates:** per-company, per-class. No single "valuation date" applies across the portfolio. |
| 4 | **Granularity:** one price per share class, not per company. |
| 5 | **CLN/loan notes:** included on the page but read-only at principal value in v1. Future Work: estimate accrued interest. |
| 6 | **Share class onboarding (Future Work 14.14):** addressed in this stage by rebuilding the foundation properly. |
| 7 | **Test data:** all existing data in `valuations` and `company_share_classes` is throwaway test data. Wipe and re-seed deliberately. Claude Code generates plausible new test data automatically — no separate seed-plan review. |
| 8 | **Page location:** `/settings/share-prices`. Quick-link from each company page menu. |
| 9 | **Freshness indicator:** show the date only, no coloured pills. |
| 10 | **Row model:** every (company, share-class) combination shows, including those with no valuation yet — so gaps stick out visibly. |
| 11 | **Share class management:** lives on the company page (existing Share Classes tab), with an inline "+ Add share class" affordance on the share-prices page that opens the same shared modal. |
| 12 | **Cleanup appetite:** high — all legacy JSONB reads replaced, dead code removed, foundation left clean. |
| 13 | **Internal-only in v1, designed with the investor portal in mind** — same principle as Stage 1. Investor portal will only ever read this data; valuations are not investor-editable. |
| 14 | **Existing per-company `SharePriceSection`:** stripped back to a minimal snapshot card. Heavy work moves to the Settings page. Ed will rebuild company pages later anyway — no point investing in fancy chart UI now. |

---

## 3. Standing rules from the platform (do not violate)

1. **No PostgREST embedded joins.** Two-query-then-merge pattern only. Documented in `CLAUDE.md`.
2. **Plain English alongside technical detail** in PRs and non-trivial code comments. Ed is not a coder.
3. **Review-before-apply for migrations.** Claude Code generates the migration SQL with plain-English line-by-line explanation in the PR. Ed reviews and runs it manually in the Supabase SQL editor. Claude Code does NOT apply migrations directly.
4. **Branch per sub-stage, PR per sub-stage.** Do not roll up.
5. **Two-layer review.** Claude Code builds and self-checks. Chat-Claude verifies via Supabase MCP. Ed reviews preview.
6. **Fees are never hardcoded** (continuing standing rule from prior stages, applies wherever fee logic is touched).

---

## 4. Sub-stage structure

```
Sub-stage 2B.1 — Schema rebuild + wipe + re-seed
       ↓ (Ed reviews)
Sub-stage 2B.2 — Legacy cleanup pass
       ↓ (Ed reviews)
Sub-stage 2B.3 — New Settings share-prices page
       ↓ (Ed reviews)
       merged → Stage 2 (B-side) complete
       Stage 2 (A-side, valuation statement PDF) begins
```

---

## 5. Sub-stage 2B.1 — Schema rebuild + wipe + re-seed

**Branch:** `feat/share-prices-foundation`
**Outcome:** Database has a clean foundation for per-share-class valuations. Fresh test data seeded.

### 5.1 Migration scope

The migration must:

1. **Add four columns to `valuations`:**
   - `share_class_id uuid null references company_share_classes(id) on delete set null` — links a valuation to a specific share class. NULL means "company-wide price" (a fallback we'll use for CLN/loan-note pseudo-classes, see 5.3).
   - `methodology text null` — free text describing how the price was derived (e.g. "Last funding round", "Board approved", "409A valuation"). Already referenced by code, not in production schema.
   - `source text null default 'manual'` — e.g. `manual`, `deal_setup`, `bulk_upload`. Provides audit trail for where a valuation came from.
   - `updated_at timestamptz null default now()` — last-edited timestamp. Distinct from `created_at`. Trigger keeps it current on updates.

2. **Add an index** on `(company_id, share_class_id, valuation_date desc)` so "latest price per company-class" queries are fast.

3. **Wipe `valuations`** — `TRUNCATE valuations`.

4. **Wipe `company_share_classes`** — `TRUNCATE company_share_classes CASCADE`. (CASCADE because some `investments` rows and the `share_class_ranking_history` row have FKs into it. Those FK columns become NULL — acceptable since the investment data is also test data, and re-seed step will refill them.)

   > **Correction (v1.1, 19 May 2026):** The claim above that CASCADE sets FK columns to NULL is wrong. `TRUNCATE ... CASCADE` is not the same as `DELETE ... ON DELETE SET NULL`. TRUNCATE CASCADE *truncates all dependent tables entirely*, regardless of the `ON DELETE` action defined on the FK. When applied to the live database, the cascade propagated from `company_share_classes` through `investments` to `deals`, and then via ON DELETE CASCADE through `deal_investors`, `bookbuild_entries`, `deal_action_logs`, and `documents`. All those tables were wiped. Every affected row was confirmed test data, so there was no real data loss. Future migrations that truncate a parent table should use `TRUNCATE ... RESTART IDENTITY CASCADE` only when all dependent tables are also confirmed empty or throwaway; otherwise, manually null the FK columns with UPDATE before truncating the parent.

5. **Drop the JSONB column** `companies.share_classes`. There is no future use case for it once the cleanup pass migrates all readers to the proper table.

6. **Replace the `company_current_valuations` view** with a per-share-class version. New shape:
   ```sql
   create or replace view company_current_valuations as
   select distinct on (company_id, share_class_id)
     company_id, share_class_id, share_price, valuation_date, methodology, source
   from valuations
   order by company_id, share_class_id, valuation_date desc;
   ```
   Note: `share_class_id` will be NULL for CLN/loan-note pseudo-class rows; the view treats those as "the company's NULL-class price" which is fine.

7. **Update the `client_portfolio_summary` view** to join on `(company_id, share_class_id)` when matching investments to current prices, falling back to the original price if no valuation exists. (View definition below in section 5.5.)

8. **Add a trigger** on `valuations` that keeps `updated_at` current on UPDATE. Pattern matches existing `set_updated_at()` function defined in the deal-page-restructure foundation migration — reuse, don't redefine.

### 5.2 Seed scope (after migration applied)

Claude Code generates a re-seed using one SQL block that inserts:

- **Share classes** for each of the 11 portfolio companies. Realistic shape based on the Barry O'Brien report:

  | Company | Share classes to seed |
  |---|---|
  | AI Forge Ltd | Ordinary; CLN (pseudo-class, see 5.3) |
  | Ball Co | Ordinary; B Preference (multiple 4.0, participating) |
  | Cyclr | Ordinary; A Ordinary; C Ordinary |
  | Domainex Ltd | Ordinary; B Ordinary; D Preference (multiple 4.0, participating) |
  | Edozo | Ordinary; A Ordinary |
  | Groovance | Ordinary |
  | Mishipay Ltd | Ordinary |
  | Obrizum Group Ltd | Ordinary |
  | Purple | Ordinary; A Ordinary; B Ordinary |
  | Sky Medical | Ordinary; A Ordinary; CLN (pseudo-class) |
  | Synchtank | Ordinary; C Ordinary |

- **Valuations** — one valuation per share class, with a spread of dates to make the page look populated and the "last updated" column meaningful. Specifically:
  - Roughly one third dated in the last 30 days (fresh)
  - Roughly one third dated 1–6 months ago (mid-staleness)
  - Roughly one third dated >6 months ago (stale)
  - Two companies have ONE share class with no valuation (so empty-row rendering is exercised). Suggested: Groovance Ordinary, Edozo A Ordinary.

- **Investments backfill** — populate `share_class_id` on the existing 8 `investments` rows where the class name matches a newly-seeded class for the same company. Other test investment data can stay as-is for now.

The exact prices and dates are at Claude Code's discretion within these constraints. Plausibility matters more than precision — this is test data.

### 5.3 CLN / loan note "pseudo-class" model

CLNs and loan notes are not equity instruments. They live in `cln_positions` and `loan_notes` respectively, with a `principal_amount` per holding. They should appear on the share-price page so the team has a single view of all positions and prices, but:

- They are **read-only** in v1 — no manual price update.
- Their "price" is always **£1.00 per £1 of principal** until conversion or write-down (future work).
- They render with a "CLN" or "Loan note" tag in the share-class column.
- A short note under the price reads: "Held at principal; accrued-interest estimate planned (Future Work 14.16)."

**Implementation approach:** create a row in `company_share_classes` for each CLN-holding company with `name = 'CLN'` and `type = 'ordinary'` (the constraint only allows `ordinary` or `preference`; we'll widen it in a future migration if/when CLN ranking matters). Tag the row as a CLN via a new column `instrument_type text default 'equity' check (instrument_type in ('equity','cln','loan_note'))`. This becomes the single discriminator the page reads to know whether to render a row as editable equity or read-only debt.

If Claude Code thinks adding `instrument_type` is overengineering for v1, an alternative is: don't add CLN rows to `company_share_classes` at all, and instead derive CLN/loan-note rows on the share-prices page by separately querying `cln_positions` and `loan_notes` and merging into the row list. **Discuss this in the PR**; both designs are defensible. Default: add the `instrument_type` column, since it's the simpler page query.

### 5.4 Files in this sub-stage

- `supabase/migrations/<date>_share_prices_foundation.sql` — full migration as described in 5.1
- `supabase/migrations/<date>_share_prices_seed.sql` — re-seed of share classes, valuations, and investments backfill
- `src/lib/supabase/types.ts` — regenerated TypeScript types to match new schema
- `CLAUDE.md` — append a short note under "Platform conventions" recording: (a) share classes always read from `company_share_classes`, (b) `companies.share_classes` JSONB no longer exists, (c) valuations are per share class.

### 5.5 New `client_portfolio_summary` view

Replaces the existing version (which only joined on `company_id`). New definition joins on `(company_id, share_class_id)`:

```sql
create or replace view client_portfolio_summary as
select
  i.client_id,
  i.company_id,
  i.share_class_id,
  c.name as company_name,
  c.sector,
  sum(i.sum_subscribed) as total_invested,
  sum(i.shares_purchased) as total_shares,
  count(*) as transaction_count,
  -- Current value: shares × latest matching valuation per (company, share_class).
  -- If no valuation exists, fall back to the original price (so the figure
  -- never disappears entirely; a zero would be misleading).
  sum(i.shares_purchased * coalesce(v.share_price, i.original_share_price)) as current_value,
  sum(i.shares_purchased * coalesce(v.share_price, i.original_share_price))
    - sum(i.sum_subscribed) as gain_loss
from investments i
join companies c on c.id = i.company_id
left join company_current_valuations v
  on v.company_id = i.company_id
 and v.share_class_id is not distinct from i.share_class_id
where i.status = 'active'
group by i.client_id, i.company_id, i.share_class_id, c.name, c.sector;
```

Note the use of `is not distinct from` rather than `=`: ensures the join works correctly when both sides are NULL (the pseudo-class case for CLN holdings without a real share class).

### 5.6 Acceptance — Sub-stage 2B.1

1. Migration SQL is in the PR description with plain-English explanation of every line.
2. Seed SQL is in the PR description with plain-English explanation of every block.
3. After Ed applies the migration in Supabase:
   - `valuations` has the four new columns and the index
   - `company_share_classes` is empty
   - `companies` no longer has a `share_classes` column
   - The two views (`company_current_valuations` and `client_portfolio_summary`) match section 5.1.6 and 5.5
4. After Ed runs the seed:
   - Each of the 11 companies has the share classes from section 5.2
   - Most share classes have one or more valuations; two are deliberately empty
   - The 8 existing `investments` rows have their `share_class_id` backfilled where possible
5. Build passes (`npm run build`), TypeScript types compile.

**Stop condition:** Ed reviews. Sub-stage 2B.2 does not begin until 2B.1 is merged.

---

## 6. Sub-stage 2B.2 — Legacy cleanup pass

**Branch:** `feat/share-prices-cleanup`
**Outcome:** No code reads from the old JSONB. Broken pages are fixed or deleted. Foundation is clean.

### 6.1 Code changes

**Replace JSONB reads with proper-table reads:**

- `src/app/(app)/deals/new/page.tsx` — currently reads `companies.select('id, name, share_classes')`. Drop `share_classes` from the select. The downstream `NewDealPage` component is already structured to fetch share classes per company via `company_share_classes` when the company is picked; verify the wiring.
- Any other file referencing `companies.share_classes` — grep first, then update.

**Delete dead code:**

- `src/app/(app)/portfolio/[id]/tabs/CompanyValuationsTab.tsx` — fully delete. References missing columns; its functionality is duplicated by the simpler `SharePriceSection` which we'll also simplify.
- Remove any import of `CompanyValuationsTab` from the company page tab list.

**Fix the bulk-upload wizard:**

- `src/app/(app)/settings/bulk-upload/BulkUploadWizard.tsx` — the valuations import writes `valuation_type` (doesn't exist), should write `methodology` and `source` instead. Confirm field mapping matches the new schema.

**Simplify `SharePriceSection`:**

- `src/app/(app)/portfolio/[id]/SharePriceSection.tsx` — strip back to a small "Share prices" card. Layout:
  - Title: "Share prices"
  - For each share class on this company: class name · current price (or "Never valued") · last-updated date
  - One link at the bottom: "Update share prices" → `/settings/share-prices?company=<id>`
- Remove the chart, the price history table, the inline update form, the share-class colour-pill picker. All of that lives at the Settings page now.

**Verify the existing Share Classes tab works:**

- `src/app/(app)/portfolio/[id]/tabs/CompanyShareClassesTab.tsx` and `ShareClassModal.tsx` already read/write `company_share_classes`. After the wipe and re-seed, verify they work as expected. Make any small UI tidy-ups but no structural change.

**Update CLAUDE.md:**

Add a short section:

```
## Share class & valuation model

Share classes live in `company_share_classes`. The `companies.share_classes`
JSONB column has been removed.

Valuations live in `valuations`, keyed by `(company_id, share_class_id)`.
A NULL `share_class_id` represents a CLN/loan-note pseudo-class — those rows
are read-only at principal value.

Latest price per (company, share class) is read from the
`company_current_valuations` view.
```

### 6.2 Acceptance — Sub-stage 2B.2

1. `git grep "share_classes"` (with the underscore-s suffix, the JSONB column name) returns zero hits in `src/`.
2. `git grep "valuation_type"` returns zero hits — replaced by `methodology` / `source`.
3. The deleted `CompanyValuationsTab` doesn't appear anywhere in the imports.
4. The simplified `SharePriceSection` renders without errors on a company page.
5. The Share Classes tab on a company page can add, edit, and delete share classes.
6. Build passes, TypeScript types compile, lint clean.
7. Preview deploy shows the Share Classes tab working on at least one company with multi-class.

**Stop condition:** Ed reviews preview. Sub-stage 2B.3 does not begin until 2B.2 is merged.

---

## 7. Sub-stage 2B.3 — New Settings share-prices page

**Branch:** `feat/share-prices-page`
**Outcome:** A working `/settings/share-prices` page that shows every (company × share-class) combination, lets the team update prices per class, and offers an inline quick-add for new share classes.

### 7.1 Route and navigation

- Route: `/settings/share-prices`
- Settings nav: add a "Share prices" item.
- Company page menu: add an "Update share prices" link from the company page action menu, that opens `/settings/share-prices?company=<id>` (the page should scroll/highlight that company on load when this query param is present).

### 7.2 Page structure

Single page, server component fetches the data, client components handle interactions.

**Top of page:** title "Share prices", short blurb: "Used to keep portfolio valuations current before generating statements. One price per share class."

**Body:** vertical stack of company sections. Each company section is:

```
─────────────────────────────────────────────────────────────
Company logo · Company name                         [+ Add share class]
─────────────────────────────────────────────────────────────
Share class    Current price    Last updated    Methodology   Source   Actions
Ordinary       £2.99            8 May 2026      Series B...   manual   [Update]
A Ordinary     £4.85            8 May 2026      Series B...   manual   [Update]
C Ordinary     Never valued     —               —             —        [Update]
─────────────────────────────────────────────────────────────
```

For CLN/loan-note rows (pseudo-class):

```
CLN            £1.00 (principal)  N/A             Held at principal           Read-only
```

- "Never valued" rows render with a subtle visual treatment (slightly italicised, or grey text) to draw the eye.
- Methodology and Source columns truncate to one line with a hover tooltip if longer.
- Companies render in alphabetical order. Inside each company, share classes render in created-at order (oldest first), with the pseudo-class CLN/loan-note rows last.

### 7.3 Update action

Each row's "Update" button opens a modal (shared component, updated version of `UpdateValuationModal`).

Modal fields:
- New share price (£) — numeric input, required
- Effective date — defaults to today
- Methodology — text input, optional, sub-label "e.g. Series B, Board approved, 409A valuation"
- Notes — text area, optional
- Source — set automatically to `manual` (not shown as an editable field; future work could make this editable for "received from company" etc.)

On Save:
- Insert a row into `valuations` with `(company_id, share_class_id, share_price, valuation_date, methodology, notes, source = 'manual', updated_by = current user)`
- Insert a row into `internal_updates` with `update_type = 'valuation'` and a description like `Share price updated to £X.XX for <Company> <Class>`
- Refresh the page; the row now shows the new price and date.

### 7.4 "+ Add share class" inline affordance

Each company section header has an "+ Add share class" button. Clicking opens the **same** `ShareClassModal` already used by the company page Share Classes tab — no duplicate code. On save, the modal inserts into `company_share_classes` and the page refreshes, showing the new class with a "Never valued" row.

### 7.5 Quick-link from company page

When the share-prices page is opened with `?company=<id>`:
- Scroll to that company's section on page load
- Briefly highlight the section (e.g. a soft background flash for 2 seconds) so the user knows where they landed

### 7.6 Investor-portal future-proofing

Follow the same pattern as Stage 1: query layer in `app/settings/share-prices/_lib/queries.ts`. Comment header at the top:

```typescript
// QUERIES THAT POWER THE SHARE-PRICES PAGE
// All queries in this file return data only visible to the team.
// When the investor portal is built, this query layer is NOT reused —
// the portal will have its own read-only valuation queries scoped to
// the investor's own holdings.
```

No RLS in v1; standing rule from Stage 1.

### 7.7 Files in this sub-stage

- `app/settings/share-prices/page.tsx` — server component, fetches data
- `app/settings/share-prices/SharePricesClient.tsx` — client component, handles modal open state, scroll-to-company, etc.
- `app/settings/share-prices/_components/company-section.tsx`
- `app/settings/share-prices/_components/share-class-row.tsx`
- `app/settings/share-prices/_components/update-valuation-modal.tsx` (or refactor the existing one in `portfolio/[id]/`)
- `app/settings/share-prices/_lib/queries.ts`

Plus a small update to the company page menu component to add the "Update share prices" link.

### 7.8 Acceptance — Sub-stage 2B.3

1. Page renders at `/settings/share-prices` with every (company, share class) combination including the two deliberately empty ones from the seed.
2. Updating a price via the modal writes to `valuations` with the correct `share_class_id`, refreshes the row, and logs to `internal_updates`.
3. CLN/loan-note pseudo-class rows render read-only with the principal-value caveat.
4. "+ Add share class" button opens the shared `ShareClassModal`, and a successful add appears as a new row with "Never valued".
5. Quick-link from a company page menu (`/settings/share-prices?company=<id>`) scrolls to the right company and highlights briefly.
6. No PostgREST embedded joins anywhere in the page's queries.
7. Build passes, lint clean, types compile.
8. Page renders correctly at 1280px+ viewports.

**Stop condition:** Ed reviews preview. Stage 2 (B-side) merged. Stage 2 (A-side) — the valuation statement PDF — begins.

---

## 8. Future Work generated by this stage

Add the following to the platform Future Work list (alongside items 14.1–14.15 already in the deal-page-restructure spec):

- **14.16 — CLN/loan-note accrued-interest estimate.** Calculate a running estimate of accrued interest for active CLN and loan-note positions, based on rate × principal × elapsed days. Display alongside principal value on the share-prices page and in valuation statements. Currently rolled-up interest is only confirmed at maturity / repayment via `loan_note_interest_adjustments`.
- **14.17 — Per-share-class price history view.** The valuations table now supports per-class history but there's no dedicated UI for browsing it. Future: a "Price history" tab on each share class on the company page, showing all valuations for that class over time.
- **14.18 — Bulk price update.** Users may eventually want to update many companies in one go (e.g. quarter-end). Build a bulk-update mode on the share-prices page: select multiple rows, enter prices, save in one transaction.
- **14.19 — Investor portal share-price visibility.** When the investor portal is built, expose current share prices (read-only) to investors for the companies they hold. Specify exact field visibility — likely current price + last-updated date only, no methodology or source.
- **14.20 — Drop `valuations.valuation_type` (if it ever appears).** Migration 002 in the old repo tried to add a `valuation_type` text column. It's not in the live schema today. If it ever surfaces from a stray apply, drop it — `methodology` is the canonical replacement.

---

## 9. Version history

- **v1 (19 May 2026):** Initial spec, approved for build.
- **v1.1 (19 May 2026):** Correction to section 5.1.4 — `TRUNCATE ... CASCADE` wipes dependent tables entirely; it does not set FK columns to NULL. The behaviour in practice was more aggressive than the spec described. All affected data was confirmed test data. No other content changed.

---

*End of spec. Sub-stage 2B.1 build prompt is `Build_Prompt_Phase_B_Stage_2B1_Schema_Wipe_Seed.md`.*
