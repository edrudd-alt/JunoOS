# Prompt for Claude Code — Stage 4a: Closing Tab

Copy and paste the text between the `===PROMPT START===` and `===PROMPT END===` lines into Claude Code.

---

===PROMPT START===

Stage 4a — first half of Stage 4. Builds the Closing tab fully — investor table, Mark as paid action, Add late addition override, bookbuild auto-lock logic, search/filter/bulk actions. Shares ~80% of patterns with the Bookbuild tab; reuse aggressively rather than reimplementing.

Stage 4b will follow with the Completion tab.

NO Completion tab work. NO Documents/Invoices tab work. NO new database schema beyond what's already there.

## Documents to read first

1. `/docs/Juno_Deal_Page_Restructure_Spec_v3.2.md` — Sections 5 and 6 (Closing tab) are the primary references. If only v3.1 is in the repo, use it — Stage 4a's design is documented in this prompt explicitly so spec version matters less.
2. `/CLAUDE.md` — two-query Supabase pattern still mandatory.
3. `/src/app/(app)/deals/[id]/BookbuildTab.tsx` — the patterns to reuse.

## Workflow rules

- Branch: `feature/stage-4a-closing-tab`
- Commit logical chunks: tab skeleton, bookbuild auto-lock derivation, Closing table render, Mark as paid action, Add late addition override, search/filter/bulk
- Push branch when done; do NOT merge to main — Ed reviews preview first
- Vercel auto-deploys preview; report URL when ready
- DO NOT modify the database schema. Use existing fields only.

## Background — what the Closing tab is

The Closing tab is for **investors who have signed but haven't yet been marked complete.** Specifically, rows where `lifecycle_status IN ('signed', 'paid')` are active in this tab. Past rows (`complete`) are shown below a divider, greyed.

When **all active investors have reached `signed` or beyond**, the Bookbuild tab auto-locks (becomes read-only with an "Add late addition" override). This is derived from the data on every page load — no stored state.

## The big picture — tab presence per status

| Status | Bookbuild tab | Closing tab | Completion tab |
|---|---|---|---|
| soft_circled, confirmed, app_form_sent, chase, declined | Active | Not present | Not present |
| signed | Past (greyed below divider) | **Active** | Not present |
| paid | Past | **Active** | Active (Stage 4b) |
| complete | Past | **Past (greyed)** | Past |

A row can simultaneously be "past" in one tab and "active" in another. This is intentional.

## Task 1 — Bookbuild auto-lock derivation

Implement a helper function `isBookbuildLocked(dealInvestors)` that returns `true` when:
- There is at least one investor on the deal (excluding declined), AND
- All non-declined investors have `lifecycle_status` in `['signed', 'paid', 'complete']`

This is computed on read, no stored state. Return `false` if no investors exist.

When `isBookbuildLocked` returns `true`:
- Bookbuild tab's **+ Add investors** button is disabled with a tooltip: "Bookbuild auto-locked — all investors signed. Use Closing tab's '+ Add late addition' for exceptions."
- All Next-step buttons in Bookbuild remain functional (e.g. someone in `app_form_sent` can still be marked signed via the existing flow) — but new soft-circles are blocked
- A small banner at the top of the Bookbuild table reads: "Bookbuild auto-locked. To add a late investor, use the Closing tab's '+ Add late addition' button."

When `isBookbuildLocked` returns `false`:
- Bookbuild behaves as it does today

Note: declined investors don't count. A deal with all signed/paid/complete rows EXCEPT for one declined investor is still "auto-locked."

Centralise this in a utility (e.g. `dealUtils.ts` already exists from Stage 3a). Both Bookbuild and Closing tabs reference it.

Commit as: "Add bookbuild auto-lock derivation".

## Task 2 — Closing tab table render

Replace the Stage 2b placeholder in the Closing tab with the full table. Same column structure as Bookbuild but slightly adjusted.

### Columns (in order)

1. Checkbox (28px, disabled for past rows)
2. **Client** — same as Bookbuild (with KYC indicator). min-width 160px.
3. **Vehicle** — same as Bookbuild
4. **Location** — same as Bookbuild
5. **Confirmed (£)** — right-aligned, tabular numerals (no soft-circle column in Closing — irrelevant here)
6. **Shares** — right-aligned
7. **Fee (%)** — right-aligned (always shown for Closing rows since they're all confirmed-or-beyond; show with 🔒 since fee is locked at this point)
8. **Status** — coloured badge (Signed / Paid / Complete)
9. **Days since signed** — calculated `(NOW() - updated_at)::int` formatted as e.g. "3 days" or "12 days". Amber styling if > 14 days for signed rows. Empty for paid/complete rows.
10. **POA** — same as Bookbuild
11. **EIS** — same as Bookbuild (deal-level)
12. **Next step** — see Task 4
13. **Action ("⋯")** — see Task 5

### Active vs past split

- **Active rows** (above divider, full opacity): `lifecycle_status IN ('signed', 'paid')`
- **Divider:** "Past states (now active in Completion)" — only show if at least one past row
- **Past rows** (below divider, ~45% opacity): `lifecycle_status = 'complete'`

Sort active rows by status priority (signed first, then paid), then within same status by `updated_at` ascending.

### Totals row

At the bottom, aggregating active rows only (signed + paid, excluding complete):
- Confirmed total
- Shares total
- Fee total

Same styling as Bookbuild's totals row.

### Data fetching

Same two-query pattern as Bookbuild — fetch deal_investors, then clients + nominees separately, merge in JS. Reuse the helper from BookbuildTab if possible.

Commit as: "Build Closing tab table render with active/past split".

## Task 3 — Tab badge counts

The tab strip's count badges (built in Stage 2b) need to update for the Closing tab specifically.

For Closing tab badge:
- Show count of `lifecycle_status IN ('signed', 'paid')` (active in this tab) — single number, not active/total

This may already be correct from earlier work — verify and adjust if needed.

## Task 4 — Next step column behaviour

Per status, render:

| Status | Next step rendering |
|---|---|
| signed | Green button "Mark as paid" |
| paid | Italic grey text "In Completion tab" (no button) |
| complete | Italic grey text "Complete" (no button) |

### "Mark as paid" action

Click opens a small confirmation modal:

```
┌─────────────────────────────────┐
│ Confirm cash received           │
│                                 │
│ Confirm cash received for       │
│ [Investor name] (£[X])?         │
│                                 │
│        [ Cancel ]  [ Confirm ]  │
└─────────────────────────────────┘
```

On Confirm:
- Update row: `lifecycle_status = 'paid'`, `updated_at = NOW()`, `updated_by = current user`
- Insert into `deal_action_logs`: action_type='mark_paid', is_mock=false (this is a real state change)
- Toast: "[Investor name] marked as paid"
- Modal closes; row re-renders as paid

No date entry, no amount entry, no bank reference. Just the confirmation.

Commit as: "Add Mark as paid action with light confirmation".

## Task 5 — Row "⋯" menu

Per status:

**Signed:**
- View investor record
- Edit deal details for this investor (amount only — fee is locked)
- Move backwards to app_form_sent — confirmation: "Move [Investor] back to App form sent? Their signed status will be reverted." → on confirm, sets lifecycle_status='app_form_sent', updates audit log
- Mark as paid (same as Next-step button)
- Note: Decline / Remove are NOT available for signed rows (audit trail protection)

**Paid:**
- View investor record
- Edit deal details for this investor (amount only — fee is locked)
- Move backwards to signed — confirmation: "Move [Investor] back to Signed? Cash receipt will be reverted." → on confirm, sets lifecycle_status='signed'
- Go to Completion tab (jump to ?tab=completion to see this row's checklist)

**Complete (past row):**
- View investor record
- Go to Completion tab
- Move backwards to paid — confirmation: "Move [Investor] back to Paid? The investments record will need to be reviewed." → on confirm, sets lifecycle_status='paid'. Note: this does NOT auto-delete the investments row (orphans it for review). Log action.

### "Edit deal details for this investor" modal

Same component as in Stage 3b but adapted for Closing context. Fields editable:
- Confirmed amount (always editable)
- POA held (toggle)
- Vehicle dropdown
- Location dropdown
- Fee % is read-only (locked at this stage, shown with 🔒 message)

Reuse the existing `EditDealInvestorModal` component if it can be parameterised; otherwise create a similar one.

Commit as: "Add Closing tab row menu with per-status actions".

## Task 6 — Search and filter toolbar

Same pattern as Bookbuild's toolbar (built in Stage 3b). Place above the Closing tab table:

1. Search input — placeholder "Search investors, vehicles, or locations..."
2. Status filter dropdown — checkboxes for: Signed, Paid, Complete (only the relevant statuses for this tab)
3. Vehicle filter dropdown — same as Bookbuild
4. **"+ Add late addition" button** — see Task 7

Filtering behaviour:
- Search: substring match on investor name, vehicle name, nominee name, POA holder name (case-insensitive)
- Status filter: shows only rows whose status matches checked options
- Filters reset when navigating to a different deal
- "Clear filters" link visible when filters active

Empty state: "No investors match your filters. [Clear filters]"

Commit as: "Add search and filter toolbar to Closing tab".

## Task 7 — "+ Add late addition" button (override)

Always visible in the Closing tab toolbar (regardless of bookbuild lock state — the button works in both states, but the wording differs).

### When bookbuild is NOT yet locked

Button label: **"+ Add investors"** (matches Bookbuild's button — calls the same modal as Bookbuild's Add Investors)
- Same flow as Bookbuild: two-tab picker (favourites / other), bulk amount entry
- Investors added go to `lifecycle_status = 'soft_circled'` and appear in Bookbuild

### When bookbuild IS locked

Button label: **"+ Add late addition"**
- Click opens an extra confirmation FIRST: "Bookbuild is auto-locked because all investors are signed or beyond. Adding a late investor is an exception that should only be done with deliberate intent. Continue?"
- "Cancel" or "Yes, add anyway"
- On confirm: opens the same Add Investors modal as Bookbuild
- Investors added still go to `lifecycle_status = 'soft_circled'` and appear in Bookbuild
- Audit log entry: `action_type='late_addition'`, with details JSONB recording the deal's pre-add state

This means: **late additions still pass through Bookbuild's normal lifecycle.** They just enter the system at a non-standard time.

Reuse the existing `AddInvestorsModal` component — pass a `lateAddition: boolean` prop or similar to drive the confirmation prompt.

Commit as: "Add late addition override for post-lock investor additions".

## Task 8 — Bulk action footer bar

Same pattern as Bookbuild's bulk footer (Stage 3b). When ≥1 row checked, sticky navy footer appears.

### Bulk actions available

**For signed rows selected (all same status):**
- Primary action: "Mark as paid (N)" — opens bulk confirmation: "Confirm cash received for [N] selected investors (£X total)?"
- Other: Move backwards (no — too risky in bulk for backwards moves; offer per-row only)

**For paid rows selected:**
- No bulk action (Completion tab handles their progression)
- Footer can show "These rows are managed in the Completion tab" with a "Go to Completion" link

**For mixed selections:**
- Primary action disabled; warning: "Selected rows have different statuses."

**For complete (past) rows:**
- Their checkboxes are disabled (consistent with Bookbuild's past rows)

Commit as: "Add bulk action footer to Closing tab".

## Task 9 — Bookbuild banner (when auto-locked)

When `isBookbuildLocked` returns true and the user is on the Bookbuild tab, show a small banner at the top of the Bookbuild table:

```
ℹ️ Bookbuild auto-locked: all investors are signed or beyond. To add a late investor, go to the Closing tab and use "+ Add late addition".
```

Style: light blue/grey background, info icon. Dismissible? No — it's structural information, should always be visible when locked.

Commit as: "Add Bookbuild banner when auto-locked".

## Task 10 — Verification

Before pushing:

1. Run `npm run build` and confirm no errors
2. Run typecheck/lint
3. In dev mode on the Cyclr test deal:

**Auto-lock derivation:**
- Cyclr currently has rows in many states (soft_circled, confirmed, app_form_sent, signed, paid, declined). `isBookbuildLocked` should return `false`. Verify the Bookbuild tab is NOT in locked state — "+ Add investors" works as before.
- (Don't manually flip every row to signed for testing — too disruptive. Instead, mentally verify the helper function would return `true` if rows were all signed/paid/complete. Add a unit-style verification if helpful.)

**Closing tab render:**
- Switch to Closing tab — table renders with 2 active rows (Humphrey signed, Bob via vehicle paid) and 0 past rows
- All 13 columns visible
- "Days since signed" shows for Humphrey (recently set, so probably "0 days" or "1 day"); empty for Bob's paid row
- Totals row at bottom shows totals for active rows

**Mark as paid action:**
- On Humphrey (signed): click "Mark as paid" → confirmation modal → confirm → row becomes paid, toast appears, Closing tab still shows the row but now in paid state

**Move backwards:**
- On Bob's paid row: row menu → "Move backwards to signed" → confirmation → row reverts to signed
- (After verification, you may want to leave it for Ed to review on the preview)

**Add investors / Add late addition:**
- "+ Add investors" button visible in Closing toolbar
- Currently behaves like Bookbuild's add (since deal isn't auto-locked)

**Search/filter:**
- Type a name → filters Closing rows
- Status filter shows Signed/Paid/Complete options

**Bookbuild banner:**
- On Bookbuild tab → no banner (deal isn't locked)

**Sanity:**
- Bookbuild tab still works (Stage 3a/3b behaviour intact)
- Sell deals still render the old page

If anything fails, STOP and report.

## Task 11 — Push and report

Once verified:
1. Push branch to GitHub
2. Wait for Vercel preview
3. Report:
   - Vercel preview URL
   - List of commits
   - Any judgement calls or concerns
   - Any places where the spec was unclear and you made a decision
   - Note anything that doesn't match this prompt

DO NOT merge to main. Wait for Ed's review.

## Important constraints

- DO NOT touch the Completion tab — it's still a placeholder. Stage 4b builds it.
- DO NOT touch Documents/Invoices tabs.
- DO NOT modify the persistent header, summary cards, or Edit deal details modal.
- DO NOT touch sell deal rendering.
- DO NOT modify the database schema.
- DO NOT add bank reference, payment date entry, or any other "complexity" to the Mark as paid flow. It's deliberately a single-click confirmation.
- DO NOT auto-create the `investments` table row when marking paid. That happens only on Mark complete in Stage 4b.
- The user (Ed) is non-technical. Explain things in plain English in your final report.

When everything is done and pushed, stop and report. If you hit a blocker, STOP and ask before improvising.

===PROMPT END===

---

## After Claude Code responds

When the preview is up, the things to specifically test:

**Most important:**

1. **The Closing tab renders** with Humphrey (signed) and Bob via Robert Bigballs (paid) as active rows
2. **"Days since signed"** shows for Humphrey (recently — Stage 3a seeded him as just-signed)
3. **Mark as paid** on Humphrey → row becomes paid in real database
4. **Bookbuild tab not locked** — banner not showing (the seed has lots of pre-signed rows)

**Then:**

5. **Toolbar** with search, filter, "+ Add investors" button
6. **Row menu** opens with per-status options
7. **Bulk action footer** appears when rows ticked

**Sanity:**

8. Stage 3a/3b Bookbuild still works as before
9. Sell deals still load old page
10. Browser DevTools console — no red errors

A small honest reflection: Stage 4a is structurally simpler than Stage 3 because most patterns are established. Estimated 2-3 days of work, possibly less. After this, only the Completion tab (Stage 4b) and Documents/Invoices (Stage 5) are big builds remaining.

When you're ready to start Stage 4a, take this prompt to Claude Code. I'll be here when there are commits to verify or a preview to review.
