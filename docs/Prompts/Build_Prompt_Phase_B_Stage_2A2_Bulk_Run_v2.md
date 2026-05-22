# Build Prompt — Sub-stage 2A.2: Portfolio Statement Bulk Run (v2)

**Pre-read:** `docs/specs/Juno_Phase_B_Stage_2A2_Spec_v2.md` is the authoritative spec. Read it first; this doc tells you HOW to build, the spec defines WHAT.

**Branch:** `feat/portfolio-statement-bulk-run`
**Base:** `main`
**Database migrations:** YES — three new tables. Show SQL to Ed for approval before applying.

---

## Context

This is the largest 2A sub-stage. It does five things in one PR:

1. Replaces the legacy `PortfolioStatementWizard` with a new bulk-aware page
2. Introduces JunoOS's first background-job pattern (polling-based)
3. Adds 7 filter chips including 3 fund-type filters
4. Adds team-shared saved presets (save / load / rename / delete)
5. Surfaces a past-runs history table

Expect 10-14 commits. The PR is genuinely substantial. **The spec is long for good reason** — read Sections 5, 6, 8, 9 carefully before writing code.

---

## Files to read before writing anything

1. `src/app/(app)/reports/Reports.tsx` — landing page, action card copy needs updating
2. `src/app/(app)/reports/portfolio-statement/PortfolioStatementWizard.tsx` — the legacy code being replaced
3. `src/app/(app)/reports/portfolio-statement/page.tsx` — where the wizard is currently mounted
4. `src/services/document-generation/generatePortfolioValuationStatement.ts` — the per-investor generator from 2A.1
5. `src/app/(app)/clients/[id]/portfolioStatementActions.ts` — the server action wrapper
6. `src/app/(app)/clients/[id]/ClientRecord.tsx` — the Action menu currently linking to the legacy URL
7. `CLAUDE.md` — two-query-then-merge pattern (no PostgREST embedded joins)

Also useful: read `src/lib/templates.ts` from 2A.1.5 for the `formatPeriodDateUK` helper.

---

## Task 1 — Migration (Ed approves before apply)

Three tables, indexes, and RLS policies. SQL is in spec Section 9. Migration file: `supabase/migrations/20260521120000_bulk_runs.sql`.

After writing the SQL, **STOP and show Ed**. Bring the SQL across **verbatim** — don't "improve" or simplify. Three tables: `bulk_runs`, `bulk_run_items`, `bulk_run_presets`. Plus indexes. Plus RLS policies.

The unique index on `bulk_run_presets (type, name)` is the database-level enforcement of preset name uniqueness. The application also validates on save, but the index is the safety net.

---

## Task 2 — Server actions for bulk runs

New file: `src/app/(app)/reports/portfolio-statement/bulkRunActions.ts`

Server actions, each marked `'use server'`:

**`createBulkRun({ type, periodDate, clientIds, presetId?, notes? })`** → `{ runId: string }`
- Inserts one `bulk_runs` row with `type='portfolio_statement'`, `status='in_progress'`, `started_by=current user`, `total_items=clientIds.length`, `period_date=periodDate`, `preset_id=presetId ?? null`
- Inserts one `bulk_run_items` row per clientId with `status='pending'`
- Returns the run ID
- Rolls back if any clientId doesn't exist

**`tickBulkRun({ runId })`** → `{ status, summary, currentItem? }`
- Per spec Section 8.2
- `FOR UPDATE SKIP LOCKED` to pick the next pending item:
  ```sql
  SELECT id, client_id
  FROM bulk_run_items
  WHERE bulk_run_id = $1 AND status = 'pending'
  ORDER BY id
  LIMIT 1
  FOR UPDATE SKIP LOCKED
  ```
- Marks item `in_progress`, calls generator, marks `succeeded` or `failed`
- When no pending AND no in_progress items remain, marks run `completed`
- Returns `{ pending, in_progress, succeeded, failed, currentItem?: { clientName, status } }`
- **Catches generator exceptions internally** — never propagates. Marks the item failed with the error message and returns normally.
- Structured JSON logs for both success and failure paths: `bulk_run_item_succeeded`, `bulk_run_item_failed`

**`cancelBulkRun({ runId })`** → `{ ok: boolean }`
- Sets `bulk_runs.status='cancelled'`, `cancelled_at=now()`
- In-progress items aren't interrupted (let them finish)
- Pending items skipped on next tick because the run is cancelled

**`retryFailedItems({ runId })`** → `{ retryRunId: string }`
- Creates a NEW `bulk_runs` row (doesn't modify original)
- Copies the failed items from the original run as fresh pending items in the new run with `retry_count = original.retry_count + 1`
- Notes field: "Retry of run {originalRunId}"

---

## Task 3 — Server actions for presets

In the same `bulkRunActions.ts` file (or a separate `presetActions.ts` — your call):

**`savePreset({ type, name, clientIds, filterState })`** → `{ presetId: string }`
- Validates name is non-empty
- Inserts into `bulk_run_presets` with `created_by`, `updated_by` both set to current user
- The unique index will reject duplicate names — catch the error and return `{ error: "A preset with this name already exists." }`

**`listPresets({ type })`** → `Preset[]`
- Selects all presets of the given type, ordered by `created_at DESC`
- Joins to `team_users` for `created_by_name` and `updated_by_name` (two-query-then-merge pattern)

**`loadPreset({ presetId })`** → `{ name, clientIds, filterState }`
- Just a `SELECT * WHERE id = ?`
- Returns the data the page needs to restore state

**`renamePreset({ presetId, newName })`** → `{ ok: boolean } | { error: string }`
- Validates name is non-empty
- Updates `name`, `updated_at`, `updated_by`
- Catches unique-constraint error

**`deletePreset({ presetId })`** → `{ ok: boolean }`
- DELETE the row (RLS allows it per Section 9.4)

**`filterState` shape:**

```typescript
interface FilterState {
  activeInvestments: boolean
  favouritesOnly: boolean
  fundSyndicate: boolean
  fundMultiManager: boolean
  fundEisFund: boolean
  notSentThisQuarter: boolean
  hasEmail: boolean
}
```

Stored as JSONB in the database. Default value when no preset is loaded: `{ activeInvestments: true, favouritesOnly: false, fundSyndicate: false, fundMultiManager: false, fundEisFund: false, notSentThisQuarter: false, hasEmail: true }`.

---

## Task 4 — API route for polling

New file: `src/app/api/bulk-runs/[id]/tick/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { tickBulkRun } from '@/app/(app)/reports/portfolio-statement/bulkRunActions'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await tickBulkRun({ runId: params.id })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

The `tickBulkRun` action catches generator errors internally; this 500 path is only reached for true system errors (DB connection lost, etc).

---

## Task 5 — Server-side data loader

In `src/app/(app)/reports/portfolio-statement/page.tsx` (Server Component), fetch:

1. **All clients with enrichment for filtering.** Plain fields plus:
   - `has_active_investments: boolean`
   - `fund_types_held: string[]` — distinct fund types from the investor's investments (for the fund-type pills in the table)
   - `last_statement_iso: string | null` — date of most recent non-superseded statement (any period)
   - `current_statement_periods: string[]` — array of ISO dates for which a current (non-superseded) statement exists

2. **Current in-progress bulk run** (if any) — to decide between rendering progress view vs config view

3. **Past 20 bulk runs** for the past-runs section

4. **All presets** for the "Load preset" dropdown

Use two-query-then-merge throughout. Example for client enrichment:

```typescript
const { data: clients } = await supabase
  .from('clients')
  .select('id, full_name, email, is_favourite')
  .order('full_name')

const { data: investments } = await supabase
  .from('investments')
  .select('client_id, shares_purchased, fund_type')

const { data: existingStatements } = await supabase
  .from('documents')
  .select('client_id, period, created_at')
  .eq('type', 'portfolio_statement')
  .eq('superseded', false)

// Build lookup maps
const activeByClient = new Map<string, boolean>()
const fundsByClient = new Map<string, Set<string>>()
for (const inv of investments ?? []) {
  if ((inv.shares_purchased ?? 0) > 0) {
    activeByClient.set(inv.client_id, true)
  }
  if (inv.fund_type) {
    if (!fundsByClient.has(inv.client_id)) {
      fundsByClient.set(inv.client_id, new Set())
    }
    fundsByClient.get(inv.client_id)!.add(inv.fund_type)
  }
}

const lastStatementByClient = new Map<string, string>()
const periodsByClient = new Map<string, Set<string>>()
for (const doc of existingStatements ?? []) {
  // Track most recent
  const existing = lastStatementByClient.get(doc.client_id)
  if (!existing || doc.created_at > existing) {
    lastStatementByClient.set(doc.client_id, doc.created_at)
  }
  if (doc.period) {
    if (!periodsByClient.has(doc.client_id)) {
      periodsByClient.set(doc.client_id, new Set())
    }
    periodsByClient.get(doc.client_id)!.add(doc.period)
  }
}

const enriched = clients.map(c => ({
  ...c,
  has_active_investments: activeByClient.get(c.id) ?? false,
  fund_types_held: [...(fundsByClient.get(c.id) ?? [])],
  last_statement_iso: lastStatementByClient.get(c.id) ?? null,
  current_statement_periods: [...(periodsByClient.get(c.id) ?? [])],
}))
```

---

## Task 6 — Client component skeleton

New file: `src/app/(app)/reports/portfolio-statement/BulkStatementRunPage.tsx`

```typescript
'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
// ...other imports

interface BulkStatementRunPageProps {
  initialClients: EnrichedClient[]
  currentInProgressRun: BulkRunSummary | null
  pastRuns: BulkRunSummary[]
  presets: Preset[]
}

export default function BulkStatementRunPage(props: BulkStatementRunPageProps) {
  const searchParams = useSearchParams()
  const presetClientId = searchParams.get('client')

  const [periodDate, setPeriodDate] = useState(() => defaultQuarterEnd())
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (presetClientId) return new Set([presetClientId])
    return new Set()
  })
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null)
  const [isPresetModified, setIsPresetModified] = useState(false)
  const [runId, setRunId] = useState<string | null>(props.currentInProgressRun?.id ?? null)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [manageModalOpen, setManageModalOpen] = useState(false)

  // ... filter application logic per Task 7

  if (runId) {
    return <BulkRunProgress runId={runId} onDone={() => setRunId(null)} />
  }

  return (
    <>
      <ConfigureSection periodDate={periodDate} onChange={setPeriodDate} />
      <PresetBar
        presets={props.presets}
        loadedPresetId={loadedPresetId}
        isModified={isPresetModified}
        selectedCount={selectedIds.size}
        onLoad={handleLoadPreset}
        onSave={() => setSaveModalOpen(true)}
        onManage={() => setManageModalOpen(true)}
      />
      <FilterAndSelectSection
        clients={filteredClients}
        filterState={filterState}
        onFilterChange={(newState) => {
          setFilterState(newState)
          if (loadedPresetId) setIsPresetModified(true)
        }}
        search={search}
        onSearchChange={setSearch}
        selectedIds={selectedIds}
        onSelectionChange={(newIds) => {
          setSelectedIds(newIds)
          if (loadedPresetId) setIsPresetModified(true)
        }}
      />
      <PreRunReviewSection
        selectedClients={selectedFullObjects}
        periodDate={periodDate}
        onRun={handleRunBulk}
      />
      <PastRunsTable runs={props.pastRuns} />
      {saveModalOpen && (
        <SavePresetModal
          selectedCount={selectedIds.size}
          onSave={handleSavePreset}
          onClose={() => setSaveModalOpen(false)}
        />
      )}
      {manageModalOpen && (
        <ManagePresetsModal
          presets={props.presets}
          onRename={handleRenamePreset}
          onDelete={handleDeletePreset}
          onClose={() => setManageModalOpen(false)}
        />
      )}
    </>
  )
}
```

---

## Task 7 — Filter application logic

```typescript
const filteredClients = useMemo(() => {
  let result = props.initialClients

  if (filterState.activeInvestments) {
    result = result.filter(c => c.has_active_investments)
  }
  if (filterState.favouritesOnly) {
    result = result.filter(c => c.is_favourite)
  }

  // Fund filters — OR within the fund dimension
  const fundFiltersActive =
    filterState.fundSyndicate ||
    filterState.fundMultiManager ||
    filterState.fundEisFund
  if (fundFiltersActive) {
    const selectedFunds: string[] = []
    if (filterState.fundSyndicate) selectedFunds.push('Syndicate')
    if (filterState.fundMultiManager) selectedFunds.push('Multi Manager')
    if (filterState.fundEisFund) selectedFunds.push('EIS Fund')

    result = result.filter(c =>
      c.fund_types_held.some(f => selectedFunds.includes(f))
    )
  }

  if (filterState.hasEmail) {
    result = result.filter(c => c.email != null && c.email.trim() !== '')
  }

  if (filterState.notSentThisQuarter) {
    result = result.filter(c => !c.current_statement_periods.includes(periodDate))
  }

  if (search.trim()) {
    const s = search.toLowerCase()
    result = result.filter(c => c.full_name.toLowerCase().includes(s))
  }

  return result
}, [props.initialClients, filterState, search, periodDate])
```

---

## Task 8 — Pre-run review section

The summary card shows the fund breakdown of currently-selected investors. Calculate it from the selected clients' `fund_types_held` arrays:

```typescript
const fundBreakdown = useMemo(() => {
  const counts = { Syndicate: 0, 'Multi Manager': 0, 'EIS Fund': 0 }
  let multipleFunds = 0
  for (const c of selectedFullObjects) {
    let countedForMultiple = false
    for (const fund of c.fund_types_held) {
      if (counts[fund as keyof typeof counts] != null) {
        counts[fund as keyof typeof counts]++
      }
    }
    if (c.fund_types_held.length > 1 && !countedForMultiple) {
      multipleFunds++
      countedForMultiple = true
    }
  }
  return { counts, multipleFunds }
}, [selectedFullObjects])
```

Display per the spec:
- Three count lines per fund
- "(Some investors hold across multiple funds)" caveat if any investor has more than one fund_type

Also calculate the "would supersede X existing statements" and "Y selected investors have no email" counts.

---

## Task 9 — Background job UI (polling)

`BulkRunProgress` component handles the polling loop:

```typescript
function BulkRunProgress({ runId, onDone }: Props) {
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      if (cancelled) return
      try {
        const res = await fetch(`/api/bulk-runs/${runId}/tick`, { method: 'POST' })
        const data = await res.json()
        setProgress(data)
        if (data.status === 'completed' || data.status === 'cancelled') {
          return  // stop polling
        }
      } catch (e) {
        console.error('Tick failed', e)
        // Continue polling — transient errors shouldn't kill the loop
      }
      if (!cancelled) {
        timeoutId = setTimeout(poll, 3000)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [runId])

  // ... render progress UI
}
```

**Don't use `setInterval`.** Use recursive `setTimeout` with cancellation flag, per the anti-patterns section below.

---

## Task 10 — Save Preset and Manage Presets modals

**SavePresetModal** — simple modal with one text field:
- Title: "Save selection as preset"
- Field: name input, autofocus
- Subtext: "{N} investors selected. Shared with the team."
- Cancel / Save buttons
- On save: call `savePreset` action; on `error` field returned, show inline error; on success, close modal and refresh presets list via `router.refresh()` or parent callback

**ManagePresetsModal** — list view with row actions:
- Title: "Manage presets"
- Table of presets: Name, Investor count, Created by, Created date, Last modified, Actions (Rename / Delete)
- Rename → inline edit OR small popover with text field
- Delete → confirmation dialog: "Delete preset '{name}'? This cannot be undone. Other team members will no longer be able to use this preset."

Both modals follow the same visual style as the 2A.1.5 decision/composer modals — CSS variables for theming, no fixed colours.

---

## Task 11 — Reports landing page updates

In `src/app/(app)/reports/Reports.tsx`:

- Portfolio Statement card sub-label: "For one or more investors"
- Card description: "Generate statements for one investor or for many at once. Filter by fund type, favourites, or who hasn't been sent yet."
- Add a "Recent bulk runs" section pulling from `bulk_runs` ordered by `started_at DESC LIMIT 5`. Each row: started timestamp, period, count, X succeeded / Y failed.

Leave the Investor Update card unchanged.

---

## Task 12 — Delete the legacy wizard

Once the new page is wired in:

- Delete `src/app/(app)/reports/portfolio-statement/PortfolioStatementWizard.tsx`
- Delete any helper files only used by the wizard
- Search for `PortfolioStatementWizard` imports — there should be no remaining references after the page swap

Don't drop the `investor_updates` and `investor_update_recipients` tables — they're still used by the investor update letter workflow.

---

## Task 13 — Future Work items

Append items 14.36-14.42 (per spec Section 12) to `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md`. Wording is in the spec — copy verbatim.

---

## Acceptance for this PR

All 28 criteria in spec Section 11 must pass on the preview.

**Critical tests:**

1. **Database migrations applied correctly** — verify all three tables exist with expected columns and indexes via Supabase MCP.
2. **Fund filter semantics** — pick a test client with both Syndicate and Multi Manager investments. Select only "Fund: Syndicate". Verify the client appears in the list. Run the bulk on them. Verify the generated PDF includes BOTH their Syndicate AND Multi Manager holdings.
3. **Two browsers parallel processing** — open the same in-progress run in two tabs, watch them tick in parallel without double-processing.
4. **Intentionally failed generation** — break one investor's data (or simulate via a mock), verify only that item fails, others continue.
5. **Page reload mid-run** — close the page, reopen it, confirm progress view loads.
6. **Supersedure** — run bulk for a period that already has statements; old rows marked `superseded=true`, new rows are current.
7. **Preset save/load round trip** — save a preset, modify the selection, reload the preset, verify selection and filters restore exactly.
8. **Preset uniqueness** — try to save a preset with a name that already exists, verify the inline error.
9. **Preset shared visibility** — sign in as second team user, see the preset created by the first.
10. **Action menu pre-select** — from a client record, click "Generate portfolio statement", verify the bulk page loads with that one client pre-selected.

---

## Anti-patterns to avoid

- **Don't generate PDFs in `createBulkRun`.** That action just inserts queue rows. Generation happens in `tickBulkRun`.
- **Don't let exceptions escape `tickBulkRun`.** Catch and mark the item failed.
- **Don't omit `SKIP LOCKED`.** Without it, concurrent ticks block waiting for each other instead of picking different items.
- **Don't fetch the full investor list inside `tickBulkRun`.** Each tick processes one item — just look up that one client.
- **Don't add a "send all emails" button.** Bulk sending waits for Outlook integration. Per Future Work 14.36.
- **Don't use `setInterval` for polling.** Use recursive `setTimeout` with a cancellation flag — `setInterval` keeps firing even when responses are slow, leading to overlapping requests.
- **Don't add a "delete bulk run" action.** No DELETE policies on bulk_runs/bulk_run_items — historical runs stay forever for audit.
- **Don't auto-start a bulk run on page load.** Always require an explicit click.
- **Don't fetch presets only client-side.** Load them server-side in the loader so they're available on first paint.
- **Don't allow saving a preset with zero investors selected.** Validate on both client and server.
- **Don't allow editing a preset's `client_ids` directly on the page** — that would silently change the saved selection. Editing a preset is a deliberate "Save changes to this preset" action; otherwise loaded presets are read-only until saved.

---

## Workflow

1. Branch `feat/portfolio-statement-bulk-run` from `main`
2. Commit 1: Add spec file (`docs/specs/Juno_Phase_B_Stage_2A2_Spec_v2.md`)
3. Commit 2: Append Future Work items 14.36-14.42 to Stage 2A spec
4. Commit 3: Migration SQL — **STOP and show Ed**
5. Ed approves → apply migration via Supabase MCP
6. Commit 4: Server actions for bulk runs (`bulkRunActions.ts`)
7. Commit 5: Server actions for presets
8. Commit 6: API polling route
9. Commit 7: Server-side data loader updates to page.tsx
10. Commit 8: `BulkStatementRunPage.tsx` + sub-components (ConfigureSection, FilterAndSelectSection, PreRunReviewSection, BulkRunProgress, PastRunsTable)
11. Commit 9: PresetBar, SavePresetModal, ManagePresetsModal
12. Commit 10: `Reports.tsx` updates + Recent bulk runs section
13. Commit 11: Delete legacy `PortfolioStatementWizard.tsx`
14. Push, write PR description, **stop and wait for Ed.**

Expect possibly 12-15 commits total once preview review surfaces issues. The first push should hit at least these 11.

---

*End of build prompt.*
