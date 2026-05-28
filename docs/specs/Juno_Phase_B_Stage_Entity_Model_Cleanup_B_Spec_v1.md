# Juno Phase B — Entity Model Cleanup, Sub-stage B: UI Rename and Documentation

**Status:** Draft v1 — for Ed's review before Claude Code prompt is written
**Depends on:** Sub-stage A (PR #18 merged 23 May 2026)
**Position in plan:** Code-side and documentation completion of the Entity Model Cleanup begun in Sub-stage A
**Companion stage:** None — this is the final piece of the Entity Model Cleanup

---

## 1. Purpose

Sub-stage A removed `entity_type`, `fund_type`, and `active_fund_type` from the `clients` table and added the vehicle-lead integrity trigger. The database is clean. But the application code still references the dropped columns in 10 places across 3 files, and the team-facing UI still uses the old vocabulary ("Client / Vehicle / Location") rather than the agreed Lead investor / Beneficial owner / Legal owner naming.

This sub-stage does three coordinated things:

1. **Fix the 10 type errors** Sub-stage A surfaced — mechanical removals of references to dropped columns
2. **Rename the user-facing vocabulary** throughout the bookbuild, Add Investors modal, filters, and search
3. **Restructure the bookbuild filters** to give the team the multi-select Beneficial owner filter and a new multi-select Legal owner filter (which didn't exist before)
4. **Fix the Settings → Fund Management page** so it reads fund counts from `investments.fund_type` rather than the removed `clients.fund_type`
5. **Sweep the spec documentation** so every live reference uses the new vocabulary, and historical build prompts carry a one-line note pointing to the change

All in one PR with logical commit groupings, reviewable section by section.

---

## 2. Out of scope

- **Touching the application form PDF wording.** Future Work 14.16 reviews legal terminology in the v1.1.0 Documenso template separately. Not in this PR.
- **Building the `client_relationships` UI.** Future Work 14.17. The table exists and works for the spousal/family link in test data; building a dedicated workflow waits.
- **Saved filter views.** Future Work 14.18.
- **Investor portal work.** Future Work 14.19. The data model now supports a clean "filter holdings by beneficial owner" view, but the portal itself is a much later stage.
- **Renaming database column names.** `client_id`, `investing_vehicle_id`, `nominee_id` stay as-is. Only comments (set in Sub-stage A) and user-facing labels change.
- **Sell deal redesign.** The terminology rename will be propagated to the sell deal spec (Section 14.1) but only as a documentation change. The sell deal redesign itself is a separate stage.

---

## 3. The five pieces of work

### 3.1 Type-error fixes (the mechanical bit)

Sub-stage A's type regeneration surfaced 10 errors across 3 files:

| File | Errors | Nature |
|---|---|---|
| `ClientRecord.tsx` | 4 | References to `entity_type`. Also: a local `LinkedEntity` interface that includes `entity_type` as a required field — needs the field dropped from the interface too. |
| `DetailsTab.tsx` | 4 | References to `entity_type` and / or `fund_type` / `active_fund_type` on the client object |
| `RecordTransactionModal.tsx` | 2 | References to `fund_type` / `active_fund_type` on the client |

**The fix in each case is removal, not replacement.** Per Ed's decision, the Client Record screens that previously displayed entity-type information will lose it silently. The fields were displaying a category error (the same column carrying two different meanings depending on whether the row was a lead or a vehicle), so no genuine information is lost.

For the `RecordTransactionModal.tsx` fund-type references: today these read `client.active_fund_type` (or `client.fund_type` if `active_fund_type` is NULL) to default the new investment's fund type. After the fix, the default should come from the lead investor's most recent investment's fund type, falling back to `syndicate` if the client has no prior investments. Plain-English rationale: a client's "current" fund type was a hack to remember which fee regime applied; the most recent investment is a more honest answer.

### 3.2 Terminology rename in the UI

Every place a human sees "Client / Vehicle / Location" becomes "Lead investor / Beneficial owner / Legal owner". Database column names stay as-is.

| Surface | Before | After |
|---|---|---|
| Bookbuild table column heading 1 | Client | Lead investor |
| Bookbuild table column heading 2 | Vehicle | Beneficial owner |
| Bookbuild table column heading 3 | Location | Legal owner |
| Add Investors modal — left panel label | "Client" | "Lead investor" |
| Add Investors modal — dropdown 1 label | "Vehicle" | "Beneficial owner" |
| Add Investors modal — dropdown 2 label | "Location" | "Legal owner" |
| Add Investors modal — dropdown 1 NULL label | "Own name" | "Lead investor" (consistent with column heading 1, indicates "the lead is also the beneficial owner") |
| Add Investors modal — dropdown 2 NULL label | "Direct" | "Direct (no nominee)" (slightly more explicit — the existing "Direct" label is fine but could be clearer) |
| Bookbuild search placeholder | "Search investors, vehicles, or locations…" | "Search by lead, beneficial owner, or legal owner…" |
| Bookbuild bulk-action footer messages | "Selected X investors across N vehicles" | "Selected X investors across N beneficial owners" |
| Any tooltips, helper text, or error messages | Old vocabulary | New vocabulary |

**Two specific UX nuances to preserve:**

1. **NULL display in the bookbuild table.** When `investing_vehicle_id` is NULL, the cell shows the lead's name in muted grey (a "Lead investor" hint, meaning "the lead is also the beneficial owner"). When `nominee_id` is NULL, the cell shows the beneficial owner's name in muted grey with a "Direct" qualifier. This pattern was already there for Vehicle/Location — it just gets new labels.
2. **The Vehicle/Location dropdowns in Add Investors** keep their existing behaviour — they only show the lead's linked entities (now: beneficial owners belonging to this lead) and the deal's available nominees. Only labels change, not data selection logic.

### 3.3 Filter restructure (the only behavioural change beyond rename)

Today the bookbuild has a single-select "Vehicle" filter. It's replaced by **two independent multi-select filters**:

**Beneficial owner filter** (replaces "Vehicle" filter):

A multi-select dropdown, same UI pattern as the existing Status filter. Options:

- ☐ Lead investor only (`investing_vehicle_id IS NULL`)
- ☐ Any separate beneficial owner (`investing_vehicle_id IS NOT NULL`)
- *(divider)*
- ☐ Specific beneficial owner 1 (e.g. Rother House)
- ☐ Specific beneficial owner 2 (e.g. Humphrey SIPP)
- ☐ ... every distinct beneficial owner that appears in this deal

**Legal owner filter** (new — didn't exist before):

A multi-select dropdown. Options:

- ☐ Held direct (`nominee_id IS NULL`)
- ☐ Held via any nominee (`nominee_id IS NOT NULL`)
- *(divider)*
- ☐ Specific nominee 1 (e.g. City Partnership Nominees Ltd)
- ☐ ... every distinct nominee that appears in this deal

**Combination logic:**

- **Within a single filter** — OR logic. Ticking "Held direct" and "City Partnership Nominees" gives rows that are either direct OR held via City Partnership.
- **Across filters** — AND logic. The Beneficial owner filter and Legal owner filter combine with AND. Plus the existing Status filter and free-text search also combine with AND.

So a user could express queries like:
- "Rother House investments held via any nominee" — tick Rother House in BO filter, "Held via any nominee" in LO filter
- "Everything held direct, regardless of beneficial owner" — leave BO filter empty, tick "Held direct" in LO filter
- "Lead-as-beneficial-owner investments held via City Partnership" — tick "Lead investor only" in BO filter, City Partnership in LO filter

**Filter state persistence:** None. Same as today — filters reset on deal navigation. Saved filter views are Future Work 14.18.

### 3.4 Settings → Fund Management page fix

Today this page reads `clients.fund_type` and renders a "Clients in Syndicate: X / Multi Manager: Y / EIS: Z / Both: W" breakdown. After Sub-stage A, `clients.fund_type` is gone — the page is currently broken.

**The fix:** rewrite the counts to come from `investments.fund_type` instead:

```sql
SELECT
  fund_type,
  COUNT(DISTINCT client_id) AS client_count
FROM investments
GROUP BY fund_type;
```

**The semantic change Ed has agreed:** a client with investments in *both* Syndicate and Multi Manager will now appear in *both* counts. The total across funds may exceed the total client count. This is more accurate than the old "both" pseudo-category and reflects reality — a Multi Manager client *is* genuinely a Multi Manager client even if they also have Syndicate holdings.

**Required UX addition:** a small explanatory note on the page reading:
> Note: A client with investments in more than one fund appears in each fund's count. The totals may exceed the unique client count.

This is one line of help text, placed adjacent to the count cards.

**No "Both" fund type displayed.** The old fourth column / row representing the `'both'` category is removed entirely.

### 3.5 Documentation sweep

Five live spec documents need full search-and-replace passes. Nine historical build prompts get a one-line note.

**Live documents (full sweep):**

| File | What changes |
|---|---|
| `Juno_Deal_Page_Restructure_Spec_v3_6.md` | Every reference to "Client / Vehicle / Location" → "Lead investor / Beneficial owner / Legal owner". Column heading table in Section 4.3. References in Sections 6.4, 7.4 (filters), 8.4 (closing), 1593 (changelog). |
| `section_9_client_record.md` | Lines 42, 45 (vocabulary) plus removal of the `entity_type` migration block at lines 376–381 (column no longer exists). |
| `TRANSACTION_WORKFLOW_SPEC.md` | Search and replace throughout. |
| `CLAUDE.md` | Add a permanent note in the "Database conventions" section: "The clients table no longer has `entity_type`, `fund_type`, or `active_fund_type` columns (removed Sub-stage A, 23 May 2026). Fund type lives only on `investments.fund_type`. The Client / Vehicle / Location triangulation has been renamed Lead investor / Beneficial owner / Legal owner in user-facing UI; database column names are unchanged." |
| `AGENTS.md` | Mirror the CLAUDE.md note. |

**Future Work additions** to the platform spec:

- **14.16** Application form PDF wording review
- **14.17** `client_relationships` structural workflow
- **14.18** Saved filter views on the bookbuild
- **14.19** Investor portal beneficial-owner view

(Existing numbering may need to shift; Claude Code should check the current next-available number and adjust.)

**Historical build prompts (one-line note at top):**

| File | Note to add at top |
|---|---|
| `Stage_1_Build_Prompt.md` | (see below) |
| `Stage_2a0_Housekeeping_Prompt.md` | (see below) |
| `Stage_2a1_Frontend_Prompt.md` | (see below) |
| `Stage_2b_Cards_And_Tabs_Prompt.md` | (see below) |
| `Stage_2c_Edit_Modal_Prompt.md` | (see below) |
| `Stage_3a_Bookbuild_Render_Prompt.md` | (see below) |
| `Stage_3a1_Three_Column_Patch_Prompt.md` | (see below) |
| `Stage_3b_Bookbuild_Actions_Prompt.md` | (see below) |
| `Stage_4a_Closing_Tab_Prompt.md` | (see below) |
| `Stage_6b_Application_Form_Documenso_Prompt.md` | (see below) |

The standard note (single line, italicised, at the very top under the title):

> *Historical reference. Terminology updated in Sub-stage B of the Entity Model Cleanup (PR #19, May 2026): Client → Lead investor, Vehicle → Beneficial owner, Location → Legal owner. The `entity_type`, `fund_type`, and `active_fund_type` columns on the `clients` table were removed in Sub-stage A. See the current platform spec for live terminology and schema.*

This adds zero risk — the original content of each prompt is untouched, just prefixed.

---

## 4. PR structure

One PR (`feat/entity-model-cleanup-B`) with five logical commits in this order:

1. **`fix: resolve type errors from entity_type/fund_type column drops`** — the 10 mechanical fixes from §3.1. Smallest commit; gets the codebase compiling again.
2. **`refactor: rename Client/Vehicle/Location → Lead investor/Beneficial owner/Legal owner in UI`** — every label change from §3.2. Pure rename, no logic change.
3. **`feat(bookbuild): split filters into Beneficial owner + Legal owner with multi-select`** — the filter restructure from §3.3. The one piece of behavioural change.
4. **`fix(settings): rewire Fund Management to count from investments.fund_type`** — the fix from §3.4 plus the explanatory note.
5. **`docs: sweep vocabulary across specs and historical build prompts`** — §3.5.

Each commit reviewable in isolation. PR description provides a per-commit summary.

---

## 5. Verification

After the PR builds and the preview deploys, the verification is more user-facing than Sub-stage A's database checks. Required spot-checks:

1. **Cyclr test deal — bookbuild table.** Headings now read "Lead investor / Beneficial owner / Legal owner". All 13 rows display correctly. NULL beneficial owners show the lead's name in muted grey. NULL legal owners show "Direct" or the beneficial owner's name muted.
2. **Add Investors modal.** Labels updated. Existing search and selection behaviour unchanged.
3. **Beneficial owner filter.** Tick "Rother House" alone → only Rother House rows. Tick "Rother House" + "Lead investor only" → Rother House rows AND own-name rows. Untick all → all rows back.
4. **Legal owner filter.** Tick "Held direct" → only direct rows. Tick a specific nominee → only rows held by that nominee. Combine with Beneficial owner filter → AND logic respected.
5. **Search.** Placeholder updated. Searching by lead name, vehicle name, or nominee name still finds matches.
6. **Client Record page (Cyclr test deal investors).** Loads without errors. Entity type badges/rows that used to display are gone.
7. **Settings → Fund Management page.** Counts populate from investments. Explanatory note visible. Page no longer errors.
8. **Type-check (`npm run typecheck` or equivalent).** Clean — zero errors after the 10 fixes.
9. **No runtime errors in browser console** when navigating: bookbuild → client record → settings.

If anything fails, capture in the PR comments and iterate before merge.

---

## 6. What this stage does NOT change

- Database schema (untouched — Sub-stage A handled all schema work)
- Documenso application form template (Future Work 14.16)
- Investor portal (Future Work 14.19)
- Saved filters / filter persistence (Future Work 14.18)
- Family-relationship workflow (Future Work 14.17)
- Sell deal redesign (separate stage, but will inherit the new vocabulary)
- The two-query-then-merge pattern (untouched — all the filtering happens in TypeScript over already-fetched data, per existing pattern)

---

## 7. Acceptance criteria

Sub-stage B is done when:

- All 5 commits land in one PR
- Type-check clean — zero errors
- All 9 verification spot-checks above pass on the deployed preview
- Spec documentation updated; historical build prompts have the prefix note
- Future Work items 14.16–14.19 added to the platform spec
- Ed has signed off after spot-checking the deployed preview
- PR merged to `main`

Then the Entity Model Cleanup is complete.
