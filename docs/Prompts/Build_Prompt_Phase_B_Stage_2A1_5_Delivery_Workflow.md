# Build Prompt — Sub-stage 2A.1.5: Portfolio Statement Delivery Workflow

**Pre-read:** the spec at `docs/specs/Juno_Phase_B_Stage_2A1_5_Spec_v1.md` (also available at `/mnt/user-data/outputs/Juno_Phase_B_Stage_2A1_5_Spec_v1.md`) is the authoritative source for behaviour and acceptance criteria. This document tells you HOW to build it.

**Branch:** `feat/portfolio-statement-delivery-workflow`
**Base:** `main` (Sub-stage 2A.1 already merged)
**No database migrations.** No schema changes.

---

## Context

Sub-stage 2A.1 built portfolio statement generation. The team's experience today: click Generate → PDF auto-opens in a new tab. That's it. No structured handoff to the "now email it to the client" workflow.

Sub-stage 2A.1.5 adds two modals that bridge generation and delivery:

1. **Decision modal** — opens after Generate, shows the new statement, offers View or Email
2. **Email composer modal** — opens when Email is chosen (or from a row action on existing statements), with To pre-filled, draft body, attachment available for download. Copy buttons for each field. No Send button yet (waits for Outlook integration).

The whole stage is UI + small server actions. No data model changes.

---

## Existing code to read first

Before writing anything, read:

1. **`src/services/document-generation/generatePortfolioValuationStatement.ts`** — understand the existing generation flow
2. **`src/app/(app)/clients/[id]/_components/GenerateStatementSection.tsx`** — the Portfolio statement card on the Overview tab; this is where the Generate button currently lives
3. **`src/app/(app)/clients/[id]/portfolioStatementActions.ts`** — the server actions: `generatePortfolioStatementAction`, `getDownloadUrlForStatement`
4. **`src/app/(app)/clients/[id]/documentActions.ts`** — `getDownloadUrlForDocument` (generic, used by the Documents tab)
5. **`src/app/(app)/clients/[id]/_tabs/InvestmentDocsTab.tsx`** — the Documents tab; how existing statement rows render and what actions they have
6. **`src/lib/date.ts`** — `formatDocumentTimestamp` for displaying dates consistently

You can verify the file paths via `git grep` if any don't match exactly.

---

## Task 1 — Build the Decision modal

**New file:** `src/app/(app)/clients/[id]/_components/StatementDecisionModal.tsx`

Client component (`'use client'`). Props:

```typescript
interface StatementDecisionModalProps {
  open: boolean
  onClose: () => void
  onEmail: () => void
  statement: {
    documentId: string
    filename: string
    periodDate: string         // 'YYYY-MM-DD'
    generatedAtIso: string     // ISO timestamp from documents.created_at
  }
}
```

**Layout** (per spec Section 3.1):

- Modal overlay using the platform's existing modal convention (whatever pattern Stage 6b's review-before-send modal uses; consistency)
- Title: "Statement generated"
- Meta line: `Period: {formatPeriodDate(periodDate)} · Generated {formatDocumentTimestamp(generatedAtIso)} · Saved to Documents`
  - `formatPeriodDate` converts `2026-03-31` → `31 March 2026` (use date-fns or `Intl.DateTimeFormat` with `en-GB` locale, full month, no leading zero on day)
  - `formatDocumentTimestamp` is the existing helper
- PDF preview card (grey background, centred): file icon, filename, "2 pages · A4 landscape" subtext
- Two side-by-side buttons:
  - Secondary "View" (eye icon)
  - Primary "Email to client" (mail icon, navy bg)
- Close (×) button in the top-right of the header

**Behaviour:**

- "View" → calls `getDownloadUrlForDocument(statement.documentId)`, opens the signed URL in a new tab. **Does NOT close the modal** — user might want to email after viewing.
- "Email to client" → calls `props.onEmail()`. Parent component handles transitioning to the composer modal.
- Close (×) and Escape → calls `props.onClose()`.
- All colours via CSS variables — `--color-background-primary`, `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`, `--color-border-tertiary`, etc. Navy primary button uses `#0f2744` (brand colour) as in the existing modals.
- Use Tabler icons via `<i class="ti ti-eye">`, `<i class="ti ti-mail">`, `<i class="ti ti-x">`, `<i class="ti ti-file-text">`. Verify the icon set is already loaded — Stage 6b's modals will tell you.

**Accessibility:**

- `role="dialog"` `aria-modal="true"` on the modal root
- Focus traps inside the modal
- On open, focus the first interactive element (View button)
- Close button has `aria-label="Close"`

---

## Task 2 — Build the Email composer modal

**New file:** `src/app/(app)/clients/[id]/_components/EmailComposerModal.tsx`

Client component. Props:

```typescript
interface EmailComposerModalProps {
  open: boolean
  onClose: () => void
  statement: {
    documentId: string
    filename: string
    periodDate: string
  }
  client: {
    fullName: string
    email: string | null
  }
}
```

**Layout** (per spec Section 3.2):

- Modal overlay, same convention as the decision modal but slightly wider (~580px max)
- Title: "Email portfolio statement"
- Context row (grey card): file icon + filename + period date
- Info banner (warning yellow): the text from spec Section 3.2 about Outlook integration not being available
- Three fields, each in its own group with a label row and a Copy button:
  - **To**: readonly input, value = `client.email` (or empty if null, with placeholder "No email on file")
  - **Subject**: editable input, default value = subject template (spec 4.1) with substitutions
  - **Body**: editable textarea (min 140px tall, resizable vertically), default value = body template (spec 4.2) with substitutions
- Attachment row below the body: a pill showing the filename + a separate "Download attachment" button (matches Copy button style, not a primary action)
- Footer: grey "Send button enabled once Outlook integration ships" text on the left, Close button on the right

**Template substitution helper:**

Add to `src/lib/templates.ts` (new file):

```typescript
export interface EmailTemplateContext {
  clientFirstName: string
  periodDateFormatted: string
}

export function deriveClientFirstName(fullName: string): string {
  const trimmed = fullName.trim()
  const firstSpace = trimmed.indexOf(' ')
  if (firstSpace === -1) return trimmed  // single-word name
  return trimmed.substring(0, firstSpace) || '[Client first name]'
}

export function formatPeriodDateUK(isoDate: string): string {
  // '2026-03-31' -> '31 March 2026'
  const d = new Date(`${isoDate}T00:00:00`)
  if (isNaN(d.getTime())) return '[Period date]'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export const PORTFOLIO_STATEMENT_SUBJECT_TEMPLATE = (ctx: EmailTemplateContext) =>
  `Portfolio statement as at ${ctx.periodDateFormatted}`

export const PORTFOLIO_STATEMENT_BODY_TEMPLATE = (ctx: EmailTemplateContext) =>
  `Dear ${ctx.clientFirstName},

Please find attached your portfolio valuation statement as at ${ctx.periodDateFormatted}.

The statement covers your holdings across all entities and includes per-lot performance and a summary by company. If you have any questions, please get in touch.

Kind regards,
Juno Capital Partners LLP`
```

The composer initialises Subject and Body state from these template functions on first open. Subsequent re-opens reset state (no draft persistence in v1).

**Copy buttons:**

Use `navigator.clipboard.writeText(value)`. On success, swap the button text from "Copy" to "Copied" for 1.5 seconds, then revert. On failure, show "Failed" with the same timeout.

**Download attachment button:**

Calls `getDownloadUrlForDocument(statement.documentId)`, opens in new tab. Same pattern as everywhere else.

**Accessibility:**

- `role="dialog"` `aria-modal="true"`
- On open, focus the Subject field (per spec 5.2)
- Each Copy button has `aria-label="Copy {field}"` (e.g. "Copy recipient address", "Copy subject", "Copy body")
- Escape closes
- Tab order: Subject → Subject Copy → Body → Body Copy → Download attachment → Close

---

## Task 3 — Wire modals into GenerateStatementSection

In `src/app/(app)/clients/[id]/_components/GenerateStatementSection.tsx`:

**Add state:**

```typescript
const [decisionModalStatement, setDecisionModalStatement] = useState<DecisionModalStatement | null>(null)
const [composerStatement, setComposerStatement] = useState<DecisionModalStatement | null>(null)
```

(Choose a more descriptive type name. Both reference the same shape.)

**Modify the Generate button's onClick handler:**

Currently it probably calls `generatePortfolioStatementAction(...)` and then opens the signed URL in a new tab. Change the post-action handling to:

```typescript
const result = await generatePortfolioStatementAction(clientId, periodDate)
if (result?.documentId) {
  // Look up the new row to get its created_at
  // (or have generatePortfolioStatementAction return it — simpler)
  setDecisionModalStatement({
    documentId: result.documentId,
    filename: <looked up>,
    periodDate,
    generatedAtIso: <looked up>,
  })
}
// NO auto-open new tab any more — the modal is the new entry point
```

**Cleanest approach:** modify `generatePortfolioStatementAction` to return `{ documentId, filename, createdAt }` instead of just `{ documentId }`. All three are already available at the end of the action — strip the buffer (still serializable issue), keep the metadata. Update the return type accordingly.

**Add to the JSX:**

```tsx
{decisionModalStatement && (
  <StatementDecisionModal
    open={true}
    statement={decisionModalStatement}
    onClose={() => setDecisionModalStatement(null)}
    onEmail={() => {
      setComposerStatement(decisionModalStatement)
      setDecisionModalStatement(null)
    }}
  />
)}
{composerStatement && (
  <EmailComposerModal
    open={true}
    statement={composerStatement}
    client={{ fullName: client.fullName, email: client.email }}
    onClose={() => setComposerStatement(null)}
  />
)}
```

The parent passes `client.fullName` and `client.email` down — verify these are already props or fetch them in the parent.

**Existing-statement row changes:**

Each existing statement row on the Portfolio statement card currently has a "View" link. Add an "Email" action next to it. On click, set `composerStatement` to that row's data.

---

## Task 4 — Wire composer modal into Documents tab

In `src/app/(app)/clients/[id]/_tabs/InvestmentDocsTab.tsx` (or whatever the current path is):

For document rows where `type === 'portfolio_statement'`, add an "Email" action next to the existing View action. Clicking it opens the EmailComposerModal with that statement's details.

The composer state and modal mount can live in this tab component (since the tab is the only place that needs it from here) OR be lifted to a shared client component. Use whatever's cleanest given the existing code structure.

**Important:** the Email action should ONLY appear for `type === 'portfolio_statement'` rows. Other document types (when they're added later) might have their own email workflows. Keep this branch type-scoped via a small dictionary or branch:

```typescript
const SUPPORTS_EMAIL: Record<string, boolean> = {
  portfolio_statement: true,
  // Future: transaction_statement: true, etc.
}
```

---

## Task 5 — Future Work items in the spec

Append items 14.32, 14.33, 14.34, 14.35 to `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md` per spec Section 7. Exact wording is in the spec — copy it verbatim into the Future Work section.

---

## Task 6 — Move this spec into the repo

Copy the spec from `/mnt/user-data/outputs/Juno_Phase_B_Stage_2A1_5_Spec_v1.md` into `docs/specs/Juno_Phase_B_Stage_2A1_5_Spec_v1.md`. This becomes the source of truth alongside the existing 2A spec.

Commit this as the first commit on the branch so the spec exists in the repo before any code references it.

---

## Acceptance for this PR

All twelve items in spec Section 9 must pass on the preview. Specifically:

1. Generate opens the decision modal (no more auto-tab-open)
2. Decision modal shows correct meta line including "Saved to Documents"
3. View on the decision modal opens the PDF in a new tab
4. "Email to client" transitions cleanly from decision modal to composer
5. Composer's To, Subject, Body all pre-filled correctly with substitutions
6. Each Copy button works and shows "Copied" feedback
7. Download attachment opens the PDF in a new tab
8. Closing either modal leaves the statement saved (verifiable via MCP)
9. Email action available from existing statement rows on both Overview card and Documents tab
10. Light and dark mode both work — no invisible buttons
11. Escape key closes either modal
12. Tab navigation works correctly

Plus: build passes, lint clean, TypeScript types compile.

---

## Workflow

1. Branch: `feat/portfolio-statement-delivery-workflow` from `main`
2. Commit 1: Add spec file (`docs/specs/Juno_Phase_B_Stage_2A1_5_Spec_v1.md`)
3. Commit 2: Add Future Work items 14.32-14.35 to the Stage 2A spec
4. Commit 3: Templates helper file (`src/lib/templates.ts`)
5. Commit 4: StatementDecisionModal component
6. Commit 5: EmailComposerModal component
7. Commit 6: Wire modals into GenerateStatementSection (Overview card)
8. Commit 7: Add Email action to Documents tab statement rows
9. Push, write PR description, **stop and wait for Ed.**

Don't fix things outside this scope, even if you notice them. Surface as Future Work in the PR description instead.

---

## Anti-patterns to avoid

- **Don't add a Send button** even disabled. The button doesn't exist in v1. Visual debt.
- **Don't use HTML `<form>`** in the composer. Per `<critical_ui_requirements>` for this platform's environment — use onClick handlers and useState.
- **Don't reach for `localStorage` or `sessionStorage`** for "remember the user's edits". No persistence in v1.
- **Don't auto-format the body** as the user types (no markdown rendering, no link detection). It's a plain textarea — what they type is what gets copied.
- **Don't try to send via mailto fallback** even though it might seem tempting. The team has decided on copy-buttons-only for v1 (per the chat thread that produced this spec).
- **Don't add OneDrive/Outlook integration code** as part of this PR. That's a separate piece of work.

---

*End of build prompt.*
