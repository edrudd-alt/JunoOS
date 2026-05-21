# Fifth follow-up to PR #11 — Filename convention + Investment docs View 404

**Branch:** `feat/portfolio-statement-generation` (still PR #11)
**Status:** Two fixes before merge. First aligns filename convention with Stage 6c. Second fixes a 404 on the Investment docs tab's View link.

---

## Why this follow-up exists

Two issues surfaced during preview review:

1. **Filename pattern partially drifts from Stage 6c's documented convention.** The current display filename reads `2026-03-31 — Barry O'Brien III — Portfolio Valuation Statement.pdf` (order: date, investor, document type). Stage 6c's transaction statement uses `YYYY-MM-DD — Investor — Company — Transaction Statement.pdf`. The platform-wide convention documented in `Juno_Deal_Page_Restructure_Spec_v3_6.md` Section 14.17 is `YYYY-MM-DD — [Document type] — [Optional descriptor].pdf`. Also: the storage_url contains a trailing milliseconds-since-epoch suffix (`-1779351200916.pdf`) where Stage 6c uses just the sanitised filename. And: regenerating a statement marks prior rows `superseded = true` in the database, but does NOT rename the prior file with a `_superseded_YYYY-MM-DD-HHMMSS` suffix the way Stage 6c does. Result: all four superseded versions display with identical filenames in the Investment docs tab.

2. **The Investment docs tab's View link returns 404.** When the user clicks View on a portfolio statement, the browser navigates to `https://juno-os.vercel.app/clients/clients/{client_id}/portfolio-statements/{storage_key}` — a JunoOS route that doesn't exist. Two compounding bugs: (a) the path has a duplicated `clients/` segment, and (b) the View link treats `documents.storage_url` (a Supabase Storage object key) as if it were a route on the JunoOS site, with no server action generating a signed URL. This is a Stage 1 bug (the Investment docs tab from Sub-stage 1.5) — portfolio statements are just the first real document type to surface it.

Both fix in this PR before merge.

---

## Task 1 — Align filename convention with Stage 6c

Reference: `src/services/document-generation/generateTransactionStatement.ts` lines around the filename construction. Mirror its pattern.

### 1.1 Display filename (in `documents.filename`)

Change the construction from whatever it is today to:

```typescript
const periodDate = params.periodDate  // already YYYY-MM-DD
const safeName = client.full_name.replace(/[\\/:*?"<>|]/g, '').trim()
const filename = `${periodDate} — Portfolio statement — ${safeName}.pdf`
```

For Barry O'Brien III on the 31 March 2026 period this gives:

```
2026-03-31 — Portfolio statement — Barry O'Brien III.pdf
```

Two notes:
- Document type lowercased ("Portfolio statement" not "Portfolio Valuation Statement") — matches Stage 6c's "Transaction Statement" style of being a normal English phrase rather than a formal product name.
- Em dashes (U+2014) preserved in the display filename. The `sanitiseStorageKey()` helper will strip them in the storage key path.

### 1.2 Storage key (in `documents.storage_url`)

Replace the current storage-key construction with the standard Stage 6c pattern:

```typescript
const storageKey = sanitiseStorageKey(filename)
const storagePath = `clients/${params.clientId}/portfolio-statements/${storageKey}`
```

No trailing milliseconds-since-epoch suffix. The supersedure rename in 1.3 below provides the necessary distinction between versions; uniqueness during a single generation isn't an issue because the rename pattern guarantees no overwrite.

For Barry on 31 March 2026:

```
clients/1ad062a6-e2d7-4b26-8e96-b2f45ce85b7e/portfolio-statements/2026-03-31-Portfolio_statement-Barry_OBrien_III.pdf
```

### 1.3 Supersedure rename (the most important change)

Currently when regenerating for the same `(client_id, period)`, the code marks prior `documents` rows `superseded = true` but does NOT rename the old file. Mirror Stage 6c's behaviour:

For each prior non-superseded statement for the same (client_id, period):

1. Build a supersedure suffix: `_superseded_YYYY-MM-DD-HHMMSS` using the current timestamp
2. Compute the new (suffixed) storage path: `{oldPath}_superseded_2026-05-21-094230.pdf` (insert before `.pdf`)
3. Compute the new (suffixed) display filename the same way
4. Call `supabase.storage.from('documents').move(oldStoragePath, newStoragePath)` — this renames the file in Storage
5. If the move succeeds: update the documents row with the new storage_url AND new filename, plus `superseded = true`, `superseded_at`, `superseded_by_id`
6. If the move fails (e.g. the old file is no longer there for some reason): still update the documents row with `superseded = true` but leave `storage_url` and `filename` at their original values. Log the error.

Reference: lines from `generateTransactionStatement.ts` around the rename-old-files block. Use the same helper / inline logic.

After this fix, the Investment docs tab will show:

```
Portfolio statement   2026-03-31 — Portfolio statement — Barry O'Brien III_superseded_2026-05-20-162605.pdf   ...
Portfolio statement   2026-03-31 — Portfolio statement — Barry O'Brien III_superseded_2026-05-20-172707.pdf   ...
Portfolio statement   2026-03-31 — Portfolio statement — Barry O'Brien III_superseded_2026-05-21-081321.pdf   ...
Portfolio statement   2026-03-31 — Portfolio statement — Barry O'Brien III.pdf                                 ...
```

Visually obvious which is current and which are superseded.

### 1.4 Backfill consideration

The four existing portfolio statement rows in the database (versions 1–4 for Barry, with the old naming) will not be retroactively renamed by this code change. Two options:

**Option A — leave them as-is.** They're test data, will be re-created via fresh Generate clicks when testing. No backfill needed.

**Option B — write a one-time backfill query** that renames the four existing files in Storage and updates the four documents rows. Generally not worth the effort for test data.

**Take Option A.** Note in the PR description that the four pre-existing portfolio statements will continue to show the old filename until they're naturally superseded.

---

## Task 2 — Fix the Investment docs View link

This is a Stage 1 bug (Sub-stage 1.5, the original Investment docs tab). The View link constructs a URL like `/clients/clients/{client_id}/...` which 404s.

### 2.1 Locate the file

Most likely path: `src/app/(app)/clients/[id]/_tabs/investment-docs.tsx` or similar in the `_tabs/` folder. Run:

```bash
git grep -n "investment-docs\|InvestmentDocsTab\|portfolio-statements" src/app/\(app\)/clients/
```

to find the file.

### 2.2 Diagnose the existing View link

The current code likely does something like:

```typescript
// WRONG
<a href={`/clients/${doc.storage_url}`}>View</a>
```

or

```typescript
// WRONG
<a href={doc.storage_url}>View</a>
```

Both treat `storage_url` (which is a Supabase Storage object key like `clients/{uuid}/portfolio-statements/{filename}.pdf`) as if it were a webpage route. It isn't. There's no Next.js route that handles paths inside the `documents` bucket.

### 2.3 Replace with the signed-URL pattern (matches PR #11's Portfolio statement card)

The Portfolio statement card on the Overview tab (`GenerateStatementSection.tsx`) already does this correctly. It calls a server action `getDownloadUrlForStatement(documentId)` which returns a short-lived signed URL, then opens it via `window.open()` or triggers a download.

Mirror that pattern for the Investment docs tab. Two options:

**Option A — Reuse the existing server action.** If `getDownloadUrlForStatement` is exported from `portfolioStatementActions.ts` and works for any documents row (not just portfolio statements), import it and use it.

**Option B — Add a generic version.** Create `getDownloadUrlForDocument(documentId)` in a more general server actions file (e.g. `src/app/(app)/clients/[id]/documentActions.ts`) that works for any document type. Then both the Investment docs tab and any future surfaces can use it.

Take Option B — it's the more reusable shape and avoids the Investment docs tab importing from a portfolio-statement-specific file.

The server action should:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'

export async function getDownloadUrlForDocument(documentId: string): Promise<string | null> {
  const supabase = await createClient()

  // 1. Look up the documents row
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, storage_url')
    .eq('id', documentId)
    .single()
  if (docError || !doc) return null

  // 2. Generate a signed URL with a short TTL (60 seconds)
  const { data, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.storage_url, 60)
  if (urlError || !data) return null

  return data.signedUrl
}
```

### 2.4 Wire it into the View link

In the Investment docs tab, replace the broken `<a href>` with a button that calls the server action:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { getDownloadUrlForDocument } from '../documentActions'

// ...

<button
  onClick={async () => {
    const url = await getDownloadUrlForDocument(doc.id)
    if (url) {
      window.open(url, '_blank')
    } else {
      // Toast or inline error — couldn't get download URL
      console.error('Could not generate download URL for document', doc.id)
    }
  }}
  className="view-link"
>
  View
</button>
```

Style it to match the existing View link visually so the change is invisible to users — same colour, same font, same cursor behaviour, same hover.

### 2.5 Sanity check

After fixing, test on the preview:

1. Click View on a portfolio statement row → PDF opens in a new tab
2. The URL in that new tab is a Supabase signed URL (long, has `token=...` parameter), NOT a JunoOS route
3. The signed URL is valid for ~60 seconds
4. After 60 seconds, refreshing the tab gives a 403 (TTL expired) — that's correct behaviour

### 2.6 No regression to other document types

The Investment docs tab might be used by other document types in future (KYC documents, share certificates, etc.). The fix above works for any documents row regardless of type, since it just generates a signed URL from `storage_url`. No special-casing needed.

If the tab currently displays document types other than portfolio statements, verify those still work (or fail gracefully) after the fix.

---

## Acceptance for this follow-up

1. New portfolio statements generated after the fix have filename `YYYY-MM-DD — Portfolio statement — {client name}.pdf` and storage key sanitised accordingly (no trailing milliseconds suffix)
2. Regenerating for the same `(client_id, period)` renames the prior file with a `_superseded_YYYY-MM-DD-HHMMSS` suffix in BOTH `documents.filename` AND `documents.storage_url`, and `supabase.storage.move()` is called to rename the actual storage object
3. The Investment docs tab on a client record page renders correctly
4. Clicking View on a portfolio statement opens the PDF in a new tab via a signed URL (not the broken JunoOS route)
5. Pre-existing portfolio statement rows (versions 1–4 in the database from before the fix) are left as-is and noted in the PR description
6. Build passes, lint clean, TypeScript types compile
7. Mention any Stage 1 components touched in the PR description so the change is reviewable

---

## Workflow

1. Stay on `feat/portfolio-statement-generation`.
2. Task 1 in one commit (`Filename convention: align with Stage 6c, add supersedure rename`).
3. Task 2 in a second commit (`Investment docs View: replace broken route with signed-URL server action`).
4. Push to existing PR. Preview redeploys.
5. Add a "## Follow-up commits — filename + View 404" section to the PR description summarising both fixes.
6. **Stop. Wait for Ed.**

---

*End of follow-up prompt.*
