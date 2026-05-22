# Juno Phase B Sub-stage 2A.2 — Portfolio Statement Bulk Run

**Status:** Draft v1 — to be moved into `docs/specs/` once approved
**Depends on:** Sub-stage 2A.1 (merged 21 May 2026, PR #11) and Sub-stage 2A.1.5 (merged 21 May 2026, PR #12)
**Position in plan:** the bulk trigger for routine quarterly statement runs

---

## 1. Purpose

Sub-stage 2A.1 built per-client generation. 2A.1.5 built the delivery workflow. Both are one-investor-at-a-time. For routine quarterly reporting against ~150 investors, the team needs a single page where they can pick a period date and a list of investors, kick off the run, and walk away. The server generates statements one by one in the background; the team can come back, see what succeeded, see what failed, and pick up where they left off.

This sub-stage builds that bulk page, replaces the legacy `PortfolioStatementWizard` (which generated single-investor statements through a now-deprecated path), and introduces JunoOS's first background job pattern — a `bulk_runs` table with progress polling.

Outlook delivery is still deferred to a future stage. After bulk generation, the team uses the existing per-statement Email composer modal (from 2A.1.5) to send each one manually. Bulk-send via Outlook is a separate piece of work (Future Work 14.34 + bulk variant).

---

## 2. Out of scope

- **Bulk send.** Generation only. Each statement still needs to be emailed manually via 2A.1.5's composer. The "bulk email" workflow becomes possible once Outlook integration ships.
- **Scheduled/automated runs.** Cron jobs that run quarterly without human input. Future Work, once 2A.2 has proven itself in real use.
- **Approval workflow.** No "team lead reviews each PDF before it goes out" gate in v1. The team trusts the generation pipeline — supersedure is the safety net.
- **Per-client format overrides.** All statements in a bulk run use the same template. Customising one investor's PDF differently from another's is not supported.
- **Cover letters / personalised narrative.** The 2A.1 template is the only output. Future Work 14.24 (cover letter generation) remains future.

---

## 3. Replacing the legacy wizard

The existing `/reports/portfolio-statement` route has a 3-step wizard (`PortfolioStatementWizard.tsx`) that generates a single-investor statement through a legacy path (the `investor_updates` table, not the `documents` table). This pre-dates Stage 2A.1 and is now stale — it doesn't use the React-pdf template, doesn't write to the new storage location, doesn't appear under Valuations on the Documents tab.

**This sub-stage replaces it entirely.**

The replacement: at `/reports/portfolio-statement` (singular, keeping the existing URL), a new bulk-aware page that supports both single-investor and many-investor runs. Single-investor selection is a checklist of 1; bulk is a checklist of many.

Side effects of the replacement:

- The old `PortfolioStatementWizard.tsx` and its preview/template logic are deleted
- The "Generate portfolio statement" action on the client record (which previously linked to `/reports/portfolio-statement?client={clientId}`) is rewired. Two options for what it does now:
  - (a) Stay on the client record — open the existing per-client modal flow from 2A.1
  - (b) Navigate to `/reports/portfolio-statement?client={clientId}` and have the bulk page pre-select that one client
  Either is fine; the spec leans (a) because it's already built and well-tested. Decision left to the build step.
- The `investor_updates` and `investor_update_recipients` tables are left in place (not dropped) — they'll be used by the separate investor-update-letter workflow (still on the Reports landing page). They just aren't used for portfolio statements any more.

---

## 4. Where the team triggers a bulk run from

**The page is `/reports/portfolio-statement`** (singular — keeping the existing route to avoid breaking any in-flight links).

**The Reports landing page** at `/reports` is updated:
- The "Portfolio Statement" action card's sub-label changes from "For a single investor" to "For one or more investors"
- The card description updates accordingly
- The "Recent" section on the Reports landing page is renamed or repurposed to list recent **bulk runs** (with a count per run, period date, success/failure summary) — see Section 9 for the per-run history table
- The "In draft" section may also need to change. If there are no draft bulk runs as a concept, the section can be dropped. (Drafts of investor update letters can remain.)

---

## 5. The bulk page — UI design

A single page with four sections, top to bottom:

### 5.1 Configure (top section)

- **Period date** picker. Default to the most recent quarter-end:
  - If today is on or after 1 April → 31 March of this year
  - If today is on or after 1 July → 30 June of this year
  - If today is on or after 1 October → 30 September of this year
  - If today is on or after 1 January → 31 December of last year
  - The team can change to any date via a standard date picker
  - The displayed format under the picker: "31 March 2026 (Q1 end)"

### 5.2 Select investors (middle section)

A search-and-filter table with checkboxes.

**Filter chips at the top of the table** (multi-select, applied as AND):
- **All investors with active investments** (the data-derived "currently a holder" — derived by joining `clients → investments` and checking sum of shares > 0)
- **Favourites only** (`clients.is_favourite = true`)
- **Hasn't been sent this quarter** (no statement row in `documents` where `type = 'portfolio_statement'` AND `period = {selected period}` AND `superseded = false`)
- **Has email on file** (`clients.email IS NOT NULL`)

**Search bar** (substring match on `clients.full_name`).

**Table columns:**
- Checkbox
- Client name
- Email (greyed out if missing — flag with "No email")
- Last statement date for any period (column shows date of most recent non-superseded statement; "Never" if none)
- Last statement for THIS period (shows date of generation if one exists, or "—")

**Header row:**
- "Select all visible" / "Deselect all" toggle (selects only rows currently matching filters)
- Counter: "X of Y selected"

**Important behaviour:**
- Filter chips don't AUTO-select; they NARROW the visible list. The team still ticks the checkboxes themselves. This is deliberate — bulk runs are an explicit decision, not an automatic one.
- Default filter on page open: "All investors with active investments" + "Has email on file"
- Selecting a row that's filtered out (e.g. by switching filters) keeps the selection but greys the row

### 5.3 Pre-run review (third section)

Below the table, a summary card that updates live as selection changes:

```
You're about to generate 47 statements for the period 31 March 2026.

8 of these investors already have a current statement for this period.
Those will be superseded (the old version preserved in the archive).

3 selected investors have no email on file.
You'll be able to download those statements but not email them.

[ Run bulk generation ] [ Save selection as preset (future) ]
```

The "Save selection as preset" button is greyed out and labelled "Coming soon" — it hints at the future ability to save "always send to these 50 investors" as a saved list. Future Work item.

### 5.4 Run progress (only visible while a run is in progress)

While a bulk run is executing, this section replaces the rest of the page (or appears prominently above it):

```
Bulk run in progress
Started 21 May 2026 14:32 by erudd
Period: 31 March 2026

[████████░░░░░░░░░░░░] 23 of 47 (49%)

✓ 22 succeeded
✗ 1 failed (see details below)
○ 24 remaining

Currently generating: Sky Medical Technology — Barry O'Brien III…
```

A progress table below shows each investor's status:
- Pending (○)
- In progress (◐)
- Succeeded (✓ green) — clickable to view the generated PDF
- Failed (✗ red) — clickable to expand the error message

The team can:
- **Leave the page** — the run continues in the background. They can come back later and see progress.
- **Cancel the run** — stops the queue. Already-generated statements are kept (not rolled back).
- **Retry failed** — re-runs only the failed entries from this run.

---

## 6. Filter logic and edge cases

### 6.1 "All investors with active investments"

Defined as: any client where `SUM(investments.shares_purchased) > 0` AND no offsetting sell transactions reducing them to 0.

If sells haven't been built into the platform yet (worth checking), this simplifies to: any client with at least one row in `investments`.

The simpler version is fine for v1. Future Work to refine when sell transactions become part of the data model.

### 6.2 "Hasn't been sent this quarter"

Defined as: no row in `documents` where:
- `type = 'portfolio_statement'`
- `client_id = {client}`
- `period = {YYYY-MM-DD of selected period date}`
- `superseded = false`

The `period` column is text and is set by the existing generation function (`generatePortfolioValuationStatement`). For this filter to work, that column must be populated with the ISO date of the period for every existing portfolio statement. Verify this is the case before relying on the filter — if the column is sometimes null on existing rows, fall back to substring matching on the filename pattern.

### 6.3 Investors with no email

These can still be included in a bulk run. Generation works regardless. Only the delivery side (2A.1.5 composer) requires an email. The pre-run review surfaces this so the team knows what they'll be left with.

---

## 7. The background job

This is the architectural novelty in 2A.2 — JunoOS hasn't had a background job pattern before.

### 7.1 What "background" means in this Next.js context

Next.js on Vercel runs as serverless functions. A single function invocation has a ~60 second timeout (longer on some plans, but unreliable). 150 statements at 3 seconds each is far too long for one invocation.

Two real options:

**Option A: Queue-per-row, polled from the client.**
- Team clicks "Run". Server creates a `bulk_runs` row and many `bulk_run_items` rows (one per investor, status='pending').
- Server returns immediately with the run ID.
- Client polls `/api/bulk-runs/{id}/status` every 3 seconds.
- The polling endpoint, on each call, picks up the next pending item, generates the statement, marks it complete or failed, and returns the updated progress.
- This means progress only advances while at least one team member's browser is polling. If everyone closes the tab, the run pauses. When someone reopens the page, polling resumes and the queue continues.
- Pros: simple, no Vercel queue infrastructure, no scheduled functions, easy to reason about
- Cons: tied to a browser session; if everyone closes their browser, work stops
- Mitigation: most bulk runs happen when one team member is actively kicking them off and will keep the tab open

**Option B: Vercel Cron + Background Functions.**
- A scheduled cron runs every minute, picks up pending items from `bulk_run_items`, processes a batch (say 5 at a time within the 60-second window), marks them.
- Works without anyone's browser open.
- Pros: truly autonomous, scales beyond browser sessions
- Cons: Vercel Cron is configured at deploy time, harder to test, adds infrastructure JunoOS doesn't have yet

**Recommendation for v1: Option A.** Bulk runs are infrequent (quarterly), and the team driving them is going to be at their desk when they kick one off. The "browser must stay open" caveat is acceptable. If real-world experience says otherwise, Option B can be added later — the underlying `bulk_runs` + `bulk_run_items` tables don't change.

### 7.2 Polling endpoint behaviour

The polling endpoint `POST /api/bulk-runs/{id}/tick` does, per call:

1. Read the run row. If status is `cancelled`, return early.
2. Find the next `bulk_run_items` row where status = `pending` for this run, locked using `SELECT ... FOR UPDATE SKIP LOCKED` (so two concurrent polls don't pick the same item).
3. If no pending item exists and no in-progress items exist, mark the run `completed` and return.
4. Mark the item `in_progress` with `started_at`.
5. Call `generatePortfolioValuationStatement` for that investor and period.
6. On success: mark the item `succeeded`, store `document_id`.
7. On failure: mark the item `failed`, store the error message.
8. Return the run's current summary (counts of pending / in_progress / succeeded / failed).

The client polls every 3 seconds. Each tick generates at most one statement (about 3-5 seconds) so each poll roughly produces one row of progress. Multiple browsers open will tick in parallel, which is fine — each picks a different `pending` item thanks to `SKIP LOCKED`.

### 7.3 What happens if the page is reloaded mid-run?

On page load, the client checks if there's an in-progress `bulk_runs` row for the current user (or any user). If so, the page resumes showing progress for that run instead of the configuration UI.

Multiple in-progress runs at once are not blocked at the database level, but the UI nudges the team to wait for the current run to finish before starting another. (Real-world usage will mean one at a time.)

---

## 8. Database changes

Two new tables.

### 8.1 `bulk_runs`

```sql
CREATE TABLE bulk_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            TEXT NOT NULL CHECK (type IN ('portfolio_statement')),
                  -- Reserved for future bulk operations (e.g. 'eis_certificates')
  period_date     DATE,
                  -- For portfolio_statement type: the period date all statements use.
                  -- NULL for run types where this doesn't apply.
  status          TEXT NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'completed', 'cancelled', 'failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  started_by      UUID REFERENCES team_users(id),
  total_items     INTEGER NOT NULL,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  notes           TEXT
                  -- Free-text notes for the run, e.g. "Q1 2026 routine quarterly"
);

CREATE INDEX bulk_runs_status_idx ON bulk_runs (status, started_at DESC);
CREATE INDEX bulk_runs_type_idx ON bulk_runs (type, period_date);
```

### 8.2 `bulk_run_items`

```sql
CREATE TABLE bulk_run_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bulk_run_id   UUID NOT NULL REFERENCES bulk_runs(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES clients(id),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'succeeded', 'failed', 'skipped')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  document_id   UUID REFERENCES documents(id),
                -- Populated on success: the documents.id of the generated statement
  error_message TEXT,
                -- Populated on failure
  retry_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX bulk_run_items_run_status_idx ON bulk_run_items (bulk_run_id, status);
CREATE UNIQUE INDEX bulk_run_items_run_client_idx ON bulk_run_items (bulk_run_id, client_id);
                -- One row per (run, client) — no duplicates within a single run
```

### 8.3 RLS

Both tables get RLS policies matching the existing `documents` table:

```sql
ALTER TABLE bulk_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_run_items ENABLE ROW LEVEL SECURITY;

-- Authenticated team users can SELECT/INSERT/UPDATE all rows
CREATE POLICY "team can read bulk_runs"
  ON bulk_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "team can insert bulk_runs"
  ON bulk_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team can update bulk_runs"
  ON bulk_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "team can read bulk_run_items"
  ON bulk_run_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "team can insert bulk_run_items"
  ON bulk_run_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team can update bulk_run_items"
  ON bulk_run_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
```

(No DELETE policies for now — historical bulk runs stay in the database as audit. Cleanup can be added later if needed.)

---

## 9. Past runs history

Below the configuration UI (or on a separate tab on the same page), a table of past bulk runs:

| Started | Period | Count | Succeeded | Failed | Started by | Actions |
|---|---|---|---|---|---|---|
| 21 May 2026 14:32 | 31 March 2026 | 47 | 46 | 1 | erudd | [View details] |
| 21 February 2026 09:15 | 31 December 2025 | 45 | 45 | 0 | erudd | [View details] |
| ... | ... | ... | ... | ... | ... | ... |

Clicking "View details" expands or navigates to a per-run view showing each item's status, with links to the generated PDF or expand to see the error.

Only completed/cancelled runs appear in this table. In-progress runs are pinned at the top with a "View progress" link instead.

---

## 10. The single-investor case

A bulk run with one investor selected works identically. The team picking exactly one client, then "Run bulk generation" with one item to process. Takes about 3 seconds. Equivalent in outcome to the per-client Generate button on the Overview tab.

This means the legacy wizard is genuinely replaced with no loss of capability — the new page handles every case the old wizard did, plus the many-investor case it couldn't.

The Action menu on the client record (`/clients/[id]`) still has a "Generate portfolio statement" item. After this sub-stage, it should:
- Either continue to open the per-client modal flow from 2A.1 (recommended — already built, well-tested, faster for one investor)
- Or navigate to `/reports/portfolio-statement?client={clientId}` with that one client pre-selected

The spec leans toward keeping the per-client flow for one-off generations and reserving `/reports/portfolio-statement` for the multi-investor case — but the Reports landing page card description should make clear that bulk works with one-or-more.

---

## 11. Acceptance criteria

To be verified on the preview before merging:

1. The legacy `PortfolioStatementWizard.tsx` is deleted from the codebase.
2. `/reports/portfolio-statement` renders the new bulk page with Configure + Select + Pre-run review sections.
3. Period date picker defaults to the most recent quarter-end (verify in each of the four quarters by changing the system date).
4. Filter chips correctly narrow the investor list:
   - "All investors with active investments" excludes clients with no investments
   - "Favourites only" excludes non-favourites
   - "Hasn't been sent this quarter" excludes clients with a current statement for the selected period
   - "Has email on file" excludes clients with NULL email
5. Filter chips don't auto-select — selection is always explicit.
6. The pre-run review summary updates live as selection changes.
7. Clicking "Run bulk generation" creates a `bulk_runs` row + one `bulk_run_items` row per selected investor (verify via Supabase MCP).
8. The progress UI shows running counts, currently-generating investor name, and item-by-item statuses.
9. Leaving the page and returning shows the in-progress run, not the configuration UI.
10. A single statement that fails (e.g. invented missing data) is marked failed with the error message visible. Other statements continue.
11. "Cancel run" sets `status='cancelled'`, stops the queue. Already-generated statements remain.
12. "Retry failed" creates a follow-on operation that re-runs only failed items.
13. A second team member opening the same in-progress run sees the same progress and contributes to ticking (parallel processing).
14. After completion, the run appears in the "Past runs" table with the correct counts.
15. Statements generated via bulk run appear under Valuations on each client's Documents tab (same place 2A.1 puts them).
16. Existing statements for the same period are properly superseded (verifiable: old rows have `superseded=true`, new rows have `superseded_by_id` pointing at them).
17. The Action menu on the client record still works for the per-client generation flow.
18. The Reports landing page (`/reports`) is updated to reflect the bulk-aware copy.

---

## 12. Future Work items to add to the Stage 2A spec

Append items 14.36-14.42:

```markdown
- **14.36 — Bulk delivery (Outlook integration era).** Once Outlook integration ships,
  add a "Bulk send" action after a bulk run completes. Composes and sends all emails in
  one operation, with per-client subject/body templates applied. Replaces the current
  "team copies each email manually after bulk generation" workflow.

- **14.37 — Saved investor selections (presets).** Let the team save a chosen investor
  set as a named preset (e.g. "Quarterly EIS investors", "VIP clients"). Future bulk
  runs can load the preset to pre-fill the checklist instead of re-selecting.

- **14.38 — Scheduled bulk runs.** Vercel Cron-triggered quarterly runs that fire
  automatically on the day after each quarter-end (1 April, 1 July, 1 October, 1 January).
  Requires graduating from Option A polling to Option B background functions.

- **14.39 — Bulk run notifications.** When a bulk run completes (or fails partway), notify
  the initiating team member via email or in-app banner. Removes the need to keep the
  browser open or refresh repeatedly.

- **14.40 — Per-client report frequency preferences.** Add `reporting_default_frequency`
  (quarterly/semi-annual/annual/never) and `reporting_default_include` (boolean) columns
  to `clients`. Bulk runs respect these. Investors marked "annual" only get statements
  in Q4 runs, etc.

- **14.41 — Bulk action audit logging.** When a bulk run starts/completes/cancels,
  record an entry in an `activity_log` table for compliance and audit. Useful when the
  team wants to verify "did Q2 statements actually go out?"

- **14.42 — Bulk run for other document types.** The `bulk_runs.type` column already
  hints at this: extend the bulk runner to EIS certificates, dividend statements, tax
  vouchers. Each type defines its own per-item generator function; the queue mechanism
  is shared.
```

---

## 13. Implementation order (for the build prompt)

The right commit order:

1. Spec file added to `docs/specs/`
2. Migration: create `bulk_runs` and `bulk_run_items` tables + RLS policies
3. Future Work 14.36-14.42 appended to Stage 2A spec
4. Server actions: `createBulkRun`, `tickBulkRun`, `cancelBulkRun`, `retryFailedItems`
5. API route: `POST /api/bulk-runs/[id]/tick` calling the server action
6. New page component: `BulkStatementRunPage.tsx` with Configure + Select + Review + Progress sections
7. Replace `PortfolioStatementWizard.tsx` import in `/reports/portfolio-statement/page.tsx`
8. Delete `PortfolioStatementWizard.tsx` and its dependencies
9. Update `Reports.tsx` action card copy
10. Verify client record Actions menu still points at the per-client flow

---

*End of spec.*
