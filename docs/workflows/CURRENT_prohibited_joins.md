# Service Blueprint: Prohibited Embedded Joins
**Stage:** 2 — read-only analysis, no code changes
**Produced:** 2026-04-07
**Issue:** Three server components use the PostgREST embedded join syntax inside `.select()` calls. This version of Supabase silently returns `null` for any field populated via an embedded join, so the data those queries intend to return is never actually received.

---

## 1. The Prohibited Pattern

PostgREST embedded join syntax places a related table name and its columns directly inside the `.select()` string, using either `table (columns)` or `table(columns)` notation. Example:

```typescript
supabase
  .from('investments')
  .select('id, company_id, companies (id, name)')
```

This tells the PostgREST API to resolve the foreign key `company_id → companies.id` and inline the result. In this version of Supabase it silently produces `null` for those fields rather than raising an error.

### File 1 — `src/app/(app)/investments/page.tsx`

The investments query inside a `Promise.all`:

```typescript
supabase
  .from('investments')
  .select(`
    id, client_id, company_id, share_class, investment_date,
    original_share_price, shares_purchased, sum_subscribed,
    eis_status, holding_entity, holding_location, status,
    transaction_type, cost_basis, transfer_counterparty_id, transfer_type, notes,
    fund_type, companies (id, name)
  `)
  .order('investment_date', { ascending: false })
```

- **Primary table:** `investments`
- **Embedded join:** `companies (id, name)` — resolves `investments.company_id → companies.id`
- **Intended result:** Each investment row should carry a `companies` object `{ id, name }` so downstream components can display the company name without a separate lookup.

The same `Promise.all` also independently fetches:

```typescript
supabase
  .from('companies')
  .select('id, name, share_classes')
  .order('name')
```

That second companies fetch is unaffected by the prohibited pattern.

### File 2 — `src/app/(app)/reports/page.tsx`

```typescript
supabase
  .from('investor_updates')
  .select(`
    id, update_type, title, status, sent_at, created_at,
    companies (id, name),
    investor_update_recipients (id)
  `)
  .order('created_at', { ascending: false })
  .limit(30)
```

- **Primary table:** `investor_updates`
- **Embedded join 1:** `companies (id, name)` — resolves `investor_updates.company_id → companies.id`
- **Embedded join 2:** `investor_update_recipients (id)` — resolves the one-to-many `investor_updates.id → investor_update_recipients.investor_update_id`, returning an **array** of `{ id }` objects
- **Intended result:** Each update row should carry `companies: { id, name }` for the display name, and `investor_update_recipients: { id }[]` so the recipient count can be computed as `.length`.
- **Additional note:** The scalar column `company_id` is absent from the explicit select list. It exists on the `investor_updates` table but is not selected here, so it is not available in the result for a post-fetch merge without also adding it to the select.

### File 3 — `src/app/(app)/deals/[id]/edit/page.tsx`

```typescript
supabase
  .from('deals')
  .select('id, deal_type, status, company_id, share_price, share_class, investment_date, eis_qualifying, completion_checklist, notes, companies(id, name)')
  .eq('id', id)
  .maybeSingle()
```

- **Primary table:** `deals` (single row)
- **Embedded join:** `companies(id, name)` — resolves `deals.company_id → companies.id`
- **Intended result:** The single deal row should carry `companies: { id, name }` so the component can extract the company name without a follow-up query.
- **Observed usage immediately below the query:**
  ```typescript
  const company     = deal.companies as any
  const companyName = company?.name ?? ''
  ```
  `companyName` is then passed as `SetupData.companyName` (buy path) or `SellSetupData.companyName` (sell path) to `EditInvestorsClient`.
- **Unrelated pre-existing issue (not part of this analysis):** `notes` is selected but does not exist as a column on the `deals` table in any migration. This is a separate known issue.

---

## 2. The Correct Pattern

The correct approach is: run the primary query without any embedded join syntax, collect the foreign-key values from the result, run a second query using `.in()` to fetch the related rows by those IDs, then merge them in TypeScript using a `Map`.

### Reference example — `src/app/(app)/deals/[id]/page.tsx`

This file fetches a deal and its related company using the correct pattern. The relevant sections:

**Step 1 — Primary query, no embedded join:**
```typescript
const { data: rawDeal } = await supabase
  .from('deals')
  .select('id, deal_type, status, created_at, investment_amount, share_price, share_class, completion_checklist, company_id')
  .eq('id', id)
  .maybeSingle()
```
`company_id` is selected as a plain scalar. No join syntax.

**Step 2 — Secondary query conditioned on the FK value:**
```typescript
const [
  { data: dealInvestors },
  { data: companyData },
  { data: documents },
  { data: rawInvoices },
] = await Promise.all([
  supabase.from('deal_investors').select('id, amount, signing_status, poa_held, client_id').eq('deal_id', id),
  rawDeal.company_id
    ? supabase.from('companies').select('id, name').eq('id', rawDeal.company_id).maybeSingle()
    : { data: null },
  supabase.from('documents').select('id, filename, type, storage_url, document_date').eq('deal_id', id).order('document_date', { ascending: false }),
  supabase.from('invoices').select('id, client_id, amount, status, issued_at').eq('deal_id', id),
])
```
The company is fetched in a parallel `Promise.all` using the FK value from step 1. The conditional `rawDeal.company_id ? ... : { data: null }` guards against null FK.

**Step 3 — Manual merge in TypeScript:**
```typescript
const deal = {
  ...rawDeal,
  companies:      companyData ?? null,
  deal_investors: mergedDealInvestors,
}
```
The `companies` field is attached to the deal object manually, producing the same shape the embedded join was intended to produce.

**For one-to-many lookups** (where the result is an array, not a single object), the pattern shown in `clients/[id]/page.tsx` and `dashboard/page.tsx` applies: collect all FK values into an array, query with `.in('id', ids)`, build a `Map`, then attach matches to each primary row in a `.map()` call.

---

## 3. Required Changes Per File

### File 1 — `investments/page.tsx`

**What needs splitting:**
The investments select inside the `Promise.all` at lines 7–20.

**Query 1 (modified primary — remove the join):**
```
.from('investments')
.select(`
  id, client_id, company_id, share_class, investment_date,
  original_share_price, shares_purchased, sum_subscribed,
  eis_status, holding_entity, holding_location, status,
  transaction_type, cost_basis, transfer_counterparty_id, transfer_type, notes,
  fund_type
`)
.order('investment_date', { ascending: false })
```
`companies (id, name)` is removed. `company_id` remains as it is already present.

**Query 2 (already exists — no change needed):**
```
.from('companies')
.select('id, name, share_classes')
.order('name')
```
This query is already present in the same `Promise.all`. No new query is needed.

**Merge:**
After the `Promise.all`, build a `Map` from the companies result and attach to each investment row:
```typescript
const companyMap = new Map((companies ?? []).map(c => [c.id, c]))
const investmentsWithCompany = (investments ?? []).map(inv => ({
  ...inv,
  companies: companyMap.get(inv.company_id) ?? null,
}))
```
Pass `investmentsWithCompany` (not `investments`) to `InvestmentsLedger`.

### File 2 — `reports/page.tsx`

**What needs splitting:**
The single `investor_updates` select (lines 7–14). It contains two embedded joins, each requiring separate treatment.

**Query 1 (modified primary — remove both joins, add company_id):**
```
.from('investor_updates')
.select('id, update_type, title, status, sent_at, created_at, company_id')
.order('created_at', { ascending: false })
.limit(30)
```
Both embedded joins removed. `company_id` added as a scalar so the companies merge can work.

**Query 2 — companies:**
Collect unique non-null `company_id` values from the result of Query 1, then:
```
.from('companies')
.select('id, name')
.in('id', companyIds)
```
Conditional on `companyIds.length > 0`.

**Query 3 — recipient counts:**
The `investor_update_recipients (id)` embedded join was used to compute `.length` (i.e., a count). Collect all update `id` values, then:
```
.from('investor_update_recipients')
.select('investor_update_id')
.in('investor_update_id', updateIds)
```
Then count matches per `investor_update_id` in TypeScript. An alternative is a Supabase `{ count: 'exact', head: true }` per update, but the `.in()` batch approach matches the pattern used elsewhere in this codebase.

**Merge:**
```typescript
const companyMap = new Map((companiesData ?? []).map(c => [c.id, c]))

const recipientCountByUpdate: Record<string, number> = {}
for (const r of recipientsData ?? []) {
  const uid = r.investor_update_id
  recipientCountByUpdate[uid] = (recipientCountByUpdate[uid] ?? 0) + 1
}

const updates = (rawUpdates ?? []).map(u => ({
  ...u,
  companies: u.company_id ? (companyMap.get(u.company_id) ?? null) : null,
  investor_update_recipients: Array.from(
    { length: recipientCountByUpdate[u.id] ?? 0 },
    (_, i) => ({ id: String(i) })  // shape { id }[] to satisfy Reports.tsx type
  ),
}))
```

### File 3 — `deals/[id]/edit/page.tsx`

**What needs splitting:**
The single deals select on lines 12–15.

**Query 1 (modified primary — remove the join):**
```
.from('deals')
.select('id, deal_type, status, company_id, share_price, share_class, investment_date, eis_qualifying, completion_checklist, notes')
.eq('id', id)
.maybeSingle()
```
`companies(id, name)` removed. `company_id` is already present.

**Query 2 — company (conditional):**
Run after the deal is confirmed non-null, before the `isBuyDeal`/`isSellDeal` branches:
```
deal.company_id
  ? supabase.from('companies').select('id, name').eq('id', deal.company_id).maybeSingle()
  : { data: null }
```

**Merge:**
Replace the current:
```typescript
const company     = deal.companies as any
const companyName = company?.name ?? ''
```
With:
```typescript
const companyName = companyData?.name ?? ''
```
No further downstream changes needed — `companyName` is consumed only within this file.

---

## 4. Dependencies

### `investments/page.tsx`

**Downstream consumers of the `investments` prop:**

| File | Location | How it uses `.companies` |
|------|----------|--------------------------|
| `investments/InvestmentsLedger.tsx` | Line 92 | `investments.find(i => i.company_id === compId)?.companies?.name ?? ''` — used to build a display label in the filter UI |
| `investments/LedgerView.tsx` | Line 63 | `inv.companies?.name ?? '—'` — rendered in the company name column of the transaction table |
| `investments/ledgerUtils.ts` | Line 24 | TypeScript interface includes `companies: { id: string; name: string } | null` — type definition only, no runtime impact |

The separately fetched `companies` array is passed to `InvestmentsLedger` as its own prop (`companies={companies}`). `InvestmentsLedger` uses this array for the company filter dropdown (line 210). The merge proposed above ensures `inv.companies` is populated, satisfying both `InvestmentsLedger.tsx:92` and `LedgerView.tsx:63` without changing those files.

**No other files read the return value of `investments/page.tsx`.**

### `reports/page.tsx`

**Downstream consumer:** `Reports.tsx` (single file)

| Location | Usage |
|----------|-------|
| `Reports.tsx:13–14` | Type interface: `companies: { id: string; name: string } | null`, `investor_update_recipients: { id: string }[]` |
| `Reports.tsx:128` | `u.title ?? u.companies?.name ?? '—'` — update title display in draft list |
| `Reports.tsx:181` | `u.title ?? u.companies?.name ?? '—'` — update title display in sent list |
| `Reports.tsx:183` | `u.investor_update_recipients.length` — recipient count column in sent list |

`Reports.tsx` reads `.investor_update_recipients.length` directly. The merge must produce a value with a `.length` property. The approach above (constructing a synthetic array of the correct length) satisfies this without modifying `Reports.tsx`. An alternative would be to change `Reports.tsx` to read a `recipientCount: number` scalar instead, but that would require modifying an existing file.

**No other files read the return value of `reports/page.tsx`.**

### `deals/[id]/edit/page.tsx`

**Downstream consumer:** `EditInvestorsClient.tsx`

`companyName` is passed as `setupData.companyName` in both the buy and sell branches. `EditInvestorsClient.tsx:47–62` reads `props.setupData.companyName` and renders it as a subtitle below the deal heading. There is no other use of the companies data from this file.

**The `companies` field on the deal object is consumed only within `deals/[id]/edit/page.tsx` itself.** `EditInvestorsClient` receives `companyName` as a plain string inside `setupData`, not the `deal.companies` object directly.

---

## 5. Risk Assessment

### File 1 — `investments/page.tsx`
**Confidence: High — straightforward swap.**

The companies array needed for the merge is already fetched in the same `Promise.all`. The fix is:
1. Remove `companies (id, name)` from the investments select string.
2. After the `Promise.all`, build a `Map` from the existing companies result and attach to each investment row.
3. Pass the merged array instead of the raw array to `InvestmentsLedger`.

No new queries required. Two downstream usages in `InvestmentsLedger.tsx` and `LedgerView.tsx` read `inv.companies?.name` — the merge produces exactly that shape. No changes to those files are needed.

**Complicating factors:** None.

---

### File 2 — `reports/page.tsx`
**Confidence: Medium — more steps, one structural decision.**

This is the most complex of the three fixes because:

1. **Two joins to replace, not one.** Both `companies (id, name)` and `investor_update_recipients (id)` must be handled separately.

2. **`company_id` is missing from the current select.** It must be added to Query 1 for the companies merge to be possible. This is a one-word change but it is a change to the select string.

3. **The recipients join returns an array, not a scalar.** The downstream code reads `.investor_update_recipients.length`. The merge must produce an array-shaped value. The options are:
   - Fetch all recipient rows with `.in('investor_update_id', updateIds)` and group by update ID (two queries, follows existing pattern).
   - Change `Reports.tsx` to accept a `recipientCount: number` scalar (requires modifying an existing file).
   The first option keeps all changes in `page.tsx` and avoids touching `Reports.tsx`.

4. **Updates with no company (`company_id IS NULL`)** must be handled in the merge — these should produce `companies: null`, which `Reports.tsx` handles with optional chaining (`u.companies?.name`).

**Complicating factors:** Two queries to add (companies + recipients). The recipient merge produces a synthetic array to satisfy the existing type contract in `Reports.tsx`.

---

### File 3 — `deals/[id]/edit/page.tsx`
**Confidence: High — simplest of the three.**

This is a single-row fetch on a known `id`. The FK value `company_id` is already in the select. The join result is consumed only within this file (two lines: `deal.companies as any` and `company?.name ?? ''`). The fix requires:

1. Remove `companies(id, name)` from the select string.
2. Add one conditional secondary query (same pattern as `deals/[id]/page.tsx` which does exactly this).
3. Replace `const company = deal.companies as any` and `company?.name ?? ''` with `companyData?.name ?? ''`.

No downstream files are affected.

**Complicating factors:** None, except a pre-existing unrelated issue: `notes` appears in the select string but the column does not exist in any migration. This issue is already present before the join fix and is unchanged by it.
