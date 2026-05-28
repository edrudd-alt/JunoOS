*Historical reference. Terminology updated in Sub-stage B of the Entity Model Cleanup (PR #19, May 2026): Client → Lead investor, Vehicle → Beneficial owner, Location → Legal owner. The `entity_type`, `fund_type`, and `active_fund_type` columns on the `clients` table were removed in Sub-stage A. See the current platform spec for live terminology and schema.*

# Prompt for Claude Code — Stage 3a.1: Three-Column Investor Identity Patch

Copy and paste the text between the `===PROMPT START===` and `===PROMPT END===` lines into Claude Code. This is a patch on top of Stage 3a, before Stage 3a is merged to main.

---

===PROMPT START===

Stage 3a.1 — small but important patch. Stage 3a's "Investor / Entity" columns conflate three independent concepts: the principal client, the legal vehicle, and the share holding location. This patch separates them into three distinct columns and adds a nominee_id field to deal_investors so location can be set during bookbuild (not just after completion).

This is a patch to the existing `feature/stage-3a-bookbuild-render` branch — NOT a new branch. Continue building on top of the existing work and push to the same branch.

## Background — what's wrong, in plain English

Currently, when an investor (Client A) invests via a vehicle (Vehicle B) with shares held by a nominee (Nominee C), the table displays this confusingly. The fields lose their distinct meanings.

The team thinks of every investment as having three independent dimensions:

1. **Client** — the principal investor (relationship-holder). Always a real person. e.g. "Nigel Rudd"
2. **Vehicle** — how the money is wrapped. "Own name" by default, or a vehicle name. e.g. "Rother House" (a vehicle of Nigel Rudd)
3. **Location** — where the shares are held. "Direct" by default, or a nominee. e.g. "City Partnership Nominees Ltd"

These are three independent attributes. Examples:
- Nigel Rudd / Own name / Direct
- Nigel Rudd / Rother House / Direct
- Nigel Rudd / Own name / City Nominees
- Nigel Rudd / Rother House / City Nominees

All four are valid, all need to be displayable.

## Documents to read first

1. `/docs/Juno_Deal_Page_Restructure_Spec_v3.1.md` — Section 4.3 (table columns) — note this section will need updating to reflect the three-column structure (we'll handle spec update separately, after the patch lands)
2. `/CLAUDE.md` — two-query Supabase pattern still applies

## Workflow rules

- Continue on the existing branch `feature/stage-3a-bookbuild-render` (do NOT create a new branch)
- Commit chunks: migration + backfill, then table changes, then modal changes
- Push to the existing branch when done; do NOT merge to main — Ed reviews preview again before merging
- Migration goes via `apply_migration` after explicit approval

## Task 1 — Migration: add `nominee_id` to deal_investors

Migration file: `supabase/migrations/20260430170000_add_deal_investors_nominee_id.sql`

```sql
-- Add nominee_id to deal_investors so the share holding location can be set
-- at confirmation time (during bookbuild), not just at completion. The
-- existing nominees table is the source of truth for nominee identities.
-- NULL means "shares held directly by the legal investor" (no nominee).

ALTER TABLE deal_investors
  ADD COLUMN nominee_id UUID REFERENCES nominees(id) ON DELETE SET NULL;

COMMENT ON COLUMN deal_investors.nominee_id IS
  'Nominee holding the shares for this investment. NULL means "Direct" — held by the legal investor (the deal_investor''s client_id, or its investing_vehicle_id if set). Pre-fills from clients.default_nominee_id at insert time, can be overridden per-investment.';
```

STOP and show me the SQL before applying.

## Task 2 — Backfill some test data with nominee

After the migration is approved and applied, run a small UPDATE to populate `nominee_id` on a couple of test rows so we can visually verify both "Direct" and "Nominee" rendering states.

Get the City Partnership Nominees Ltd UUID first by querying:
```sql
SELECT id FROM nominees WHERE name ILIKE 'City%';
```

Then UPDATE 2-3 of the existing deal_investors rows on the Cyclr test deal. Pick rows that exercise different statuses for variety. Suggested:

```sql
-- Backfill nominees on a few test deal_investors rows to verify "City Partnership Nominees" display
UPDATE deal_investors
SET nominee_id = '[the-city-nominees-uuid]'
WHERE deal_id = 'cecde2bc-0935-4873-85e5-bda135d9af75'
  AND client_id IN (
    'de1c5f87-d943-4af4-8f8b-45d107f0a342',  -- Bibi Netanahu (confirmed)
    'b2afaead-9c92-4a61-b190-594294769749',  -- Marcus Brigstocke (app form sent)
    'ed1e1419-2f58-4e93-9d69-ad5ca0f32e61'   -- Humphrey TheCamel (signed past row)
  );
```

Show me the UPDATE before running.

## Task 3 — Restructure the Bookbuild table to three columns

Replace the current "Investor" and "Entity" columns with **three distinct columns**: Client / Vehicle / Location.

**The new column structure is now:**

1. Checkbox
2. **Client** — primary investor name (from `deal_investors.client_id` → `clients.full_name`)
   - Sub-text below name: KYC indicator badge (🟢/🟡/🔴) — keep this, it was in Stage 3a
3. **Vehicle** — `deal_investors.investing_vehicle_id`:
   - If NULL: show "Own name" in normal text
   - If populated: show the vehicle's `full_name` (look up via the vehicle's clients row)
4. **Location** — `deal_investors.nominee_id`:
   - If NULL: show "Direct" in normal text
   - If populated: show the nominee's `name` (look up via the nominees table)
5. Soft-circle (£)
6. Confirmed (£)
7. Shares
8. Fee (%)
9. Status badge
10. POA badge
11. EIS badge
12. Next step
13. Action ("⋯")

So the table now has **13 columns** instead of 12. Slightly wider — make sure the layout still works. If the table feels cramped, consider giving the financial columns (Soft-circle, Confirmed, Shares) slightly less horizontal padding, or right-aligning their labels to free up space.

**REMOVE** any Stage 3a logic that:
- Showed "Vehicle of [parent]" as a sub-text under the investor name
- Used `entity_type` to label the entity column
- Showed "Direct" or "Own name" in a single combined column

The new columns are independent and use only the three FK fields described above.

**Data fetching:**
- The query needs to fetch `clients` (for client + vehicle lookups — same query covers both since both are clients) AND `nominees`
- Use the two-query-then-merge pattern: fetch deal_investors, collect the IDs, fetch clients and nominees in parallel, merge in JS with Map lookups
- Do NOT use PostgREST embedded joins

Commit as: "Restructure Bookbuild table to Client/Vehicle/Location columns".

## Task 4 — Update Add Investors modal: add Location dropdown

On the bulk amount entry screen (Screen 2 of the modal), add a Location dropdown alongside the existing Vehicle dropdown.

**Location dropdown behaviour:**

- Default option: **"Direct"** (means: nominee_id will be saved as NULL)
- Other options: all rows from the `nominees` table, sorted by name
- Pre-fill logic: when the row first renders, default to the client's `clients.default_nominee_id` if set; otherwise default to "Direct"
- The selected option determines `nominee_id` on save

**Layout suggestion:**

The bulk entry screen now has 4 inputs per row:
- Investor name (display only, with KYC indicator)
- Vehicle dropdown (existing)
- Location dropdown (new)
- Soft-circle amount

Make sure the row layout still works — probably keep them all on one line on desktop, with the dropdowns roughly equal width. If row height becomes a problem, allow location to wrap to a second line on narrow screens.

**On Save:**

The INSERT statement for each row now includes `nominee_id`. Set it to:
- The selected nominee's UUID if a nominee was chosen
- NULL if "Direct" was selected (or left as default with no client default)

Commit as: "Add Location dropdown to Add Investors bulk amount entry".

## Task 5 — Verification

Before pushing:

1. Run `npm run build` and confirm no errors
2. Run typecheck/lint
3. In dev mode on the Cyclr test deal, verify the table:
   - 13 columns visible (Checkbox, Client, Vehicle, Location, Soft-circle, Confirmed, Shares, Fee, Status, POA, EIS, Next step, ⋯)
   - Bibi Netanahu's row shows: Client "Bibi Netanahu" / Vehicle "Own name" / Location **"City Partnership Nominees Ltd"** (since we backfilled her)
   - Marcus Brigstocke's row shows: Client "Marcus Brigstocke" / Vehicle "Own name" / Location **"City Partnership Nominees Ltd"**
   - Humphrey TheCamel's row (past, signed): Client "Humphrey TheCamel" / Vehicle "Own name" / Location **"City Partnership Nominees Ltd"**
   - Bob Bigballs' soft-circled row: Client "Bob Bigballs" / Vehicle "Own name" / Location "Direct"
   - Bob Bigballs' paid row (via vehicle): Client "Bob Bigballs" / Vehicle **"Robert Bigballs III"** / Location "Direct"
   - Nick Brigstocke Multi Manager row: Client "Nick Brigstocke" / Vehicle **"Nick Brigstocke Multi Manager"** / Location "Direct"
4. Click the Add Investors button, walk through the flow:
   - Pick an investor on the picker
   - On bulk amount entry, see Vehicle dropdown AND Location dropdown
   - Location defaults to "Direct" (since no client has default_nominee_id set yet)
   - Try changing it to "City Partnership Nominees Ltd"
   - Save — verify the row appears with "City Partnership Nominees Ltd" in the Location column
5. Check existing Stage 3a behaviour still works (nothing else should be affected by this patch)

If anything fails, STOP and report.

## Task 6 — Push and report

Push to the existing branch. Vercel will redeploy the preview.

Report:
- Confirmation migration applied + backfill done
- The same preview URL as Stage 3a (will be updated)
- List of new commits added
- Any judgement calls or concerns

DO NOT merge to main. Wait for Ed's re-review.

## Important constraints

- DO NOT touch any other tab. Closing/Completion/Documents/Invoices keep their placeholders.
- DO NOT change anything about the chase logic, status badges, fee column, totals row, etc. They're all working in Stage 3a.
- DO NOT modify the persistent header or summary cards.
- DO NOT touch sell deal rendering.
- DO NOT update the spec document — Ed will refresh the spec after the patch lands.
- DO NOT add any new functionality beyond what's listed here. This is a focused patch.
- The user (Ed) is non-technical. Explain things in plain English in your final report.

When everything is done and pushed, stop and report. If you hit a blocker, STOP and ask.

===PROMPT END===

---

## After Claude Code responds

When Claude Code shows you the migration SQL (Task 1), paste it here and I'll verify before approval — same pattern as before.

When the preview is up:

- **Bibi, Marcus, Humphrey rows** should each show "City Partnership Nominees Ltd" in the Location column
- **Bob's vehicle row** should show "Robert Bigballs III" in the Vehicle column AND "Direct" in Location (we didn't backfill her)
- **Nick MM row** should show "Nick Brigstocke" in Client AND "Nick Brigstocke Multi Manager" in Vehicle
- **Add Investors flow** — when you pick someone and reach bulk amount entry, you should see a Location dropdown alongside Vehicle

A small thing to specifically test: try adding a new investor with **non-default** Location (pick "City Partnership Nominees Ltd" from the dropdown). Save. Confirm the new row in the table shows the right location. This tests the save path, not just the display.
