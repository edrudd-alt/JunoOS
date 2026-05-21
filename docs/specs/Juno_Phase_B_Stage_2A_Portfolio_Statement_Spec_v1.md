# Phase B Stage 2A — Portfolio Valuation Statement PDF: Spec v1

**Date:** 20 May 2026
**Status:** Approved by Ed for build
**Scope:** Generate per-investor portfolio valuation statement PDFs from JunoOS data, replacing the standalone Python report builder.
**Depends on:** Phase B Stage 2B (per-share-class valuations foundation, merged 19–20 May 2026) and Stage 6a/6b/6c document generation infrastructure (merged 7–12 May 2026).
**Companion docs:** `CLAUDE.md`, `AGENTS.md`, `Juno_Deal_Page_Restructure_Spec_v3_6.md` (Sections 11 and 14 — document generation pattern)

---

## 0. Why this stage exists

The existing portfolio valuation statement (the "Barry O'Brien report") is produced by a standalone Python desktop app (`juno-investor-reports`) that reads an Excel spreadsheet and outputs a PDF. The data is duplicated from JunoOS into the spreadsheet by hand. Every statement run requires manual data export and a separate tool.

Phase B Stage 2B left JunoOS with clean per-share-class valuations, the missing piece for accurate statements. This stage builds the in-app equivalent: a button that, in one click, takes the live database state and produces the same PDF that the Python builder produces today, with no spreadsheet step in between.

**The deliverable in one line:** "click a button on an investor's record, get back an immutable PDF that matches the existing Juno format, stored privately in Supabase Storage."

---

## 1. Scope of this stage

### In scope

- **Per-client trigger** — generate one statement for one client, on demand
- **Bulk trigger** — generate statements for many clients in one operation, manually selecting the cohort
- A new dedicated function `generatePortfolioValuationStatement()` following the Stage 6c pattern
- A new React-pdf template `portfolioValuationStatement@1.0.0`
- Period date passed at generation time (no fixed quarterly cadence in v1)
- Supersedure handling: if regenerating a statement for the same client and period, mark prior versions superseded

### Out of scope (deferred to Future Work)

- Cover letter generation (the AI-narrative + pie-chart letter in the Python builder)
- Investor portal access to statements
- Automated scheduled generation (e.g. "every quarter-end, auto-generate")
- Email delivery (manual download from Supabase Storage in v1; Documenso integration not required since statements aren't signed)
- Multi-portfolio / sub-portfolio breakdowns
- KPI sections, narrative content, charts

### Sub-stage structure

| Sub-stage | Scope | Outcome |
|---|---|---|
| **2A.1** | Per-client trigger + the template itself + the generation function | A client's record page has a "Generate portfolio statement" button. Clicking it produces the PDF for that one client at a chosen period date. |
| **2A.2** | Bulk trigger UI | A Reports section (or extension of an existing settings hub) where the user picks a period date and a cohort of clients, and generates statements for all of them in one operation. |

2A.2 will be specified separately after 2A.1 is merged; this spec previews its shape in Section 8.

---

## 2. Decisions taken with Ed during scoping

| # | Decision | Rationale |
|---|---|---|
| 1 | **Visual target = Barry O'Brien report.** | Existing Python builder is the canonical layout; investors already expect this format. |
| 2 | **Scope = statement only.** Cover letter is Future Work. | Letter requires Anthropic API integration and chart generation; orthogonal to the core deliverable. |
| 3 | **Trigger = per-client (now) + bulk (follow-up).** | Per-client establishes the foundation. Bulk is a UI addition once the foundation works. |
| 4 | **Generation path = dedicated function, mirroring Stage 6c.** | Portfolio statement's data shape (multi-row, multi-company, computed totals) doesn't fit the generic `DealDocumentContext` registry. Stage 6c set the precedent of bypassing the registry for non-deal documents. Repeating it makes it a pattern rather than a one-off. |
| 5 | **Dividends column behaviour:** query the `dividends` table; if zero across the statement, drop the column entirely; if non-zero, show the column with pro-rata allocation per buy-lot and real totals per company. | Pragmatic: clean visual when no dividends exist, correct behaviour the day real dividends arrive. Pro-rata at lot level is an honest fiction (dividends aren't really per-lot but the report shape requires per-lot rows). |
| 6 | **Period date is captured at generation time.** | Statement reflects valuations as of that date. Stored on the `documents` row. |
| 7 | **Supersedure on regeneration.** Regenerating a statement for the same (client, period) marks prior versions `superseded = true`. | Matches Stage 6c pattern. Audit trail preserved; downloads default to the latest non-superseded version. |
| 8 | **Internal-only in v1.** | No investor portal access yet (Future Work 14.19). Generated PDFs are downloadable by team members from the client record page. |

---

## 3. Standing rules from the platform (do not violate)

1. **No PostgREST embedded joins.** Two-query-then-merge pattern only. Documented in `CLAUDE.md`.
2. **Plain English alongside technical detail** in PRs and non-trivial code comments. Ed is not a coder.
3. **Branch per sub-stage, PR per sub-stage.** 2A.1 and 2A.2 are separate.
4. **Review-before-apply for migrations.** If any schema change is needed (one tiny `documents.type` allowed-value addition is the only candidate), the SQL gets posted in the PR with plain-English commentary before Ed applies it.
5. **Two-layer review.** Claude Code builds and self-checks; chat-Claude verifies via Supabase MCP; Ed reviews the Vercel preview.
6. **Internal-only in v1, designed with the investor portal in mind.** Query layer comment header per Section 6 below.
7. **Fees never hardcoded** (continuing standing rule).
8. **Storage key sanitisation.** Per Stage 6c's `sanitiseStorageKey()` pattern — strip em dashes, smart quotes, and other Unicode characters that Supabase Storage rejects from filenames and storage paths.
9. **Immutable PDFs.** Once generated, the bytes never change. Regeneration produces a new file; old file persists with `superseded = true`.

---

## 4. The data model

### 4.1 What the statement needs (per investor)

For each client included in a statement:

**Header data:**
- Client `full_name` and `investor_reference` from `clients`
- Period date (passed in at generation, not stored on `clients`)
- Generated-on date (today, at generation)

**Per-lot rows** — one row per `investments` row for this client:
- Company name (from `companies` via `company_id`)
- Share class name (from `company_share_classes` via `share_class_id`)
- EIS status (`investments.eis_status` — `'yes'` / `'no'` / `'tbc'` / NULL → empty)
- Investment date (`investments.investment_date`)
- Original share price (`investments.original_share_price`)
- Shares purchased (`investments.shares_purchased`)
- Sum subscribed (`investments.sum_subscribed`)
- Current share price (`company_current_valuations.share_price` matched on `(company_id, share_class_id)` — or `investments.original_share_price` as fallback if no valuation exists)
- Current valuation (computed: `shares_purchased × current_share_price`)
- Valuation change (computed: `current_valuation - sum_subscribed`)
- Cumulative dividend allocation (computed pro-rata; see 4.3)

**Per-company summary rows** — one row per distinct `(company, share_class)` for this client:
- Company name
- Total shares purchased (sum across this client's lots in this company/class)
- Total sum subscribed (sum)
- Total current valuation (sum)
- Total valuation change (sum)
- Total cumulative dividend (real, not pro-rata)

**Grand totals row:**
- Total sum subscribed across all rows
- Total current valuation across all rows
- Total valuation change across all rows
- Total cumulative dividend (sum of real per-company-summary values)

### 4.2 Query plan (two-query-then-merge applied consistently)

A single call to `generatePortfolioValuationStatement()` makes the following queries:

1. **Client** — `clients` row by `id`, selecting `full_name, investor_reference`
2. **Investments** — `investments` rows where `client_id = ?` and `status = 'active'` (or whatever the live filter convention is for "active holdings"), selecting all fields needed for the per-lot rows
3. **Companies** — `companies` rows for the distinct `company_id`s in (2), selecting `id, name`
4. **Share classes** — `company_share_classes` rows for the distinct `share_class_id`s in (2), selecting `id, name`
5. **Current valuations** — `company_current_valuations` view rows for the distinct `(company_id, share_class_id)` pairs in (2)
6. **Dividends** — `dividends` rows where `client_id = ?` AND `(company_id, share_class_id)` is in the set from (2), selecting `total_amount, company_id, share_class_id`

Then merge in JavaScript using Maps. No PostgREST embedded joins.

### 4.3 Dividend allocation logic

Two-step:

**Step 1 — sum dividends per (company, share_class) for this client.** From the dividends query above, build `dividendByCompanyClass = Map<companyId+classId, totalAmount>`.

**Step 2 — drop the column if zero across the whole statement.** If `sum(all values in dividendByCompanyClass) === 0`, drop the column from BOTH the per-lot detail table AND the per-company summary table. Skip the rest of the dividend logic.

**Step 3 — if non-zero, allocate pro-rata at lot level:**

For each investments row (lot):
- Find the client's total shares in this company+class across ALL of their lots: `totalSharesInClassForClient`
- Find the dividend total for this company+class: `dividendForClass`
- Pro-rata for this lot: `(thisLot.shares_purchased / totalSharesInClassForClient) × dividendForClass`

The per-company summary uses the real `dividendForClass` value (not summed from the pro-rata lots — they're mathematically equivalent but using the real value is clearer).

**Edge case:** if `totalSharesInClassForClient === 0`, return zero for that lot. Should never happen in practice (a lot exists means they had shares) but defensive.

**Plain English code comment** the implementation should include:

```typescript
// Dividend allocation is a fiction at the lot level: dividends are paid
// to the holder at a record date, not to a specific buy lot. We allocate
// them pro-rata by the lot's share count over the client's total shares
// in that company+class. The per-company summary uses the real total.
// Both views sum to the same grand total. When real dividend data starts
// arriving, this logic must be verified against an actual payment event
// (Future Work item, see Section 10).
```

### 4.4 Schema change required

One tiny addition: the `documents.type` column doesn't currently include `'portfolio_statement'` as an allowed value (or, if there's no enum constraint, the documentation needs updating). Check what's there.

<details>
<summary>Current `documents.type` known values</summary>

From existing seed and code: `'application_form'`, `'transaction_statement'`, `'other'`. The `documents.type` column is text without a CHECK constraint as of the 2B.1 schema, but the platform uses string literals consistently in code.
</details>

**Migration scope:** if there IS a CHECK constraint, add `'portfolio_statement'` to it. If not, just commit the convention in `CLAUDE.md`.

No other schema changes.

### 4.5 Storage layout

Following Stage 6c's pattern, with per-client scoping:

```
documents/
  clients/
    {client_id}/
      portfolio-statements/
        portfolioValuationStatement-{period_yyyymmdd}-{timestamp}-{randomSuffix}.pdf
```

The `clients/` prefix is new (Stage 6c used `deals/`). Filenames are sanitised via the existing `sanitiseStorageKey()` helper.

### 4.6 The `documents` row written on generation

| Field | Value |
|---|---|
| `id` | uuid_generate_v4() |
| `type` | `'portfolio_statement'` |
| `client_id` | the client this statement is for |
| `company_id` | NULL (statement spans multiple companies) |
| `deal_id` | NULL (not a deal document) |
| `deal_investor_id` | NULL |
| `filename` | the sanitised PDF filename |
| `storage_url` | the storage path (not the public URL — private bucket) |
| `period` | the period date in `YYYY-MM-DD` format, e.g. `'2026-03-31'` |
| `document_date` | the generation date (today) |
| `template_version` | `'portfolioValuationStatement@1.0.0'` |
| `version` | 1 on first generation; incremented on regeneration |
| `superseded` | false on insert |
| `uploaded_by` | the team member who clicked Generate |

---

## 5. Sub-stage 2A.1 — Per-client trigger + template

**Branch:** `feat/portfolio-statement-generation`
**Outcome:** A team member can navigate to a client record page, click a button, choose a period date, and download a PDF that matches the Barry O'Brien report's format using live database data.

### 5.1 The new template file

**File:** `src/services/document-generation/templates/portfolioValuationStatement.tsx`

A React-pdf template component. Visual reference: the Barry O'Brien PDF in the uploaded `juno-investor-reports` Python package. Specifically:

**Page setup:**
- A4 landscape (orientation: `'landscape'`)
- Margins: 1.5cm left/right, 3.5cm top, 2.2cm bottom (matching Python builder)
- Helvetica family throughout
- Body 9pt, headers 10pt, table headers 9pt bold

**Brand colours** (copy from Python builder):
- `JUNO_DARK` = `#1A1A2E`
- `JUNO_NAVY` = `#1B3272` (table header background)
- `JUNO_GOLD` = `#B8962E` (line below table header)
- `LIGHT_GREY` = `#F5F5F5` (alternating row background)
- `MID_GREY` = `#CCCCCC` (grid lines)
- `WHITE`

**Header (every page):**
- Logo top right (use the JunoOS app logo — same file used elsewhere, ideally an SVG component)
- "Portfolio Summary" title top left, 14pt
- Period date subtitle below the title (e.g. "31 March 2026"), 10pt grey

**Sub-header below the gold line (page 1 only):**
- "Full Name: {client.full_name}"
- "Investor Reference: {client.investor_reference}"

**Detail table (the main 11-column table):**

| Column | Width hint | Format |
|---|---|---|
| Company | flex | text, left-aligned |
| Share Class | flex | text, left-aligned |
| EIS | small | text, left-aligned, "EIS" or empty |
| Date | small | date `DD/MM/YY` |
| Orig. Price | small | currency `£X.XX` |
| Shares | small | number with commas (no decimals if whole) |
| Subscribed | medium | currency right-aligned |
| Curr. Price | small | currency |
| Curr. Value | medium | currency right-aligned |
| Change | medium | currency, right-aligned (negative in red? Python uses default — keep default for v1) |
| Dividends | medium | currency right-aligned **(dropped entirely if zero across statement)** |

Auto-size columns proportionally to fit the page width, matching the Python builder's `_auto_col_widths` approach. The Python source code (`report_generator.py`) is the reference; port the logic to JavaScript.

Sort order for detail rows: alphabetical by company name, then by investment date within company.

**Totals row at the end of the detail table:**
- "Total" in the Company column
- Currency totals for Subscribed, Curr. Value, Change, Dividends (if shown)
- Other columns empty

**Page 2 — "Summary by Company":**
- Six columns: Company, Shares Purchased, Sum Subscribed, Current Valuation, Valuation Change, Cumulative Dividend Paid (last column dropped if zero across statement)
- One row per distinct `(company, share_class)` for this client — but display only company name in the Company column. If a client has multiple share classes in the same company, render multiple rows with the same company name (matching Python builder).
- Sort order: alphabetical by company name
- Totals row at the end

**Footer (every page):**
- Left: "Generated on {today}, DD MMMM YYYY"
- Centre: "Juno Capital Partners LLP" then "91 Wimpole Street, London, W1G 0EF"
- Right: "Page X of Y"

### 5.2 The generation function

**File:** `src/services/document-generation/generatePortfolioValuationStatement.ts`

```typescript
export async function generatePortfolioValuationStatement(
  supabase: SupabaseClient,
  params: {
    clientId: string
    periodDate: string  // YYYY-MM-DD
    triggeredBy: string  // user ID
  },
  options: { previewOnly?: boolean } = {},
): Promise<GenerationResult> {
  // 1. Fetch context (the 6 queries from 4.2 above)
  const context = await fetchPortfolioStatementContext(supabase, params)

  // 2. Render the React PDF
  const element = React.createElement(PortfolioValuationStatementTemplate, context)
  const pdfBuffer = await renderToBuffer(element)

  if (options.previewOnly) {
    return { documentId: '', storageUrl: '', templateVersion: 'portfolioValuationStatement@1.0.0', pdfBuffer }
  }

  // 3. Sanitise filename and build storage path
  const safeName = sanitiseStorageKey(context.client.full_name)
  const filename = `portfolioValuationStatement-${periodDate.replace(/-/g, '')}-${Date.now()}-${randomSuffix()}.pdf`
  const storagePath = `clients/${params.clientId}/portfolio-statements/${filename}`

  // 4. Upload to private bucket
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw uploadError

  // 5. Mark prior statements for same (client, period) as superseded
  await supabase
    .from('documents')
    .update({ superseded: true, superseded_at: new Date().toISOString(), superseded_reason: 'Regenerated' })
    .eq('client_id', params.clientId)
    .eq('type', 'portfolio_statement')
    .eq('period', params.periodDate)
    .eq('superseded', false)

  // 6. Determine new version number (max + 1)
  const { data: existing } = await supabase
    .from('documents')
    .select('version')
    .eq('client_id', params.clientId)
    .eq('type', 'portfolio_statement')
    .eq('period', params.periodDate)
    .order('version', { ascending: false })
    .limit(1)
  const newVersion = (existing?.[0]?.version ?? 0) + 1

  // 7. Insert new documents row
  const { data: doc, error: insertError } = await supabase
    .from('documents')
    .insert({
      type: 'portfolio_statement',
      client_id: params.clientId,
      filename,
      storage_url: storagePath,
      period: params.periodDate,
      document_date: new Date().toISOString().split('T')[0],
      template_version: 'portfolioValuationStatement@1.0.0',
      version: newVersion,
      superseded: false,
      uploaded_by: params.triggeredBy,
    })
    .select('id, storage_url')
    .single()
  if (insertError) throw insertError

  return {
    documentId: doc.id,
    storageUrl: doc.storage_url,
    templateVersion: 'portfolioValuationStatement@1.0.0',
    pdfBuffer,
  }
}
```

The context-fetching helper `fetchPortfolioStatementContext()` lives in the same file or alongside it. It does the 6 queries from Section 4.2 and the dividend pro-rata calculation from Section 4.3, returning a fully-built `PortfolioStatementContext` ready to pass to the template.

### 5.3 The trigger UI

**File:** new component on the client record page — `src/app/(app)/clients/[id]/_components/GenerateStatementSection.tsx` (or wherever the existing client record tabs live).

Pattern: small card on the client record page, on a sensible tab (likely the Overview tab or a Documents tab if one exists). UI:

- Card title: "Portfolio statement"
- A period date picker (default: end of last completed quarter — e.g. on 20 May 2026, default is 31 March 2026)
- A "Generate statement" button (primary)
- Below the button, list any existing non-superseded statements for this client as small links: "31 March 2026 (generated 20 May 2026) — Download"
- Behind the button, the `generatePortfolioValuationStatement` action triggers
- On success, the new statement appears in the list and a download starts automatically
- On failure, show an inline error

The download link points at a Supabase Storage signed URL, generated on demand when the user clicks Download. **Do not expose `storage_url` directly** — generate signed URLs from the private bucket with a short TTL.

### 5.4 Files to create / modify

**Create:**
- `src/services/document-generation/templates/portfolioValuationStatement.tsx` — the template
- `src/services/document-generation/generatePortfolioValuationStatement.ts` — the generation function + context fetcher
- `src/app/(app)/clients/[id]/_components/GenerateStatementSection.tsx` — the UI
- `src/app/(app)/clients/[id]/portfolioStatementActions.ts` — server actions wrapping the generation function

**Modify:**
- `src/services/document-generation/types.ts` — add `PortfolioStatementContext` type (alongside `TransactionDocumentContext`, which is also outside the generic registry)
- `src/app/(app)/clients/[id]/page.tsx` — wire the new section into the client record page
- `CLAUDE.md` — note that `portfolio_statement` is now a recognised `documents.type` value

### 5.5 Acceptance criteria — Sub-stage 2A.1

1. A team member can navigate to any client's record page and see a Portfolio statement card with a period date picker and a Generate button
2. Clicking Generate produces a PDF that:
   - Matches the Barry O'Brien layout (header, sub-header, 11-column detail table, totals row, page break, 6-column summary table, footer)
   - Renders all 11 portfolio companies' share classes correctly with the client's actual holdings
   - Sorts rows alphabetically by company, then by investment date
   - Shows the Dividends column only if the client has any dividend record across the statement
   - Pro-rata allocates dividends correctly at lot level when shown
   - Uses Juno brand colours, A4 landscape, correct margins
3. The PDF uploads to `documents/clients/{client_id}/portfolio-statements/{filename}` in private storage
4. A `documents` row is inserted with `type = 'portfolio_statement'`, correct period, version 1
5. Re-generating for the same (client, period) marks the prior version `superseded = true` and inserts version 2
6. Downloading uses a signed URL with TTL — does NOT expose the private storage path
7. The generation function does NOT use PostgREST embedded joins
8. Filenames are sanitised via `sanitiseStorageKey()` — em dashes, smart quotes, etc. stripped
9. Build passes, lint clean, TypeScript types compile
10. The Stage 6c precedent is followed structurally — context type alongside `TransactionDocumentContext`, generation function alongside `generateTransactionStatement()`, storage path mirrors

**Stop condition:** Ed reviews preview. Sub-stage 2A.2 does not begin until 2A.1 is merged.

---

## 6. Sub-stage 2A.2 — Bulk trigger (preview only)

To be specified separately after 2A.1 merges. Expected shape:

- A new page or section (likely Settings → Reports, or a new top-level Reports nav entry)
- Period date picker + cohort picker (e.g. "all clients", "selected clients", filter by fund type)
- Progress UI as each PDF generates (could take a few minutes for 150 clients)
- Result summary: how many succeeded, how many failed, links to each
- The generation function `generatePortfolioValuationStatement()` from 2A.1 is reused; only the orchestrating UI is new

Server actions need to handle long-running generation gracefully (Next.js server action timeouts, background job options to consider).

**Trigger to specify:** after 2A.1 is in production and being used.

---

## 7. Investor-portal future-proofing

Following the same principle as Stages 1 and 2B: build the query layer in a way that makes future portal access easy without doing portal work now.

In `generatePortfolioValuationStatement.ts`, include a comment header at the top:

```typescript
// PORTFOLIO STATEMENT GENERATION
// This function generates statements visible only to the team (internal).
// When the investor portal is built, portal users will be able to view their
// own statements via a separate read-only query path (e.g. by document_id,
// scoped to their own client_id via RLS). The generation function is NOT
// reused by the portal — generation is always team-triggered. The portal
// reads existing PDFs via signed URLs the same way the internal team does.
```

No RLS in v1; standing rule from prior stages.

---

## 8. Future Work items added by this stage

- **14.24 — Cover letter generation.** AI-narrative letter + pie chart, equivalent to the Python builder's `letter_generator.py`. Requires Anthropic API integration and chart generation. Out of scope of Stage 2A.
- **14.25 — Automated quarterly statement run.** A scheduled job that runs at quarter-end and generates statements for all active clients automatically, replacing the manual bulk trigger. Probably integrates with Microsoft 365 Graph for email delivery once that integration lands.
- **14.26 — Verify dividend pro-rata against a real payment event.** When the first real dividend is recorded in `dividends`, manually verify the statement's pro-rata math against a hand calculation. Document any edge cases discovered.
- **14.27 — Portal access to statements.** Read-only access for investors to view their own statements via the (future) investor portal. RLS on `documents` rows where `type = 'portfolio_statement' AND client_id = <viewer's client>`.
- **14.28 — Multi-portfolio support.** If clients ever hold investments across multiple Juno-managed portfolios (e.g. EIS-only sub-portfolio), the statement may need a portfolio selector or breakdown view. Currently every client has one combined portfolio.

- **14.29 — Stage 6c transaction statement supersedure broken in production.** The same storage UPDATE policy gap that broke portfolio statement supersedure (fixed in PR #11) likely affects Stage 6c. Regenerating a transaction statement probably fails silently or with "Object not found" before this PR's RLS policy fix landed. The policy fix applies platform-wide so Stage 6c should now work, but it hasn't been re-tested. Action: regenerate a transaction statement in production after PR #11 merges and verify the old file gets renamed correctly.

- **14.30 — Optional "show superseded" toggle on client record Documents tab.** Currently the tab hides superseded documents entirely (per Ed's preference). The deal-page Documents tab has a "Final only / All docs" toggle. If the team ever needs to inspect version history of a client-scoped document, the same toggle pattern could be added here. Low priority — version history can be retrieved by querying the database directly in the meantime.

- **14.31 — Migration files for MCP-applied schema changes.** Two changes during Stage 2A were applied via MCP for speed but the corresponding migration files in the repo were created retrospectively or are missing: the test investment seed (Stage 2A.1, applied during build) and the storage UPDATE policy (this PR). Both are captured in production but the migration-file source of truth is partially drifted. Future MCP-applied changes should always be followed up with a migration file commit within the same PR.

---

## 9. Version history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1 | 20 May 2026 | Ed + chat-Claude | Initial spec, approved for build |

---

*End of spec. Sub-stage 2A.1 build prompt is `Build_Prompt_Phase_B_Stage_2A1_Portfolio_Statement.md`.*
