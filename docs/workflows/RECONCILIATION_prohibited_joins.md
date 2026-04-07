# Reconciliation Plan: Prohibited Embedded Joins
**Stage:** 5 Part A — plan only, no code changes made
**Produced:** 2026-04-07
**Source:** docs/workflows/CURRENT_prohibited_joins.md

---

## 1. Files to Change

| # | File | Change required |
|---|------|----------------|
| 1 | `src/app/(app)/deals/[id]/edit/page.tsx` | Remove `companies(id, name)` from deals select; fetch company in separate conditional query; replace two lines that read `deal.companies` |
| 2 | `src/app/(app)/investments/page.tsx` | Remove `companies (id, name)` from investments select; add merge step using the companies array already fetched in the same `Promise.all` |
| 3 | `src/app/(app)/reports/page.tsx` | Replace single query (two embedded joins) with three queries: primary select + companies lookup + recipients lookup; merge all three into the updates array |

---

## 2. Fix Order (lowest risk first)

1. **`deals/[id]/edit/page.tsx`** — single row, single join, consumption is entirely within the same file. Exact reference pattern exists in `deals/[id]/page.tsx`.
2. **`investments/page.tsx`** — companies array already fetched; only needs a merge step added. Two downstream files read the result but neither needs changing.
3. **`reports/page.tsx`** — two joins, two new queries, synthetic array construction for recipient count. Most moving parts.

---

## 3. Preparatory Changes

### `reports/page.tsx` only
`company_id` is not currently in the `investor_updates` select. It must be added in the new primary query (see Section 4, File 3). This is part of the fix, not a separate step.

No preparatory changes are needed for the other two files.

---

## 4. Exact Code Changes

### File 1 — `src/app/(app)/deals/[id]/edit/page.tsx`

#### Change A — remove embedded join from select string

**Remove (line 13):**
```typescript
    .select('id, deal_type, status, company_id, share_price, share_class, investment_date, eis_qualifying, completion_checklist, notes, companies(id, name)')
```

**Replace with:**
```typescript
    .select('id, deal_type, status, company_id, share_price, share_class, investment_date, eis_qualifying, completion_checklist, notes')
```

#### Change B — add company fetch inside the existing Promise.all

**Remove (lines 33–42):**
```typescript
  const [{ data: clients }, { data: investments }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, email, default_fee_rate, tax_status, lead_investor_id, fund_type, active_fund_type')
      .order('full_name'),
    supabase
      .from('investments')
      .select('id, client_id, company_id, share_class, shares_purchased, original_share_price, sum_subscribed, eis_status, transaction_type, investment_date')
      .eq('status', 'active'),
  ])
```

**Replace with:**
```typescript
  const [{ data: clients }, { data: investments }, { data: companyData }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, email, default_fee_rate, tax_status, lead_investor_id, fund_type, active_fund_type')
      .order('full_name'),
    supabase
      .from('investments')
      .select('id, client_id, company_id, share_class, shares_purchased, original_share_price, sum_subscribed, eis_status, transaction_type, investment_date')
      .eq('status', 'active'),
    deal.company_id
      ? supabase.from('companies').select('id, name').eq('id', deal.company_id).maybeSingle()
      : { data: null },
  ])
```

#### Change C — replace lines that read `deal.companies`

**Remove (lines 44–47):**
```typescript
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const company     = deal.companies as any
  const cc          = (deal.completion_checklist ?? {}) as Record<string, unknown>
  const companyName = company?.name ?? ''
```

**Replace with:**
```typescript
  const cc          = (deal.completion_checklist ?? {}) as Record<string, unknown>
  const companyName = companyData?.name ?? ''
```

**Lines removed:** 4 (select string content, eslint comment, `company` variable, `companyName` original form)
**Lines added:** 5 (new select string, three new lines in Promise.all, new `companyName`)
**Net change:** +1 line

---

### File 2 — `src/app/(app)/investments/page.tsx`

#### Change A — remove embedded join from investments select

**Remove (line 20 of the template literal):**
```typescript
        fund_type, companies (id, name)
```

**Replace with:**
```typescript
        fund_type
```

#### Change B — add merge step after the Promise.all, before the return

**Remove (lines 37–44):**
```typescript
  return (
    <InvestmentsLedger
      investments={(investments ?? []) as Record<string, unknown>[]}
      companies={(companies ?? []) as Record<string, unknown>[]}
      clients={(clients ?? []) as Record<string, unknown>[]}
      valuations={(valuations ?? []) as Record<string, unknown>[]}
    />
  )
```

**Replace with:**
```typescript
  const companyMap = new Map((companies ?? []).map(c => [c.id, c as Record<string, unknown>]))
  const investmentsWithCompany = (investments ?? []).map(inv => ({
    ...(inv as Record<string, unknown>),
    companies: companyMap.get((inv as Record<string, unknown>).company_id as string) ?? null,
  }))

  return (
    <InvestmentsLedger
      investments={investmentsWithCompany}
      companies={(companies ?? []) as Record<string, unknown>[]}
      clients={(clients ?? []) as Record<string, unknown>[]}
      valuations={(valuations ?? []) as Record<string, unknown>[]}
    />
  )
```

**Lines removed:** 9 (one select line + the return block)
**Lines added:** 12 (merge block + return block)
**Net change:** +3 lines

---

### File 3 — `src/app/(app)/reports/page.tsx`

#### Change A — replace entire query block and return

**Remove (lines 7–17, the entire function body):**
```typescript
  const { data: updates } = await supabase
    .from('investor_updates')
    .select(`
      id, update_type, title, status, sent_at, created_at,
      companies (id, name),
      investor_update_recipients (id)
    `)
    .order('created_at', { ascending: false })
    .limit(30)

  return <Reports updates={(updates ?? []) as Record<string, unknown>[]} />
```

**Replace with:**
```typescript
  // Query 1: investor_updates — no embedded joins; company_id added for merge
  const { data: rawUpdates } = await supabase
    .from('investor_updates')
    .select('id, update_type, title, status, sent_at, created_at, company_id')
    .order('created_at', { ascending: false })
    .limit(30)

  // Collect IDs for secondary lookups
  const companyIds = [...new Set((rawUpdates ?? []).map(u => u.company_id).filter((c): c is string => Boolean(c)))]
  const updateIds  = (rawUpdates ?? []).map(u => u.id)

  // Query 2 + Query 3 in parallel
  const [{ data: companiesData }, { data: recipientsData }] = await Promise.all([
    companyIds.length > 0
      ? supabase.from('companies').select('id, name').in('id', companyIds)
      : { data: [] as { id: string; name: string }[] },
    updateIds.length > 0
      ? supabase.from('investor_update_recipients').select('investor_update_id').in('investor_update_id', updateIds)
      : { data: [] as { investor_update_id: string }[] },
  ])

  // Merge
  const companyMap = new Map((companiesData ?? []).map(c => [c.id, c]))

  const recipientCountByUpdate: Record<string, number> = {}
  for (const r of recipientsData ?? []) {
    const uid = (r as Record<string, unknown>).investor_update_id as string
    recipientCountByUpdate[uid] = (recipientCountByUpdate[uid] ?? 0) + 1
  }

  const updates = (rawUpdates ?? []).map(u => ({
    ...u,
    companies: u.company_id ? (companyMap.get(u.company_id) ?? null) : null,
    investor_update_recipients: Array.from(
      { length: recipientCountByUpdate[u.id] ?? 0 },
      () => ({ id: '' }),
    ),
  }))

  return <Reports updates={updates as Record<string, unknown>[]} />
```

**Lines removed:** 11
**Lines added:** 38
**Net change:** +27 lines

---

## 5. Verification

### File 1 — `deals/[id]/edit/page.tsx`
Navigate to `/deals/[any-deal-id]/edit` for a deal that has a `company_id` set.

- **Before fix:** The subtitle below "Edit deal" (rendered from `companyName` in `EditInvestorsClient`) is blank or shows the fallback `''`.
- **After fix:** The company name (e.g. "Acme Ltd") appears as the subtitle.

To confirm the fix is isolated: a deal with `company_id = null` should still render without error (the conditional guard `deal.company_id ? ... : { data: null }` produces `companyData = null`, so `companyName = ''`).

### File 2 — `src/app/(app)/investments/page.tsx`
Navigate to `/investments` and switch to the **Ledger** view tab.

- **Before fix:** The company name column shows `—` for every row (because `inv.companies` is `null`).
- **After fix:** Each row shows the correct company name.

Secondary check: switch to **Holdings** view. The company filter dropdown is built from the separately fetched `companies` prop (not from `inv.companies`), so it should be unaffected by this fix in either state — but verify it still renders correctly.

Also verify in `InvestmentsLedger` the label used for the account key (line 92: `investments.find(i => i.company_id === compId)?.companies?.name`) now resolves to a name rather than `undefined`.

### File 3 — `src/app/(app)/reports/page.tsx`
Navigate to `/reports`.

- **Before fix:** The "Sent updates" table (if any updates with status `sent` exist) shows `—` in the title/company column and `0` in the recipients column.
- **After fix:** Each sent update row shows the company name (or the update title if set) and the correct recipient count.

Also verify draft updates (status `draft` or `in_review`) display their company name in the drafts list at the top of the page.

---

## 6. Risks

### Risk 1 — `deal.company_id` reference before null-check (File 1)
**What could go wrong:** Change B adds `deal.company_id` as a condition in the `Promise.all`. This `Promise.all` runs after `if (!deal) return notFound()` and after the `deal.status === 'complete'` check, but before the `isBuyDeal`/`isSellDeal` guard. `deal` is confirmed non-null at that point, so `deal.company_id` is safe to access (it may be `null` but the conditional handles that).

**How to avoid:** The replacement code shown above uses `deal.company_id ? ... : { data: null }` — the same guard pattern used in `deals/[id]/page.tsx`.

### Risk 2 — TypeScript type of `companyData` (File 1)
**What could go wrong:** The third element of the destructured `Promise.all` result will be typed as `{ data: { id: string; name: string } | null }`. The existing `companyName = companyData?.name ?? ''` expression is straightforward optional chaining and should type-check cleanly. The removed `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment existed specifically to silence the `deal.companies as any` cast — removing it along with that cast is correct.

**How to avoid:** No special handling needed. The optional chaining `?.name` is sufficient.

### Risk 3 — `investments` TypeScript types after merge (File 2)
**What could go wrong:** The merge produces `investmentsWithCompany` as `(Record<string, unknown> & { companies: Record<string, unknown> | null })[]`. This is passed to `InvestmentsLedger` which expects `Record<string, unknown>[]`. The cast `as Record<string, unknown>[]` is not needed because the merged type is assignable to it — but `InvestmentsLedger.tsx` internally casts everything to its own `Investment` interface anyway (line 26: `as unknown as Company[]`). No type error is expected.

**How to avoid:** The replacement code shown above matches the cast style used elsewhere in the file.

### Risk 4 — `companies` prop shape mismatch (File 2)
**What could go wrong:** `InvestmentsLedger` receives both `investments` (with `companies` merged in) and `companies` (the full list with `share_classes`). The merged `companies` objects on each investment row come from the same `companies` array but were built with `select('id, name, share_classes')`. If any downstream code on `inv.companies` expects only `{ id, name }` (per `ledgerUtils.ts:24`), including `share_classes` is harmless — it is an extra field, not a missing one.

**How to avoid:** No action needed. The merge attaches the full company object; downstream code only reads `.name`.

### Risk 5 — `investor_update_recipients` array shape in `Reports.tsx` (File 3)
**What could go wrong:** `Reports.tsx` type definition (line 14) declares `investor_update_recipients: { id: string }[]`. The synthetic array produced by the merge uses `() => ({ id: '' })` to satisfy this shape. `Reports.tsx` only calls `.length` on this array (line 183) — it never iterates or reads individual `id` values. If any future code reads individual `id` values, the empty string `''` would be wrong.

**How to avoid:** The empty-string `id` is acceptable only because the current consumer reads `.length` only. This is documented in `CURRENT_prohibited_joins.md`. If `Reports.tsx` is later changed to use individual IDs, the recipients data structure would need to be revisited.

### Risk 6 — updates with `company_id = null` (File 3)
**What could go wrong:** `investor_updates.company_id` may be null for some rows (e.g. platform-wide updates not linked to a company). The merge uses `u.company_id ? companyMap.get(u.company_id) ?? null : null` which correctly produces `companies: null` for those rows. `Reports.tsx` renders `u.companies?.name` with optional chaining, so `null` produces no output without an error.

**How to avoid:** The conditional in the merge handles this. No special action needed.

### Risk 7 — `notes` column in deals select (File 1)
**What could go wrong:** The existing select string includes `notes`. Per Known Issue #17 in `CURRENT_STATE.md`, the `notes` column does not exist on the `deals` table in any migration. This issue exists before and after the join fix — the proposed Change A preserves `notes` in the select string exactly as it is now.

**How to avoid:** Do not remove or add `notes` as part of this fix. It is a separate known issue.

---

## 7. Line Count Summary

| File | Lines removed | Lines added | Net |
|------|--------------|-------------|-----|
| `deals/[id]/edit/page.tsx` | 4 | 5 | +1 |
| `investments/page.tsx` | 9 | 12 | +3 |
| `reports/page.tsx` | 11 | 38 | +27 |
| **Total** | **24** | **55** | **+31** |
