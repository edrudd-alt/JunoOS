# Ninth follow-up to PR #11 — Hide superseded documents + housekeeping

**Branch:** `feat/portfolio-statement-generation` (still PR #11)
**Status:** One UI rule change, one migration file to capture the storage policy applied via MCP, and a Future Work note.

---

## The display rule we're enforcing

**Hide superseded documents entirely from the Documents tab and the Portfolio statement card on the Overview tab.** Show only the latest non-superseded version per `(client, period)`.

In plain English: when Ed regenerates a portfolio statement for the same period date, the older version is marked superseded and disappears from the UI. The file still exists in storage (renamed with `_superseded_YYYY-MM-DD-HHMMSS` suffix) and the row still exists in the database — but it doesn't render anywhere in the team's interface.

This deviates from the deal-page Documents tab pattern (Section 8.2 of `Juno_Deal_Page_Restructure_Spec_v3_6.md`) which has a "Final only (default) / All docs" toggle. Ed's decision for the client record is the stricter "hide entirely" rule. Noted in Future Work item 14.X (see Task 4).

---

## Task 1 — Update the Portfolio statement card query

File: probably `src/app/(app)/clients/[id]/_components/GenerateStatementSection.tsx` (or wherever the existing-statements list is fetched — `getStatementsForClient` action).

Find the query that loads existing statements for the client. Add `.eq('superseded', false)` to the filter chain.

```typescript
// Before
const { data: statements } = await supabase
  .from('documents')
  .select('id, filename, created_at, period')
  .eq('client_id', clientId)
  .eq('type', 'portfolio_statement')
  .order('created_at', { ascending: false })

// After
const { data: statements } = await supabase
  .from('documents')
  .select('id, filename, created_at, period')
  .eq('client_id', clientId)
  .eq('type', 'portfolio_statement')
  .eq('superseded', false)  // ← add this
  .order('created_at', { ascending: false })
```

After this change, the existing-statements list on the Overview card shows only the current statements, one per period.

---

## Task 2 — Update the Documents tab query

File: probably `src/app/(app)/clients/[id]/_tabs/InvestmentDocsTab.tsx` (or wherever the tab fetches documents for the tree).

The Documents tab probably has a query that loads all `documents` for the client across all types. Add `.eq('superseded', false)` to it.

If the documents tab also has a 14th parallel query somewhere else (e.g. in `page.tsx` for the tab count badge or similar), update that too.

After this change, the Documents tab tree shows only the current versions of every document type. Superseded versions are hidden.

### One thing to watch for

If there are other document types where superseded handling differs (e.g. application forms where the team needs to see version history), this blanket `.eq('superseded', false)` would hide those too. That's likely fine — most document types follow the "current version only" convention — but worth scanning the existing tree-rendering code to see if it has any type-specific overrides.

If there's a per-type override, leave it alone. The change is to the default filter only.

---

## Task 3 — Add a migration file for the storage UPDATE policy

Earlier, the storage UPDATE policy on `storage.objects` for the documents bucket was applied directly via Supabase MCP (it was blocking the supersedure rename). The repo doesn't have a migration file capturing this change.

Create a new migration file: `supabase/migrations/<NEW_TIMESTAMP>_documents_bucket_update_policy.sql` (use a timestamp after the most recent migration in the folder). Contents:

```sql
-- Storage UPDATE policy for the documents bucket.
-- Required by supabase.storage.move() during document supersedure (e.g. portfolio
-- statement regeneration, transaction statement regeneration). Without this policy,
-- move() fails with "Object not found" because RLS denies the underlying UPDATE
-- on storage.objects.
--
-- Applied via MCP on 2026-05-21 during PR #11; this migration file captures it
-- in version control for parity with the live database.

create policy "documents: authenticated update"
on storage.objects
for update
to authenticated
using (bucket_id = 'documents')
with check (bucket_id = 'documents');
```

The policy is already applied in the database — running this migration on a fresh database would be the only place where it actually creates the policy. On the existing production database, the migration is informational (the policy already exists).

If Supabase migrations run via `supabase db push` would fail because the policy already exists, wrap with `IF NOT EXISTS` semantics or note that the migration is for new environments only.

---

## Task 4 — Add Future Work items to the platform spec

In `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md` (the spec we wrote at the start of this stage), add to the Future Work section at the bottom:

```markdown
- **14.29 — Stage 6c transaction statement supersedure broken in production.** The same storage UPDATE policy gap that broke portfolio statement supersedure (fixed in PR #11) likely affects Stage 6c. Regenerating a transaction statement probably fails silently or with "Object not found" before this PR's RLS policy fix landed. The policy fix applies platform-wide so Stage 6c should now work, but it hasn't been re-tested. Action: regenerate a transaction statement in production after PR #11 merges and verify the old file gets renamed correctly.

- **14.30 — Optional "show superseded" toggle on client record Documents tab.** Currently the tab hides superseded documents entirely (per Ed's preference). The deal-page Documents tab has a "Final only / All docs" toggle. If the team ever needs to inspect version history of a client-scoped document, the same toggle pattern could be added here. Low priority — version history can be retrieved by querying the database directly in the meantime.

- **14.31 — Migration files for MCP-applied schema changes.** Two changes during Stage 2A were applied via MCP for speed but the corresponding migration files in the repo were created retrospectively or are missing: the test investment seed (Stage 2A.1, applied during build) and the storage UPDATE policy (this PR). Both are captured in production but the migration-file source of truth is partially drifted. Future MCP-applied changes should always be followed up with a migration file commit within the same PR.
```

The 14.X numbers are placeholders — use whatever the next free number is in the spec's existing Future Work list.

---

## Acceptance

1. Generate a fresh portfolio statement for Barry O'Brien III. The existing-statements list on the Overview card now shows only the current statement for 31 March 2026 (previous superseded versions are hidden).
2. Open the Documents tab. The Valuations group shows only the current statement for 31 March 2026. Superseded versions are hidden.
3. Verify via MCP: superseded rows still exist in the `documents` table (we didn't delete anything, just stopped showing them).
4. Migration file for the storage UPDATE policy exists in `supabase/migrations/`.
5. Spec updates with the three Future Work items.
6. Build passes, lint clean, TypeScript types compile.

---

## Workflow

1. Stay on `feat/portfolio-statement-generation`.
2. Four commits, one per task. Tasks 1 and 2 can be combined as "Hide superseded documents from default views" if you prefer.
3. Push to existing PR. Preview redeploys.
4. Add a "## Follow-up commits — display rule + housekeeping" section to the PR description.
5. **Stop. Wait for Ed.**

---

*End of follow-up prompt.*
