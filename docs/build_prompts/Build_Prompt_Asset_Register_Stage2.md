## Three-State Asset Register — Build Prompt (Stage 2)

### Context
You are working on JunoOS at C:/Users/edrud/GitHub/JunoOS on branch feat/asset-register-three-state.

The spec is at docs/specs/Juno_Asset_Register_ThreeState_Spec_v1.md. Read it first.
AGENTS.md has platform conventions — read it too (especially: NO PostgREST embedded joins, two-query-then-merge, compute on read).

Stage 1 is already done — the following files exist:
- src/types/index.ts — has DeferredPayment, AssetState types
- src/lib/assetState.ts — has getAssetState(), classifyInvestments(), groupDeferredByInvestment(), settledDeferredTotal(), unsettledDeferredTotal()
- src/lib/fetchDeferredPayments.ts — has fetchDeferredPayments(supabase, investmentIds) and fetchDeferredPaymentsByClient(supabase, clientId)

### What to build

Integrate the three-state classification into these surfaces. For each, you need to:
1. Fetch deferred_payments data (server-side in page.tsx, passed as props)
2. Use getAssetState() / classifyInvestments() / groupDeferredByInvestment() to classify
3. Add a "Contingent" section in the UI between current holdings and exit history

#### Surface 1: Client Record — InvestmentsTab
File: src/app/(app)/clients/[id]/page.tsx (add deferred_payments fetch)
File: src/app/(app)/clients/[id]/ClientRecord.tsx (pass deferredPayments prop through)
File: src/app/(app)/clients/[id]/tabs/InvestmentsTab.tsx (add contingent section)

The InvestmentsTab currently groups by company via netByCompany and only shows companies with remaining > 0 as "current holdings", plus an exit history table. Add:
- Fetch deferred_payments for the client's investment IDs in page.tsx
- Pass through ClientRecord to InvestmentsTab
- In InvestmentsTab, import and use getAssetState + groupDeferredByInvestment to classify exited investments
- Add a "Contingent — Deferred Proceeds" section between current holdings and exit history
- Contingent section shows: company name, disposal date, total proceeds received (upfront + settled deferred), outstanding expected amounts with status badges (expected/overdue), contingency description, tranche info
- Contingent items MUST NOT appear in the portfolio value total

#### Surface 2: Client Record — OverviewTab
File: src/app/(app)/clients/[id]/tabs/OverviewTab.tsx

The OverviewTab shows a holdings summary card. Add:
- Accept deferredPayments prop
- Show a contingent assets indicator below the holdings summary if any exist
- A small card or line showing "X contingent positions — £Y expected in deferred proceeds" 
- This must be visually distinct from the owned holdings and not included in the portfolio total

#### Surface 3: Company Page — CompanyInvestorsTab
File: src/app/(app)/portfolio/[id]/page.tsx (add deferred_payments fetch)
File: src/app/(app)/portfolio/[id]/tabs/CompanyInvestorsTab.tsx (add contingent section)

Same pattern as InvestmentsTab but from the company perspective — show investors who have contingent positions in this company. Add:
- Fetch deferred_payments for this company's investment IDs in page.tsx
- Pass to CompanyInvestorsTab
- Add a "Contingent Investors" section between current investors and exit history
- Show investor name, disposal details, outstanding expected amounts with status

#### Surface 4: Reports — Bulk Statement Run
File: src/app/(app)/reports/portfolio-statement/page.tsx

The bulk run page filters clients by hasActive (shares_purchased > 0). Add:
- Fetch deferred_payments to identify clients with contingent positions
- Include those clients in the eligible list (they should get statements showing their contingent positions)
- Add a "Has contingent" indicator on the client row

### Style rules
- Match the existing codebase style exactly (inline styles, same colour palette, same card/table patterns)
- Status badges: expected = amber/yellow, overdue = red, received = green, waived = grey
- "Contingent" section heading with an amber/yellow accent to distinguish from owned (green) and disposed (grey)
- Use the existing formatCurrency, formatDate helpers from @/lib/utils
- Every surface that shows a total must NEVER include contingent amounts in it

### Do NOT
- Add any database migrations
- Use PostgREST embedded joins
- Store contingent as a status value
- Create new API routes — all data is fetched server-side in page.tsx
- Change any existing working behaviour — only add the new contingent sections
