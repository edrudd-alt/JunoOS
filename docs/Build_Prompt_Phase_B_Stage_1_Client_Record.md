# Build Prompt — Phase B Stage 1: Client Record Page

**Reference spec:** `Juno_Platform_Specification_v1.md` Section 9 (replaced — see `section_9_client_record.md`)
**Reference prototype:** `client_record_v2.html`
**Depends on:** existing `clients` table, `deals`, `deal_investors`, `transactions`, `documents`
**Branch:** `feat/client-record-v1`

## Goal

Build the client record page at `/clients/[client_id]`. This is the team's home base for managing one investor relationship. Mirror the prototype's structure, behaviour, and visual language exactly. All five tabs in this stage; report generation modals deferred to a later stage.

## Build Order

The work breaks into five sub-stages. Open a PR per sub-stage and wait for review before proceeding to the next.

### Sub-stage 1.1 — Schema migration & data model

Migration file: `supabase/migrations/[timestamp]_client_record_schema.sql`

Required changes (verify against existing schema first; some columns may already exist):

```sql
-- Lead investor / linked entity model
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS lead_client_id UUID REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS entity_type TEXT
    CHECK (entity_type IN ('own_name','family','pension','corporate','trust'))
    DEFAULT 'own_name';

-- Default lead_client_id to self for existing rows
UPDATE clients SET lead_client_id = id WHERE lead_client_id IS NULL;
ALTER TABLE clients ALTER COLUMN lead_client_id SET NOT NULL;

-- Reporting defaults
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS reporting_default_entities UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reporting_default_delivery TEXT
    DEFAULT 'email' CHECK (reporting_default_delivery IN ('email','download')),
  ADD COLUMN IF NOT EXISTS reporting_default_frequency TEXT
    DEFAULT 'quarterly'
    CHECK (reporting_default_frequency IN ('quarterly','half_yearly','annual','manual'));

-- Notes
CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  flag_for_followup BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_client_notes_client_id ON client_notes(client_id);
CREATE INDEX idx_client_notes_followup ON client_notes(client_id) WHERE flag_for_followup = TRUE;

-- RLS policies for client_notes (matching pattern from other tables)
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_notes_team_access" ON client_notes
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
```

**Membership documents:** check whether `documents` table already covers KYC/POA/membership_agreement/suitability/source_of_funds categories. If not, propose schema in PR description before building.

Verify with chat-Claude before applying.

### Sub-stage 1.2 — Page shell, header, status strip, headline stats

Files:
- `app/clients/[id]/page.tsx` — server component, fetches data
- `app/clients/[id]/_components/client-header.tsx`
- `app/clients/[id]/_components/status-strip.tsx`
- `app/clients/[id]/_components/headline-stats.tsx`
- `app/clients/[id]/_components/entity-filter.tsx`
- `app/clients/[id]/_lib/queries.ts` — all DB queries
- `app/clients/[id]/_lib/aggregations.ts` — pure functions for computing headline stats etc.

Query pattern (per CLAUDE.md, no embedded joins):

```typescript
// 1. Lead + entities
const { data: clientGroup } = await supabase
  .from('clients')
  .select('*')
  .eq('lead_client_id', leadId);

// 2. All transactions for those entities
const entityIds = clientGroup.map(c => c.id);
const { data: transactions } = await supabase
  .from('transactions')
  .select('*')
  .in('client_id', entityIds);

// 3. Companies (for logos, names)
const companyIds = [...new Set(transactions.map(t => t.company_id))];
const { data: companies } = await supabase
  .from('companies')
  .select('*')
  .in('id', companyIds);

// 4. Merge in JS via Map lookups
```

Status strip computed in `aggregations.ts`. Each pill has a determined colour (green/amber/red) based on rules in spec 9.3.3.

Entity filter state managed via URL query param (`?entity=[id]` or `?entity=all`). Use `useSearchParams` and a small client-side wrapper.

URL: `/clients/[id]?tab=overview&entity=all`

If a linked-entity URL is opened directly, redirect to the lead with `entity=[linkedId]` pre-applied. Server-side redirect in the page component.

### Sub-stage 1.3 — Overview tab

Files:
- `app/clients/[id]/_tabs/overview.tsx`
- `app/clients/[id]/_components/contact-details-panel.tsx`
- `app/clients/[id]/_components/membership-docs-panel.tsx`
- `app/clients/[id]/_components/linked-entities-panel.tsx`
- `app/clients/[id]/_components/reporting-defaults-panel.tsx`
- `app/clients/[id]/_components/edit-client-modal.tsx` — Edit Client Details form

**Edit Client Details modal** (re-use the pattern from Edit Deal Details in Stage 2c): Fields: email, phone, address (single textarea), tax status, default fee rate, report email. Save → updates `clients` row → revalidates server component.

**+ Add entity flow** → modal as per spec 9.13. On save, creates a new `clients` row with `lead_client_id = currentLeadId`.

**Reporting defaults:** bind directly to the new `reporting_default_*` columns. Saving updates the columns.

**Performance placeholder panel:** render as a static dashed-border panel with the placeholder text. No data binding in v1.

### Sub-stage 1.4 — Investments tab (the hard one)

Files:
- `app/clients/[id]/_tabs/investments.tsx`
- `app/clients/[id]/_components/inv-toolbar.tsx`
- `app/clients/[id]/_components/inv-view-by-company.tsx`
- `app/clients/[id]/_components/inv-view-by-shareclass.tsx`
- `app/clients/[id]/_components/inv-view-flat.tsx`
- `app/clients/[id]/_lib/inv-aggregations.ts` — pure functions for grouping, avg cost, subtotals

**View toggle** state persisted in URL: `?view=company` (default) / `view=shareclass` / `view=flat`.

**Avg cost calculation:** `total_invested / total_shares`. Implement once in `inv-aggregations.ts`, reuse across all three views.

**Sub-table inside expanded company row:** render a `<table>` inside a single `<td colspan>` of the parent row. CSS as per prototype.

**Sortable headers in flat view:** client-side sort, no DB round-trip. Default sort: date descending.

**Cumulative dividend display:** read from a `dividends_paid` total per (client, company) — query the `dividends` table if it exists; if not, default to £0.00 and flag the missing data path in the PR description.

**Empty states:** if a client has no transactions, show a single panel: "No investments yet · + Add investment".

### Sub-stage 1.5 — Investment docs, Updates sent, Notes tabs

Files:
- `app/clients/[id]/_tabs/investment-docs.tsx`
- `app/clients/[id]/_tabs/updates-sent.tsx`
- `app/clients/[id]/_tabs/notes.tsx`
- `app/clients/[id]/_components/notes-add-form.tsx`
- `app/api/client-notes/route.ts` — POST endpoint for creating notes

**Investment docs tab:** tree expansion (Company → Year → Documents). Tree state local to the component, not URL-synced. Filters apply.

**Updates sent tab:** read from a `client_communications` table or equivalent. If no such table exists, propose schema in PR description and stub the tab with an empty state for now.

**Notes tab:**
- Add note form posts to `/api/client-notes` (small action)
- Optimistic UI: add the note to the list immediately, mark as "saving"
- Flagged notes get the amber styling per spec 9.11.3
- Sort: newest first

## Visual & Design Constraints

All values from `Juno_Platform_Specification_v1.md` Section 27 (Design System). Particular care:

- Status strip pills: 5px 10px padding, 6px border-radius, dot 6px diameter
- Headline cards: 13px 16px padding, 8px border-radius, 0.5px border #e8e7e0
- Entity chips: 14px border-radius, navy when active
- Sub-table inside expanded row: dashed top border (#d8d7d0), light grey background (#fafaf8)
- All numbers: `font-variant-numeric: tabular-nums` for alignment
- EIS pill green: bg #e1f5ee text #085041; nominee pill purple: bg #eeedfe text #3c3489
- Status strip dots: green #1d9e75 / amber #ba7517 / blue #185fa5 / grey #aaa
- Click hover row: bg #fafaf8

Match prototype exactly — when in doubt, copy the CSS values from `client_record_v2.html`.

## Testing & Seed Data

Seed test data on a sample lead investor record:
- Lead with 3 linked entities (own name + SIPP + corporate)
- Mix of EIS and non-EIS transactions
- Mix of direct and nominee holdings
- At least 2 companies with multiple share classes
- Both gainers and losers in the portfolio
- 2+ flagged notes
- Pending signature scenario (so the status strip pill goes amber)
- Expiring KYC scenario (within 90 days)

Suggested test client: re-use the Cyclr test deal investor pattern from Stage 3a.

## What's NOT in scope for this stage

- **Generate report buttons** → wire to placeholder modals returning "Coming soon". Real PDF generation is a separate stage.
- **Send for signature button** → placeholder modal.
- **Note editing/deletion** → out of scope. Add only.
- **Performance metrics (P&L, MOIC, IRR)** → placeholder panel only.
- **Investor portal carve-out** → not relevant in v1.

## Acceptance Criteria

Before sub-stage marked complete:

1. Page loads with no console errors at `/clients/[any-real-client-id]`
2. All three Investments views render correctly
3. Entity filter persists across tab switches (verify via URL)
4. Status strip pills compute correctly for all five conditions across multiple test clients
5. Adding a note appears in the list immediately, persists across reload, and updates the status strip count if flagged
6. Linking and unlinking an entity updates the headline figures and the entity filter chips
7. No PostgREST embedded joins anywhere in the codebase (lint check)
8. Page renders correctly at viewport widths 1280px+ (no responsive mobile layout in v1)
9. Edit Client Details modal saves and the page reflects changes on revalidate

## Review Checkpoints

- **After 1.1 (schema):** chat-Claude verifies SQL against actual Supabase schema before apply.
- **After 1.2 (shell + header):** Ed reviews preview deployment for layout, status strip behaviour, and entity filter wiring.
- **After 1.3 (Overview):** Ed reviews — particularly the linked entities table and reporting defaults flow.
- **After 1.4 (Investments):** Ed reviews — this is the highest-risk sub-stage. Particular attention to avg cost figures and sub-table column alignment.
- **After 1.5 (remaining tabs):** Ed reviews end-to-end before merge to main.

---

*End of build prompt. Total estimated effort: ~25–35% of Stages 2b–3b combined.*
