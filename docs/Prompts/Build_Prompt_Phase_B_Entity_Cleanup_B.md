# Build Prompt — Phase B Entity Model Cleanup, Sub-stage B: UI Rename and Documentation (FINAL, ready to run)

**Reference spec:** `docs/specs/Juno_Phase_B_Stage_Entity_Model_Cleanup_B_Spec_v1.md` (committed as Task 0)
**Master platform standards:** `CLAUDE.md` and `AGENTS.md`
**Depends on:** Sub-stage A (PR #18, merged 23 May 2026)
**Branch:** `feat/entity-model-cleanup-B`
**Supabase project ref:** `pzfydvwbeeupfgnxkpad`

> **NOTE TO CLAUDE CODE:** This sub-stage is code, UI, and documentation work — no schema changes. You may apply database operations freely (none are expected, but column comments could be tweaked if needed) using the Supabase MCP. The five commits described below should land as a single PR, reviewable section by section. After the PR is up, Ed will spot-check the deployed preview via Vercel.

---

## 0. Pre-flight context (read before doing anything)

This is **Sub-stage B** of the two-part Entity Model Cleanup. Sub-stage A removed `entity_type`, `fund_type`, and `active_fund_type` from `clients` and added the vehicle-lead integrity trigger. The database is clean. This stage finishes the work code-side:

- 10 type-error fixes from Sub-stage A's regeneration
- Terminology rename in user-facing UI (Client → Lead investor, Vehicle → Beneficial owner, Location → Legal owner)
- Filter restructure (multi-select Beneficial owner + new multi-select Legal owner)
- Settings → Fund Management page rewire to read from `investments.fund_type`
- Documentation sweep across 5 live spec docs and 10 historical build prompts

Read `docs/specs/Juno_Phase_B_Stage_Entity_Model_Cleanup_B_Spec_v1.md` end to end before starting. The most important context is in:

- **Section 1** — purpose
- **Section 2** — out of scope (respect every item)
- **Section 3** — the five pieces of work, each with detail
- **Section 4** — PR structure (5 commits, one PR)
- **Section 5** — verification checklist (9 spot-checks)

**Standing rules from the platform (do not violate):**

1. **No PostgREST embedded joins anywhere.** Two-query-then-merge pattern only. Documented in `CLAUDE.md`.
2. **Plain English alongside technical detail.** Every PR description and every non-trivial code comment must explain reasoning in plain English. Ed is not a coder.
3. **One PR for this sub-stage.** Branch `feat/entity-model-cleanup-B`, one PR.
4. **Commit grouping matters.** Five commits in the order listed in spec §4, each reviewable in isolation. Don't bundle unrelated changes into a single commit.
5. **Internal-only in v1, designed with the investor portal in mind.** The filter restructure (new Legal owner filter) is forward-looking — when the portal arrives, the data model and filters already support beneficial-owner / legal-owner views.

---

## 1. Current state (verified 24 May 2026)

After Sub-stage A:

- `clients.entity_type`, `clients.fund_type`, `clients.active_fund_type` are gone
- The `trg_vehicle_belongs_to_lead` trigger is live on `deal_investors`
- 7 column comments are set on `clients` and `deal_investors`
- `types/supabase.ts` was regenerated; the three columns are no longer in the type
- 10 type errors remain to be fixed (per the PR #18 description):
  - `ClientRecord.tsx` — 4 errors. Includes a local `LinkedEntity` interface that requires `entity_type`; the field needs to drop from the interface too.
  - `DetailsTab.tsx` — 4 errors
  - `RecordTransactionModal.tsx` — 2 errors

---

## 2. Task list

### Task 0 — Commit the spec

Copy `Juno_Phase_B_Stage_Entity_Model_Cleanup_B_Spec_v1.md` (provided by Ed, in his outputs) into the repo at `docs/specs/Juno_Phase_B_Stage_Entity_Model_Cleanup_B_Spec_v1.md`. Confirm with Ed if the file content is not immediately available.

Commit on the new branch `feat/entity-model-cleanup-B` as the first commit:

```
docs: add Entity Model Cleanup Sub-stage B spec
```

Do NOT modify the spec contents.

### Task 1 — Commit 1: Type-error fixes

Fix the 10 errors from Sub-stage A's regeneration. Per the spec §3.1, **the fix is removal, not replacement**. No new UI is built to display the removed data — the fields disappear silently.

Specific changes:

**`ClientRecord.tsx`** (4 errors):
- Drop any UI element (badge, row, label) that displays `client.entity_type` or `entity.entity_type`
- Drop the `entity_type` field from the local `LinkedEntity` interface
- Any conditional logic that branches on `entity_type` values: simplify by removing the branches (if "show this badge only when `entity_type === 'corporate'`" was the rule, just remove the entire badge)

**`DetailsTab.tsx`** (4 errors):
- Drop any UI element that displays `client.entity_type`, `client.fund_type`, or `client.active_fund_type`
- Drop any input field, label, or helper text that allowed editing these values
- The save/update logic should no longer attempt to write these fields

**`RecordTransactionModal.tsx`** (2 errors):
- Currently reads `client.active_fund_type` (falling back to `client.fund_type`) to default the new investment's `fund_type`
- Replace with: query the client's investments table for the most recent investment's `fund_type`, falling back to `'syndicate'` if no prior investments exist
- This is the only behavioural-rather-than-mechanical fix in the type-error work. Add a clear plain-English comment explaining the new lookup rule

Commit message:
```
fix: resolve type errors from entity_type/fund_type column drops

Sub-stage A removed clients.entity_type, clients.fund_type, and
clients.active_fund_type. This commit fixes the 10 resulting type
errors across ClientRecord.tsx (4), DetailsTab.tsx (4), and
RecordTransactionModal.tsx (2).

Per the approved spec, the UI elements that displayed these fields
are removed silently — they displayed information that was a
category error and is no longer meaningful. The LinkedEntity
interface inside ClientRecord.tsx loses its entity_type field
too.

RecordTransactionModal.tsx is the one non-mechanical fix: instead
of reading client.active_fund_type, the default fund_type for a new
investment now comes from the client's most recent prior investment,
falling back to 'syndicate' for new clients.
```

### Task 2 — Commit 2: Terminology rename in UI

Pure label changes. No logic changes. See spec §3.2 for the full table.

Key places to touch:

- `BookbuildTab.tsx` — three column headings, the search placeholder, and the bulk-action footer messages
- `AddInvestorsModal.tsx` — left panel label, dropdown 1 label, dropdown 2 label, NULL labels
- Any helper text, tooltips, ARIA labels, or error messages elsewhere that use "vehicle" or "location" in the user-facing sense

Specific NULL labels (from spec §3.2):
- Beneficial owner column when `investing_vehicle_id IS NULL`: display the lead's name in muted grey (existing pattern, just new wording)
- Legal owner column when `nominee_id IS NULL`: display "Direct (no nominee)" — slightly more explicit than today's "Direct"
- Add Investors modal Beneficial owner dropdown's NULL option: "Lead investor" (replaces "Own name")
- Add Investors modal Legal owner dropdown's NULL option: "Direct (no nominee)"

Things you do NOT change in this commit:
- Database column names (`client_id`, `investing_vehicle_id`, `nominee_id`)
- The data flowing into the dropdowns (selection logic unchanged)
- The filter UI itself (that's Commit 3)
- Any application form PDF text (Future Work 14.16)

Commit message:
```
refactor: rename Client/Vehicle/Location → Lead investor/Beneficial owner/Legal owner in UI

Per the approved spec, the user-facing terminology for the
three-dimensional investor identity model is updated:

- Client → Lead investor (the real human Juno has a relationship with)
- Vehicle → Beneficial owner (the entity ultimately owning the investment)
- Location → Legal owner (the entity on the share register)

Database column names are unchanged. This is a pure UI rename:
column headings, dropdown labels, NULL placeholders, search hints,
tooltips, and bulk-action messages. No selection logic or data
fetching changes.

The new vocabulary aligns with standard legal terminology and
makes the model easier to reason about — particularly ahead of
the eventual investor portal where "filter holdings by beneficial
owner" becomes a first-class user need.
```

### Task 3 — Commit 3: Filter restructure

The one piece of behavioural change. See spec §3.3 for the full UX detail.

Implement:

1. **Replace the single-select "Vehicle" filter** with a multi-select "Beneficial owner" filter
2. **Add a new multi-select "Legal owner" filter** that didn't exist before
3. Both filters use the same UI component pattern as the existing Status filter (multi-select dropdown with checkboxes)
4. Filter combination logic:
   - Within a filter: OR
   - Across filters: AND
5. Both filters reset on deal navigation (same as today)

Option structure for each filter (from spec §3.3):

**Beneficial owner filter:**
- ☐ Lead investor only (`investing_vehicle_id IS NULL`)
- ☐ Any separate beneficial owner (`investing_vehicle_id IS NOT NULL`)
- *(visual divider)*
- ☐ Each distinct beneficial owner that appears in this deal's `deal_investors`

**Legal owner filter:**
- ☐ Held direct (`nominee_id IS NULL`)
- ☐ Held via any nominee (`nominee_id IS NOT NULL`)
- *(visual divider)*
- ☐ Each distinct nominee that appears in this deal's `deal_investors`

Data sourcing: the lists of specific beneficial owners and nominees are computed from the deal_investors data already loaded for the bookbuild. No new database queries needed; filter logic runs client-side in TypeScript over already-fetched data (consistent with existing pattern).

Commit message:
```
feat(bookbuild): split filters into Beneficial owner + Legal owner with multi-select

Replaces the single-select Vehicle filter with two independent
multi-select filters, matching the new vocabulary established in
the previous commit and giving the team capabilities that didn't
exist before.

Beneficial owner filter (replaces Vehicle filter):
- Lead investor only
- Any separate beneficial owner
- Each specific beneficial owner in this deal

Legal owner filter (new):
- Held direct
- Held via any nominee
- Each specific nominee in this deal

Combination logic: OR within a single filter (standard multi-select
pattern), AND across filters (intersect with Status filter and
search). Filters reset on deal navigation; saved views are Future
Work 14.18.

All filter logic runs client-side over already-fetched data,
preserving the two-query-then-merge pattern.
```

### Task 4 — Commit 4: Settings → Fund Management fix

Rewire the page to read counts from `investments.fund_type` instead of the removed `clients.fund_type`. See spec §3.4.

Specific changes:

1. Find the count-loading logic in the Fund Management page
2. Replace with a query against `investments`:
   ```sql
   SELECT fund_type, COUNT(DISTINCT client_id) AS client_count
   FROM investments
   GROUP BY fund_type
   ```
   Following the two-query-then-merge pattern: fetch counts, fetch fund_types reference rows, merge in TypeScript
3. Remove the "Both" pseudo-column/row entirely (no longer applicable)
4. Add the explanatory note adjacent to the count cards:
   > "Note: A client with investments in more than one fund appears in each fund's count. The totals may exceed the unique client count."
   Treat this as standard UI helper text, styled consistently with other notes in the settings area.
5. Confirm the page renders without errors and counts are populated

Commit message:
```
fix(settings): rewire Fund Management to count from investments.fund_type

The Fund Management page previously read clients.fund_type and
clients.active_fund_type to count clients per fund. Both columns
were removed in Sub-stage A, so this page has been broken since
that PR merged.

The fix: count distinct client_id per fund_type from the
investments table. This is the correct source of truth for
fund-type questions per the model established in Sub-stage A
(fund is a property of each investment, not of the relationship).

Semantic change: a client with investments in multiple funds now
appears in each fund's count. The totals across funds may exceed
the unique client count. This is more honest than the old "both"
pseudo-category and reflects reality.

A helper note on the page explains this so it isn't mistaken for
a bug.
```

### Task 5 — Commit 5: Documentation sweep

Five live documents get a full search-and-replace pass. Ten historical build prompts get a one-line note. See spec §3.5 for the full list and the standard note wording.

**Live documents:**

1. `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md` — full vocabulary sweep. Pay particular attention to Section 4.3 (the canonical model description), Sections 6.4 / 7.4 / 8.4 (filter, bookbuild, closing), and the changelog at line 1593.
2. `docs/specs/section_9_client_record.md` — vocabulary fixes (especially lines 42 and 45) plus removal of the `entity_type` migration block at lines 376–381 (those columns no longer exist).
3. `docs/specs/TRANSACTION_WORKFLOW_SPEC.md` — search and replace throughout.
4. `CLAUDE.md` — add a permanent note in the "Database conventions" section with the wording from spec §3.5.
5. `AGENTS.md` — mirror the CLAUDE.md note.

**Future Work additions** in the platform spec — add items 14.16–14.19 with the descriptions from spec §3.5. Check current next-available number and adjust if needed (e.g. if 14.16 is already taken, increment).

**Historical build prompts (10 files)** — add the standard note from spec §3.5 to the very top of each, as the first content after the title:

- `docs/prompts/Stage_1_Build_Prompt.md`
- `docs/prompts/Stage_2a0_Housekeeping_Prompt.md`
- `docs/prompts/Stage_2a1_Frontend_Prompt.md`
- `docs/prompts/Stage_2b_Cards_And_Tabs_Prompt.md`
- `docs/prompts/Stage_2c_Edit_Modal_Prompt.md`
- `docs/prompts/Stage_3a_Bookbuild_Render_Prompt.md`
- `docs/prompts/Stage_3a1_Three_Column_Patch_Prompt.md`
- `docs/prompts/Stage_3b_Bookbuild_Actions_Prompt.md`
- `docs/prompts/Stage_4a_Closing_Tab_Prompt.md`
- `docs/prompts/Stage_6b_Application_Form_Documenso_Prompt.md`

(Confirm exact paths in the repo; structure may vary.) Touch nothing else inside these files — they are archaeological records of past work.

The standard note (single italicised paragraph at the top):

> *Historical reference. Terminology updated in Sub-stage B of the Entity Model Cleanup (PR #19, May 2026): Client → Lead investor, Vehicle → Beneficial owner, Location → Legal owner. The `entity_type`, `fund_type`, and `active_fund_type` columns on the `clients` table were removed in Sub-stage A. See the current platform spec for live terminology and schema.*

Commit message:
```
docs: sweep vocabulary across specs and historical build prompts

Updates 5 live spec documents to use the new vocabulary
(Lead investor / Beneficial owner / Legal owner) consistently.
Removes the obsolete entity_type migration block from
section_9_client_record.md (the column no longer exists).

Adds permanent notes to CLAUDE.md and AGENTS.md describing the
Sub-stage A schema changes and the rename, so future Claude Code
sessions inherit the new convention.

Adds Future Work items 14.16 (application form PDF wording review),
14.17 (client_relationships UI workflow), 14.18 (saved filter
views), and 14.19 (investor portal beneficial-owner view) to the
platform spec.

Prefixes 10 historical build prompts with a one-line note pointing
to the new vocabulary. The original prompt content is unchanged.
```

---

## 3. PR description format

The PR description must include:

1. **Summary** — three or four sentences in plain English describing what the PR does
2. **Commits** — one section per commit with a short summary
3. **Verification spot-checks** — the 9 spot-checks from spec §5, as a markdown checklist Ed can tick:
   - [ ] Cyclr test deal — bookbuild headings updated
   - [ ] Add Investors modal — labels updated
   - [ ] Beneficial owner filter — multi-select works, combinations correct
   - [ ] Legal owner filter — new filter works, combinations correct
   - [ ] Search — placeholder updated, finds matches
   - [ ] Client Record — no entity_type display, no errors
   - [ ] Settings → Fund Management — counts populate, note visible
   - [ ] Type-check clean — zero errors
   - [ ] No browser console errors when navigating
4. **Files touched** — high-level list grouped by area (UI / settings / docs)
5. **Out of scope confirmation** — explicit list of things this PR does NOT change (mirror spec §6)

---

## 4. Things you do NOT do in this sub-stage

- **Do NOT change any database schema.** This is purely code and documentation.
- **Do NOT change database column names** (`client_id`, `investing_vehicle_id`, `nominee_id`).
- **Do NOT touch the Documenso application form template.** Future Work 14.16.
- **Do NOT build `client_relationships` UI.** Future Work 14.17.
- **Do NOT build saved filter views.** Future Work 14.18.
- **Do NOT build investor portal features.** Future Work 14.19.
- **Do NOT rewrite the sell deal spec section content** — just sweep the vocabulary in line with the rest of the docs.
- **Do NOT modify the original content of historical build prompts** — only prefix the standard note.
- **Do NOT bundle unrelated changes** into commits. The five commits are deliberately separated.

---

## 5. Quality bar checklist for the PR

Before pushing and opening the PR:

- [ ] Five commits in the order described, each with the commit message provided
- [ ] Type-check clean (`npm run typecheck`) — zero errors
- [ ] All 10 type-error files from PR #18 description fully resolved
- [ ] No code references to `entity_type`, `fund_type`, or `active_fund_type` remain anywhere in `src/`
- [ ] The PR description has the 9-item verification checklist for Ed
- [ ] Branch name is exactly `feat/entity-model-cleanup-B`
- [ ] Spec committed at `docs/specs/Juno_Phase_B_Stage_Entity_Model_Cleanup_B_Spec_v1.md` as Task 0

---

## 6. What "done" looks like

Sub-stage B is done when:

- Spec committed to `docs/specs/` (Task 0)
- All 5 commits land in one PR
- Type-check clean — zero errors
- All 9 verification spot-checks pass on the deployed preview
- Documentation updated; historical prompts prefixed
- Future Work items 14.16–14.19 added to the platform spec
- Ed has signed off after spot-checking the deployed preview
- PR merged to `main`

Then the Entity Model Cleanup (Sub-stages A + B) is complete and we are ready for the next piece of work — Stage 7 cutover, sell deal redesign, or whatever comes next on Ed's plan.
