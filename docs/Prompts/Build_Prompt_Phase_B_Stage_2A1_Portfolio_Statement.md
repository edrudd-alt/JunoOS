# Build Prompt — Phase B Stage 2A.1: Portfolio Valuation Statement (per-client, FINAL, ready to run)

**Reference spec:** `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md` (Sections 4 and 5 cover this sub-stage)
**Master platform standards:** `CLAUDE.md` and `AGENTS.md`
**Depends on:** Phase B Stage 2B merged (per-share-class valuations foundation) and Stage 6c merged (transaction statement, the architectural precedent we're following).
**Branch:** `feat/portfolio-statement-generation`
**Supabase project ref:** `pzfydvwbeeupfgnxkpad`

> **NOTE TO CLAUDE CODE:** This sub-stage is **mostly code-only** — one tiny schema check, then several new files. The architectural pattern is already established by Stage 6c (transaction statement); you're following it for a new document type. Read Stage 6c's implementation in the codebase before writing anything new — specifically `src/services/document-generation/generateTransactionStatement.ts` and `src/services/document-generation/templates/transactionStatement.tsx`.

---

## 0. Pre-flight context (read before doing anything)

This is Sub-stage 2A.1 of Phase B Stage 2A. The deliverable is a button on the client record page that, when clicked, generates a per-investor portfolio valuation statement PDF — replacing the existing standalone Python desktop app (`juno-investor-reports`).

The visual target is the **Barry O'Brien report** — the team has the PDF; the layout is detailed in spec Section 5.1. The data source is now the JunoOS database directly, post the Stage 2B foundation rebuild.

**Read these files in order before starting:**

1. `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md` — full spec
2. `src/services/document-generation/generateTransactionStatement.ts` — the Stage 6c precedent; copy its shape
3. `src/services/document-generation/templates/transactionStatement.tsx` — the template style guide
4. `src/services/document-generation/types.ts` — particularly the `TransactionDocumentContext` type as a model

**Standing rules (do not violate):**

1. **No PostgREST embedded joins.** Two-query-then-merge pattern only.
2. **Plain English alongside technical detail** in PRs and non-trivial code comments.
3. **Storage key sanitisation** via the existing `sanitiseStorageKey()` helper (Stage 6c established this pattern).
4. **Immutable PDFs.** Regenerate → mark prior version `superseded = true`, insert new row with `version + 1`.
5. **Investor-portal future-proofing.** Comment header on the generation function per spec Section 7.

---

## 1. Current database state (verified 20 May 2026)

- 11 companies in `companies`
- 23 share classes in `company_share_classes` (21 equity, 2 CLN)
- 19 valuations in `valuations`; 2 deliberately empty for empty-row testing (Groovance Ordinary, Edozo A Ordinary)
- `investments` table is **empty** (cascade casualty from 2B.1 — we have no live test data for actual holdings)
- `dividends` table is empty
- `clients` table has 20 test clients with `full_name` and `investor_reference` populated
- `documents` table exists with shape from Stage 6a/6b/6c; `documents.type` is text (no CHECK constraint as of writing — verify this in Task 1)

**The empty `investments` table is the elephant in the room.** Statements need investment rows to render anything meaningful. There are two options for this sub-stage:

**Option A — Seed test investment data first.** Add a small seed script that creates ~15-30 investment rows across 2-3 test clients, mimicking the Barry O'Brien report's shape (multiple lots, multiple companies, mix of EIS / non-EIS). This is essential because otherwise you can't visually verify the output.

**Option B — Build the template and trigger UI, but defer visual verification.** Risky; you can't tell if the template is right until you have data.

**Take Option A.** Add a seed inside the migration step (Task 2). Coordinate with Ed via the PR description before applying.

---

## 2. Task list

Build this sub-stage in 8 tasks. Work through them in order. The first three are setup; the next three are the core build; the last two are polish and acceptance.

### Task 1 — Branch and schema verification

```bash
git checkout main && git pull
git checkout -b feat/portfolio-statement-generation
```

Verify the `documents.type` column:

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.documents'::regclass AND contype = 'c';
```

- If no CHECK constraint on `type`, no schema change needed. Just commit a `CLAUDE.md` line noting `portfolio_statement` is a recognised type value.
- If a CHECK constraint exists that doesn't include `'portfolio_statement'`, generate a migration to extend it. Post in the PR for Ed's review before applying.

Use chat-Claude (via Supabase MCP) for this verification if useful — the cost is low.

### Task 2 — Seed test investments

Create a new migration file `supabase/migrations/<YYYYMMDDHHMMSS>_seed_test_investments.sql` (timestamped after 2B.1 + 2B.2):

Insert investment rows for 2-3 of the existing test clients (e.g. the first three alphabetically) such that:

- Each test client has 5-10 lots across 3-4 companies
- Use share class IDs from the existing `company_share_classes` rows (don't make up new ones)
- `investment_date` ranges across multiple years
- `original_share_price`, `shares_purchased`, `sum_subscribed` are internally consistent (`original_share_price × shares_purchased = sum_subscribed` to within rounding)
- `eis_status` is a mix of `'yes'`, `'no'`, NULL
- `transaction_type` = `'buy'`, `status` = `'active'`, `fund_type` = `'syndicate'`
- Match `share_class_id` to the actual share class on `company_share_classes` (use the same lookup-by-(company, name) pattern used in earlier seeds)
- Include CLN positions: one or two CLN holdings for the test clients (matching the CLN share classes on AI Forge / Sky Medical)

Post the seed SQL in the PR description with plain-English commentary. Ed applies manually. Once applied, chat-Claude verifies via MCP.

### Task 3 — Add the new type to `types.ts`

Open `src/services/document-generation/types.ts`. Add a `PortfolioStatementContext` type alongside the existing `TransactionDocumentContext`:

```typescript
// ── Portfolio statement context ────────────────────────────────────────────────
// Not in the generic registry pipeline — has its own generation path
// (multi-row, multi-company, computed totals, no deal_id).

export interface PortfolioStatementContext {
  client: {
    id: string
    full_name: string
    investor_reference: string | null
  }
  period: {
    date: string  // YYYY-MM-DD, the "as at" date the statement reflects
    generatedOn: string  // YYYY-MM-DD, today
  }
  lots: Array<{
    investment_id: string
    company_name: string
    share_class_name: string
    eis_status: 'yes' | 'no' | 'tbc' | null
    investment_date: string  // YYYY-MM-DD
    original_share_price: number
    shares_purchased: number
    sum_subscribed: number
    current_share_price: number  // from latest valuation, or original_share_price as fallback
    current_valuation: number  // computed: shares_purchased × current_share_price
    valuation_change: number  // computed: current_valuation - sum_subscribed
    dividend_allocation: number  // pro-rata, zero if no dividends for this company+class
  }>
  companySummary: Array<{
    company_name: string
    share_class_name: string
    total_shares: number
    total_subscribed: number
    total_current_valuation: number
    total_valuation_change: number
    total_dividends: number  // real, not pro-rata
  }>
  grandTotals: {
    subscribed: number
    current_valuation: number
    valuation_change: number
    dividends: number
  }
  showDividendColumn: boolean  // true iff any (company, class) has nonzero dividend
}
```

No changes to `TemplateId` or `ContextMap` — the portfolio statement is outside the generic registry (per spec decision 4).

### Task 4 — Build the generation function

Create `src/services/document-generation/generatePortfolioValuationStatement.ts`. Use spec Section 5.2 as the structural template. The function:

1. Fetches context via a helper `fetchPortfolioStatementContext(supabase, clientId, periodDate)` — the 6 queries from spec Section 4.2, merged in JavaScript using Maps. NO PostgREST embedded joins.
2. Computes the dividend allocation per spec Section 4.3 (drop column if zero across statement; otherwise pro-rata at lot level).
3. Renders the React PDF using the new template from Task 5.
4. Sanitises the storage key via `sanitiseStorageKey()`.
5. Uploads to `documents/clients/{client_id}/portfolio-statements/{filename}` in the private `documents` bucket.
6. Marks prior versions for the same `(client, period)` as `superseded = true`.
7. Inserts a new row in `documents` with `type = 'portfolio_statement'`, the next version number, etc.
8. Returns `{ documentId, storageUrl, templateVersion, pdfBuffer }`.

The function takes a `previewOnly` option (like the Stage 6b application form preview). When true, skip the upload and the `documents` insert — just return the PDF buffer.

**Plain English file header comment:**

```typescript
// PORTFOLIO STATEMENT GENERATION
// This function generates statements visible only to the team (internal).
// When the investor portal is built, portal users will be able to view their
// own statements via a separate read-only query path (e.g. by document_id,
// scoped to their own client_id via RLS). The generation function is NOT
// reused by the portal — generation is always team-triggered. The portal
// reads existing PDFs via signed URLs the same way the internal team does.
//
// Architectural note: this function lives outside the generic
// templateRegistry (generateDocument.tsx) because the portfolio statement's
// data shape (multi-row, multi-company, computed totals, no deal_id) does
// not fit DealDocumentContext. This mirrors Stage 6c's transaction statement
// pattern; the divergence is intentional (see Future Work 14.18 in the
// deal-page-restructure spec).
```

### Task 5 — Build the template

Create `src/services/document-generation/templates/portfolioValuationStatement.tsx`. Use spec Section 5.1 as the visual specification and `templates/transactionStatement.tsx` as the structural reference.

Key requirements:

- A4 landscape (`orientation="landscape"` on the `<Page>`)
- Margins: 1.5cm L/R, 3.5cm top, 2.2cm bottom
- Helvetica family, body 9pt
- Juno brand colours from spec Section 5.1
- Three rendered sections per statement:
  - Header (logo top right, "Portfolio Summary" title, period date subtitle, gold line, sub-header with name + reference) — appears on every page
  - Detail table (11 columns, or 10 if dividends column dropped) — multi-page if needed
  - Summary by Company table (6 columns, or 5 if dividends dropped) — starts on a new page after the detail table
- Footer (every page): generated-on date left, firm name + address centre, page X of Y right
- Column auto-sizing: port the `_auto_col_widths` logic from `juno-investor-reports/report_generator.py` to JavaScript — measure each column's max content width, scale proportionally to fill page width

**Render rules:**
- Numbers: thousands separator (e.g. `1,234`); whole numbers if no decimal needed, 4 decimal places for fractional shares
- Currency: `£X.XX` (two decimal places); negative shows as `-£X.XX`; default colour (no red for negatives in v1)
- Dates: `DD/MM/YY` for table cells; full `DD MMMM YYYY` for header period
- EIS column: shows `"EIS"` if `eis_status === 'yes'`, otherwise empty
- Sort order: alphabetical by company, then by investment date within company

**File size hint:** the template will be roughly 300-500 lines. The Stage 6c transaction statement template is a reasonable size benchmark.

### Task 6 — Build the trigger UI

Create `src/app/(app)/clients/[id]/_components/GenerateStatementSection.tsx`.

UI per spec Section 5.3:

- Card with title "Portfolio statement"
- Period date picker (input type="date"), default to end of last completed calendar quarter from today's date
- Primary button "Generate statement"
- Below the button, a list of any existing non-superseded statements for this client, e.g.:
  ```
  31 March 2026 (generated 20 May 2026)  [Download]
  31 December 2025 (generated 16 Jan 2026)  [Download]
  ```
- On button click, calls a server action that wraps `generatePortfolioValuationStatement()`
- On success: new entry appears at top of the list; auto-trigger a download of the just-generated PDF
- On failure: inline error message; do not break the page

**Server actions file:** `src/app/(app)/clients/[id]/portfolioStatementActions.ts` containing:
- `generateStatementAction(formData)` — wraps the generation function
- `getStatementsForClient(clientId)` — fetches list of non-superseded statements
- `getDownloadUrlForStatement(documentId)` — produces a Supabase Storage signed URL (TTL ~5 minutes) and returns it

**Important:** the Download button must NOT expose `storage_url` directly. Generate a signed URL when the button is clicked, then `window.open` or trigger a download.

### Task 7 — Wire the section into the client record page

Find the existing client record page at `src/app/(app)/clients/[id]/page.tsx`. Add the `GenerateStatementSection` to a sensible tab — most likely the Overview tab, or the Documents tab if one exists. If unsure, add it to the Overview tab and flag for Ed in the PR description.

### Task 8 — Update `CLAUDE.md`

Add a short section:

```
## Portfolio statement generation

Portfolio valuation statements are generated by
`generatePortfolioValuationStatement()` — a dedicated function outside the
generic templateRegistry, mirroring Stage 6c's transactionStatement pattern.

- Template: portfolioValuationStatement@1.0.0
- Storage: documents/clients/{client_id}/portfolio-statements/
- Trigger: per-client via the client record page (Sub-stage 2A.1)
- Documents row: type = 'portfolio_statement', supersedure on regeneration

Bulk trigger is Sub-stage 2A.2 (deferred).
```

---

## 3. PR description template

Title: `Sub-stage 2A.1 — Portfolio valuation statement (per-client)`

Body sections:

1. **What this PR does** — one-paragraph plain-English summary
2. **Test investment seed** — full SQL with plain-English commentary (the Task 2 seed needs Ed's review before applying)
3. **Files created** — list with one-line descriptions
4. **Files modified** — `types.ts`, the client page wiring, `CLAUDE.md`
5. **Architectural note** — explain why this lives outside the generic registry (cite spec section 2 decision 4)
6. **Visual reference** — call out that the Barry O'Brien Python-generated PDF is the visual target; mention the file path of the Python source for layout reference
7. **Test instructions for Ed** — generate a statement for one of the seeded test clients, verify all columns render correctly, verify the dividend column is dropped (since dividends are empty), verify regeneration creates v2 and marks v1 superseded
8. **Screenshots** — at minimum, the generated PDF for one test client showing both pages

---

## 4. Acceptance criteria (mirrors spec Section 5.5)

Before requesting review:

1. **Seed verified** — Ed has applied the seed SQL and the database has investment rows for 2-3 test clients
2. **Template renders correctly** — A4 landscape, all 11 columns (or 10 if dividends dropped), correct fonts, correct colours, totals row at the end
3. **Sort order correct** — alphabetical by company, then by investment date within company
4. **Empty-state handling** — generates without errors for a client with no investments (produces an empty statement with totals = £0; or shows a "no holdings" placeholder — your call, but no crash)
5. **CLN handling** — CLN class lots render at principal value (`current_share_price = £1.00`) if no valuation override exists
6. **Dividend column hidden** — since the dividends table is empty, the column doesn't render in the seeded scenario. To test "column-shown" behaviour, manually insert a dividend row via SQL and regenerate — column should now appear
7. **Supersedure** — regenerating for the same (client, period) marks v1 superseded and inserts v2
8. **Storage path correct** — uploaded files appear at `documents/clients/{client_id}/portfolio-statements/`
9. **Signed-URL download** — Download button produces a working signed URL with a TTL (does not expose `storage_url` directly)
10. **No PostgREST embedded joins** — `git grep` confirms `.select` calls in this PR's code don't use embedded-relation syntax
11. **Build passes, lint clean, TypeScript types compile**
12. **CLAUDE.md updated**

---

## 5. Workflow

1. Read this prompt + spec Sections 4 and 5 end-to-end.
2. Read the Stage 6c precedent files listed in Section 0.
3. Create the branch.
4. **Task 1 first** — verify schema, decide whether a migration is needed. If yes, generate the SQL and post in the PR.
5. **Task 2** — generate the seed SQL, post in the PR, wait for Ed to apply.
6. **Tasks 3-8** — proceed once Ed confirms the seed is applied.
7. Run `npm run build` and `npm run lint` before pushing.
8. Open the PR, fill in the description template.
9. Verify all acceptance criteria on the deployed preview.
10. **Stop. Wait for Ed.**
11. Once Ed approves, merge to `main`. Sub-stage 2A.2 (bulk trigger) gets specified separately afterward.

---

## 6. Things worth knowing as you build

- **The visual reference IS the existing Barry O'Brien PDF.** If something in the layout looks ambiguous in the spec, the Python source (`juno-investor-reports/report_generator.py`) is the canonical reference. Match its output.
- **Don't over-engineer for bulk.** Bulk generation is 2A.2. For 2A.1, one statement at a time is fine. No background jobs, no progress UI, no parallelisation.
- **The dividend logic is fictional at the lot level.** That's intentional — see spec Section 4.3. Include the plain-English code comment from the spec verbatim.
- **Period date determines the valuation snapshot.** When `periodDate = '2026-03-31'`, the statement should use whichever valuation is the latest one DATED ON OR BEFORE that period. Currently `company_current_valuations` view returns the absolute latest; to make period-respecting work properly, the query needs `valuation_date <= periodDate` filter. Don't use the view — query `valuations` directly with that filter, doing the `DISTINCT ON` in the query. This is an important nuance not covered in the original 2B view design.
- **Empty dividend column** — make sure to compute the boolean `showDividendColumn` cleanly in context-fetching, then read it once in the template to drive rendering. Don't scatter conditionals throughout.

---

*End of build prompt. Total estimated effort: medium-to-large. The template itself is the bulk of the work. The Stage 6c precedent does most of the architectural thinking for you.*
