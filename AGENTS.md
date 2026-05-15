<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:juno-conventions -->
# Juno conventions

Platform-wide rules for how JunoOS is built. Read this before writing any code. Where this file and a stage spec disagree, the stage spec wins for that stage; this file wins for everything else.

The canonical living spec is `docs/Juno_Deal_Page_Restructure_Spec_v3_7.md` (and successors). Per-stage build prompts live in `docs/Prompts/`. The master transaction-type spec is `docs/specs/TRANSACTION_WORKFLOW_SPEC.md`.

---

## 1. Database queries

### 1.1 No PostgREST embedded joins

PostgREST's embedded join syntax (e.g. `clients(id, full_name)` inside `.select()`) silently fails on JunoOS's schema — returns parent rows with joined fields as null, no error thrown. This has bitten the platform before and is platform-wide forbidden.

**Always use the two-query-then-merge pattern.** Fetch parent rows, collect IDs, fetch related rows in a second query keyed by those IDs, merge in JavaScript via a `Map` lookup.

```typescript
// 1. Parent rows
const { data: clientGroup } = await supabase
  .from('clients')
  .select('*')
  .eq('lead_client_id', leadId);

// 2. Collect IDs and fetch related rows
const entityIds = clientGroup.map(c => c.id);
const { data: transactions } = await supabase
  .from('transactions')
  .select('*')
  .in('client_id', entityIds);

// 3. Merge via Map lookup in JS
const txByClient = new Map();
transactions.forEach(t => {
  if (!txByClient.has(t.client_id)) txByClient.set(t.client_id, []);
  txByClient.get(t.client_id).push(t);
});
```

For more than two levels (e.g. clients → transactions → companies), repeat the pattern. Three queries is fine; a single embedded join is not.

### 1.2 Migrations via `apply_migration`, not `execute_sql`

Use Supabase MCP's `apply_migration` for any schema change so it's tracked in migration history. `execute_sql` is for inspection and ad-hoc data queries only.

### 1.3 Ed reviews SQL before any migration runs

No exceptions. Propose the SQL in plain text, wait for explicit approval, then apply. This rule precedes every other database rule.

---

## 2. Document generation

### 2.1 Two-form file naming

Every generated document has two filename forms stored in different columns:

| Column | Form | Example |
|---|---|---|
| `documents.filename` | Human-facing, em dashes as separators | `2026-05-12 — Bob Smith — Acme Ltd — Transaction Statement.pdf` |
| `documents.storage_url` | Supabase Storage-safe (sanitised) | `2026-05-12-Bob_Smith-Acme_Ltd-Transaction_Statement.pdf` |

The human-facing form is what users see in the UI and what gets attached to emails. The storage form is the actual Supabase Storage object key.

### 2.2 Always sanitise storage keys

Supabase Storage rejects em dashes (U+2014) and certain other Unicode characters in object keys. Every upload must pass its filename through `sanitiseStorageKey()` (in `src/services/document-generation/storage.ts`) before constructing the storage path. Never call `supabase.storage.from(...).upload(path, ...)` directly with an unsanitised path.

This rule applies to **every** document type, not just transaction statements where it was discovered.

### 2.3 Document type model

Generated documents land in the `documents` table with at minimum: `type`, `deal_id` and/or `client_id` and/or `deal_investor_id` (whichever apply), `filename`, `storage_url`, `template_version` (format: `templateName@semver`, e.g. `applicationForm@1.1.0`), `superseded` (boolean).

Documents that need signing additionally populate `signing_status`, `documenso_envelope_id`, `recipient_email`, `cc_emails`. Generation-only documents (e.g. transaction statements) leave these NULL.

### 2.4 Two pipelines for document generation

The platform has two generation pipelines. The choice is **driven by whether the document needs e-signature**, not by an open architectural question.

- **Generic pipeline with Documenso** (`generateDocument<T>()`, `ContextMap` registry in `src/services/document-generation/`) — used for documents that need signing. Application forms use this. Populates `documents.signing_status`, `documents.documenso_envelope_id`, `documents.recipient_email`, `documents.cc_emails`.
- **Dedicated function** (e.g. `generateTransactionStatement()`) — used for plain PDF generation that doesn't need signing. Transaction statements use this. Leaves signing-related columns NULL.

Both paths use React-pdf for rendering, immutable Supabase Storage, template versioning (format `templateName@semver`), and the same `sanitiseStorageKey()` rule for storage paths.

When adding a new document type, the first question is: does this need an investor signature? Yes → generic pipeline. No → dedicated function. Future Work 14.18 in the spec tracks whether to consolidate these into a single pipeline, but for now the split is the working pattern.

---

## 3. State and audit logging

### 3.1 Mock buttons write real database state

Buttons labelled as "mock" in the UI still write real records — status updates, `fee_locked_at`, placeholder document rows, etc. They are flagged with `is_mock=true` in `deal_action_logs` so they can be filtered or rolled back later. This is intentional: the only way the workflow stays testable end-to-end without external integrations.

### 3.2 Compute statuses on read, don't schedule jobs

Derived statuses — chase status (10-day inactivity threshold on `updated_at`), bookbuild auto-lock (when all non-declined investors are signed-or-beyond), client status strip pills — are computed in JavaScript when the page renders. There are no scheduled jobs, no cached status columns, no triggers.

The canonical pattern is `getDisplayedStatus()` in the deals workflow. New computed-status surfaces (e.g. client record status strip) follow the same shape.

### 3.3 React state and route navigation

`useState` does not reinitialise between route navigations to the same component (e.g. navigating deal A → deal B). To force a clean remount, pass `key={deal.id}` (or equivalent stable per-instance ID) on the component. Derive statuses as plain constants from props rather than holding them in state.

---

## 4. Domain rules

### 4.1 Three-dimensional investor identity

Every investment has three independent dimensions. Never collapse them into two.

- **Client** — principal investor, always a real person
- **Vehicle** — legal entity through which the investment is made (NULL = own name)
- **Location** — where the shares are physically held (NULL = direct, otherwise nominee company name)

This applies platform-wide: deals, sells (future redesign), client records, reporting.

### 4.2 EIS status is transaction-level

Never at company level. A company can have both EIS and non-EIS transactions simultaneously. UI must never imply "Cyclr is EIS" — only "this transaction is EIS".

### 4.3 Lock-after-complete rule

When a deal completes, only `share_price` locks. All other deal-level fields (including share class) remain editable — share class can change on recapitalisation.

### 4.4 Fund types and fees

**Three fund types exist** (rows in the `fund_types` table):

- **Syndicate** — default for all new clients; open to new onboarding
- **Multi Manager** — closed to new onboarding
- **EIS Fund** — closed to new onboarding

Clients are linked to a fund type via `clients.active_fund_type`. Clients may belong to more than one fund type; deal and transfer wizards must prompt for active designation in that case.

**Fees are never hardcoded in the platform.** They live in database tables and must be read from there at every use site. The lookup chain:

1. **Client's fee schedule:** `clients.fee_schedule_id` → `fee_schedules` → `fee_schedule_items` (filtered by relevant `fee_type`, e.g. `'buy'`, `'exit'`)
2. **Fallback:** `clients.default_fee_rate` (legacy column, still populated, default 5.00) if the client has no `fee_schedule_id`
3. **Further fallback:** `fund_types.exit_fee_default_pct` (rare) — used by the fund type's defaults

Any new feature that needs a fee value follows this chain. Never write fee percentages as constants in code.

The persistent deal-header "Fund type" cell derives from the deal's primary client → `clients.active_fund_type` → `fund_types` row. Deals don't currently have a direct `fund_type` field — it's implicit from the investors involved.

### 4.5 Payment reconciliation is permanently out of scope

JunoOS does not capture bank references or payment dates beyond the team's manual "Mark payment received" confirmation. No bank integration, no payment matching. Manual confirmation only.

---

## 5. Design tokens

The canonical design system lives in the spec. Key values to memorise:

| Token | Value |
|---|---|
| Navy (primary) | `#0f2744` |
| Teal (accent / badges) | `#1d9e75` |
| EIS pill green | bg `#e1f5ee` text `#085041` |
| Nominee pill purple | bg `#eeedfe` text `#3c3489` |
| Status dots | green `#1d9e75` / amber `#ba7517` / blue `#185fa5` / grey `#aaa` |
| Hover row background | `#fafaf8` |
| Card border | 0.5px `#e8e7e0` |
| Border radius (cards) | 8px |
| Border radius (pills) | 6px |

Numbers across the platform use `font-variant-numeric: tabular-nums` for column alignment.

---

## 6. Build discipline

### 6.1 Branch per stage

One feature branch per stage (or sub-stage). Stage prompts live in `docs/Prompts/` and follow the naming pattern `Stage_[N]_[Name]_Prompt.md`.

### 6.2 Spec version history is the truth

When a stage merges, the spec's version history (Section 15) gets a new entry, and the build sequence table (Section 12) updates the stage's status to "Merged [date]". If this discipline slips, drift accumulates fast — see how Stage 6c was almost lost in v3.5.

### 6.3 Two-layer review

Claude Code builds and self-checks. Chat-Claude (via Supabase MCP, preview deployments, and reading the spec) verifies. Ed reviews preview deployments before merge. No PR merges without both review layers.

<!-- END:juno-conventions -->
