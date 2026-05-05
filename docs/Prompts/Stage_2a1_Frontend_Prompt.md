# Prompt for Claude Code — Stage 2a.1: Routing + Persistent Header

Copy and paste the text between the `===PROMPT START===` and `===PROMPT END===` lines into Claude Code.

---

===PROMPT START===

Stage 2a.1 — the frontend shell, part 1. Routing detection, the persistent header with metadata grid, and the three remaining (B) UI cleanup items from the audit. Plus seeding a test deal.

This is the first frontend stage. NO tab strip, NO summary cards, NO modal — those come in Stage 2b and 2c. Strict scope.

## Documents to read first

1. `/docs/Juno_Deal_Page_Restructure_Spec_v3.1.md` — Section 2.1 (persistent header) is the primary reference. Section 1.4 covers the buy/sell routing rule.
2. `/docs/Deal_Page_Restructure_Decision_Log.md` — for context if anything in the spec is unclear.
3. `/CLAUDE.md` — for the two-query Supabase pattern and other codebase rules.

## Workflow rules

- All changes go on a new branch: `feature/stage-2a1-routing-and-header`
- Commit small, logical chunks (e.g. one commit for routing, one for header, one for cleanup, one for seed) so the diff is reviewable
- Push the branch when done; do NOT merge to main yet — Ed will review the Vercel preview deployment first
- Vercel will auto-create a preview deployment for the branch; report the preview URL when it's ready

## Task 1 — Three remaining (B) UI cleanup items

These were identified in the Stage 2a.0 audit. Do these FIRST — they're prerequisites for any new wizard work and they're well-bounded.

**1.1 — `src/lib/supabase/types.ts` line 7**

Change the `DealType` union to remove `'kyc'`, `'side_letter'`, `'membership'`. After change, it should read:

```typescript
export type DealType = 'new_investment' | 'follow_on' | 'exit' | 'full_exit' | 'partial_exit'
```

**1.2 — `src/app/(app)/deals/new/wizardTypes.ts` lines 37–39**

Remove the three entries from the `DEAL_TYPES` array:
- `{ value: 'kyc', label: 'KYC / Onboarding' }`
- `{ value: 'side_letter', label: 'Side letter' }`
- `{ value: 'membership', label: 'Membership joining' }`

Don't touch the document-template entries on lines 47-48 (those are different — `'kyc'` and `'side_letter'` as document types are correct).

**1.3 — `src/app/(app)/deals/new/NewDealPage.tsx`**

Three coupled changes:
- Line 12 area: Update the `DealTypeValue` type union to remove the three deprecated values
- Lines 52-71 area: Remove the three deal-type picker cards (the ones with KYC, Side Letter, Membership labels)
- Line 123 area: Remove the routing branch `if (selectedType === 'kyc' || selectedType === 'side_letter' || selectedType === 'membership')` and any associated logic

These three changes must be done together — leaving any one will leave a partial, broken state.

After Task 1, run `npm run build` (or whatever the project uses for type-checking) to confirm no TypeScript errors remain. Commit as a single commit: "Remove deprecated deal types from wizard UI".

## Task 2 — Seed a test deal

Create exactly ONE test deal with realistic data. We need something to render the new page against.

Use these specifics:
- Company: Cyclr (UUID — find it in the `companies` table)
- Deal type: `new_investment`
- Status: `draft`
- Share class: the Cyclr Ordinary share class from `company_share_classes` (or whichever ordinary class exists; if none, create the deal with `share_class_id = NULL` and a hardcoded `share_class = 'Ordinary'`)
- Share price: `2.99`
- Target raise: `200000`
- EIS qualifying: `yes`
- Created by: the most recent `auth.users` row (likely Ed)

This should be done via a single SQL statement applied via `apply_migration` — which means it gets tracked. Migration name: `20260430140000_seed_stage_2a1_test_deal.sql`. Save the file in `supabase/migrations/`.

Inside the migration, also create the corresponding `bookbuilds` row pointing to this deal (`target_raise = 200000`, `status = 'open'`).

STOP and show me the SQL before applying. Same review pattern as before.

## Task 3 — Routing logic

When a user opens `/deals/[id]`, the system must:
1. Look up the deal's `deal_type`
2. If `deal_type` is `new_investment` or `follow_on` → render the new deal page (Task 4)
3. If `deal_type` is `full_exit`, `partial_exit`, or `exit` → render the existing deal page unchanged

The cleanest way to do this is probably to introduce a router component at the top of `src/app/(app)/deals/[id]/page.tsx` that checks deal_type and renders one of two child components: `NewDealPage` (the new shell from Task 4) or `LegacyDealPage` (the existing implementation, possibly extracted into its own component if it's currently inlined).

Don't break the existing sell deal experience. Test by visiting a sell deal in the live app after deploying — it should look identical to today.

If the existing `/deals/[id]/page.tsx` is complex and refactoring it carries risk, propose an alternative routing approach in your reply BEFORE coding.

Commit as: "Add routing detection for buy vs sell deal pages".

## Task 4 — The persistent header

Per spec Section 2.1, build the header strip. NO tabs below it yet — just a placeholder element saying "Tab strip and content coming in Stage 2b" (or similar).

**Header structure:**

Top row:
- Company logo on the left (or coloured rounded square with company initials if no logo)
- Deal title — for the test deal: "Cyclr — [appropriate name based on deal data]"
  - Note: the spec doesn't define how the deal title is constructed. For now, use `[company.name] — [deal_type humanised]` (e.g. "Cyclr — New investment"). This can be refined later.
- Deal subtitle: `[Deal type humanised] · Created [date in 'D MMMM YYYY' format]`
  - Per spec Section 2.1: deal owner / lead user is NOT shown. Don't add it.
- Status pill — coloured by status (e.g. "Draft" in light grey, "In bookbuild" in light blue). Use the existing colour conventions from the codebase if any exist.
- "Edit deal details" button — Stage 2a.1 implementation: this button NAVIGATES to the existing `/deals/[id]/edit` route. The proper modal version comes in Stage 2c. So in 2a.1, just `<Link>` it to the edit route.
- Overflow "⋯" button — non-functional in 2a.1. Render the button but `onClick` does nothing (or shows a console.log for testing). It will be wired up in later stages.

Metadata grid (6 cells, divided by vertical lines):

| Cell | Label | Value source | Sub-text |
|---|---|---|---|
| 1 | Share class | join `deals.share_class_id` to `company_share_classes` | "EIS qualifying" or "Non-EIS" from `deals.eis_qualifying` |
| 2 | Share price | `deals.share_price` formatted as £X.XX | "Set [date]" from `deals.created_at` |
| 3 | Target raise | `bookbuilds.target_raise` (joined via `bookbuilds.deal_id`) formatted as £X | "[shares] shares" calculated as target÷share_price, comma-formatted |
| 4 | Soft-circled | sum of `deal_investors.soft_circle_amount` for active rows on this deal | "% of target" |
| 5 | Confirmed | sum of `deal_investors.confirmed_amount` for active rows | "[n] of [total] investors" |
| 6 | Fund type | from the deal's primary client → `clients.active_fund_type` → `fund_types.name`. With no investors, show "—" with sub-text "No investors yet" | The `fund_types.exit_fee_default_pct` value as a percentage |

For cells 4, 5, and 6: with no investors yet on the test deal (we just seeded it), these cells will show £0 / 0 / "—". That's correct and expected.

**Data fetching:** use the two-query-then-merge pattern from CLAUDE.md. Fetch the deal first, then separately fetch `bookbuilds`, `companies`, `company_share_classes`, etc. Merge in JavaScript with Map lookups. Do NOT use PostgREST embedded joins.

Below the header, render a clear placeholder:

```
Coming in Stage 2b — tab strip with Bookbuild, Closing, Completion, Documents, Invoices
```

This placeholder is intentional and will be replaced in the next stage.

Commit as: "Build persistent header for new deal page shell".

## Task 5 — Verification

After all tasks complete, before pushing:

1. Run `npm run build` and confirm no errors
2. Run `npm run lint` if a lint script exists, or whatever lint/typecheck the project uses
3. In dev mode (`npm run dev`), visit the test deal's URL and confirm:
   - The new header renders with all 6 metadata cells populated correctly
   - The "Edit deal details" button navigates to /edit
   - The placeholder text appears below the header
4. Visit a sell deal (any with `deal_type` = `full_exit` etc.) and confirm:
   - The OLD page renders, unchanged
   - No errors in the console

If any of these fail, STOP and report. Don't push broken code to a branch.

## Task 6 — Push and report

Once verified locally:
1. Push the branch to GitHub
2. Wait for Vercel to deploy a preview
3. Report:
   - The Vercel preview URL
   - The test deal's full URL on the preview
   - The list of commits on the branch
   - Any caveats or "I had to make a judgement call about X" notes

DO NOT merge to main. Wait for Ed's approval after he reviews the preview.

## Important constraints

- DO NOT build the tab strip, summary cards, or any tab content. Those are Stage 2b.
- DO NOT build the Edit deal details MODAL. That's Stage 2c. The button just navigates in 2a.1.
- DO NOT modify any sell-deal-related code. They keep using the existing page.
- DO NOT touch existing components beyond what's necessary for routing detection. If you need to extract the legacy page into its own component for the routing to work, that's fine and necessary, but no other changes to that legacy code.
- DO NOT modify the database schema beyond the test-deal seed (which creates one row in deals + one in bookbuilds, no schema changes).
- The user (Ed) is non-technical. When you report back, explain things in plain English first, technical detail second.

When all tasks are complete and pushed, stop and report. If you hit a blocker on any task, STOP and ask before improvising.

===PROMPT END===

---

## After Claude Code responds

When Claude Code reports back with the preview URL, here's what to do:

**1. Visit the preview URL** in a browser. The preview will look like `juno-os-[hash].vercel.app` (a temporary URL — your main `juno-os.vercel.app` is unaffected).

**2. Visit the test deal's URL on the preview** (Claude Code will tell you the exact URL). Specifically check:

- **The header looks right** — six cells, real data, sensible formatting
- **No "kyc/side_letter/membership" options** appear in the create-deal wizard (visit `/deals/new` to check)
- **A sell deal still renders the old page** — Claude Code should give you a link to one
- **The "Edit deal details" button works** (navigates to /edit)
- **The "Coming in Stage 2b" placeholder is visible** below the header

**3. Paste Claude Code's report back into this chat.** I'll do my own checks from this side too — run a few queries to verify the test deal seed worked properly, and run through the report for anything that looks off.

**4. If everything's good, you approve the merge to main.** If something's off, we send Claude Code a fix.

This pattern (build on a branch → preview deploy → review → merge) is what we'll repeat for every stage going forward.
