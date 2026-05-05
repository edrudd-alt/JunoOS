# Prompt for Claude Code — Stage 2c: Edit Deal Details Modal

Copy and paste the text between the `===PROMPT START===` and `===PROMPT END===` lines into Claude Code.

---

===PROMPT START===

Stage 2c — the Edit deal details modal. Replaces the navigate-to-`/edit` behaviour from Stage 2a.1 with an inline modal. Six editable fields. One small migration to add a `title` column.

This stage is the modal only. NO tab body content, NO new workflow buttons. Strict scope.

## Documents to read first

1. `/docs/Juno_Deal_Page_Restructure_Spec_v3.1.md` — Section 2.5 (Edit deal details modal) is the primary reference.
2. `/docs/Deal_Page_Restructure_Decision_Log.md` — for context on why decisions were made.
3. `/CLAUDE.md` — two-query Supabase pattern still applies.

## Workflow rules

- Branch: `feature/stage-2c-edit-deal-modal`
- Commit logical chunks: one for migration, one for the modal component, one for header wiring, one for the lock-after-complete logic
- Push branch when done; do NOT merge to main — Ed reviews preview first
- Vercel auto-deploys preview; report URL when ready
- The migration goes in Git first (file in `supabase/migrations/`) then applied via `apply_migration` after Ed's explicit approval

## Task 1 — Add `deals.title` column (migration)

Per discussion: the deal title is an internal-only working label, distinct from the auto-constructed display name (currently "Cyclr — New investment"). It does NOT appear on any investor-facing document.

Migration file: `supabase/migrations/20260430150000_add_deals_title.sql`

```sql
-- Add a deals.title column for internal team labels.
-- This is a working label used by the team, not shown on documents to investors.
-- Examples: "Cyclr Q2 Top-Up", "Sky Medical Series C", "Buyapowa Bridge Round".
-- Free-text, no enforced convention (Future Work 14.9 may add one later).

ALTER TABLE deals
  ADD COLUMN title TEXT;

COMMENT ON COLUMN deals.title IS
  'Internal team-facing label for the deal. Not shown on investor-facing documents (application forms, transaction statements, EIS certs, invoices, emails). Free text, optional.';
```

STOP and show me the SQL before applying. Same review pattern as before.

## Task 2 — Update the persistent header to use the title

Once the migration is approved and applied, update the persistent header (built in Stage 2a.1) to use the title field intelligently:

- **If `deals.title` is set** → display the title in the header (e.g. "Cyclr Q2 Top-Up")
- **If `deals.title` is null or empty** → fall back to the existing constructed format (e.g. "Cyclr — New investment")

The deal subtitle (deal type + creation date) stays as-is.

Keep this fallback logic clean and readable — Ed will want to understand it.

Commit as: "Use deals.title in persistent header with fallback to constructed name".

## Task 3 — Build the Edit deal details modal

Create a modal component that opens when the user clicks "Edit deal details" in the persistent header. Replace the existing navigation behaviour (which currently goes to `/deals/[id]/edit`).

**Modal fields (in this order):**

| # | Field | Database location | Type | Notes |
|---|---|---|---|---|
| 1 | Title | `deals.title` | Text input | "Internal use only — not shown on documents to investors." sub-label |
| 2 | Share class | `deals.share_class_id` (preferred) / `deals.share_class` (fallback) | Dropdown with text fallback | See Task 4 for share class behaviour |
| 3 | Share price | `deals.share_price` | Numeric input, currency-formatted | Locked when deal is complete (see Task 5) |
| 4 | Target raise | `bookbuilds.target_raise` (joined via `bookbuilds.deal_id`) | Numeric input, currency-formatted | NB: lives on bookbuilds, not deals |
| 5 | EIS qualifying | `deals.eis_qualifying` | Three-option toggle (Yes / No / TBC) | Always editable |
| 6 | Notes | `deals.notes` | Text area (multi-line) | "Operational context for the team." sub-label |

**Modal behaviour:**

- Opens when user clicks "Edit deal details" button in the persistent header
- Pre-populates with current values
- Save button is disabled until at least one field is changed (dirty-check)
- Cancel button closes without saving (with a confirmation if there are unsaved changes)
- On Save:
  - Validate all fields (see validation rules below)
  - Call a server action / API route that updates `deals` AND `bookbuilds` in a single transaction
  - On success: close modal, refresh the persistent header with new values
  - On error: show error inline (don't close modal)
- Modal is a centred overlay with a backdrop (clicking the backdrop should NOT close the modal — too easy to lose work; require explicit Cancel)

**Validation rules:**
- Title: optional, max 200 characters
- Share class: required (either id or text)
- Share price: required, must be > 0
- Target raise: required, must be > 0
- EIS qualifying: required (one of yes/no/tbc)
- Notes: optional, max 2000 characters

Commit as: "Build Edit deal details modal with six editable fields".

## Task 4 — Share class dropdown with text fallback

For the share class field, the modal should show a dropdown of share classes for the deal's company, plus a text-fallback option.

Behaviour:

1. **Fetch share classes for this company** from `company_share_classes` where `company_id = deal.company_id`
2. **If share classes exist** → render a dropdown:
   - Each share class is an option (showing the name)
   - Selecting one sets `share_class_id` (UUID) and clears the free-text `share_class`
   - Last option in dropdown: "Use custom (text)..."
   - Selecting "Use custom" reveals a text input below the dropdown
   - Custom text sets `share_class` and clears `share_class_id`
3. **If no share classes exist** for this company (e.g. Cyclr today):
   - Skip the dropdown entirely
   - Show only the text input
   - This populates `share_class` (text)

When pre-populating the modal:
- If the deal has `share_class_id` set → select that option in the dropdown
- If the deal has only `share_class` (text) → if it matches a known share class name, select that; otherwise show the custom text option pre-filled

Commit as: "Add share class dropdown with text fallback to Edit deal modal".

## Task 5 — Lock share price when deal is complete

When the deal's `status = 'complete'`, the share price field must be read-only in the modal. All other fields remain editable.

UI behaviour:
- The share price input is disabled (greyed out, not editable)
- A small lock icon (🔒) appears next to the field label
- A tooltip / sub-text explains: "Share price locked: deal is complete and price is part of historical investment records. Contact admin to override if needed."

Note: only `share_price` is locked. Share class, target raise, EIS, title, and notes all remain editable post-completion. (Share class can change on a recapitalisation event — see Future Work 14.10. Target raise is an internal aspirational figure. EIS sometimes gets corrected. Title and notes are always working labels.)

Commit as: "Lock share price field when deal status is complete".

## Task 6 — Verification

Before pushing:

1. Run `npm run build` and confirm no errors
2. Run typecheck/lint
3. In dev mode, on the test deal `/deals/cecde2bc-0935-4873-85e5-bda135d9af75`:
   - Click "Edit deal details" in the header
   - Modal opens with current values pre-populated
   - Edit the title to e.g. "Cyclr Test Deal — Q2"
   - Save — modal closes, header refreshes showing the new title
   - Click Edit again — confirm new title is now pre-populated
   - Verify share class dropdown shows correctly (Cyclr has no share classes, so should show only text input)
   - Try the other fields — share price, target raise, EIS toggle, notes
   - Try Cancel without unsaved changes — closes immediately
   - Try Cancel with unsaved changes — confirmation appears
   - Try clicking the backdrop — should NOT close the modal
4. Visit a sell deal — old page renders, no modal involvement (it shouldn't be touched)

If any verification fails, STOP and report.

## Task 7 — Push and report

Once verified:
1. Push branch to GitHub
2. Wait for Vercel preview deployment
3. Report:
   - Vercel preview URL
   - Test deal URL on preview
   - Whether the migration applied cleanly
   - List of commits on the branch
   - Any judgement calls or concerns

DO NOT merge to main. Wait for Ed's review.

## Important constraints

- DO NOT touch any tab body content. Tab placeholders stay as they are.
- DO NOT touch the existing `/deals/[id]/edit` route (it stays alive but unused — cleanup is Stage 7).
- DO NOT touch sell deal rendering.
- DO NOT add validation rules beyond those specified in Task 3.
- DO NOT make the title field appear on any document or investor-facing surface. It's strictly internal.
- DO NOT modify the database schema beyond adding `deals.title`. No other migrations.
- The user (Ed) is non-technical. Explain things in plain English in your final report, especially around the lock-after-complete logic and the share class fallback.

When all tasks are complete and pushed, stop and report. If you hit a blocker, STOP and ask before improvising.

===PROMPT END===

---

## After Claude Code responds

When Claude Code reports back with the migration SQL (Task 1), paste it here and I'll verify before you approve.

When the preview is up, the things to specifically test:

- **Click "Edit deal details" in the header** — modal opens
- **Set a title** like "Cyclr Q2 2026" — save — header updates
- **Edit again** — title pre-populated correctly
- **Try EIS toggle** — three options visible (Yes / No / TBC)
- **Try cancel with unsaved changes** — confirmation prompt
- **Click the backdrop** — modal should NOT close (per spec)
- **Try Notes** — multi-line, accepts longer text

This is a smaller stage than 2b but the modal has more interactive surface area — backdrop click handling, dirty-form check, dropdown fallback all need to work right. Worth a thorough preview check.
