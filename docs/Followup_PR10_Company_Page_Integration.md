# Follow-up to PR #10 (Sub-stage 2B.3) — Company-page integration

**Branch:** `feat/share-prices-page` (the PR you've already opened)
**Status:** Four corrections needed before merge. Same PR, three or four new commits.

---

## Why this follow-up exists

The new `/settings/share-prices` page works correctly on the preview. But when Ed tested the company-page entry points, two problems showed up and one bit of polish needs picking up:

1. **The simplified `SharePriceSection` snapshot card isn't rendered anywhere visible on the company page.** It was supposed to live on the Overview tab with the "Update share prices →" link. Either it was never wired in, or it was removed during the cleanup pass.

2. **The legacy "Update valuation" button is still in the top-right of the company page header.** It opens an old modal that doesn't know about share classes and would write valuations with NULL `share_class_id` — broken in the new per-class model.

3. **The Share Classes tab list shows the CLN class with an "Ordinary" badge** because it renders `type` (ordinary/preference) instead of `instrument_type` (equity/cln/loan_note). Misleading visual.

**The plan after discussion with Ed:**

- Don't restore `SharePriceSection.tsx` to the Overview tab. Ed is rebuilding company pages later anyway — no point investing in throwaway placement.
- Instead, enhance the Share Classes tab so its existing list shows current price and last-updated date inline. The Share Classes tab is the natural home for share-class info.
- Add a "Update share prices →" link to the Share Classes tab header that routes to `/settings/share-prices?company=<id>`.
- Remove the legacy "Update valuation" header button entirely.
- Fix the CLN badge in the Share Classes tab list.
- Delete the orphaned `SharePriceSection.tsx` component so no dead code is left behind.

---

## Task 1 — Enhance the Share Classes tab list with price, date, and layered terms

Open `src/app/(app)/portfolio/[id]/tabs/CompanyShareClassesTab.tsx`. The list currently shows one row per share class with the class name and a "type" badge ("Ordinary" or "Preference") and an Edit button. Enhance it with a layered information model.

### 1.1 Primary line (every row)

```
[Class name] [Instrument badge]              £X.XXXX        Updated DD MMM YYYY     [Edit]
                                              Never valued   —
                                              £1.0000 (principal)  —                  (for CLN with no override)
                                              £1.0000 (principal)  Acquired DD MMM YYYY (for CLN with an investment)
```

**What "last updated" shows:**

- Equity rows: the `valuation_date` from the latest matching valuation in `company_current_valuations`, prefixed with "Updated "
- CLN/loan-note rows with no valuation row AND no investment yet: "—"
- CLN/loan-note rows with no valuation row but with at least one investment: the earliest matching `investments.investment_date` prefixed with "Acquired "
- CLN/loan-note rows WITH a manual valuation override: the override's `valuation_date` prefixed with "Updated "

### 1.2 Secondary line (conditional)

A small sub-line rendered below the primary line in lower-emphasis text (smaller font, grey colour matching tertiary text elsewhere on the page). Render conditionally:

**For preference shares** (`type = 'preference'`), build a one-liner from the fields the modal already captures, including only those that are set:

```
{preference_multiple}× {participating ? 'participating' : 'non-participating'} · {dividend_rate}% {dividend_cumulative ? 'cumulative' : 'non-cumulative'} dividend · {dividend_payment === 'paid' ? 'paid' : 'rolled up'}
```

Example: `4× participating · 5% cumulative dividend · paid`

If a preference field is NULL, omit that segment of the line. If no preference fields are set at all (just `type = 'preference'` with everything else NULL), don't render the secondary line.

**For CLN rows** (`instrument_type = 'cln'`):

```
Held at principal · accrued-interest estimate planned
```

**For loan-note rows** (`instrument_type = 'loan_note'`):

```
Held at principal · accrued-interest estimate planned
```

**For ordinary equity rows** (`type = 'ordinary'` AND `instrument_type = 'equity'`): no secondary line.

### 1.3 Visual structure

Each row is a stack:

```
─────────────────────────────────────────────────────────────────────────────
B Preference [Preference]                    £3.5000    Updated 10 Mar 2026     [Edit]
             4× participating · 5% cumulative dividend · paid
─────────────────────────────────────────────────────────────────────────────
```

The secondary line is visually subordinate to the primary line — smaller font, less prominent colour, indented to align with the class name (not with the badge).

### 1.4 Data fetching

The component currently fetches share classes only. Add two more queries (matching the pattern from `SharePriceSection.tsx` which you're about to delete in Task 5 — copy the queries over before deleting):

1. Latest valuations per class — from the `company_current_valuations` view
2. Earliest investment date per class — from `investments` grouped by `share_class_id`

Merge in JavaScript using Maps. Two-query-then-merge pattern, no PostgREST embedded joins.

**Plain English code comment near the new queries:**

```typescript
// We fetch valuations and earliest investment dates separately rather than
// using an embedded join. PostgREST embedded joins silently fail under
// certain conditions — the platform's standing rule (see CLAUDE.md) is to
// always fetch related tables separately and merge in JavaScript.
```

### 1.5 Plain-English code comment for the secondary-line logic

Near the function that builds the secondary line, add:

```typescript
// Secondary line shows preference-share terms (multiple, participating,
// dividend) or a CLN/loan-note caveat. Ordinary equity rows have no
// secondary line. Each segment is omitted if the underlying field is NULL,
// so a partially-configured preference class doesn't render dangling
// punctuation. CLN-specific terms like interest rate, conversion price,
// and maturity date are NOT shown here — those fields don't exist on
// company_share_classes (they're Future Work 14.23, captured in a
// dedicated CLN workflow later).
```

---

## Task 2 — Add "Update share prices →" link to the Share Classes tab header

The Share Classes tab currently has "Current share classes" as a section header with a "+ Add share class" button at the top right.

Add a second action to the right of "+ Add share class": a link reading **"Update share prices →"** that routes to `/settings/share-prices?company=${companyId}`. Style it as a secondary text link (less prominent than the "+ Add share class" button).

Layout:

```
Current share classes                     Update share prices →   [+ Add share class]
```

---

## Task 3 — Fix the CLN/loan-note badge on the Share Classes tab list

In the same file (`CompanyShareClassesTab.tsx`), change the badge rendering logic:

```typescript
// Render the instrument badge prominently for non-equity classes;
// for equity classes, just show the ordinary/preference type as today.
function ShareClassBadges({ shareClass }: { shareClass: ShareClass }) {
  if (shareClass.instrument_type === 'cln') {
    return <Badge variant="amber">CLN</Badge>  // amber/yellow
  }
  if (shareClass.instrument_type === 'loan_note') {
    return <Badge variant="amber">Loan note</Badge>
  }
  // equity: show ordinary/preference type badge as today
  return <Badge variant="grey">{shareClass.type === 'preference' ? 'Preference' : 'Ordinary'}</Badge>
}
```

Use the same amber/yellow colour treatment that the share-prices page already uses for CLN rows, so visuals are consistent.

---

## Task 4 — Remove the legacy "Update valuation" button from the company header

Find the component that renders the company-page header (with the "Add info / Update valuation / Investor update / Settings" buttons in the top right). Most likely lives in `src/app/(app)/portfolio/[id]/page.tsx` or a `CompanyHeader.tsx` adjacent to it.

Remove:
1. The "Update valuation" `<button>` element
2. Any state, modal, or handler associated with it (e.g. `showValuationModal` state, the `UpdateValuationModal` component if it's only used here)
3. The import of any now-unused modal component

The flow going forward: users update valuations via the Share Classes tab's "Update share prices →" link → lands on the Settings share-prices page → click Update on the relevant row.

**Important — the `UpdateValuationModal.tsx` component might still be used by other parts of the codebase.** Before deleting it, run:

```bash
git grep -n "UpdateValuationModal" -- src/
```

If it has other uses, leave the file in place but unimport it from the company header. If the company header was its only user, delete the file too.

---

## Task 5 — Delete the orphaned `SharePriceSection.tsx` component

This was the simplified snapshot card from PR #9. Now that the company page won't render it (per Ed's decision in this follow-up), it's dead code.

```bash
git grep -n "SharePriceSection" -- src/
```

Find every import and JSX usage of it. Remove the usages. Then delete the component file:

```bash
rm src/app/(app)/portfolio/[id]/SharePriceSection.tsx
```

(Check the exact path — it might be `_components/SharePriceSection.tsx` or similar in your repo.)

**Plain English for the PR:** *Component was a snapshot card living somewhere on the company page. Ed has decided the same information is better surfaced on the Share Classes tab (where it's now inline on each row), so the standalone snapshot component is no longer needed.*

---

## Acceptance for this follow-up

1. The Share Classes tab on a company page shows for each row:
   - **Primary line:** class name, instrument badge (CLN/Loan note/Ordinary/Preference), current price (or "Never valued"), last-updated date (or "—" / "Acquired ..."), and an Edit button
   - **Secondary line (conditional):** preference terms for preference shares (e.g. "4× participating · 5% cumulative dividend · paid"); "Held at principal · accrued-interest estimate planned" for CLN/loan-note rows; nothing for ordinary equity rows
2. Sky Medical Share Classes tab specifically shows:
   - A Ordinary [Ordinary badge] · £1.2500 · Updated 25 Apr 2026 (no secondary line)
   - CLN [CLN amber badge] · £1.0000 (principal) · — (secondary line: Held at principal · accrued-interest estimate planned)
   - Ordinary [Ordinary badge] · £0.5000 · Updated 10 Oct 2025 (no secondary line)
3. AI Forge Share Classes tab shows:
   - CLN [CLN amber badge] · £1.0000 (principal) · — (secondary line)
   - Ordinary [Ordinary badge] · £2.5000 · Updated 8 May 2026 (no secondary line)
4. Ball Co Share Classes tab shows:
   - B Preference [Preference badge] · £3.5000 · Updated 10 Mar 2026 (secondary line: 4× participating)
   - Ordinary [Ordinary badge] · £1.0000 · Updated 30 Apr 2026 (no secondary line)
5. The CLN rows on both Sky Medical and AI Forge show an amber "CLN" badge, NOT an "Ordinary" badge.
6. A "Update share prices →" link is visible in the Share Classes tab header, next to the "+ Add share class" button. Clicking it routes to `/settings/share-prices?company=<id>`.
7. The "Update valuation" button has been removed from the company-page header. The remaining header buttons are: Add info, Investor update, Settings (or whatever the original lineup was minus "Update valuation").
8. `git grep "SharePriceSection"` returns zero hits.
9. `git grep "UpdateValuationModal"` returns zero hits in component usage (the modal file may or may not exist depending on Task 4 finding).
10. Build passes (`npm run build`), lint clean, TypeScript compiles.

---

## Workflow

1. Stay on `feat/share-prices-page` (do not branch off — these are corrections to the same PR).
2. Commit roughly one task per commit if practical (4 or 5 commits total).
3. Push to the existing PR. Preview redeploys.
4. Add a "## Follow-up commits" section to the PR description explaining what changed and why (Ed's company-page integration decisions during preview review).
5. **Stop. Wait for Ed.**

---

## Plain English summary for the PR description

For Ed's review, include this paragraph at the top of the follow-up commits section:

> After PR #10 was first deployed to preview, Ed tested the company-page entry points and found two issues: the simplified `SharePriceSection` snapshot card wasn't actually rendered anywhere visible on the company page, and the legacy "Update valuation" header button was still present but writes valuations without share-class context (broken in the new per-class model). These commits resolve both by enhancing the Share Classes tab list to show current price and last-updated date inline, adding a "Update share prices →" link in that tab's header, removing the legacy header button, and deleting the orphaned `SharePriceSection.tsx` component. Also fixes a small bug where CLN classes showed an "Ordinary" badge instead of a CLN-specific one.

---

*End of follow-up prompt.*
