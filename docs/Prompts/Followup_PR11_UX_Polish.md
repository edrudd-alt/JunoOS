# Sixth follow-up to PR #11 — UX polish before merge

**Branch:** `feat/portfolio-statement-generation` (still PR #11)
**Status:** Four small UX fixes before merge. All in client-record page code. No schema changes, no document-generation logic changes.

---

## Why this follow-up exists

After preview review, four small UX items surfaced:

1. The Portfolio statement card on the Overview tab triggers a browser save dialog directly, instead of opening the PDF in a new tab the way the Investment docs tab now does. Inconsistent.
2. Document rows show date only ("21 May 2026"). When the same statement is regenerated twice on the same day, the rows look identical in the list. Adding a time (HH:MM) makes them distinguishable.
3. The "Investment docs" tab name is misleading now that portfolio statements (which span multiple companies) also appear there. Rename to "Documents".
4. Portfolio statements currently fall into a "General" group in the document tree because they have NULL `company_id`. Group them under "Valuations" instead.

---

## Task 1 — Overview tab Download → open in new tab

The Portfolio statement card lives in `src/app/(app)/clients/[id]/_components/GenerateStatementSection.tsx` (or similar — search if not exact). The Download button currently triggers a save dialog.

The Investment docs tab now uses the pattern: `getDownloadUrlForDocument(documentId)` → `window.open(url, '_blank')`. Use the same pattern on the Overview tab's Download button.

Specifically:

- Replace the existing Download handler with one that calls `getDownloadUrlForDocument(documentId)` (the server action you added in the previous follow-up's Task 2) and opens the result in a new tab.
- The same change applies to BOTH (a) the "Download" button on existing-statement rows in the list, AND (b) the auto-trigger after a fresh generation. The fresh-generation auto-trigger should open the new statement in a new tab, not start a download.

**Plain English commit message:** *Overview tab Download buttons now open the PDF in a new browser tab via signed URL, matching the Documents tab behaviour.*

---

## Task 2 — Add time to document date display

Currently the Investment docs tab and Portfolio statement card both render document dates as `DD MMM YYYY` (e.g. "21 May 2026"). Change the format to `DD MMM YYYY HH:MM` (e.g. "21 May 2026 09:42").

**Data source:** `documents.created_at` is already a `timestamptz`. Format it client-side using whatever date helper the codebase already uses (e.g. `date-fns` if present, or a `toLocaleString()` call configured for `en-GB`).

A reusable formatter is the right shape — call it `formatDocumentTimestamp(iso: string): string`. Place it in a small util file (`src/lib/date.ts` or wherever similar helpers live) and use it everywhere a document timestamp renders.

**Format requirements:**
- 24-hour time (e.g. `14:30`, not `2:30 PM`)
- Single space between date and time
- British English month names (`May`, not `Mai`)
- Local time zone (UK time, since the platform is UK-only in v1)

**Plain English commit message:** *Document rows now display timestamp in DD MMM YYYY HH:MM format so regenerations on the same day are distinguishable.*

---

## Task 3 — Rename "Investment docs" tab to "Documents"

Find the tabs config on the client record page. Most likely lives in `src/app/(app)/clients/[id]/ClientRecord.tsx` (a `TABS` array near the top of the file based on previous Stage 1 work).

Rename the tab label from "Investment docs" to "Documents". The URL slug — `?tab=investment_docs` — can stay the same OR change to `?tab=documents`. Recommendation: change the slug too for consistency with the new name. If you change the slug, make sure any existing internal links or default tab references are updated to match.

Also update `docs/specs/section_9_client_record.md` Section 9.6 to reflect the rename. The line currently reads:

```
**Overview · Investments · Investment docs · Updates sent · Notes**
```

Change to:

```
**Overview · Investments · Documents · Updates sent · Notes**
```

And add a small note below the tab list:

```
> Note: this tab was named "Investment docs" in v1 and renamed to "Documents" in May 2026 once portfolio statements (which span multiple companies) started appearing alongside investment-tied documents.
```

**Plain English commit message:** *Renamed Investment docs tab to Documents to reflect the broader scope.*

---

## Task 4 — Group portfolio statements under "Valuations" sub-heading

Find the Documents tab tree-grouping logic. The current grouping is roughly:

```
[Company A]
  [Year]
    [Document]
[Company B]
  ...
[General]   ← portfolio statements fall here (company_id IS NULL)
  [Year]
    [Document]
```

The change: introduce a type-to-group dictionary that maps documents with NULL `company_id` (i.e. documents not tied to a specific portfolio company) to a named group based on their `type` field.

**The dictionary:**

```typescript
// Group label resolution for documents without a company_id.
// New document types added in future should get a row here.
// Documents with a non-null company_id continue to group by company name.
const NON_COMPANY_GROUP_BY_TYPE: Record<string, string> = {
  portfolio_statement: 'Valuations',
  // Future types: e.g. engagement_letter -> 'Onboarding', etc.
}

function getGroupLabel(doc: DocumentRow): string {
  if (doc.company_id) {
    // Existing behaviour: look up company name
    return companyNameById.get(doc.company_id) ?? 'Unknown company'
  }
  // No company — look up the type in the dictionary, fall back to "General"
  return NON_COMPANY_GROUP_BY_TYPE[doc.type] ?? 'General'
}
```

After this change, the tree structure on Barry O'Brien III's Documents tab should be:

```
[AI Forge Ltd]
  2024
    ...
[Cyclr]
  ...
[Valuations]
  2026
    2026-03-31 — Portfolio statement — Barry O'Brien III.pdf  · 21 May 2026 09:42
    ...
```

**Ordering:** keep alphabetical by group label (so "Valuations" sits where it naturally falls — after all company names from A-V). Note: if you have a "General" group, it could also sort alphabetically. If you'd prefer "General" always at the bottom, special-case it — but I'd say leave it strictly alphabetical for now, no special-casing.

**Plain English commit message:** *Portfolio statements now appear under a "Valuations" sub-heading in the Documents tab, grouped via a type-to-group dictionary that can be extended for future non-company document types.*

---

## Acceptance for this follow-up

1. **Overview tab Download** — clicking Download on an existing statement opens the PDF in a new browser tab; auto-trigger after a fresh generation also opens in a new tab (no save dialog)
2. **Document timestamp display** — every row showing a document timestamp shows `DD MMM YYYY HH:MM` in UK local time, 24-hour format
3. **Tab rename** — the tab label reads "Documents" (was "Investment docs"); URL slug updated if changed; default tab references still resolve
4. **Spec update** — `docs/specs/section_9_client_record.md` Section 9.6 lists the tab as "Documents" with a brief explanatory note about the rename
5. **Grouping** — on a client with portfolio statements, the Documents tab shows a "Valuations" group containing the statements; companies still group by company name; rows with neither a company nor a known non-company type fall under "General"
6. **No regression** — Investment docs tab's existing functionality (View links via signed URL, document types other than portfolio_statement, etc.) continues to work
7. Build passes, lint clean, TypeScript types compile

---

## Workflow

1. Stay on `feat/portfolio-statement-generation`.
2. Four commits, one per task, in order. Keeps the diff reviewable.
3. Push to existing PR. Preview redeploys.
4. Add a "## Follow-up commits — UX polish" section to the PR description summarising all four fixes.
5. **Stop. Wait for Ed.**

---

*End of follow-up prompt. This should be the last set of changes before PR #11 merges.*
