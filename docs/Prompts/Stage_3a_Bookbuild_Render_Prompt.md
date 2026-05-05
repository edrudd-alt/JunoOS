# Prompt for Claude Code — Stage 3a: Bookbuild Tab Rendering + Add Investors Modal

Copy and paste the text between the `===PROMPT START===` and `===PROMPT END===` lines into Claude Code.

---

===PROMPT START===

Stage 3a — first half of Stage 3. The Bookbuild tab fully renders against real data, with all 12 columns, status badges, the active/past row split, KYC/POA/EIS indicators, the totals row, and chase compute-on-read. Plus the Add Investors modal (two-tab picker + bulk amount entry).

NO functional Next-step buttons yet (they render but don't do anything). NO fee override popover. NO row "⋯" menu actions. NO search/filter/bulk-action toolbar. Those are Stage 3b.

## Documents to read first

1. `/docs/Juno_Deal_Page_Restructure_Spec_v3.1.md` — Sections 4.1 (Bookbuild definition), 4.2 (active vs past), 4.3 (table columns), 4.4 (totals row), 4.5 (chase mechanics, KYC visibility), 4.9 (fee column display rules)
2. `/docs/Deal_Page_Restructure_Decision_Log.md` — for context
3. `/CLAUDE.md` — two-query Supabase pattern is mandatory

## Workflow rules

- Branch: `feature/stage-3a-bookbuild-render`
- Commit logical chunks: migration, table skeleton, status/KYC/POA badges, totals row, chase logic, Add Investors modal (probably 2-3 commits for the modal alone)
- Push branch when done; do NOT merge to main — Ed reviews preview first
- Migration goes in Git first (file in `supabase/migrations/`) then applied via `apply_migration` after Ed's approval
- DO NOT modify the database schema beyond the single `is_favourite` migration

## Task 1 — Migration: add `clients.is_favourite`

Migration file: `supabase/migrations/20260430160000_add_clients_is_favourite.sql`

```sql
-- Add a boolean to flag clients that should appear in the "Active investors"
-- tab of the Add Investors modal. Manually toggled by the team via a star
-- icon in the picker UI itself. Default false; can be set true on any client.

ALTER TABLE clients
  ADD COLUMN is_favourite BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN clients.is_favourite IS
  'Marks the client as a regular favourite — appears in the "Active investors" tab of the Add Investors modal. Toggled manually via star icon.';
```

STOP and show me the SQL before applying. Same review pattern as before.

After applying: also run a small UPDATE to mark **a few clients** as favourites for testing (so the "Active investors" tab has something to show when first opened). Mark these clients as favourites:

```sql
UPDATE clients SET is_favourite = TRUE
WHERE full_name IN (
  'Barry O''Brien III',
  'Bibi Netanahu',
  'Bob Bigballs',
  'Henry Hickman',
  'Marcus Brigstocke',
  'Nick Brigstocke',
  'Humphrey TheCamel',
  'The Donald'
);
```

Show me this UPDATE SQL too before running. It's a separate statement, run after the migration is approved.

## Task 2 — Build the Bookbuild table

Per spec Section 4.3. The table replaces the placeholder we put in Stage 2b.

**Data fetching pattern (mandatory):**

Use the two-query-then-merge pattern from CLAUDE.md. Specifically:

1. Fetch `deal_investors` rows for this deal (no embedded joins)
2. Collect all the `client_id` and `investing_vehicle_id` UUIDs
3. Fetch `clients` rows where id IN those collected UUIDs
4. Merge in JavaScript using a Map lookup

DO NOT use PostgREST embedded joins (e.g. `clients(full_name, kyc_status)` inside `.select()`). They silently fail in our setup.

**Table columns (in this order, left to right):**

1. **Checkbox** (28px wide) — disabled for now (Stage 3b will wire bulk actions). Render the checkbox visually but don't track its state functionally.

2. **Investor** — name + small KYC indicator badge near the name. Indicator:
   - 🟢 small green dot if `clients.kyc_status = 'verified'`
   - 🟡 small amber dot if `'renewal_due'`
   - 🔴 small red dot if `'outstanding'`
   - Tooltip on hover explains the status
   - Sub-text below the name: if the client has `lead_investor_id` populated, show "Vehicle of [parent name]" in small grey text. Otherwise show nothing.

3. **Entity** — text only:
   - If `investing_vehicle_id` is null → show "Own name" in small grey text
   - If `investing_vehicle_id` is populated → show the vehicle's name (look up via the vehicle's `clients` row)

4. **Soft-circle (£)** — right-aligned, tabular numerals. Format: `£25,000`. Empty cell if `soft_circle_amount` is null.

5. **Confirmed (£)** — right-aligned, tabular numerals. Same formatting. Empty cell if null.

6. **Shares** — right-aligned, tabular numerals, no currency. Format: `13,378.76` (two decimal places). Empty if null.

7. **Fee (%)** — right-aligned. Show only on rows where `lifecycle_status = 'confirmed'` AND `fee_pct IS NOT NULL`. For other rows show "—" in light grey.
   - When shown, format as `5.0%` (one decimal, percent sign).
   - **Override styling:** if `fee_overridden = TRUE`, show in amber colour with a small `✎` icon next to the value (e.g. "3.5% ✎").
   - **Lock styling:** if `fee_locked_at IS NOT NULL`, show a 🔒 icon next to the value (e.g. "5.0% 🔒"). Lock and override styling can both apply at once.
   - Cell is non-clickable for now (Stage 3b adds the popover).

8. **Status** — coloured badge showing the lifecycle status. **Apply chase compute-on-read here** (see Task 4 below). The badge value reflects the *displayed* status, not the raw database status.
   - Style per status:
     - `soft_circled` → light grey badge, "Soft-circled" text
     - `confirmed` → teal badge, "Confirmed" text
     - `app_form_sent` → blue badge, "App form sent" text
     - `chase` → amber badge, "Chase" text (whether stored or computed)
     - `declined` → dimmed grey badge, "Declined" text
     - `signed` → green badge, "Signed" text
     - `paid` → green badge, "Paid" text
     - `complete` → solid green badge, "Complete" text

9. **POA** — small purple badge "POA" if `poa_held = TRUE`. Otherwise "—" in light grey.

10. **EIS** — small green badge "EIS" if `deals.eis_qualifying = 'yes'` (it's a deal-level flag, applies to all rows on this deal). Show "—" if not.

11. **Next step** — render a button or label per status. **Buttons render but DO NOT respond to clicks in Stage 3a.** Add a small CSS marker (e.g. `cursor: not-allowed; opacity: 0.95`) so it's visually clear they're not yet wired. The display logic per status:

| Status (displayed, after chase computation) | Render |
|---|---|
| `soft_circled` | Grey button "Confirm investment" |
| `confirmed` | Green button "Send application form →" |
| `app_form_sent` | Grey italic text "Awaiting signature" (no button) |
| `chase` | Amber button "Send chaser" |
| `declined` | Grey italic text "No action" |
| `signed` | (in Bookbuild past section) Grey italic text "Now in Closing" |
| `paid` | Grey italic text "Now in Closing" |
| `complete` | Grey italic text "Now in Completion" |

12. **Action ("⋯")** — render the button visually but clicks do nothing in Stage 3a (Stage 3b wires the menu). Same `cursor: not-allowed` styling.

## Task 3 — Active vs past row split

Per spec Section 4.2. Within the Bookbuild table:

**Active rows (top of table):**
- Statuses: `soft_circled`, `confirmed`, `app_form_sent`, `chase`, `declined`
- Render at full opacity
- Sort order: by status priority (soft_circled first, then confirmed, then app_form_sent, then chase, then declined at the end of active section)
- Within same status, sort by `created_at` ascending

**Divider:**
- A horizontal divider with text "Past states (now active in other tabs)" between active and past rows
- Only show divider if there's at least one past row

**Past rows (below divider, greyed):**
- Statuses: `signed`, `paid`, `complete`
- Render at ~45% opacity
- Hover restores full opacity for inspection
- Checkboxes disabled (no bulk actions on past rows)

For the seeded test deal: 8 active rows + 1 declined row above the divider, 2 past rows (signed + paid) below.

## Task 4 — Chase compute-on-read

Per spec Section 4.5 and our design Q6 decisions. Implement chase as a *display rule*, not a stored value (with one exception — see below).

**The rule:**

For each row, compute the *displayed* lifecycle_status as:
- If raw `lifecycle_status = 'chase'` → display as `chase` (this is our seeded Nick — kept for testing)
- Otherwise, if raw `lifecycle_status IN ('soft_circled', 'confirmed', 'app_form_sent')` AND `NOW() - updated_at > 10 days` → display as `chase`
- Otherwise → display the raw `lifecycle_status` value

**Where this rule lives:**

Centralise the logic in a single helper function (e.g. `getDisplayedStatus(row)` in a utility file). All UI code that renders status — the badge, the Next-step column, the count badges in tabs — must use this helper, not the raw value.

This means: when the user (in Stage 3b) clicks "Send chaser" on a chase row, the action will reset `updated_at = NOW()` and the row will *display* as its underlying status again (because the timer's reset).

**For now in Stage 3a:** clicking "Send chaser" does nothing (Stage 3b wires it). But the display logic should be ready.

## Task 5 — Totals row

Per spec Section 4.4. Place at the bottom of the table, visually distinct (slightly darker background, navy text).

**Aggregations (across active rows only — exclude past and declined):**
- Soft-circle total: SUM of `soft_circle_amount` where status NOT IN past states AND NOT 'declined'
- Confirmed total: SUM of `confirmed_amount` where status NOT IN past states AND NOT 'declined'
- Shares total: SUM of `shares` where status NOT IN past states AND NOT 'declined'
- Fee total: **Only summed across rows where displayed status = 'confirmed' (i.e. excludes soft_circled, app_form_sent, chase, declined).** This reflects the team's locked-in fees, not hypotheticals.

For the seeded test deal: soft-circled total ~£255k, confirmed total ~£160k, fee total = £115k * 5% blend (do the actual math), shares total = sum of share counts on confirmed rows.

(Note: confirmed total here is for active confirmed rows only. The £370k "deal-wide" figure mentioned in conversation includes past rows. Active confirmed-section total is ~£160k — Bibi 40 + Henry 30 + Nick MM 75 + Marcus 20 + Nick 15 — wait Marcus is app_form_sent. Recalculate by code, not from this comment.)

## Task 6 — Build the "Add investors" modal

Per the design conversation. The modal opens when the user clicks "+ Add investors" — but **the button itself is not in Stage 3a**. Stage 3b adds it to the toolbar. For Stage 3a, render the modal but trigger it via a temporary debug button somewhere (or via direct URL if simpler) so we can test it.

Actually, simpler: **add a small "+ Add investors (test)" button at the top of the Bookbuild table for now**. Stage 3b will replace it with the proper toolbar button. Mark it visibly as "Stage 3a debug" so we know it's not the final placement.

**Modal structure:**

A wide modal (about 800px) with:
- Title: "Add investors to this deal"
- Two tabs at the top: "Active investors" (default) | "Other investors"
- Tab content area (varies by tab — see below)
- Footer with: "X investors selected" count + "Cancel" button + "Continue" button (disabled until 1+ selected)

**Tab 1 — Active investors:**

- A scrollable list, one row per client where `is_favourite = TRUE`
- Each row has:
  - Checkbox on the left
  - Star icon (⭐) — clicking toggles `is_favourite` for that client (real-time database update)
  - Client name
  - Sub-text: KYC status badge (small) + entity type
  - On the right: "Last deal: [date]" if the client has any past deal_investors rows; "Never invested" otherwise
- "Select all" / "Deselect all" buttons at the top
- Search input that filters the list (substring match on name)

**Tab 2 — Other investors:**

- A search-and-pick interface
- Search input at the top
- As the user types, filter all clients (where `is_favourite = FALSE` — favourites are in tab 1) by name substring
- Show matching clients as a list with:
  - Star icon (⭐) — clicking adds them to favourites AND moves them to tab 1
  - Client name + KYC status + entity type
  - "Add" button to select them for this deal
- Selected clients appear in a "Selected" section at the bottom of the tab, removable
- An empty-state message if no search and no selections: "Search for an investor by name."

**State management:**

- The modal maintains a single set of "selected" clients across both tabs
- The footer count is the size of this set
- Switching tabs preserves selections

**On Continue:**

The modal transitions (within itself, not closing) to the "Bulk amount entry" screen.

**Bulk amount entry screen:**

- Title: "Set amounts for [N] investors"
- A "Set all amounts to: [£__]" input + "Apply" button at the top (helper for round-amount syndicates)
- A scrollable list, one row per selected investor with:
  - Investor name + KYC indicator
  - **Vehicle dropdown:**
    - Default option: "Own name"
    - Plus any vehicles where the investor is `lead_investor_id` (look up `clients` where `lead_investor_id = [this client's id]`)
    - Selected option determines the `investing_vehicle_id` value when saved
  - Soft-circle amount input (£ formatted, validates positive number)
- Footer with "Back to picker" + "Save all" buttons
- "Save all" disabled until all rows have a positive amount

**On Save all:**

- For each row, INSERT a new `deal_investors` row with:
  - `deal_id` = current deal id
  - `client_id` = the picked client
  - `investing_vehicle_id` = chosen vehicle id, or NULL if "Own name"
  - `amount` = the entered amount (legacy column — keep populated)
  - `soft_circle_amount` = the entered amount
  - `confirmed_amount` = NULL
  - `shares` = NULL
  - `lifecycle_status` = 'soft_circled'
  - `fee_pct` = NULL (set when confirmed in Stage 3b)
  - `poa_held` = FALSE (default; can be set later)
  - `signing_status` = 'not_reviewed' (legacy column default)
  - `updated_by` = current user
  - `updated_at` = NOW()
- All inserts in a single transaction
- On success: close modal, refresh the Bookbuild table to show the new rows
- On unique-constraint violation (the `(deal_id, client_id, investing_vehicle_id)` constraint we set up): show a clear error inline ("X is already in this deal — remove from selection?") with the option to remove that row from the save and retry

**Important constraints on the modal:**

- DO NOT allow inline creation of new clients ("create a brand new investor inline") — out of scope per Q2 decision
- DO NOT validate KYC status — KYC is informational only (per spec Section 4.5)
- DO NOT do anything fancy with form state libraries — vanilla React state is fine

## Task 7 — Verification

Before pushing:

1. Run `npm run build` and confirm no errors
2. Run typecheck/lint
3. In dev mode, on the Cyclr test deal:
   - The Bookbuild table renders with 10 rows (8 active + 1 declined + 2 past, with divider)
   - All 12 columns visible with correct data
   - Status badges in correct colours
   - KYC indicators correct (🟢 verified, 🔴 outstanding for Henry, Henrietta, etc.)
   - POA badge on Bob Bigballs (soft_circled row)
   - EIS badge on all rows (deal is EIS qualifying)
   - Fee column: shows on confirmed rows only; Henry's 3.5% in amber with ✎ icon
   - Totals row at the bottom with correct sums
   - Nick (chase) renders with amber Chase badge
   - Marcus (app_form_sent, 3 days ago) renders normally — NOT as chase
   - Past rows (Humphrey signed, Bob Bigballs paid via vehicle) below the divider, greyed
4. Click the "+ Add investors (test)" button:
   - Modal opens with two tabs
   - Active investors tab shows the 8 favourites we seeded (and not the others)
   - Star toggles work (try toggling one — verify in database it flipped)
   - Tick a few investors, switch tabs, tick more, switch back — selections preserved
   - Click Continue → bulk amount entry screen appears
   - Vehicle dropdown shows correctly for clients with linked vehicles (e.g. Nick should have "Own name" + "Multi Manager")
   - Set all amounts helper works
   - Save adds the rows; modal closes; table refreshes
5. Confirm sell deal route still works (visit any sell deal — old page renders unchanged)

If anything fails, STOP and report.

## Task 8 — Push and report

Once verified:
1. Push branch to GitHub
2. Wait for Vercel preview
3. Report:
   - Vercel preview URL
   - Test deal URL
   - List of commits
   - Any judgement calls or concerns
   - Any places where the spec was unclear and you made a decision

DO NOT merge to main. Wait for Ed's review.

## Important constraints

- DO NOT make Next-step buttons functional. They render but don't respond to clicks. Stage 3b wires them.
- DO NOT build the fee override popover. Cell is display-only in 3a.
- DO NOT build the row "⋯" menu. Button renders, click does nothing.
- DO NOT build the search/filter/bulk-action toolbar.
- DO NOT touch any tab body other than Bookbuild. Closing/Completion/Documents/Invoices keep their placeholders.
- DO NOT modify the persistent header or summary cards.
- DO NOT touch sell deal rendering.
- DO NOT modify the database schema beyond `clients.is_favourite`.
- The user (Ed) is non-technical. Explain things in plain English in your final report — especially the chase compute-on-read logic and the modal flow.

When everything is done and pushed, stop and report. If you hit a blocker, STOP and ask.

===PROMPT END===

---

## After Claude Code responds

When Claude Code shows you the migration SQL (Task 1), paste it here and I'll verify before approval — same pattern as before.

When the preview is up, several things to specifically check:

**The table:**
1. **All 10 rows render** in the right order (active first, divider, past rows greyed)
2. **Henry's fee** shows as `3.5% ✎` in amber (the override visualisation)
3. **Nick (chase)** shows the amber Chase badge with the amber "Send chaser" button rendered (greyed/non-functional)
4. **Marcus (app form sent 3 days ago)** does NOT show as chase — verifies the timer logic is right
5. **The totals row** matches expected sums
6. **Bob Bigballs paid via vehicle** shows "Robert Bigballs III" in the Entity column (verifies vehicle lookup works)

**The Add Investors modal:**
1. **Active investors tab** shows the 8 favourites
2. **Star toggle** actually flips the database value when clicked
3. **Tab switching preserves selections**
4. **Vehicle dropdown** correctly shows linked vehicles for investors who have them (e.g. Nick has Multi Manager available)
5. **Save adds rows** and the table refreshes

**Sanity checks:**
1. Sell deal still renders the old page
2. Persistent header and summary cards still work
3. Nothing weird in the browser DevTools console

This is the biggest preview review yet. Take your time.
