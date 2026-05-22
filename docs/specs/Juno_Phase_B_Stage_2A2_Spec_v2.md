# Juno Phase B Sub-stage 2A.2 — Portfolio Statement Bulk Run

**Status:** Draft v2 — supersedes v1 (filters expanded with fund type, saved presets pulled into scope)
**Depends on:** Sub-stage 2A.1 (merged 21 May 2026, PR #11) and Sub-stage 2A.1.5 (merged 21 May 2026, PR #12)
**Position in plan:** the bulk trigger for routine quarterly statement runs

---

## 1. Purpose

Sub-stage 2A.1 built per-client generation. 2A.1.5 built the delivery workflow. Both are one-investor-at-a-time. For routine quarterly reporting against ~150 investors, the team needs a single page where they:

1. Pick a period date
2. Filter and select investors (by activity, favourites, fund type, etc.)
3. Optionally save that selection as a named preset for reuse next quarter
4. Kick off the run and walk away
5. Come back later, see what succeeded, see what failed, retry if needed

This sub-stage builds that bulk page, replaces the legacy `PortfolioStatementWizard` (which generated single-investor statements through a now-deprecated path), and introduces JunoOS's first background-job pattern — a `bulk_runs` table with progress polling.

Outlook delivery is still deferred to a future stage. After bulk generation, the team uses the existing per-statement Email composer modal (from 2A.1.5) to send each one manually. Bulk-send via Outlook is separate work (Future Work 14.36).

---

## 2. Out of scope

- **Bulk send.** Generation only. Each statement still needs to be emailed manually via 2A.1.5's composer.
- **Scheduled/automated runs.** Cron-triggered quarterly runs. Future Work once 2A.2 has proven itself.
- **Approval workflow.** No "team lead reviews each PDF before it goes out" gate in v1.
- **Per-client format overrides.** All statements in a bulk run use the same template.
- **Cover letters / personalised narrative.** The 2A.1 template is the only output. Future Work 14.24.

---

## 3. Replacing the legacy wizard

The existing `/reports/portfolio-statement` route has a 3-step wizard (`PortfolioStatementWizard.tsx`) that generates single-investor statements through a legacy path (the `investor_updates` table, not the `documents` table). This pre-dates Stage 2A.1 and is stale — it doesn't use the React-pdf template, doesn't write to the new storage location, doesn't appear under Valuations on the Documents tab.

**This sub-stage replaces it entirely.**

The replacement: at `/reports/portfolio-statement` (singular, keeping the existing URL), a new bulk-aware page that supports both single-investor and many-investor runs. Single-investor selection is a checklist of 1; bulk is a checklist of many.

Side effects:

- The old `PortfolioStatementWizard.tsx` and its preview/template logic are deleted
- The "Generate portfolio statement" action on the client record (currently links to `/reports/portfolio-statement?client={clientId}`) is rewired: the new page reads `?client={uuid}` and pre-selects that one client in the checklist
- The `investor_updates` and `investor_update_recipients` tables are left in place — they're still used by the separate investor-update-letter workflow

---

## 4. Where the team triggers a bulk run from

**The page is `/reports/portfolio-statement`** (singular — keeps the existing route).

**The Reports landing page** at `/reports` is updated:
- "Portfolio Statement" action card sub-label changes from "For a single investor" to "For one or more investors"
- Card description updated to mention bulk
- Add a "Recent bulk runs" section listing the 5 most recent runs with their date, period, count, and success/failure summary

---

## 5. The bulk page — UI design

A single page with five sections, top to bottom:

### 5.1 Configure

**Period date** picker. Defaults to the most recent quarter-end:
- After 1 April → 31 March of current year
- After 1 July → 30 June of current year
- After 1 October → 30 September of current year
- After 1 January (and before 1 April) → 31 December of prior year

The team can change to any date. Display format under the picker: "31 March 2026 (Q1 end)".

### 5.2 Filter and select investors

**Top row — preset bar:**
- "Load preset" dropdown showing all saved presets (shared across the team). Selecting a preset replaces the current selection and filters with the preset's stored state.
- "Save selection as preset" button (enabled only when at least 1 investor is selected). Opens the Save Preset modal — see Section 6.
- "Manage presets" link (small, secondary) — opens the Manage Presets modal.

**Filter chips** (multi-select, applied as AND):

| Chip | Logic |
|---|---|
| All investors with active investments | `EXISTS (SELECT 1 FROM investments WHERE client_id = c.id AND shares_purchased > 0)` |
| Favourites only | `c.is_favourite = true` |
| Fund: Syndicate | `EXISTS (SELECT 1 FROM investments WHERE client_id = c.id AND fund_type = 'Syndicate')` |
| Fund: Multi Manager | `EXISTS (SELECT 1 FROM investments WHERE client_id = c.id AND fund_type = 'Multi Manager')` |
| Fund: EIS Fund | `EXISTS (SELECT 1 FROM investments WHERE client_id = c.id AND fund_type = 'EIS Fund')` |
| Hasn't been sent this quarter | No row in `documents` with `type='portfolio_statement'`, `client_id=c.id`, `period={selected period}`, `superseded=false` |
| Has email on file | `c.email IS NOT NULL` |

**Critical semantics of fund filters:**

Fund filters are at the **investor** level, not the **investment** level. If an investor has even one investment under the selected fund, they appear in the list — and when their statement is generated, **all their investments are included regardless of fund type**.

Example: an investor with both Syndicate and Multi Manager investments will appear if either "Fund: Syndicate" or "Fund: Multi Manager" is selected, and their generated PDF will contain their full portfolio (both Syndicate and Multi Manager holdings). The fund filter is purely a "who to include in this run" mechanism, not a "what content to include" mechanism.

Multiple fund chips are OR within the fund dimension (a client matches if they have investments under ANY selected fund), AND with the other filter chips. So "Fund: Syndicate + Fund: EIS Fund + Has email" means "clients who have at least one Syndicate or EIS investment AND have an email".

**Search bar**: substring match on `clients.full_name`.

**Table columns:**
- Checkbox
- Client name
- Email (greyed out if missing — flag with "No email")
- Fund types — small pills showing which fund types this investor has investments under (e.g. "Syndicate" + "EIS")
- Last statement (any period) — date of most recent non-superseded statement; "Never" if none
- Last for this period — date if a current statement exists for the selected period, "—" otherwise

**Header row:**
- "Select all visible" / "Deselect all" toggle (operates on filtered rows only)
- Counter: "X of Y selected"

**Behaviour:**
- Filter chips NARROW the visible list, they don't AUTO-select. Selection is always explicit.
- Default filter on page open: "All investors with active investments" + "Has email on file"
- Default selection on page open: empty (team picks)
- A selected row that becomes filtered-out (by changing filters) stays selected but appears greyed; the counter still reflects it

### 5.3 Pre-run review

Below the table, a live-updating summary card:

```
You're about to generate 47 statements for the period 31 March 2026.

8 of these investors already have a current statement for this period.
Those will be superseded (the old version preserved in the archive).

3 selected investors have no email on file.
You'll be able to download those statements but not email them.

Fund breakdown:
  Syndicate:     38 investors
  Multi Manager:  6 investors
  EIS Fund:       3 investors
  (Some investors hold across multiple funds)

[ Run bulk generation ]
```

### 5.4 Run progress (visible only while a run is in progress)

While a run is executing, this section replaces the configuration UI (or appears prominently above it):

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

Per-item progress table below with status icon, client name, status text, action (View / View error).

The team can:
- **Leave the page** — run continues in background. Progress resumes on return.
- **Cancel the run** — stops the queue. Already-generated statements remain.
- **Retry failed** — once the run is complete, creates a new run with only the failed items.

### 5.5 Past runs

Below the configuration UI (or on a separate tab on the same page), a table of completed/cancelled bulk runs:

| Started | Period | Count | Succeeded | Failed | Started by | Actions |
|---|---|---|---|---|---|---|
| 21 May 2026 14:32 | 31 March 2026 | 47 | 46 | 1 | erudd | [View details] |
| 21 February 2026 09:15 | 31 December 2025 | 45 | 45 | 0 | erudd | [View details] |

Clicking "View details" expands to show each item's status with View/Error links.

In-progress runs are pinned at the top with a "View progress" link.

---

## 6. Saved presets

Presets let the team save a frequently-used selection (e.g. "Quarterly Syndicate investors", "VIP clients") and load it next time with one click. **Presets are shared across the team** — anyone can see and use anyone else's presets.

### 6.1 What a preset stores

```typescript
{
  id: UUID,
  name: TEXT,                          // e.g. "Quarterly Syndicate investors"
  type: TEXT,                          // 'portfolio_statement' for now
  client_ids: UUID[],                  // The explicitly selected investors
  filter_state: JSONB,                 // Restores the filter chips on load
                                       // { activeInvestments: true, favouritesOnly: false,
                                       //   fundSyndicate: true, fundMultiManager: false, ... }
  created_by: UUID REFERENCES team_users(id),
  created_at: TIMESTAMPTZ,
  updated_at: TIMESTAMPTZ,
  updated_by: UUID REFERENCES team_users(id)
}
```

The combination of `client_ids` + `filter_state` is important. Loading a preset restores both: the filter chips are set so the team can see who else might be eligible (and decide to add them), and the explicit selection is applied so the team knows exactly who they last ran for.

### 6.2 Save Preset modal

Triggered by the "Save selection as preset" button. Shows:

- Title: "Save selection as preset"
- Field: "Preset name" — text input, required
- Subtext: "X investors selected. Shared with the team."
- Two buttons: "Cancel" / "Save preset"

Validation: name is required, must be unique among existing presets of the same type. Trying to save with a duplicate name surfaces an inline error: "A preset with this name already exists. Choose a different name or update the existing one."

### 6.3 Load preset behaviour

Selecting a preset from the "Load preset" dropdown:
1. Replaces the current filter chip state with the preset's `filter_state`
2. Replaces the current `selectedClientIds` with the preset's `client_ids`
3. Shows a small confirmation: "Loaded preset 'Quarterly Syndicate investors' — 47 investors selected"
4. The dropdown label updates to show which preset is loaded

If the team modifies the selection after loading a preset, the dropdown shows "Quarterly Syndicate investors (modified)" — making it clear the current state no longer matches the saved preset. Optional secondary action: "Save changes to this preset" or "Save as new preset".

### 6.4 Manage Presets modal

Triggered by the "Manage presets" link. Shows a list of all presets with:

- Name
- Number of investors in the preset
- Created by (team user name)
- Created date
- Last modified by + date (if different)
- Actions: Rename, Delete

**Renaming** — modal with single text field, same uniqueness check.

**Deleting** — requires confirmation: "Delete preset 'Quarterly Syndicate investors'? This cannot be undone. Other team members will no longer be able to use this preset."

The preset that's currently loaded into the page can be deleted — the page's current selection just becomes "unsaved" after the delete completes.

---

## 7. Filter logic and edge cases

### 7.1 "All investors with active investments"

Defined as: `EXISTS (SELECT 1 FROM investments WHERE client_id = c.id AND shares_purchased > 0)`.

If sell transactions reduce shares to 0, those investments don't count. If sells aren't implemented yet, the filter simplifies to: any client with at least one investment row.

### 7.2 Fund filter combinations

When multiple fund chips are selected, the logic is OR within funds:

```sql
EXISTS (
  SELECT 1 FROM investments
  WHERE client_id = c.id
    AND fund_type IN ('Syndicate', 'EIS Fund')
)
```

When NO fund chips are selected, the fund dimension is unfiltered — investors with any (or no) fund_type appear.

### 7.3 "Hasn't been sent this quarter"

Defined as: no row in `documents` where:
- `type = 'portfolio_statement'`
- `client_id = c.id`
- `period = {ISO date of selected period}`
- `superseded = false`

The `period` column must be populated for this to work. Verify on existing rows: if some are NULL, fall back to substring match on `filename` (which contains the period date in YYYY-MM-DD format).

### 7.4 Investors with no email

Can still be included. Generation works regardless. Only delivery (2A.1.5 composer) requires an email. Pre-run review surfaces the count so the team knows what they'll be left with.

---

## 8. The background job

This is JunoOS's first background-job pattern.

### 8.1 Polling architecture (Option A)

- Team clicks "Run". Server creates a `bulk_runs` row and `bulk_run_items` rows (one per investor, status='pending').
- Server returns immediately with the run ID.
- Client polls `POST /api/bulk-runs/{id}/tick` every 3 seconds.
- The polling endpoint picks up the next pending item, generates the statement, marks it complete or failed, and returns the updated progress.
- Multiple browsers polling in parallel pick different items via `SELECT ... FOR UPDATE SKIP LOCKED`.

**Caveat:** the run only advances while at least one browser tab is polling. If everyone closes the page, the run pauses. Reopening resumes it. For routine quarterly runs where someone's actively driving the work, this is fine.

Future Work 14.38 will move to Vercel Cron-triggered background functions once routine automation is needed.

### 8.2 Polling endpoint behaviour (`POST /api/bulk-runs/{id}/tick`)

1. Read the run row. If `status='cancelled'`, return early.
2. Find next `bulk_run_items` row where `status='pending'` for this run, locked with `FOR UPDATE SKIP LOCKED`.
3. If no pending items AND no in-progress items, mark run `completed`. Return.
4. Mark the item `in_progress` with `started_at`.
5. Call `generatePortfolioValuationStatement(client_id, period_date)`.
6. On success: mark item `succeeded`, store `document_id`.
7. On failure: mark item `failed`, store error message.
8. Return run summary: `{ pending, in_progress, succeeded, failed, currentItem }`.

**Critical:** errors from the generator are caught inside the tick, never propagated. Exceptions out of the polling endpoint would break the client's polling loop.

### 8.3 Page reload mid-run

On page load, the client checks for an in-progress run via the server-side loader. If found, render the progress view instead of the configuration view.

Multiple in-progress runs at once aren't blocked at the database level, but the UI nudges the team to wait for the current run to finish before starting another.

---

## 9. Database changes

Three new tables.

### 9.1 `bulk_runs`

```sql
CREATE TABLE bulk_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            TEXT NOT NULL CHECK (type IN ('portfolio_statement')),
  period_date     DATE,
  status          TEXT NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'completed', 'cancelled', 'failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  started_by      UUID REFERENCES team_users(id),
  total_items     INTEGER NOT NULL,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  preset_id       UUID,                  -- nullable; if the run was triggered from a preset, this records which one
  notes           TEXT
);

CREATE INDEX bulk_runs_status_idx ON bulk_runs (status, started_at DESC);
CREATE INDEX bulk_runs_type_idx ON bulk_runs (type, period_date);
```

### 9.2 `bulk_run_items`

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
  error_message TEXT,
  retry_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX bulk_run_items_run_status_idx ON bulk_run_items (bulk_run_id, status);
CREATE UNIQUE INDEX bulk_run_items_run_client_idx ON bulk_run_items (bulk_run_id, client_id);
```

### 9.3 `bulk_run_presets`

```sql
CREATE TABLE bulk_run_presets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          TEXT NOT NULL CHECK (type IN ('portfolio_statement')),
  name          TEXT NOT NULL,
  client_ids    UUID[] NOT NULL,
  filter_state  JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES team_users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES team_users(id)
);

CREATE UNIQUE INDEX bulk_run_presets_type_name_idx ON bulk_run_presets (type, name);
                -- Enforces unique preset names per type
CREATE INDEX bulk_run_presets_type_idx ON bulk_run_presets (type, created_at DESC);
```

### 9.4 RLS

All three tables get RLS policies. Team users can SELECT/INSERT/UPDATE all rows. DELETE allowed only on `bulk_run_presets` (presets can be deleted by team members; bulk runs stay forever for audit).

```sql
ALTER TABLE bulk_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_run_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_run_presets    ENABLE ROW LEVEL SECURITY;

-- bulk_runs and bulk_run_items: select/insert/update only (no delete)
CREATE POLICY "team can read bulk_runs"        ON bulk_runs        FOR SELECT TO authenticated USING (true);
CREATE POLICY "team can insert bulk_runs"      ON bulk_runs        FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team can update bulk_runs"      ON bulk_runs        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "team can read bulk_run_items"   ON bulk_run_items   FOR SELECT TO authenticated USING (true);
CREATE POLICY "team can insert bulk_run_items" ON bulk_run_items   FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team can update bulk_run_items" ON bulk_run_items   FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- bulk_run_presets: select/insert/update/delete
CREATE POLICY "team can read bulk_run_presets"   ON bulk_run_presets FOR SELECT TO authenticated USING (true);
CREATE POLICY "team can insert bulk_run_presets" ON bulk_run_presets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team can update bulk_run_presets" ON bulk_run_presets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team can delete bulk_run_presets" ON bulk_run_presets FOR DELETE TO authenticated USING (true);
```

---

## 10. The single-investor case

A bulk run with one investor selected works identically — checklist of 1, "Run bulk generation" with one item to process.

The Action menu on the client record links to `/reports/portfolio-statement?client={clientId}`. The new page reads the query param and pre-selects that one client on load. The team can then click "Run bulk generation" to process the single statement, or change the selection (adding more investors) before running.

Alternatively, the team can keep using the per-client Generate button on the Overview tab for one-off runs — that flow remains unchanged and is faster for ad-hoc single generations. Both paths are valid.

---

## 11. Acceptance criteria

To be verified on the preview before merging:

### Core bulk flow
1. The legacy `PortfolioStatementWizard.tsx` is deleted from the codebase.
2. `/reports/portfolio-statement` renders the new bulk page with all 5 sections.
3. Period date picker defaults to the most recent quarter-end.
4. The 7 filter chips all correctly narrow the investor list.
5. Filter chips don't auto-select — selection is always explicit.
6. Multiple fund chips combine with OR within the fund dimension.
7. Fund filters select investors but don't filter content — generated PDF includes all of an investor's holdings regardless of selected funds.
8. The pre-run review summary updates live as selection changes, including the fund breakdown.

### Background job
9. Clicking "Run bulk generation" creates a `bulk_runs` row + one `bulk_run_items` row per selected investor.
10. Progress UI shows running counts, currently-generating investor name, and item-by-item statuses.
11. Leaving the page and returning shows the in-progress run, not the configuration UI.
12. A failed statement is marked failed with the error message visible; other statements continue.
13. "Cancel run" sets `status='cancelled'`, stops the queue. Already-generated statements remain.
14. "Retry failed" creates a follow-on run with only the failed items.
15. Two browser tabs open on the same run parallelise tick processing without double-processing the same item.

### Statement output
16. Statements generated via bulk appear under Valuations on each client's Documents tab.
17. Existing statements for the same period are properly superseded.

### Past runs
18. Completed runs appear in the past-runs table with correct counts.

### Presets
19. Saving a preset writes a `bulk_run_presets` row with `client_ids`, `filter_state`, `created_by`.
20. Saved preset names must be unique among existing presets of the same type — duplicates show an inline error.
21. Loading a preset replaces both filter chips and selection, with a confirmation message.
22. Modifying after load shows "(modified)" indicator on the preset dropdown.
23. The Manage Presets modal lists all presets with rename and delete actions.
24. Renaming a preset enforces the same uniqueness check.
25. Deleting a preset requires explicit confirmation. The deleted preset is no longer in the dropdown.
26. A second team member can see and use presets created by the first.

### Existing flows
27. Action menu on client record opens the bulk page with that client pre-selected.
28. Reports landing page action card and Recent bulk runs section reflect the new functionality.

---

## 12. Future Work items to add to the Stage 2A spec

Append items 14.36-14.42:

```markdown
- **14.36 — Bulk delivery (Outlook integration era).** Once Outlook integration ships, add a "Bulk send" action after a bulk run completes. Composes and sends all emails in one operation, with per-client subject/body templates applied. Replaces the current "team copies each email manually after bulk generation" workflow.

- **14.37 — Per-client report frequency preferences.** Add `reporting_default_frequency` (quarterly/semi-annual/annual/never) and `reporting_default_include` (boolean) columns to `clients`. Bulk runs can respect these as a filter chip ("Due this quarter"). Investors marked "annual" only get statements in Q4 runs, etc.

- **14.38 — Scheduled bulk runs.** Vercel Cron-triggered quarterly runs that fire automatically on the day after each quarter-end. Requires graduating from Option A polling to Option B background functions.

- **14.39 — Bulk run notifications.** When a bulk run completes (or fails partway), notify the initiating team member via email or in-app banner. Removes the need to keep the browser open.

- **14.40 — Saved presets per-user fork.** Currently presets are team-shared. If multiple users develop conflicting "their own" presets, add an `is_private` flag or per-user namespacing.

- **14.41 — Bulk action audit logging.** When a bulk run starts/completes/cancels, record an entry in an `activity_log` table for compliance and audit.

- **14.42 — Bulk run for other document types.** The `bulk_runs.type` and `bulk_run_presets.type` columns already support this: extend the bulk runner to EIS certificates, dividend statements, tax vouchers. Each type defines its own per-item generator function; the queue mechanism is shared.
```

---

## 13. Implementation order (for the build prompt)

1. Spec file added to `docs/specs/`
2. Migration: create `bulk_runs`, `bulk_run_items`, `bulk_run_presets` tables + RLS policies
3. Future Work 14.36-14.42 appended to Stage 2A spec
4. Server actions: `createBulkRun`, `tickBulkRun`, `cancelBulkRun`, `retryFailedItems`, `savePreset`, `loadPreset`, `renamePreset`, `deletePreset`
5. API route: `POST /api/bulk-runs/[id]/tick`
6. New page component: `BulkStatementRunPage.tsx` with all 5 sections
7. Sub-components: `ConfigureSection`, `FilterAndSelectSection` (with filter chips, search, table), `PresetBar`, `SavePresetModal`, `ManagePresetsModal`, `PreRunReviewSection`, `BulkRunProgress`, `PastRunsTable`
8. Replace `PortfolioStatementWizard.tsx` import in `/reports/portfolio-statement/page.tsx`
9. Delete `PortfolioStatementWizard.tsx` and its dependencies
10. Update `Reports.tsx` action card copy + add Recent bulk runs section
11. Verify client record Actions menu correctly pre-selects via query param

---

*End of spec.*
