# Follow-up to PR #9 (Sub-stage 2B.2) — CLN handling corrections

**Branch:** `feat/share-prices-cleanup` (the PR you've already opened)
**Status:** Two corrections needed before merge. Same PR, two new commits.

---

## Why this follow-up exists

Ed clarified an important point that the original spec got wrong. CLNs are purchased through the existing buy-deal wizard (just like equity), held on the books for potentially years, and need to appear in portfolio reports with their acquisition date and a (defaulted-to-principal) value. They are NOT read-only — they need a write-down/write-up mechanism for impairments.

The original spec said CLN rows were "read-only at principal with N/A for date". That's wrong on both counts:

- **Date** — CLN purchases have a real acquisition date captured by the deal wizard on `investments.investment_date`. "N/A" is incorrect; the actual date should display.
- **Read-only** — CLNs sometimes need write-downs (impaired company) or write-ups (rare but possible). Same Update mechanism as equity, just with different default behaviour.

The Add Company form simplification (Task 5 from the original prompt) stays as-is — no `instrument_type` selector at company creation. CLN classes get added later via the Share Classes tab when needed.

---

## Task 1 — Verify deal wizard does NOT filter out CLN classes

In `src/app/(app)/deals/new/buy/SetupStep.tsx`, the `useEffect` that loads share classes for the chosen company should fetch **all** classes regardless of `instrument_type`, not just equity.

**Check:** open the deal wizard in dev mode, pick AI Forge as the company. The share-class dropdown must show two options: "Ordinary" and "CLN". Same for Sky Medical: "Ordinary", "A Ordinary", "CLN".

If the dropdown filters CLN out, find the filter and remove it. The query should be roughly:

```typescript
const { data } = await supabase
  .from('company_share_classes')
  .select('id, name, type, instrument_type')
  .eq('company_id', companyId)
  .order('created_at')
```

No `.eq('instrument_type', 'equity')` filter.

**Why:** CLNs are bought via the deal wizard like any other share class for v1. A separate conversion workflow lives in a future stage.

**Optional small UX improvement** (only if trivial): in the dropdown, append a small tag to CLN options so they're visually distinguishable, e.g. `"CLN (convertible loan note)"`. If this is more than a couple of lines, skip it — not required.

---

## Task 2 — Fix CLN row rendering in `SharePriceSection.tsx`

Three changes to the simplified component:

### 2a. Show the acquisition date, not "N/A"

For each CLN/loan-note row (where `instrument_type IN ('cln', 'loan_note')`), the "date" column should display the **earliest acquisition date** from `investments.investment_date` for that share class.

Query approach: for each share class on the company, find the earliest `investments.investment_date` where `share_class_id = csc.id`. If there's at least one investment, that date becomes the displayed "Acquired DD MMM YYYY". If there are no investments yet (just the share class exists but nothing has been bought), display "—" or "Not yet acquired".

The two-query-then-merge pattern still applies:

```typescript
// 1. Share classes for this company
const { data: shareClasses } = await supabase
  .from('company_share_classes')
  .select('id, name, type, instrument_type, created_at')
  .eq('company_id', companyId)
  .order('created_at')

// 2. Latest valuation per class (existing view)
const { data: latestValuations } = await supabase
  .from('company_current_valuations')
  .select('share_class_id, share_price, valuation_date, methodology')
  .eq('company_id', companyId)

// 3. Earliest acquisition date per class (NEW)
const { data: earliestInvestments } = await supabase
  .from('investments')
  .select('share_class_id, investment_date')
  .eq('company_id', companyId)
  .not('share_class_id', 'is', null)
  .order('investment_date', { ascending: true })

// Merge: for each share class, build the display row.
// - For CLN/loan_note rows, the displayed "date" is the earliest
//   matching investment_date.
// - For equity rows, the displayed "date" is the valuation_date
//   (when the price was last manually set).
```

Map lookups for each merge. No PostgREST embedded joins.

### 2b. Default CLN price to `£1.00 (principal)`, but show actual valuation if one exists

The price display logic:

```
For each row:
  If instrument_type IN ('cln', 'loan_note'):
    If a valuation exists (latestValuations has a matching row):
      Show: £{valuation.share_price} (overridden)
    Else:
      Show: £1.00 (principal)
  Else (equity):
    If a valuation exists: show £{valuation.share_price}
    Else: show "Never valued"
```

The `(overridden)` tag is a small italic note to make clear that a manually-set valuation has displaced the principal default. Same font size as the existing text, low-emphasis colour.

### 2c. Add an Update button to CLN rows

Currently the simplified component delegates updates via an `onUpdate` callback. Make sure that callback fires for CLN rows too — not just equity rows. The downstream destination (the Settings share-prices page in 2B.3) will handle write-down/up form fields appropriately for CLN rows; for now this PR just needs to make sure the button is rendered and clickable for every row regardless of instrument type.

---

## Task 3 — Update the inline footnote / tooltip

Add a small note at the bottom of the SharePriceSection card, visible only when the rendered rows include at least one CLN/loan-note row:

> *CLN holdings default to principal value. Use Update to record a write-down or recovery.*

Same low-emphasis styling as other tertiary text on the page.

---

## Acceptance for this follow-up

1. Deal wizard share-class dropdown shows all classes for AI Forge and Sky Medical, including CLN.
2. SharePriceSection on AI Forge / Sky Medical:
   - CLN row shows `£1.00 (principal)` (no investment exists yet) or `£X.XX (overridden)` (if a valuation exists)
   - CLN row shows the earliest acquisition date if at least one `investments` row exists for that class, otherwise `—`
   - CLN row has an Update button, same as equity rows
   - A small footnote appears at the bottom of the card when CLN rows are present
3. The existing equity-row behaviour is unchanged. Specifically: Groovance Ordinary (no valuation) still shows "Never valued"; Sky Medical Ordinary (has valuation) still shows the price and date from the `company_current_valuations` view.
4. `npm run build` passes, lint clean, TypeScript compiles.
5. `git grep "N/A"` in the SharePriceSection file returns zero hits (i.e. the old hardcoded "N/A" for CLN dates is gone).

---

## Workflow

1. Stay on `feat/share-prices-cleanup` (do not branch off — these are corrections to the same PR).
2. Make the changes in two commits if practical (Task 1 = one commit; Tasks 2+3 = one commit).
3. Push to the existing PR. Preview redeploys.
4. Note in the PR description, under a new "## Follow-up commits" subsection, what changed and why (Ed's clarification on CLN model).
5. **Stop. Wait for Ed.**

---

## Plain English summary for the PR description

For Ed's review, include this paragraph at the top of the follow-up commits section:

> After PR #9 was first pushed, Ed clarified that CLNs are purchased via the existing buy-deal wizard just like equity, captured in `investments` with a real acquisition date, and need a write-down/write-up mechanism for impairments. The original spec said "read-only at principal with N/A for date" — both wrong. These commits fix the SharePriceSection rendering: CLN rows now show their acquisition date from the earliest matching investment, default the price to £1.00 (principal) but display any manually-set valuation instead, and have an Update button. The deal wizard share-class dropdown was also verified to include CLN classes.

---

*End of follow-up prompt.*
