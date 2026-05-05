# Prompt for Claude Code — Stage 2b: Summary Cards + Tab Strip

Copy and paste the text between the `===PROMPT START===` and `===PROMPT END===` lines into Claude Code.

---

===PROMPT START===

Stage 2b — the rest of the deal page scaffolding. Four summary cards above the tabs, the five-tab strip with count badges, and placeholder tab bodies. URL state syncs the active tab.

This stage is scaffolding only — NO tab body content, NO Edit deal details modal, NO workflow buttons. Strict scope.

## Documents to read first

1. `/docs/Juno_Deal_Page_Restructure_Spec_v3.1.md` — Sections 2.2 (summary cards), 2.3 (tab strip), 2.4 (tab content panels) are the primary references.
2. `/docs/Deal_Page_Restructure_Decision_Log.md` — for context.
3. `/CLAUDE.md` — the two-query Supabase pattern is mandatory here.

## Workflow rules

- Branch: `feature/stage-2b-cards-and-tabs`
- Commit logical chunks: one for cards, one for tab strip, one for placeholders, one for URL state
- Push branch when done; do NOT merge to main — Ed reviews preview first
- Vercel auto-deploys preview; report URL when ready

## Task 1 — Four summary cards

Per spec Section 2.2. Place a row of four equal-width cards between the persistent header and the tab strip.

**Card structure (each card):**
- Label (e.g. "Bookbuild progress") in small caps grey
- Big value in the middle (e.g. "76%")
- Progress bar below the value
- Sub-text in smaller grey (e.g. "£455k of £600k soft-circled")

**The four cards:**

| # | Label | Value | Progress bar (fills) | Progress colour | Sub-text |
|---|---|---|---|---|---|
| 1 | Bookbuild progress | `[soft-circled total / target] %` | Same % | Teal | `£X of £Y soft-circled` |
| 2 | Signatures | `[n signed] / [total active in deal]` | n/total ratio | Teal | `[n] chasers due` (amber if any chasers; otherwise hide sub or show "no chasers") |
| 3 | Cash received | `£[total received]` | total_received/total_confirmed ratio | Blue | `From [n] investors` |
| 4 | Completed | `[n complete] / [total active]` | ratio | Teal | `All docs filed` if all complete; otherwise `[n] outstanding` |

For the seeded test deal (Cyclr, no investors yet):
- Card 1: 0% / £0 of £200,000 soft-circled
- Card 2: 0 / 0 / no chasers
- Card 3: £0 / From 0 investors
- Card 4: 0 / 0 / 0 outstanding

**Data fetching:**
- Use the two-query-then-merge pattern from CLAUDE.md
- Fetch deal_investors rows for this deal first
- Aggregate the values in JavaScript (don't try to do it in PostgREST joins)
- Important: filter for non-declined rows when computing totals (declined investors don't count toward the deal totals)
- The `lifecycle_status` field added in Stage 1 is what determines who counts where:
  - "Active in deal" = anyone except `declined`
  - "Soft-circled total" = sum of `soft_circle_amount` where status NOT IN ('declined')
  - "Confirmed total" = sum of `confirmed_amount` where status NOT IN ('declined', 'soft_circled')
  - "Signed" = count where status IN ('signed', 'paid', 'complete')
  - "Cash received total" = sum of `confirmed_amount` where status IN ('paid', 'complete')
  - "Complete" = count where status = 'complete'
  - "Chasers due" = count where status = 'chase'

Commit as: "Build four summary cards above tab strip".

## Task 2 — The tab strip

Per spec Section 2.3. Place below the summary cards, above where tab content will go.

**Tab list (in this exact order):**
1. Bookbuild
2. Closing
3. Completion
4. Documents
5. Invoices

**Active tab styling:**
- The active tab has a teal underline and bolder text (per the v3.1 mockup styling)
- Inactive tabs are grey, no underline

**Count badges per tab:**

For Bookbuild, Closing, Completion: show `[active] / [total]` format. The split:

| Tab | Active count | Total count |
|---|---|---|
| Bookbuild | Investors with status IN ('soft_circled', 'confirmed', 'app_form_sent', 'chase', 'declined') | Same set |
| Closing | Investors with status IN ('signed', 'paid') | Plus 'complete' (past in this tab) |
| Completion | Investors with status IN ('paid' AND completion items pending) | Plus 'complete' (past in this tab) |

For Documents: single count = total documents on the deal (`documents.deal_id = [this deal]`).
For Invoices: single count = total invoices on the deal.

For our test deal: every count is 0. Show `0 / 0` for the action tabs and `0` for Documents and Invoices. **Do not hide a badge with 0 count** — leave it visible so the tab structure is consistent.

**Note for Stage 3+:** the Bookbuild "active vs past" logic in the table itself (where some rows go below a divider) is more nuanced than the simple count above. For Stage 2b, the count badge uses the simpler aggregation defined here. Stage 3 will refine the Bookbuild tab's internal split.

Commit as: "Add five-tab strip with live count badges".

## Task 3 — Tab body placeholders

For each of the five tabs, render a clear placeholder when that tab is active. Do NOT render a placeholder when a tab is inactive (only the active tab's body is visible at a time — that's how tabs work).

**Placeholder content per tab:**

```
[Tab name] — coming in [Stage label]
[One-line explanation of what this tab will eventually contain]
```

Specifically:
- Bookbuild: "Bookbuild content — Stage 3 / Investor pipeline up to and including signature, with Next-step workflow buttons."
- Closing: "Closing content — Stage 4 / Signed investors awaiting payment and completion handover."
- Completion: "Completion content — Stage 4 / Per-investor checklist for share certs, EIS certs, transaction statements, doc filing."
- Documents: "Documents tab — Stage 5 / All deal documents with by-investor / by-type / by-date views and superseded filtering."
- Invoices: "Invoices tab — Stage 5 / Auto-drafted fee invoices, manual push to Xero, paid status."

Style the placeholders distinctively (e.g. dashed border, light grey background, centred text) so it's obviously not real content.

Commit as: "Add tab body placeholders for each of the five tabs".

## Task 4 — URL state for active tab

The active tab should sync with the URL via a query parameter (e.g. `?tab=bookbuild`).

Behaviour:

1. **Default:** if no `tab` query param, the Bookbuild tab is active
2. **Click a tab:** the URL updates (e.g. `?tab=closing`) without a full page reload (use Next.js `router.push` or `router.replace` — `replace` is preferable so the browser back button doesn't cycle through every tab click)
3. **Refresh:** the page renders with the active tab matching the URL
4. **Back/forward:** browser back/forward navigation works correctly

**Allowed values:** `bookbuild`, `closing`, `completion`, `documents`, `invoices`. Anything else (or missing) defaults to `bookbuild`.

**Important:** make sure the URL state works for both the test deal (Cyclr) and any other deal the user might navigate to. The query param should be relative to the deal page, not global.

Commit as: "Sync active tab with URL query parameter".

## Task 5 — Verification

After all tasks complete, before pushing:

1. Run `npm run build` and confirm no errors
2. Run typecheck/lint if configured
3. In dev mode, visit the test deal `/deals/cecde2bc-0935-4873-85e5-bda135d9af75`:
   - Persistent header still renders correctly (Stage 2a.1 work)
   - Four summary cards appear below header with correct empty-state values
   - Tab strip appears below cards with all 5 tabs and `0 / 0` (or `0`) badges
   - Bookbuild tab is active by default with placeholder content
   - Click each tab — placeholder swaps, URL updates to `?tab=...`
   - Refresh on a non-default tab (e.g. `?tab=invoices`) — Invoices tab stays active
   - Browser back navigates correctly
4. Visit a sell deal — the OLD page renders (verify routing still works)

If anything fails, STOP and report.

## Task 6 — Push and report

Once verified:
1. Push branch to GitHub
2. Wait for Vercel preview deployment
3. Report:
   - Vercel preview URL
   - Test deal URL on preview (with `?tab=bookbuild` for the default)
   - List of commits on the branch
   - Any judgement calls you made
   - Any concerns or things that didn't fit cleanly

DO NOT merge to main. Wait for Ed's review.

## Important constraints

- DO NOT build any tab body content beyond the placeholders. Stages 3-5 do that.
- DO NOT touch the persistent header beyond what's necessary (it should still work as before).
- DO NOT build the Edit deal details modal. That's Stage 2c.
- DO NOT add KYC indicators, fee columns, status badges, or any tab-specific UI. Those are Stage 3+.
- DO NOT modify the database schema. No new columns, no new tables. The existing schema has everything needed for these counts.
- DO NOT add any "Send", "Mark received", or workflow buttons.
- DO NOT modify how sell deals render. They keep the old page.
- The user (Ed) is non-technical. Explain things in plain English in your final report.

When all tasks are complete and pushed, stop and report. If you hit a blocker, STOP and ask before improvising.

===PROMPT END===

---

## After Claude Code responds

When Claude Code reports back with the preview URL:

**1. Visit the preview** and check:

- The four summary cards render below the header with all-zero values (this is correct for the empty test deal)
- The five-tab strip is visible below the cards with badges showing `0 / 0` for the action tabs and `0` for Documents and Invoices
- Bookbuild tab is the default — its placeholder is visible
- Click each tab — the placeholder swaps and the URL updates
- Refresh on a non-default tab — it stays active
- Browser back/forward works

**2. Look for visual issues:**
- Cards aligned properly (all four equal width, evenly spaced)
- Tab strip aligns with the cards above
- Active tab clearly distinguished from inactive tabs
- Placeholder content looks like a placeholder, not like a finished feature

**3. Paste Claude Code's response here.** I'll do my own verification — particularly checking that the count queries are correct (i.e. they'd return real numbers if real data was present, not just 0 by accident).

**4. If everything's good, you approve the merge to main.**

This is the same pattern as Stage 2a.1: build → preview → review → merge. We'll keep using it for every stage going forward.
