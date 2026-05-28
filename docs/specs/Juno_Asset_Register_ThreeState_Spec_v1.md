# Juno OS — Three-State Asset Register Specification

**Version:** 1
**Date:** 28 May 2026
**Status:** Buildable, pending the confirmations in Section 9. Schema verified live via Supabase MCP on 28 May 2026 (project `pzfydvwbeeupfgnxkpad`).
**Scope:** The valuations-side reporting model that classifies every investor holding as **owned**, **contingent**, or **disposed**, and presents disposed-with-deferred-consideration holdings as a distinct contingent section that is never added into portfolio value.
**Relationship to other specs:** This is the day-one, independent foundation piece identified in the cash-disposal sell design-decisions document (Section 8). It is built ahead of — and consumed by — the cash-disposal sell deal page. It does not depend on the sell deal page existing. The sell deal page *operates* deferred consideration; this spec *reports* it.

---

## How to read this spec

This document is written for Claude Code, working from the existing JunoOS codebase, and reviewed by Ed (non-technical, reviews the plan before anything runs).

The headline, established by inspecting the live database: **almost all the data this needs already exists.** This is not a build-new-infrastructure spec. It is a reporting-layer spec over data the buy-page work already laid down, plus a small number of genuinely missing pieces called out explicitly. Read Section 2 (what already exists) before anything else — it's the reason this spec is short.

Everything in plain English alongside the technical detail, per the usual working style.

---

## 1. Why this exists

The platform needs to answer "what is an investor's position?" honestly. Today there are effectively two states an investment can be in: a live holding, or a closed/exited one. That's not enough, because of one real situation:

**A holding can be sold while money is still owed.** When a company is sold with deferred consideration — an earn-out, an escrow release, milestone payments — the shares are *gone* (the investor no longer owns them) but a *contingent right to future money* remains. Neither existing state describes this truthfully:

- Treating it as **owned** overstates the portfolio — the investor doesn't own the shares anymore, and the future money might never arrive.
- Treating it as **disposed** loses sight of money that is genuinely still expected.

The answer is a **third state — contingent** — and a reporting model that shows all three without ever letting contingent money inflate the headline portfolio value.

**This is needed on day one**, independent of when the sell workflow is built, because historical deals are being ingested that *already* carry deferred consideration outstanding. Those past disposals need a truthful home the moment their data lands.

---

## 2. What already exists (verified live, 28 May 2026)

This section is the foundation. Every field below was confirmed present in the live schema. The practical effect is that the three-state model is largely a *lens* over existing columns, not new storage.

### 2.1 The `investments` table already supports disposals

`investments` already carries everything a disposal needs:

| Field | Type | Relevance |
|---|---|---|
| `status` | text, check `('active','pending','exited')` | The existing two-and-a-bit states. `active` = owned; `exited` = disposed. |
| `transaction_type` | text, check includes `'sell'`, `'full_exit'`, `'partial_exit'`, `'cln_conversion'`, `'dividend'` | Disposal transaction types already allowed. |
| `proceeds` | numeric, nullable | Sale proceeds — already there. |
| `gain_loss` | numeric, nullable | Provisional gain/loss — already there. |
| `cost_basis` | numeric, nullable | The figure the FIFO engine fills — already there. |
| `fee_rate`, `fee_amount` | numeric, nullable | Disposal fee — already there. |
| `proceeds`, `completion_date`, `deal_id` | | Link disposal back to its deal. |

**Implication:** an owned holding and a disposed holding are already distinguishable by `status`. The work is to add the *contingent* distinction (Section 3) and the *reporting view* (Section 5).

### 2.2 The `deferred_payments` table is already built — and richer than expected

`deferred_payments` exists with: `investment_id`, `deal_id`, `client_id`, `expected_amount`, `actual_amount`, `expected_date`, `actual_date`, `contingency_description`, `payment_route` (`direct`/`nominee`), `status` (`expected`/`received`/`overdue`/`waived`), `tranche_number`, `is_final_tranche`, and timestamps.

**Implication:** the contingent state is *defined by* the presence of these rows. An investment is contingent precisely when it's been sold AND it has `deferred_payments` not yet all settled. The data to derive this already exists. No new table.

### 2.3 The `deals` table already has the "payments outstanding" columns

`deals` carries `deferred_consideration` (boolean), `total_proceeds_cap`, `deferred_period_months`, `deferred_closed_out` (boolean), `deferred_closed_out_at`, `deferred_closed_out_by`. There is also a `deal_deferred_notes` table.

**Implication:** the deal-level "completed – payments outstanding" state the sell page will operate already has its storage. This spec only *reads* these; the sell page writes them.

### 2.4 The fee tables already express a time-capped accruing fee

This resolves the open worry from the sell design conversation. `fee_schedule_items` already has:

- `fee_type` check including `'exit_profit_share'` and `'annual_management'`
- `basis` check including `'percentage_of_profit'`, `'percentage_of_cost'`, `'percentage_of_proceeds'`, `'fixed'`
- `rate`, `cap_rate`, and **`cap_years`**

And `fund_types` has `annual_management_fee_pct`, `fee_cap_pct`, `fee_cap_years`, `fee_deferred`, `fee_basis`.

**Implication:** "X% of cost per annum, capped at 5 years" is *already expressible*. No schema change is needed to hold the deferred management fee terms — only Settings configuration (out of scope here; belongs to the sell/Settings work). This spec notes it because the contingent reporting view shows pro-forma fees on expected payments, and those fees read from this existing chain.

### 2.5 What this means

The three-state register is **a reporting layer, not a data-model rebuild**. The genuinely new work is small and is isolated in Section 3 and Section 5.

---

## 3. The three states — definitions and how each is determined

### 3.1 The states

| State | Plain meaning | Counts in portfolio total? |
|---|---|---|
| **Owned** | A live holding. The investor owns these shares now. | **Yes** |
| **Contingent** | Sold, but deferred consideration is still outstanding. Shares gone; money still expected. | **No** — shown separately |
| **Disposed** | Fully sold and settled. Nothing further expected. | **No** — historical record |

A holding sold with deferred consideration travels **owned → contingent → disposed** as payments complete. A holding sold for a single upfront payment goes straight **owned → disposed**, never passing through contingent.

### 3.2 How each state is determined — recommendation: derive contingent on read

**The decision:** should "contingent" be a stored value on `investments.status`, or derived on read?

**Recommendation: derive it on read. Do not add a stored `'contingent'` status.**

Reasoning, in plain terms. Contingent is not a state someone *puts* an investment into — it's a fact that follows automatically from two things that are already recorded: the investment has been sold, and it still has deferred payments outstanding. If we *store* a contingent flag, we create two sources of truth for the same fact: the flag, and the underlying payment records. They can drift — the team marks the final payment received but forgets to flip the flag, and now the asset register quietly lies. If we *derive* it, the register is correct by construction, always, with no maintenance step to forget.

This also matches how the platform already works. Chase-status (10-day inactivity) and bookbuild auto-lock are both computed on read rather than stored, precisely because they're facts that follow from other data. Contingent is the same kind of fact. Deriving it is the consistent choice.

**The derivation rule:**

```
For a given investment row:

  OWNED       if status = 'active'
  DISPOSED    if status = 'exited'  AND  it has no unsettled deferred payments
  CONTINGENT  if status = 'exited'  AND  it has ≥1 deferred payment whose
                                          status is 'expected' or 'overdue'

  (deferred payments with status 'received' or 'waived' are settled and
   do not, by themselves, keep an investment contingent)
```

"Unsettled" = a `deferred_payments` row for this investment with `status IN ('expected','overdue')`. Once every deferred payment is `received` or `waived`, the investment ceases to be contingent and reads as disposed automatically.

**Centralised helper.** Implement this as a single derivation function — proposed name `getAssetState(investment, deferredPayments)` — living alongside the other compute-on-read helpers, so every part of the platform classifies an asset identically. No part of the UI re-implements the rule inline. (Mirrors the centralised `getDisplayedStatus()` pattern from the buy page.)

### 3.3 The edge case: `status='exited'` set before this spec exists

Historically some `investments` rows may already be `status='exited'` with no deferred-payment rows. Under the rule above they read as **disposed**, which is correct. Ingested historical deals that *do* have deferred consideration will have `deferred_payments` rows created at ingestion (that's the ingestion job's responsibility, not this spec's), and will therefore read as **contingent** automatically. No backfill of a status column is required precisely because nothing is stored.

---

## 4. The transition out of contingent

An investment leaves the contingent state in one of two ways, both already supported by existing data:

1. **All deferred payments settle.** As each payment is confirmed (`status='received'`) or written off (`status='waived'`) — an action performed on the sell deal page, not here — the derivation re-evaluates. When the last unsettled payment clears, the investment reads as disposed. Automatic; no separate "close out" step required for the register's correctness.

2. **The deal is closed out at the deal level.** The `deals.deferred_closed_out` flag (set on the sell page when the team decides no further payments are expected — e.g. an earn-out target was definitively missed) is a deal-level signal. Where a deal is closed out, its investments' remaining `expected`/`overdue` payments should have been resolved to `waived` as part of that action. The register relies on the payment-level status, not the deal flag, for classification — but the deal flag is available to the reporting view as context (e.g. to label why a contingent line ended).

**This spec does not write either of these.** They are operated on the sell deal page. This spec reads the results.

---

## 5. The reporting model — three sections in valuations

This is the genuinely new build: a valuations-side presentation that shows all three states, with contingent visually and arithmetically separated.

### 5.1 Where it appears

Two surfaces, same underlying classification (consistent with the "operate on the deal page, report in valuations" decision):

- **Valuations reports** (primary, this spec's focus) — the investor-facing / portfolio-level view, read-only.
- **The sell deal page** (out of scope here, noted for coherence) — where contingent payments are operated. It consumes the same `getAssetState` helper.

### 5.2 The three sections of a valuations report

A holdings view (per investor, and in aggregate) presents three clearly separated sections:

**Section A — Owned holdings.** Live positions. These sum into the **headline portfolio value**. Unchanged from today's behaviour — this is what the portfolio is "worth" now.

**Section B — Contingent / deferred proceeds.** Holdings that have been sold but have outstanding deferred consideration. Shown as a distinct table, visually separated, with a clear heading. **This section never adds into the headline portfolio total.** It may be summarised as a memo line beneath the portfolio total — e.g. "plus £X expected in contingent deferred proceeds across N past disposals (estimated, not guaranteed)".

Each contingent line shows:
- Originating company and the disposal (deal reference, disposal date)
- Total proceeds received to date (sum of settled `deferred_payments.actual_amount` plus any upfront proceeds on the `investments` row)
- Next / outstanding expected amount(s), each **clearly badged estimated or contingent**, with expected date where known and the contingency description
- Pro-forma fee estimate on expected amounts (read from the existing fee chain — Section 2.4), clearly marked provisional
- Status per payment (expected / overdue / waived) and tranche numbering (`tranche_number` of total, `is_final_tranche`)

**Section C — Disposed holdings.** Fully settled past disposals — the historical record. Shown for completeness (an investor can see what they used to hold and what it realised), never in the portfolio total. Each line shows company, disposal date, total proceeds realised, total fees, and provisional gain/loss (from the existing `investments` fields).

### 5.3 The cardinal rule

**Only Section A sums into portfolio value.** Sections B and C are shown for truth and completeness but are arithmetically excluded from the headline figure. This is the whole point of the three-state model and must be unambiguous in the UI — no design should let a reader mistake a contingent or disposed figure for current portfolio value.

### 5.4 Data assembly (two-query-then-merge)

Per the platform-wide rule, do **not** use PostgREST embedded joins. Assemble the view by:

1. Fetch the investor's `investments` rows (all statuses).
2. Fetch the related `deferred_payments` rows by the collected `investment_id`s.
3. Fetch related `deals` / `companies` / `company_share_classes` by collected IDs.
4. Merge in JavaScript via Map lookups.
5. Classify each investment with `getAssetState()` and bucket into A / B / C.

---

## 6. What is genuinely new vs reused

| Element | Status |
|---|---|
| `investments` disposal fields (`proceeds`, `gain_loss`, `cost_basis`, `fee_*`, `status='exited'`) | **Exists** — reuse |
| `deferred_payments` table | **Exists** — reuse |
| `deals` deferred-consideration columns | **Exists** — reuse (read-only here) |
| Fee chain expressing capped accruing fees (`cap_years` etc.) | **Exists** — reuse (read-only here) |
| `getAssetState()` derivation helper | **NEW** — small, central |
| Three-section valuations report (owned / contingent / disposed) | **NEW** — the main build |
| "Memo line, never in total" arithmetic separation | **NEW** — presentation rule |
| Any schema migration | **NONE required** for the register itself |

The absence of a migration is deliberate and is the consequence of the derive-on-read decision plus the pre-existing schema.

---

## 7. Explicitly out of scope

- **Operating deferred payments** (confirming receipt, waiving, regenerating statements) — that's the sell deal page.
- **The ingestion job** that creates `deferred_payments` rows for historical deals — separate task; this spec assumes those rows exist when present.
- **Configuring the deferred-fee Settings rows** — belongs to the sell/Settings work. The fee *shape* already exists (Section 2.4); the numbers are entered in Settings.
- **Probability-weighting or valuing contingent amounts** — Juno records contingent proceeds; it does not assign them a discounted value. Expected amounts are shown as entered, badged estimated.
- **CLN conversion** — although `transaction_type` already allows `cln_conversion`, the conversion workflow is a separate v2 spec. This register will classify a converted position by the same rules if/when such rows exist, but defining conversion is not this spec's job.

---

## 8. Build sequence

Small enough to be one or two stages:

1. **`getAssetState()` helper + unit logic.** The derivation rule (Section 3.2), centralised, with the settled-payment semantics. Testable in isolation.
2. **Three-section valuations report.** The owned / contingent / disposed presentation (Section 5), the memo-line arithmetic separation, two-query-then-merge assembly. Consumes the helper.

No migration stage — the schema already supports it.

---

## 9. Confirmations before build

1. **§3.2** — confirm the derive-on-read recommendation (no stored contingent status). My recommendation is to derive; overrule if you'd prefer a stored status and I'll add the migration.
2. **§5.2** — confirm the three sections appear in **valuations reports** specifically, and confirm whether the contingent section should also surface on the company/portfolio dashboard or only in the formal valuations report. (You indicated valuations reports; confirming the exact surface.)
3. **§5.2 Section B** — confirm "total proceeds received to date" should include the upfront proceeds recorded on the `investments` row plus settled deferred payments (my assumption), not deferred payments alone.
4. **§4** — confirm that when a deal is closed out (`deferred_closed_out`), outstanding payments are resolved to `waived` as part of that action on the sell page, so the register's payment-level classification stays correct. (This is a note to carry into the sell-page spec, not a change here.)

---

## 10. Version history

- **v1 (28 May 2026)** — First draft. Schema verified live. Three-state model defined as a derive-on-read reporting layer over existing `investments` / `deferred_payments` / `deals` data. Established that no migration is required for the register itself, and that the fee tables already express capped accruing fees. Genuinely new work isolated to a central `getAssetState()` helper and a three-section valuations report.

---

*End of specification v1.*
