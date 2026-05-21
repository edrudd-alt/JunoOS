# Eighth follow-up to PR #11 — Supersede BEFORE upload

**Branch:** `feat/portfolio-statement-generation` (still PR #11)
**Status:** Root cause identified. Structural reorder of supersedure logic. One file change.

---

## The diagnosis (verified via runtime logs + DB inspection)

The previous diagnostic commit gave us the answer. After clicking Generate:

- Vercel runtime log: `portfolio_statement_upload_failed` fired
- The upload error message contains "already exists" (filter test passed in the MCP logs)
- The expected `portfolio_statement_supersedure_move_failed` log did NOT fire

Database state confirms version 7 sits at exactly the storage path the new upload tried to use: `clients/1ad062a6-.../portfolio-statements/2026-03-31-Portfolio_statement-Barry_OBrien_III.pdf`. Version 7 is `superseded = false`.

**Root cause:** the code mirrors Stage 6c's order-of-operations (upload, then supersede old files) — but that order only works for Stage 6c because transaction statements have inherently unique filenames per generation (date + investor + company combination is rarely repeated within a single day). Portfolio statements use a fully deterministic filename for a given `(client_id, period)` — so regenerating ALWAYS collides at the same path. With `upsert: false`, the upload fails before the supersedure code ever runs.

The fix is to reorder: supersede old files FIRST, then upload the new one. By the time the upload runs, the old files have been renamed with `_superseded_YYYY-MM-DD-HHMMSS` suffixes and the deterministic path is free.

---

## Task — Reorder the supersedure block to run before the upload

Open `src/services/document-generation/generatePortfolioValuationStatement.ts`. The current shape (paraphrased from the Stage 6c pattern) is:

```typescript
// 1. Fetch context (client, investments, valuations, etc.)
// 2. Render PDF to buffer
// 3. Build filename and storage path
// 4. Find existing non-superseded statements (query)
// 5. Upload new PDF                  ← FAILS HERE on collision
// 6. Insert new documents row
// 7. Supersede old documents (rename in storage + update DB)
```

Reorder to:

```typescript
// 1. Fetch context
// 2. Render PDF to buffer
// 3. Build filename and storage path
// 4. Find existing non-superseded statements
// 5. Supersede old documents FIRST (rename in storage + update DB)  ← MOVED UP
// 6. Upload new PDF                                                  ← NOW SUCCEEDS
// 7. Insert new documents row
```

### Specifically

Move the entire supersedure block (the `if (existing && existing.length > 0) { ... }` loop with the `supabase.storage.move()` calls and the DB updates) to execute BEFORE the `supabase.storage.from('documents').upload(...)` call.

Keep the `existing` query in its current position (or move it too — same logic either way), but the renaming loop must complete before the new upload begins.

### Error handling

The previous follow-up's structured logging stays in place — both `portfolio_statement_supersedure_move_failed` and `portfolio_statement_upload_failed` continue to log on failure.

One edge case to handle deliberately: if the supersedure rename fails (move returns an error), should we proceed with the upload anyway, or abort? Two options:

**Option A — Abort if rename fails.** Throw before reaching the upload. Reasoning: if the old file's storage object can't be renamed out of the way, the upload will collide anyway. Better to fail fast with a meaningful error than fail with the same "already exists" message.

**Option B — Proceed best-effort.** Log the rename failure but continue. If the rename failed because the old file is genuinely missing (e.g. was deleted manually), the upload will succeed at the deterministic path. If the rename failed for permissions reasons, the upload will fail with "already exists" and that error will surface.

Take **Option A**. Reasoning: if the rename is failing systematically (the case we just hit), failing fast at the rename gives a clearer error in the runtime logs. Best-effort is what got us into the silent-failure mess in the first place.

```typescript
if (moveError) {
  console.error(JSON.stringify({
    event: 'portfolio_statement_supersedure_move_failed',
    documentId: old.id,
    sourcePath: old.storage_url,
    targetPath: newStoragePath,
    moveErrorMessage: moveError.message,
    moveErrorName: moveError.name,
    moveErrorFull: JSON.stringify(moveError),
  }))
  // Don't continue. The upload would collide at the same path anyway.
  throw new Error(`Failed to supersede old statement: ${moveError.message}`)
}
```

### Don't change anything else

- Don't touch the filename convention
- Don't change `upsert: false` to `upsert: true`
- Don't modify the context fetcher, the template, or the trigger UI
- Don't add try/catch wrappers around larger sections
- The Buffer-removal fix from earlier stays in place

---

## Acceptance

1. Push the reorder commit. Vercel preview redeploys.
2. Ed clicks Generate on Barry O'Brien III's Portfolio statement card (version 8 attempt).
3. The supersedure logic runs first: version 7's storage object is moved to `..._superseded_2026-05-21-HHMMSS.pdf` and its DB row is updated (filename and storage_url both get the suffix, `superseded = true`).
4. The upload runs second: succeeds at the now-free deterministic path.
5. New documents row inserted for version 8 with the clean filename.
6. The new statement auto-opens in a new tab.
7. The list of existing statements on the Overview card now shows 8 rows: 7 superseded with the `_superseded_...` suffix in their filenames, 1 current.
8. The Documents tab's Valuations group shows the same.
9. Chat-Claude verifies via MCP: both `documents.filename` and `documents.storage_url` for version 7 now end with `_superseded_2026-05-21-HHMMSS.pdf`, and the storage object at that path actually exists.

---

## Workflow

1. Stay on `feat/portfolio-statement-generation`.
2. One commit: `Supersede old statements before upload to prevent path collision`.
3. Push. Preview redeploys.
4. Add a one-paragraph note to the PR description's follow-up commits section explaining the diagnosis: previous code mirrored Stage 6c's upload-then-supersede order, but portfolio statements use deterministic filenames that collide on regeneration. Reordered to supersede first.
5. **Stop. Wait for Ed.**

---

*End of follow-up prompt.*
