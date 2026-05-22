# Build Prompt — Sub-stage 2A.2: Portfolio Statement Bulk Run

**Pre-read:** `docs/specs/Juno_Phase_B_Stage_2A2_Spec_v1.md` is the authoritative spec. This document tells you HOW to build it.

**Branch:** `feat/portfolio-statement-bulk-run`
**Base:** `main` (Sub-stages 2A.1 and 2A.1.5 already merged)
**Database migrations:** YES — two new tables and RLS policies. Show SQL to Ed for approval before applying.

---

## Context

The team needs a way to generate portfolio statements for ~150 investors in one run, rather than clicking Generate 150 times. This sub-stage adds:

1. A new bulk-aware page at `/reports/portfolio-statement` that replaces the legacy 3-step `PortfolioStatementWizard`
2. A background-job pattern (the first in JunoOS) using two new tables and a polling endpoint
3. Filter chips, an investor checklist, a pre-run review, and a live progress view

The legacy wizard goes away entirely. Its generation path was through a different (now stale) code path — the new page uses the same `generatePortfolioValuationStatement` function 2A.1 built.

---

## Files to read before writing anything

1. **`src/app/(app)/reports/Reports.tsx`** — the Reports landing page. Action cards will need their copy updated.
2. **`src/app/(app)/reports/portfolio-statement/PortfolioStatementWizard.tsx`** — the legacy wizard. Understand what it does so you know exactly what's being replaced.
3. **`src/app/(app)/reports/portfolio-statement/page.tsx`** — wherever the wizard is mounted; this is where the new page goes.
4. **`src/services/document-generation/generatePortfolioValuationStatement.ts`** — the generator function 2A.1 built. The bulk runner calls this once per investor.
5. **`src/app/(app)/clients/[id]/portfolioStatementActions.ts`** — the server action wrapper for single-investor generation. The bulk runner can either call the underlying function directly or use this action.
6. **`src/app/(app)/clients/[id]/ClientRecord.tsx`** — the Action menu's "Generate portfolio statement" item. Verify what URL it currently goes to and whether it needs rewiring.
7. **`CLAUDE.md`** — for the two-query-then-merge Supabase pattern (no PostgREST embedded joins).

---

## Task 1 — Migrations (Ed approves before apply)

Two tables and their RLS policies. SQL is in spec Section 8. Migration file goes in `supabase/migrations/`.

Filename: `20260521120000_bulk_runs.sql`

After writing the SQL, **STOP and show Ed before applying**. Use the same pattern as previous stages.

The SQL is verbatim from the spec — don't rewrite or "improve" it. Bring it across exactly. Two tables (`bulk_runs`, `bulk_run_items`) plus indexes plus RLS policies.

---

## Task 2 — Server actions

New file: `src/app/(app)/reports/portfolio-statement/bulkRunActions.ts`

Server actions, each marked `'use server'`:

**`createBulkRun({ type, periodDate, clientIds, notes? })`** → `{ runId: string }`
- Inserts one row into `bulk_runs` with `type='portfolio_statement'`, `status='in_progress'`, `started_by=current user's id`, `total_items=clientIds.length`, `period_date=periodDate`
- Inserts one row into `bulk_run_items` per clientId, status='pending'
- Returns the run ID
- Fails (and rolls back) if any clientId doesn't exist

**`tickBulkRun({ runId })`** → `{ status, summary, currentItem? }`
- Implements the spec Section 7.2 behaviour
- Uses `FOR UPDATE SKIP LOCKED` to pick the next pending item:
  ```sql
  SELECT id, client_id
  FROM bulk_run_items
  WHERE bulk_run_id = $1 AND status = 'pending'
  ORDER BY id
  LIMIT 1
  FOR UPDATE SKIP LOCKED
  ```
- Marks the item `in_progress`, calls the generator, marks `succeeded` or `failed`
- If no pending items remain and no in_progress items exist, marks the run `completed`
- Returns current summary: `{ pending, in_progress, succeeded, failed }`
- Logs structured errors (per the pattern Stage 6c/2A.1 established) — JSON log lines with event names like `bulk_run_item_failed`

**`cancelBulkRun({ runId })`** → `{ ok: boolean }`
- Sets `bulk_runs.status = 'cancelled'`, `cancelled_at = now()`
- Already-in-progress items aren't interrupted (let them finish naturally)
- Pending items stay pending — but on next tick they're skipped because the run is cancelled

**`retryFailedItems({ runId })`** → `{ retryRunId: string }`
- Creates a NEW `bulk_runs` row (not modifying the original)
- Copies the failed items from the original run as fresh pending items in the new run
- Sets `bulk_run_items.retry_count = original.retry_count + 1` on each copy
- Notes field includes "Retry of run {originalRunId}"

**Important error-handling rule:** if `generatePortfolioValuationStatement` throws inside `tickBulkRun`, catch it, mark the item failed with the error message, return normally. **Never propagate exceptions out of `tickBulkRun`** — that would surface as a 500 to the polling client and break the polling loop.

---

## Task 3 — API route for polling

New file: `src/app/api/bulk-runs/[id]/tick/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { tickBulkRun } from '@/app/(app)/reports/portfolio-statement/bulkRunActions'

export async function POST(
  req: NextRequest,
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

Verify auth is handled — if the server action calls `createServerClient()` correctly the polling endpoint will be auth-scoped automatically.

---

## Task 4 — Replace the page at `/reports/portfolio-statement`

Existing file: `src/app/(app)/reports/portfolio-statement/page.tsx`. Replace its body so it renders the new component, not `PortfolioStatementWizard`.

New file: `src/app/(app)/reports/portfolio-statement/BulkStatementRunPage.tsx`

Client component (`'use client'`). High-level structure:

```typescript
export default function BulkStatementRunPage({ initialClients, currentInProgressRun }) {
  const [periodDate, setPeriodDate] = useState(defaultQuarterEnd())
  const [filters, setFilters] = useState({
    activeInvestments: true,
    favouritesOnly: false,
    notSentThisQuarter: false,
    hasEmail: true,
  })
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [runId, setRunId] = useState<string | null>(currentInProgressRun?.id ?? null)

  // If there's an in-progress run, show progress instead of config
  if (runId) {
    return <BulkRunProgress runId={runId} onClose={() => setRunId(null)} />
  }

  return (
    <>
      <ConfigureSection periodDate={periodDate} onChange={setPeriodDate} />
      <SelectInvestorsSection
        clients={filteredClients}
        filters={filters}
        onFiltersChange={setFilters}
        search={search}
        onSearchChange={setSearch}
        selected={selectedClientIds}
        onSelectionChange={setSelectedClientIds}
      />
      <PreRunReviewSection
        selectedClients={selectedFullObjects}
        periodDate={periodDate}
        onRun={handleRunBulk}
      />
      <PastRunsTable runs={...} />
    </>
  )
}
```

**Sub-components to build:**

- `ConfigureSection` — period date picker with default. Helper function `defaultQuarterEnd()` returns the appropriate quarter-end date based on `new Date()`.
- `SelectInvestorsSection` — table with checkboxes, filter chips, search bar, sticky header row with "Select all visible" toggle.
- `PreRunReviewSection` — live-updating summary card with the counts and the "Run bulk generation" button.
- `BulkRunProgress` — progress bar, currently-generating display, item table with statuses, Cancel/Retry buttons. Polls every 3 seconds.
- `PastRunsTable` — shows recent runs from `bulk_runs` table. Expand to view items.

**Polling logic** in `BulkRunProgress`:

```typescript
useEffect(() => {
  let cancelled = false
  let timeoutId: NodeJS.Timeout | null = null

  async function poll() {
    if (cancelled) return
    try {
      const res = await fetch(`/api/bulk-runs/${runId}/tick`, { method: 'POST' })
      const data = await res.json()
      setProgress(data)
      if (data.status === 'completed' || data.status === 'cancelled') {
        // Stop polling
        return
      }
    } catch (e) {
      // Log but continue polling — transient errors shouldn't kill the loop
      console.error('Tick failed', e)
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
```

**The page should server-side fetch the client list and the in-progress run on initial load.** Use Server Component or `loader` pattern — same as Stage 6c/2A.1 did. The Client component receives `initialClients` and `currentInProgressRun` as props.

---

## Task 5 — Filter logic implementation

In the page component:

```typescript
const filteredClients = useMemo(() => {
  let result = initialClients

  if (filters.activeInvestments) {
    result = result.filter(c => c.has_active_investments)
  }
  if (filters.favouritesOnly) {
    result = result.filter(c => c.is_favourite)
  }
  if (filters.hasEmail) {
    result = result.filter(c => c.email != null)
  }
  if (filters.notSentThisQuarter) {
    const periodIso = periodDate.toISOString().substring(0, 10)
    result = result.filter(c => !c.has_current_statement_for_period?.[periodIso])
  }
  if (search) {
    const s = search.toLowerCase()
    result = result.filter(c => c.full_name.toLowerCase().includes(s))
  }
  return result
}, [initialClients, filters, search, periodDate])
```

**The "has_active_investments" and "has_current_statement_for_period" flags need to be computed server-side** and passed in as part of each client object. Build them in the page's data loader:

```typescript
// In the loader / Server Component
const { data: clients } = await supabase.from('clients').select('id, full_name, email, is_favourite').order('full_name')
const { data: investments } = await supabase.from('investments').select('client_id, shares_purchased')
const { data: existingStatements } = await supabase
  .from('documents')
  .select('client_id, period')
  .eq('type', 'portfolio_statement')
  .eq('superseded', false)

// Two-query-then-merge per CLAUDE.md
const activeByClient = new Map<string, boolean>()
for (const inv of investments) {
  if (inv.shares_purchased > 0) activeByClient.set(inv.client_id, true)
}

const statementsByClient = new Map<string, Set<string>>()
for (const doc of existingStatements) {
  if (!statementsByClient.has(doc.client_id)) {
    statementsByClient.set(doc.client_id, new Set())
  }
  if (doc.period) statementsByClient.get(doc.client_id)!.add(doc.period)
}

const enrichedClients = clients.map(c => ({
  ...c,
  has_active_investments: activeByClient.get(c.id) ?? false,
  has_current_statement_for_period: Object.fromEntries(
    [...(statementsByClient.get(c.id) ?? [])].map(p => [p, true])
  ),
}))
```

---

## Task 6 — Default quarter-end helper

```typescript
function defaultQuarterEnd(today: Date = new Date()): string {
  // Returns 'YYYY-MM-DD' of the most recent quarter-end
  const year = today.getFullYear()
  const month = today.getMonth() // 0-indexed

  if (month >= 9) return `${year}-09-30`  // Q3 end (after Oct 1)
  if (month >= 6) return `${year}-06-30`  // Q2 end (after Jul 1)
  if (month >= 3) return `${year}-03-31`  // Q1 end (after Apr 1)
  return `${year - 1}-12-31`              // Q4 end of prior year (before Apr 1)
}

function labelForQuarter(periodDate: string): string {
  const [y, m, d] = periodDate.split('-').map(Number)
  const quarter = m === 3 ? 'Q1' : m === 6 ? 'Q2' : m === 9 ? 'Q3' : m === 12 ? 'Q4' : null
  return quarter ? `${formatPeriodDateUK(periodDate)} (${quarter} end)` : formatPeriodDateUK(periodDate)
}
```

`formatPeriodDateUK` already exists in `src/lib/templates.ts` from 2A.1.5.

---

## Task 7 — Reports landing page updates

In `src/app/(app)/reports/Reports.tsx`:

Update the Portfolio Statement action card:
- Sub-label from "For a single investor" to "For one or more investors"
- Description updated to mention bulk: e.g. "Generate statements for one investor or for many at once. Includes filtering by activity, favourites, or unsent."

Leave the Investor Update card unchanged.

The "Recent" section currently lists rows from `investor_updates` table. For now leave it as-is (it'll continue to show investor update letters, just not portfolio statements). A later task could pull from `bulk_runs` table too.

Update the Reports landing page to also have a small "Recent bulk runs" section if there are any — pull from `bulk_runs` ordered by `started_at DESC LIMIT 5`. Optional — if the page gets cluttered, leave it for a follow-up.

---

## Task 8 — Delete the legacy wizard

Once the new page is wired in and rendering correctly:

- Delete `src/app/(app)/reports/portfolio-statement/PortfolioStatementWizard.tsx`
- Delete any helper files only used by the wizard (e.g. PDF preview templates if separate)
- Search the codebase for imports of `PortfolioStatementWizard` and remove them
- Don't delete the `investor_updates` and `investor_update_recipients` tables — they're still used by the investor update letter workflow

---

## Task 9 — Client record Action menu

In `src/app/(app)/clients/[id]/ClientRecord.tsx`, the Action menu has "Generate portfolio statement" linking to `/reports/portfolio-statement?client={clientId}`.

After this sub-stage, leave this link in place — the new page can accept a `?client={uuid}` query param and pre-select that one client in the checklist. This is the simplest path. Alternative: change the link to scroll to the Portfolio statement card on the Overview tab instead. **Use the query-param pre-select approach** — keeps both single-client and bulk flows reachable from the same page.

Add handling in `BulkStatementRunPage`:

```typescript
// On mount, check URL params
const searchParams = useSearchParams()
const initialClientId = searchParams.get('client')
useEffect(() => {
  if (initialClientId) {
    setSelectedClientIds(new Set([initialClientId]))
  }
}, [initialClientId])
```

---

## Task 10 — Future Work items

Append items 14.36-14.42 (per spec Section 12) to `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md`. Verbatim — exact wording in the spec.

---

## Acceptance for this PR

The 18 criteria in spec Section 11 must all pass on the preview.

**Critical things to verify carefully:**

1. **Database migrations applied correctly** — verify table structures via Supabase MCP after apply.
2. **A bulk run with two browsers open** — confirm both ticks parallelise and don't double-process the same item (the `FOR UPDATE SKIP LOCKED` test).
3. **An intentionally failed generation** — temporarily make one investor's data invalid (e.g. drop their email or break the dividend pro-rata), run bulk, verify that one item shows as failed with the error message, other items continue successfully.
4. **Page reload mid-run** — close the page, reopen it, confirm the progress view loads (not the config view) and the queue keeps ticking.
5. **Supersedure** — run bulk for a period that already has statements, verify the old rows are marked `superseded=true` and the new rows are the current ones (Documents tab shows the new ones only).
6. **Single-investor case via Action menu** — go to a client record, click "Generate portfolio statement", verify the bulk page loads with that one client pre-selected.

---

## Anti-patterns to avoid

- **Don't generate PDFs in `createBulkRun`.** That action just inserts the queue rows and returns. Generation happens in `tickBulkRun`.
- **Don't propagate exceptions from `tickBulkRun`.** Catch and mark the item failed.
- **Don't use `SELECT ... FOR UPDATE` without `SKIP LOCKED`.** Without `SKIP LOCKED`, concurrent ticks block waiting for each other instead of picking different items.
- **Don't fetch the full investor list inside `tickBulkRun`.** Each tick processes one item — just look up that one client.
- **Don't add a "send all emails" button to this PR.** Bulk sending waits for Outlook integration. Per Future Work 14.36.
- **Don't use `setInterval` for polling.** Use `setTimeout` recursively with a cancellation flag — `setInterval` keeps firing even when the response is slow, leading to overlapping requests.
- **Don't add a "delete bulk run" action.** No DELETE policies on the tables — historical runs stay forever for audit.
- **Don't auto-start a bulk run on page load.** Always require an explicit click.

---

## Workflow

1. Branch: `feat/portfolio-statement-bulk-run` from `main`
2. Commit 1: Add spec file (`docs/specs/Juno_Phase_B_Stage_2A2_Spec_v1.md`)
3. Commit 2: Append Future Work items 14.36-14.42 to Stage 2A spec
4. Commit 3: Migration SQL file in `supabase/migrations/` — **STOP and show Ed**
5. After Ed approves: apply migration via Supabase MCP
6. Commit 4: Server actions (`bulkRunActions.ts`)
7. Commit 5: API polling route
8. Commit 6: New page component (`BulkStatementRunPage.tsx` + sub-components)
9. Commit 7: Update `Reports.tsx` action card copy
10. Commit 8: Delete legacy `PortfolioStatementWizard.tsx`
11. Push, write PR description, **stop and wait for Ed.**

This is the largest 2A sub-stage by far. Expect 8-12 commits, possibly more if preview review surfaces issues (which it usually does).

---

*End of build prompt.*
