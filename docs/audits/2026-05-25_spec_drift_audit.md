# Spec Drift Audit — 25 May 2026

## Summary table

| Spec | High | Medium | Low | Open PRs flagged | Total |
| ---- | ---- | ------ | --- | ---------------- | ----- |
| Deal page v3.6 | 2 | 4 | 1 | 1 | 8 |
| TRANSACTION_WORKFLOW v1.0 draft | 0 | 1 | 3 | 0 | 4 |
| section_9 client record | 3 | 2 | 0 | 1 | 6 |
| Phase B Stage 2 (new tables) | 0 | 0 | 1 | 0 | 1 |

---

## Method notes

### Sweep windows used
- **Deal page spec:** 15 May 2026 (spec header date) — PRs merged on or after 15 May 2026, plus any earlier PRs whose changes post-dated v3.6 content.
- **TRANSACTION_WORKFLOW:** 1 April 2026 (first commit touching the file is the baseline); the spec header date is "April 2026" not "25 May 2026" as the audit brief assumed — see F-9.
- **section_9:** Phase B Stage 1 migration applied 18 May 2026 (`client_record_stage1` migration).

### Tools used
- `gh pr list --repo Edrudd-alt/JunoOS --state merged --search "merged:>=2026-04-01" --limit 200` — returned 18 merged PRs, all processed.
- `git log --since="2026-04-01" --first-parent main --oneline` — several direct pushes to main identified (doc-only commits and spec updates, listed below).
- `gh pr list --state open` — one open PR (#19) found.
- Supabase MCP (project `pzfydvwbeeupfgnxkpad`) — `execute_sql` against `information_schema.columns`, `list_migrations`.

### Direct pushes to main (no PR)
The following commits were pushed directly to main without a pull request. All are documentation or spec updates — no schema changes or application code changes:
- `49d0881` — Create `Juno_Deal_Page_Restructure_Spec_v3_7.md`
- `d2fbc01` — Amends to v3.7
- `1eb02ce` — Extend AGENTS.md with Juno conventions
- `749f9a3` — Spec v3.6 reconciliation (Stage 6c)
- `97660b4` — Add Phase B Stage 1 build prompt and Section 9 client record spec
- `e8001ae` — Fix: Transaction Statement menu section visibility
- `5e3e7df` — Spec v3.5 reconciliation (Stage 6b)
- `3cad889` — Docs folder reorganisation
- `c628fbd` — Moving prompts to the prompts folder
- `7292dd1` — Create Follow-up PR10 company page integration doc

None of these direct pushes introduced schema changes. The `e8001ae` commit fixed a UI bug (menu section visibility) with no migration. Flagged here for completeness but no additional spec drift identified.

### Audit was run from branch `feat/entity-model-cleanup-B`
The working tree is on the open PR #19 branch. The spec files I read therefore reflect the branch state, which differs from `main` in the following spec files: `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md`, `docs/Prompts/section_9_client_record.md`, and `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_7.md`. Where branch changes affect a finding, this is noted inline. The **main branch** state is the authoritative baseline for drift classification.

### What could not be checked
- PRs #1 through #7 predate the April 2026 sweep window and were not inspected individually. From git log, all Stage 1–6c work was merged before April 2026 and is captured in the spec changelog.
- The `drop_redundant_valuation_indexes` migration (20260519110000, PR #9) was confirmed by git log and PR description. The exact indexes dropped were verified in the PR body; not re-queried here.
- No migrations exist for the `add_document_signing_fields` (20260508134201) or `add_completion_checklist_to_deal_investors` (20260505185048) in the migration history list format — they appear as standalone migrations without a PR (committed directly or as part of Stage 6 work).

---

## Findings

### Deal page spec v3.6

#### HIGH severity

##### F-1: v3.6 superseded by v3.7 but audit scope names v3.6 as canonical
- **Classification:** Superseded statement
- **Plain English summary:** There is now a v3.7 of the deal page spec in the repository, and `AGENTS.md` explicitly names v3.7 as "the canonical living spec". The deal page spec v3.6 has a status line that says it is the current buildable spec, but it no longer is. Anyone using v3.6 as their guide is one version behind.
- **Spec location affected:** `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md` header (lines 1–13). Also `AGENTS.md` line: "The canonical living spec is `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_7.md`".
- **Evidence:**
  - `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_7.md` added to main by direct push (`49d0881`, ~15 May 2026).
  - `AGENTS.md` updated to reference v3.7 as canonical (direct push `1eb02ce`).
  - v3.7 changelog documents: Stage 7 (Phase A1 closure) merged; Future Work 14.8 (`team_members` backfill) closed; Future Work 14.17 deferred to Stage 6d; Section 11.4 jsPDF reference corrected.
  - v3.7 supersedes v3.6 per its own header: "Supersedes: v1, v2, v3, v3.1, v3.2, v3.3, v3.4, v3.5, v3.6".
- **Why this matters:** The audit brief was written referencing v3.6 — that's fine for a point-in-time audit. But any developer who reads `docs/specs/` and picks up v3.6 is reading an outdated document. The v3.6 header does not say "superseded" — it says "Buildable — Stages 1–6c complete and merged". That positive status message will mislead.
- **Suggested update direction:** Add a single line at the top of v3.6: "> **This spec is superseded by v3.7. See `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_7.md`.**"

---

##### F-2: `clients.active_fund_type` referenced in header metadata grid — column dropped from production
- **Classification:** Specced one way but merged differently (Superseded statement)
- **Plain English summary:** The deal page spec says the "Fund type" cell in the deal header gets its value by looking up a column called `active_fund_type` on the `clients` table. That column no longer exists — it was deleted from the database as part of the Entity Model Cleanup work that merged on 23 May 2026. The deal header "Fund type" cell therefore cannot work as the spec describes.
- **Spec location affected:** `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md` Section 2.1, header metadata grid table, Cell 6 (line ~159). Also the paragraph below the table (line ~163).
- **Evidence:**
  - PR #18 ("feat: Entity Model Cleanup Sub-stage A — data model migrations"), merged 2026-05-23T15:13:33Z.
  - Migration `20260524140000_entity_cleanup_step4_drop_clients_fund_type.sql`: `ALTER TABLE clients DROP COLUMN IF EXISTS active_fund_type`.
  - Live DB confirmed: `SELECT column_name FROM information_schema.columns WHERE table_name='clients'` returns no `active_fund_type` or `fund_type` rows.
  - AGENTS.md §4.4 (updated in Sub-stage A): "Fund type is per-investment (`investments.fund_type`), not per-client. The `clients.fund_type` and `clients.active_fund_type` columns were dropped in Sub-stage A (23 May 2026)."
- **Why this matters:** If anyone reads the spec and tries to build the Fund type cell as described, the query will throw a missing-column error. The correct source is now `investments.fund_type` (per AGENTS.md §4.4), but the spec still points to the old column.
- **Suggested update direction:** In Section 2.1 Cell 6 and the note below, replace the `clients.active_fund_type` reference with the AGENTS.md §4.4 rule: fund type is derived from the deal's active investors' `investments.fund_type`, most common fund type wins, with a visual cue if mixed.

---

#### MEDIUM severity

##### F-3: `documents.signed_storage_url` column in production — not in spec
- **Classification:** Merged but not specced
- **Plain English summary:** The `documents` table in production has a column called `signed_storage_url` that is not described anywhere in the deal page spec. It stores the Supabase Storage path for the signed version of a document (i.e. after Documenso returns the completed PDF). The spec describes `storage_url` (for the original unsigned version) and `signing_status`, `documenso_envelope_id`, etc., but does not mention this additional storage column.
- **Spec location affected:** `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md` Section 3.3 (document versioning fields, line ~253).
- **Evidence:**
  - Migration `add_document_signing_fields` (version `20260508134201`) applied to production.
  - Live DB confirmed: `SELECT column_name FROM information_schema.columns WHERE table_name='documents'` returns `signed_storage_url TEXT NULL`.
  - Not referenced in spec Section 3.3 or Section 11 (Stage 6b architectural design).
- **Why this matters:** The spec's documents table definition in Section 3.3 is the reference anyone would use when querying or adding new document types. Missing `signed_storage_url` means the column is invisible to future spec readers — they might not know the signed PDF is stored separately from the unsigned draft.
- **Suggested update direction:** Add `signed_storage_url TEXT NULL` to the column list in Section 3.3 with a note: "Populated by the Stage 6b webhook handler when Documenso returns the completed signed PDF. Separate from `storage_url`, which holds the original unsigned draft."

---

##### F-4: `deal_investors.completion_checklist` JSONB column in production — not in data model section
- **Classification:** Merged but not specced
- **Plain English summary:** The `deal_investors` table has a `completion_checklist` column (a JSONB blob) that stores the per-investor 5-item checklist. The spec Section 3.1 accurately describes the pre-migration state as having "deals.completion_checklist JSONB blob for completion" — but it never documents that a *new* `completion_checklist` column was added to `deal_investors`. Section 7.3 describes the 5-item checklist UI in detail, but doesn't say where the data is stored.
- **Spec location affected:** `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md` Section 3 (data model implications), specifically the absence of a migration entry for this column. Section 7.3 (completion checklist description).
- **Evidence:**
  - Migration `add_completion_checklist_to_deal_investors` (version `20260505185048`) applied to production.
  - Live DB confirmed: `deal_investors.completion_checklist JSONB NOT NULL DEFAULT '{}'`.
  - The Stage 1 migration in Section 3.9 does not include this column — it was added in a later standalone migration.
  - `deals.completion_checklist` JSONB also still exists (unchanged).
- **Why this matters:** Anyone reading Section 3 as the data model reference would assume checklist state lives only in `deals.completion_checklist` (the old blob). The actual implementation stores it on `deal_investors`. A developer adding a new checklist item would look in the wrong table.
- **Suggested update direction:** Add a Section 3.10 documenting the `deal_investors.completion_checklist` column, explaining it stores the per-investor 5-item checklist as described in Section 7.3. Note that `deals.completion_checklist` also still exists from the pre-migration schema and covers deal-level state.

---

##### F-5: "Client / Vehicle / Location" terminology throughout spec — superseded by "Lead investor / Beneficial owner / Legal owner"
- **Classification:** Superseded statement
- **Plain English summary:** The spec consistently uses the old three-dimension vocabulary "Client / Vehicle / Location" (for example, in the Section 4.3 header, the bookbuild column descriptions, and the sell deal cross-reference). The platform renamed these dimensions in Entity Model Cleanup Sub-stage B (23 May 2026). The new names are "Lead investor / Beneficial owner / Legal owner". The spec on `main` still uses the old names.
- **Spec location affected:** `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md` Section 4.3 header, Section 3.2 "What was new" block, and multiple column heading references throughout Sections 4–7. Also Section 12 and Section 15 version history.
- **Evidence:**
  - Open PR #19 ("Entity Model Cleanup Sub-stage B") includes a commit titled "docs: sweep vocabulary across specs and historical build prompts" that updates v3.6.
  - `git show main:docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md | grep "Client / Vehicle"` — returns multiple hits on `main`.
  - AGENTS.md §4.1 (on the open branch): "User-facing labels (updated Entity Model Cleanup Sub-stage B, 23 May 2026): Lead investor / Beneficial owner / Legal owner. Database column names are unchanged."
- **Why this matters:** Merging from `main` into any new branch gives the old vocabulary. Until PR #19 merges, any developer reading the spec on `main` will use terminology that no longer matches the live UI. Medium rather than high because the database column names are unchanged — only the user-facing labels differ.
- **Suggested update direction:** Will be resolved when PR #19 merges. No additional action needed unless PR #19 is blocked.

---

##### F-6: "Transaction statement PDF generation via jsPDF" — React-pdf is now the production path
- **Classification:** Superseded statement
- **Plain English summary:** Section 1.5 ("Existing infrastructure to preserve") says to preserve "Transaction statement PDF generation via jsPDF". Section 11.4 says "Generate transaction statement uses existing jsPDF generation — already real, not mock." Both are wrong. Stage 6c replaced jsPDF with a React-pdf pipeline. The jsPDF file (`src/lib/services/statementGenerator.ts`) still exists in production but is marked `LEGACY` and is only imported by the old `InvestmentCockpit`. It is not the active path. The v3.7 changelog explicitly corrects this.
- **Spec location affected:** `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md` Section 1.5 (line ~129) and Section 11.4 (line ~1135).
- **Evidence:**
  - `git show main:docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md | grep "jsPDF"` — returns both lines.
  - v3.7 changelog: "Section 11.4's stale 'uses jsPDF' line for transaction statements is corrected to point at the React-pdf pipeline introduced in Stage 6c."
  - Future Work 14.16 (in v3.7): "Deprecate `InvestmentCockpit` and legacy `statementGenerator.ts`."
  - Live code: `src/services/document-generation/templates/transactionStatement.tsx` (React-pdf) is the active template.
- **Why this matters:** Any developer following Section 1.5's guidance would preserve the jsPDF file as live infrastructure. In reality it's a legacy stub awaiting deletion. A new document type built following this precedent would use the wrong pipeline.
- **Suggested update direction:** Update both lines to reference the React-pdf pipeline and note that `statementGenerator.ts` is legacy, retained only for `InvestmentCockpit` pending Future Work 14.16.

---

#### LOW severity

##### F-7: Stage 7 in Section 12 shown as "ahead" — completed and closed in v3.7
- **Classification:** Superseded statement
- **Plain English summary:** Section 12 of v3.6 ends with Stage 7 "Cutover (1-2 days)" described as a future task. Stage 7 has since been completed and documented in v3.7 as a Phase A1 formal closure (not a traditional cutover, since no feature flag was used). The v3.6 spec on `main` still shows Stage 7 as pending.
- **Spec location affected:** `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md` Section 12, Stage 7 block (lines ~1203+).
- **Evidence:** v3.7 changelog: "Stage 7 is therefore not a cutover but a formal closure of Phase A1."
- **Why this matters:** Low impact since v3.6 is itself superseded (F-1). Included for completeness.
- **Suggested update direction:** Will be resolved when F-1 is resolved (mark v3.6 as superseded).

---

### TRANSACTION_WORKFLOW v1.0 draft

#### MEDIUM severity

##### F-8: `company_share_classes` table definition missing `instrument_type` column
- **Classification:** Merged but not specced (Section 1 territory)
- **Plain English summary:** The spec's table definition for `company_share_classes` in Section 1.3 lists all the columns but does not include `instrument_type`. This column was added to production in May 2026 as part of the Phase B Stage 2 share-prices rebuild. It's the column that distinguishes equity share classes from CLN pseudo-classes. It defaults to `'equity'` so all existing rows are unaffected, but any new table definition built from Section 1.3 would be missing this discriminator.
- **Spec location affected:** `docs/specs/TRANSACTION_WORKFLOW_SPEC.md` Section 1.3, `company_share_classes` table (lines ~117–131).
- **Evidence:**
  - Migration `share_prices_foundation` (version `20260519145029`): `ALTER TABLE company_share_classes ADD COLUMN IF NOT EXISTS instrument_type TEXT NOT NULL DEFAULT 'equity' CHECK (instrument_type IN ('equity', 'cln', 'loan_note'))`.
  - Live DB confirmed: `company_share_classes` has `instrument_type TEXT NOT NULL`.
  - Section 1.3 column list ends at `created_at` with no mention of `instrument_type`.
- **Why this matters:** Section 1 is the agreed, locked part of this spec. The table definition is the reference anyone building against this spec would use. Missing a `NOT NULL DEFAULT 'equity'` discriminator column means new migrations or external tooling built from this spec would produce an incomplete table.
- **Suggested update direction:** Add `instrument_type TEXT NOT NULL DEFAULT 'equity' CHECK (instrument_type IN ('equity', 'cln', 'loan_note'))` to the `company_share_classes` column list in Section 1.3. Add a brief explanation: "Discriminates equity share classes (normal, editable) from CLN and loan-note pseudo-classes (read-only at principal)."

---

#### LOW severity

##### F-9: Version header not updated — spec is still "1.0 draft / April 2026" despite Sections 2–7 being written
- **Classification:** Superseded statement
- **Plain English summary:** The audit brief described this spec as "version 1.1, dated 25 May 2026". The actual file header still says "Version: 1.0 draft / Date: April 2026". Sections 2 through 7.9 (covering the new investment workflow, follow-on workflow, sell/exit workflow, transfer workflow, debt transactions, dividends, and shared post-completion elements) have all been written and are in the repository. The spec header has never been updated to reflect this.
- **Spec location affected:** `docs/specs/TRANSACTION_WORKFLOW_SPEC.md` lines 1–4.
- **Evidence:** `git show main:docs/specs/TRANSACTION_WORKFLOW_SPEC.md | Select-String "Version|Date"` returns "Version: 1.0 draft" and "Date: April 2026".
- **Why this matters:** Low — does not affect any build decision. But a version number that says "draft" for a document with six complete sections will cause confusion about which parts are agreed vs. exploratory.
- **Suggested update direction:** Update header to "Version: 1.1" and "Date: 25 May 2026" and update the status line to note which sections are agreed vs. in-progress.

---

##### F-10: Section 2.3 says "Juno signs on behalf of investor via POA" — contradicts canonical rule now in Section 7.6 of same spec
- **Classification:** Specced one way but merged differently (severity reduced — Section 2 is explicitly "in progress")
- **Plain English summary:** Section 2.3 (Application Form) says: "Juno signs on behalf of investor via POA in most cases — configurable per investor." This is the old rule. The canonical rule — established in deal page spec v3.5, documented in TRANSACTION_WORKFLOW Section 7.6, and enforced in the live application — is: clients always sign their own application forms. Juno's POA does not extend to signing new investment commitments. The two sections of the same spec now contradict each other.
- **Spec location affected:** `docs/specs/TRANSACTION_WORKFLOW_SPEC.md` Section 2.3, "Sending" sub-section (line ~299). Compare with Section 7.6 (line ~1399).
- **Evidence:**
  - Section 7.6: "POA signing for application forms: out of scope. Clients always sign their own application forms. POAs at Juno are deliberately scoped to managing existing investments, not authorising new commitments."
  - Deal page spec v3.5/v3.6 Section 5.8 (canonical rule): same statement.
  - AGENTS.md implicitly references this rule ("clients always sign their own application forms").
- **Why this matters:** Low (Section 2 is "in progress") but the contradiction within the same document is confusing. A reader of Section 2 would come away with the wrong rule.
- **Suggested update direction:** In Section 2.3 "Sending", replace "Juno signs on behalf of investor via POA in most cases — configurable per investor" with: "Clients always sign their own application forms. Juno's POA does not extend to signing new investment commitments. See Section 7.6 for the canonical rule."

---

##### F-11: Section 7.6 references "Juno_Deal_Page_Restructure_Spec_v3.5.md" — that file no longer exists
- **Classification:** Superseded statement
- **Plain English summary:** Section 7.6 has a note that reads: "See `Juno_Deal_Page_Restructure_Spec_v3.5.md` Section 5.8 for the canonical rule." There is no v3.5 file in the repository — it was superseded by v3.6 and then v3.7. The file reference is a dead link.
- **Spec location affected:** `docs/specs/TRANSACTION_WORKFLOW_SPEC.md` Section 7.6 (line ~1399).
- **Evidence:** `git ls-files docs/ | grep "v3_5"` — no results. Files present: v3_6 and v3_7 only.
- **Why this matters:** Low — the rule itself is stated correctly in Section 7.6. But the dead file reference will confuse anyone who tries to follow it.
- **Suggested update direction:** Replace reference with `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_7.md` Section 5.8.

---

### section_9 client record

#### HIGH severity

##### F-12: `lead_client_id` throughout spec — live database column is `lead_investor_id`
- **Classification:** Specced one way but merged differently
- **Plain English summary:** The spec uses the column name `lead_client_id` in every place that describes how client records are linked together — the SQL migration, the data model explanation, the query pattern in Section 9.17. The actual column added to the live database is named `lead_investor_id`. They describe the same concept but have different names. Any code written directly from this spec would use the wrong column name and fail at runtime.
- **Spec location affected:** `docs/Prompts/section_9_client_record.md` Sections 9.2.1, 9.13, 9.15.1, and 9.17.
- **Evidence:**
  - Migration `client_record_stage1` (version `20260518083854`) applied to production.
  - Live DB confirmed: `SELECT column_name FROM information_schema.columns WHERE table_name='clients'` returns `lead_investor_id` (nullable UUID). No `lead_client_id` column exists.
  - Section 9.15.1 SQL: `ADD COLUMN IF NOT EXISTS lead_client_id UUID REFERENCES clients(id)`.
  - Section 9.17 query: `SELECT * FROM clients WHERE lead_client_id = $1`.
- **Why this matters:** Every query pattern, join, and migration in this spec that references `lead_client_id` will fail against the live database. This is the single most likely column to be used when building further client record features, so the wrong name will propagate.
- **Suggested update direction:** Replace all instances of `lead_client_id` with `lead_investor_id` throughout the spec.

---

##### F-13: `entity_type` — spec says to ADD this column; production database dropped it
- **Classification:** Specced one way but merged differently (active conflict)
- **Plain English summary:** Section 9.15.1 contains SQL that adds an `entity_type` column to the `clients` table. This column was initially added as part of the Phase B Stage 1 build (18 May 2026). It was then removed from production nine days later by the Entity Model Cleanup (PR #18, merged 23 May 2026). The spec now actively prescribes re-adding a column that was deliberately removed from the platform. Running the spec's SQL migration today would re-introduce a column whose removal was a deliberate architectural decision.
- **Spec location affected:** `docs/Prompts/section_9_client_record.md` Section 9.15.1, SQL block (adds `entity_type TEXT CHECK (...)`).
- **Evidence:**
  - Migration `entity_cleanup_step3_drop_entity_type` (version `20260523150430`): `ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_entity_type_check; ALTER TABLE clients DROP COLUMN IF EXISTS entity_type`.
  - PR #18 description: "drops three columns (`entity_type`, `fund_type`, `active_fund_type`) from the `clients` table that carry ambiguous or redundant meaning".
  - Live DB confirmed: no `entity_type` column on `clients` table.
  - AGENTS.md §4.1: "The `clients` table no longer has `entity_type`, `fund_type`, or `active_fund_type` columns (removed in Sub-stage A, 23 May 2026)."
- **Why this matters:** This is the most dangerous finding in the audit. The spec's migration SQL, if applied, would contradict a recently shipped architectural decision. Anyone treating Section 9.15.1 as a migration checklist and running the SQL would silently re-add a column the platform intentionally discarded.
- **Suggested update direction:** Remove `entity_type` from the Section 9.15.1 SQL block entirely, and add a note: "entity_type was initially added in Phase B Stage 1 and then dropped in Entity Model Cleanup Sub-stage A (23 May 2026). Do not add it."

---

##### F-14: `client_notes.body` — spec says `body TEXT NOT NULL`; live DB column is `note_text`
- **Classification:** Specced one way but merged differently
- **Plain English summary:** Section 9.15.3 defines the `client_notes` table with a column called `body`. The actual table created in production uses `note_text` as the column name. Any code reading or writing notes using the spec's column name (`body`) will hit a missing-column error.
- **Spec location affected:** `docs/Prompts/section_9_client_record.md` Section 9.15.3, `CREATE TABLE` block.
- **Evidence:**
  - Live DB confirmed: `SELECT column_name FROM information_schema.columns WHERE table_name='client_notes'` returns `note_text TEXT NOT NULL`. No `body` column.
  - Section 9.15.3 SQL: `body TEXT NOT NULL`.
- **Why this matters:** The `client_notes` table is actively in use (Phase B Stage 1 shipped and is live). Any new feature that reads notes from spec would query the wrong column. The TypeScript type definitions in the codebase already use the correct name; the spec is the outlier.
- **Suggested update direction:** Replace `body TEXT NOT NULL` with `note_text TEXT NOT NULL` in Section 9.15.3. Also update Section 9.11.2 (the Notes list UI description) which references the field implicitly.

---

#### MEDIUM severity

##### F-15: Reporting defaults columns — spec names and type differ from production
- **Classification:** Specced one way but merged differently
- **Plain English summary:** Section 9.15.2 defines three columns for reporting defaults on the `clients` table: `reporting_default_entities UUID[] DEFAULT '{}'`, `reporting_default_delivery TEXT`, and `reporting_default_frequency TEXT`. The live database has these columns under different names and with a different type for the first one: `reporting_entity_defaults JSONB DEFAULT '[]'`, `report_delivery_method TEXT`, and `report_delivery_frequency TEXT`. The concept is the same but every name differs, and `UUID[]` vs `JSONB` is a type mismatch that affects how the data is read.
- **Spec location affected:** `docs/Prompts/section_9_client_record.md` Section 9.15.2, SQL block.
- **Evidence:**
  - Live DB confirmed: `clients` has `reporting_entity_defaults JSONB DEFAULT '[]'`, `report_delivery_method TEXT DEFAULT 'email'`, `report_delivery_frequency TEXT DEFAULT 'quarterly'`. No `reporting_default_entities`, `reporting_default_delivery`, or `reporting_default_frequency` columns.
  - Section 9.12 references the "Reporting Defaults panel" — UI code will query the actual columns, but a reader of Section 9.15.2's SQL would use the wrong names.
- **Why this matters:** Medium rather than high because the concept and values are the same. But the column name discrepancy affects any new query or migration written from the spec. The type difference (`UUID[]` vs `JSONB`) is also meaningful — JSONB allows more flexible structures but is harder to query with strict typing.
- **Suggested update direction:** Update Section 9.15.2 SQL to match production: rename the three columns, change `UUID[]` to `JSONB`, and update the descriptive paragraph below the SQL to reflect JSONB semantics.

---

##### F-16: Section 9.17 query pattern uses `lead_client_id` — ripple from F-12, plus query is partly wrong
- **Classification:** Specced one way but merged differently
- **Plain English summary:** Section 9.17 gives the data-fetching query pattern for the client record page. The first query shown is `SELECT * FROM clients WHERE lead_client_id = $1`. Aside from using the wrong column name (see F-12), the query is also incomplete: it would only return linked entities, not the lead itself, unless the self-referencing rule is implemented (lead's `lead_investor_id` equals their own `id`). Whether that self-reference constraint is enforced in production needs verification.
- **Spec location affected:** `docs/Prompts/section_9_client_record.md` Section 9.17.
- **Evidence:**
  - Live DB: column is `lead_investor_id`, not `lead_client_id` (see F-12).
  - The self-reference pattern (lead points to own id) is described in Section 9.15.1 but not enforced by a constraint in the migration SQL (no `CHECK (lead_investor_id = id OR lead_investor_id IN (SELECT id FROM clients))` type constraint visible).
- **Why this matters:** Medium — a developer building from this query pattern would get silent errors. Combined with F-12, the query pattern section is not safe to use as-is.
- **Suggested update direction:** Fix `lead_client_id` → `lead_investor_id` and verify whether the self-referencing constraint (lead's `lead_investor_id = id`) is actually enforced in production. If not, document the application-layer rule.

---

### Phase B Stage 2 (new tables in production, no target spec coverage)

#### LOW severity

##### F-17: Five new tables in production with no coverage in any of the three audited specs
- **Classification:** Merged but not specced (against the three target specs)
- **Plain English summary:** The following tables now exist in production and are actively used but are not mentioned in any of the three specs being audited: `email_templates`, `email_sends`, `bulk_runs`, `bulk_run_items`, `bulk_run_presets`, `outlook_connections`, `oauth_pending`. They were added by Phase B Stage 2 work (PRs #13, #14, #15, #16). They are covered by the Phase B Stage 2 sub-specs (`Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md`, `Juno_Phase_B_Stage_2A3a_Spec_v1.md`, `Juno_Phase_B_Stage_2A3b_Spec_v1.md`, `Juno_FW_14_49_Spec_v1.md`) — they don't belong in the three target specs. Flagged here so Ed can confirm these Phase B Stage 2 specs are the right home.
- **Evidence:**
  - Full table list from `information_schema.tables` confirms all seven tables exist in production.
  - Migrations: `bulk_runs` (20260522082925), `outlook_connections` (20260522123908), `email_sends` (20260522140528), `email_templates` (20260522151242).
  - PRs #13–16, merged 20–22 May 2026.
- **Why this matters:** Low — these tables have their own specs. The finding is only that the three audited specs don't mention them, and that's correct. No action needed unless Ed wants a cross-reference section in the master specs.
- **Suggested update direction:** None required. Confirm Phase B Stage 2 sub-specs are the authoritative references for these tables.

---

## Open PRs flagged

### PR #19 — Entity Model Cleanup Sub-stage B: UI rename, filter restructure, fund management fix, docs sweep
- **PR:** #19, branch `feat/entity-model-cleanup-B`, created 2026-05-23T15:40:53Z. Not yet merged.
- **What it does to the specs:**
  - `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_6.md` — vocabulary sweep: renames "Client / Vehicle / Location" to "Lead investor / Beneficial owner / Legal owner" throughout (partially resolves F-5 above).
  - `docs/Prompts/section_9_client_record.md` — vocabulary note added in Section 9.2.3.
  - `docs/specs/Juno_Deal_Page_Restructure_Spec_v3_7.md` — Future Work items 14.19–14.22 added.
  - `AGENTS.md` — §4.1 and §4.4 updated with dropped-column note and new vocabulary.
- **What it does NOT fix:** PR #19's spec changes do not address F-2 (`active_fund_type`), F-12 (`lead_client_id`), F-13 (`entity_type` add), F-14 (`note_text` vs `body`), F-15 (reporting default column names), or F-3/F-4 (undocumented columns). The vocabulary sweep alone is not sufficient to bring these specs into alignment.
- **Contradiction with spec:** PR #19 applies vocabulary changes to v3.6 that assume the entity model cleanup is conceptually agreed — this is fine, since Sub-stage A already merged. No contradiction introduced.

---

## What was checked but found clean

The following areas were actively verified and came back with no drift:

- **Stage 6a/6b/6c document generation (Section 11 of v3.6):** The documents table columns `signing_status`, `documenso_envelope_id`, `recipient_email`, `cc_emails`, `template_version`, `version`, `superseded`, `superseded_at`, `superseded_by_id`, `deal_investor_id` all present in production as described. The two-pipeline model (generic Documenso pipeline vs. dedicated `generateTransactionStatement()`) matches AGENTS.md §2.4 and Section 11.
- **`deal_action_logs` table (Section 3.4):** All columns (`id`, `deal_id`, `deal_investor_id`, `document_id`, `invoice_id`, `action_type`, `action_subtype`, `is_mock`, `from_status`, `to_status`, `reason`, `metadata`, `actioned_by`, `actioned_at`) confirmed present in production. Exact match to spec.
- **`deal_investors` foundation columns (Sections 3.1–3.2):** `lifecycle_status`, `soft_circle_amount`, `confirmed_amount`, `shares`, `investing_vehicle_id`, `updated_at`, `updated_by`, `fee_pct`, `fee_overridden`, `fee_override_reason`, `fee_override_by`, `fee_override_at`, `fee_locked_at`, `nominee_id` all confirmed present. Matches spec.
- **`invoices` additions (Sections 3.6 and 3.8):** `deal_investor_id` and `issued_at` both present in production. Match spec.
- **`companies` and `nominees` bank details (Section 5.4/5.7):** Both tables have `bank_account_name`, `bank_sort_code`, `bank_account_number`, `bank_iban`, `bank_swift_bic`. Match spec.
- **`companies.share_classes` JSONB column:** Confirmed dropped from production (`migration 20260519100000`). No longer present. CLAUDE.md correctly states this.
- **TRANSACTION_WORKFLOW Section 1.3 additions to `investments`:** `transaction_category`, `held_by_entity_id`, `nominee_id`, `fee_rate`, `fee_amount`, `proceeds`, `gain_loss`, `counterparty` all confirmed in production. Match spec.
- **TRANSACTION_WORKFLOW Section 1.3 `cln_positions` table:** All specified columns confirmed present: `id`, `type`, `company_id`, `client_id`, `held_by_entity_id`, `location`, `nominee_id`, `principal_amount`, `interest_rate`, `interest_treatment`, `investment_date`, `conversion_deadline`, `maturity_date`, `discount_rate`, `valuation_cap`, `conversion_price`, `conversion_share_class_id`, `conversion_triggers`, `status`, `eis_qualifying`, `conversion_date`, `eis_start_date`, `fee_rate`, `fee_amount`, `notes`, `created_at`. Match spec.
- **`valuations` table additions (Phase B Stage 2):** `share_class_id`, `methodology`, `source`, `updated_at` all present. Match Phase B Stage 2 spec.
- **`client_notes` table (Section 9.15.3 — structure):** Table exists in production with `id`, `client_id`, `note_text`, `created_by`, `created_at`, `flag_for_followup`, `updated_at`. Correct columns except for the body→note_text rename (F-14).
- **POA rule in TRANSACTION_WORKFLOW Section 7.6:** Correctly states "clients always sign their own application forms." Consistent with deal page spec canonical rule.
- **`sanitiseStorageKey()` pattern (CLAUDE.md and Section 11):** Migration `add_document_signing_fields` and Stage 6c work confirm this is in production. CLAUDE.md §2.2 documents the rule correctly.
- **`team_members` backfill (Future Work 14.8):** Migration `team_members_backfill` (20260515131311) confirmed in migration history. Marked closed in v3.7.
- **`handle_new_auth_user_revoke_execute` trigger:** Migration (20260515131502) confirmed in history. Matches v3.7 changelog.
