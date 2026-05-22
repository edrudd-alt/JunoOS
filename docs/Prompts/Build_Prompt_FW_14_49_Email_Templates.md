# Build Prompt — Future Work 14.49: Universal Email + Database-backed Templates

**Pre-read:** `docs/specs/Juno_FW_14_49_Spec_v1.md` is the authoritative spec.

**Branch:** `feat/email-templates`
**Base:** `main` (PR #15 merged today)
**Database migrations:** YES — one new table (`email_templates`) with seed data. Show SQL to Ed for approval before applying.

---

## Context

PR #15 (2A.3b) shipped Outlook bulk send + per-document Send button, currently only wired for `portfolio_statement`. The send infrastructure is generic (`sendDocumentEmail` takes a documentId), but templates are hard-coded for portfolio statements only.

This PR:
1. Adds a new `email_templates` table with seeded defaults for 16 sendable document types
2. Builds a Settings → Email Templates page where the team can edit templates
3. Refactors the send path to read from the table instead of code constants
4. Extends the Email button visibility to all sendable types across all Documents tab locations
5. Hides the Email button on 5 sensitive types: kyc, poa, suitability_assessment, source_of_funds, call_notes
6. Introduces a reusable `DocumentActions` component used everywhere documents are listed

---

## Files to read before writing

1. `src/lib/templates.ts` — the existing hard-coded template helper. Will be refactored to read from DB.
2. The 2A.1.5 EmailComposerModal (likely under `src/app/(app)/clients/[id]/components/` or similar). Will be updated to use new template helper.
3. `src/app/(app)/reports/portfolio-statement/_components/SendAllConfirmModal.tsx` (built in PR #15) — small update to read default template from DB.
4. The per-client Documents tab (`InvestmentDocsTab.tsx` or similar).
5. The deal-page Documents tab (find via grep for documents listings).
6. `src/app/(app)/settings/integrations/` — pattern for Settings sub-pages.

---

## Task 1 — Migration with seed data

`supabase/migrations/20260524100000_email_templates.sql`:

```sql
-- 14.49: Database-backed editable email templates
-- One row per sendable document type. Seeded with defaults.

CREATE TABLE email_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_type   TEXT NOT NULL UNIQUE,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID REFERENCES team_members(id) ON DELETE SET NULL
);

CREATE INDEX email_templates_type_idx ON email_templates (document_type);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated full access on email_templates"
  ON email_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Trigger: update updated_at and clear is_default on any edit
CREATE OR REPLACE FUNCTION trigger_set_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.is_default = FALSE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_templates_updated_at();

-- Seed default templates for 16 sendable types.
-- Use the exact templates from spec Section 3.1 + 3.3.
INSERT INTO email_templates (document_type, subject, body, is_default) VALUES
  ('portfolio_statement',
   'Portfolio statement as at {{period}}',
   E'Hi {{client_first_name}},\n\nPlease find your portfolio statement as at {{period}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('transaction_statement',
   'Transaction statement — {{period}}',
   E'Hi {{client_first_name}},\n\nPlease find your transaction statement attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('application_form',
   'Signed application form — {{company_name}}',
   E'Hi {{client_first_name}},\n\nPlease find your signed application form attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('eis_certificate',
   'EIS3 certificate — {{company_name}}',
   E'Hi {{client_first_name}},\n\nPlease find your EIS3 certificate for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('investment_agreement',
   'Investment agreement — {{company_name}}',
   E'Hi {{client_first_name}},\n\nPlease find your signed investment agreement attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('side_letter',
   'Side letter — {{company_name}}',
   E'Hi {{client_first_name}},\n\nPlease find your signed side letter attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('membership_agreement',
   'Membership agreement',
   E'Hi {{client_first_name}},\n\nPlease find your membership agreement attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('ceo_update',
   '{{company_name}} — CEO update',
   E'Hi {{client_first_name}},\n\nPlease find the latest CEO update from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('press_release',
   '{{company_name}} — Press release',
   E'Hi {{client_first_name}},\n\nPlease find the latest press release from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('company_update',
   '{{company_name}} — Update',
   E'Hi {{client_first_name}},\n\nPlease find the latest update from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('exit_statement',
   'Exit statement — {{company_name}}',
   E'Hi {{client_first_name}},\n\nPlease find your exit statement for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('board_minutes',
   '{{company_name}} — Board minutes',
   E'Hi {{client_first_name}},\n\nPlease find the latest board minutes from {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('management_accounts',
   '{{company_name}} — Management accounts',
   E'Hi {{client_first_name}},\n\nPlease find the latest management accounts for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('kpi_spreadsheet',
   '{{company_name}} — KPI report',
   E'Hi {{client_first_name}},\n\nPlease find the latest KPI report for {{company_name}} attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('invoice',
   'Invoice — {{reference}}',
   E'Hi {{client_first_name}},\n\nPlease find your invoice attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE),
  ('other',
   'Document — {{filename}}',
   E'Hi {{client_first_name}},\n\nPlease find attached.\n\nKind regards,\n{{sender_first_name}}',
   TRUE);
```

**STOP and show Ed the SQL before applying via Supabase MCP.**

Verification queries to run after apply:
- `SELECT count(*) FROM email_templates` → should be 16
- `SELECT count(*) FROM email_templates WHERE is_default = TRUE` → should be 16

---

## Task 2 — SENDABLE_TYPES constant and shared types

New file: `src/lib/documentTypes.ts` (or add to an existing constants file if one exists):

```typescript
export const SENDABLE_DOCUMENT_TYPES = [
  'portfolio_statement',
  'transaction_statement',
  'application_form',
  'eis_certificate',
  'investment_agreement',
  'side_letter',
  'membership_agreement',
  'ceo_update',
  'press_release',
  'company_update',
  'exit_statement',
  'board_minutes',
  'management_accounts',
  'kpi_spreadsheet',
  'invoice',
  'other',
] as const

export type SendableDocumentType = typeof SENDABLE_DOCUMENT_TYPES[number]

export const SENSITIVE_DOCUMENT_TYPES = [
  'kyc',
  'poa',
  'suitability_assessment',
  'source_of_funds',
  'call_notes',
] as const

export function isSendableType(type: string): type is SendableDocumentType {
  return (SENDABLE_DOCUMENT_TYPES as readonly string[]).includes(type)
}

// Human-readable labels for the Settings page
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  portfolio_statement: 'Portfolio statement',
  transaction_statement: 'Transaction statement',
  application_form: 'Application form',
  eis_certificate: 'EIS certificate',
  investment_agreement: 'Investment agreement',
  side_letter: 'Side letter',
  membership_agreement: 'Membership agreement',
  ceo_update: 'CEO update',
  press_release: 'Press release',
  company_update: 'Company update',
  exit_statement: 'Exit statement',
  board_minutes: 'Board minutes',
  management_accounts: 'Management accounts',
  kpi_spreadsheet: 'KPI spreadsheet',
  invoice: 'Invoice',
  other: 'Other',
  // sensitive types - shouldn't appear in templates UI but include labels for elsewhere
  kyc: 'KYC',
  poa: 'Power of attorney',
  suitability_assessment: 'Suitability assessment',
  source_of_funds: 'Source of funds',
  call_notes: 'Call notes',
}
```

---

## Task 3 — Refactor template helper

Update `src/lib/templates.ts`. Replace hard-coded constants with a DB-reading helper.

```typescript
'use server'

import { createServerClient } from '@/lib/supabase/server'

export interface TemplateContext {
  clientFirstName?: string | null
  clientFullName?: string | null
  senderFirstName?: string | null
  senderFullName?: string | null
  period?: string | null   // already UK-formatted, e.g. "31 March 2026"
  companyName?: string | null
  filename?: string | null
  reference?: string | null
}

export interface ResolvedTemplate {
  subject: string
  body: string
}

/**
 * Look up template for the given document type and substitute placeholders.
 * Missing placeholders substitute to empty string (not literal {{...}}).
 */
export async function getEmailTemplate(
  documentType: string,
  context: TemplateContext,
): Promise<ResolvedTemplate | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('email_templates')
    .select('subject, body')
    .eq('document_type', documentType)
    .single()
  
  if (error || !data) {
    // No template for this type — sensitive type or unknown
    return null
  }
  
  return {
    subject: substitute(data.subject, context),
    body: substitute(data.body, context),
  }
}

const PLACEHOLDER_MAP: Record<string, keyof TemplateContext> = {
  'client_first_name': 'clientFirstName',
  'client_full_name': 'clientFullName',
  'sender_first_name': 'senderFirstName',
  'sender_full_name': 'senderFullName',
  'period': 'period',
  'company_name': 'companyName',
  'filename': 'filename',
  'reference': 'reference',
}

function substitute(template: string, context: TemplateContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, placeholder) => {
    const contextKey = PLACEHOLDER_MAP[placeholder]
    if (!contextKey) return ''  // unknown placeholder → empty
    const value = context[contextKey]
    return value ?? ''  // missing → empty
  })
}

// Helper: derive first name from full name
export function deriveFirstName(fullName: string | null | undefined): string {
  if (!fullName) return ''
  return fullName.trim().split(/\s+/)[0] ?? ''
}

// Helper: UK-formatted period date
export function formatPeriodDateUK(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
```

**Anti-pattern to avoid:** Don't leave the existing hard-coded templates in this file alongside the new helper. Delete them. The DB is now the single source of truth.

---

## Task 4 — Settings → Email Templates page

Add a new sub-route under Settings: `src/app/(app)/settings/email-templates/page.tsx`.

Server component that:
1. Fetches all rows from `email_templates`
2. Renders the list view

```tsx
// page.tsx (server component)
import { createServerClient } from '@/lib/supabase/server'
import { DOCUMENT_TYPE_LABELS } from '@/lib/documentTypes'
import { EmailTemplatesList } from './EmailTemplatesList'

export default async function EmailTemplatesPage() {
  const supabase = createServerClient()
  const { data: templates } = await supabase
    .from('email_templates')
    .select('*')
    .order('document_type')
  
  return (
    <div>
      <h1>Email templates</h1>
      <p>Edit the default email subject and body used when sending each document type.</p>
      <EmailTemplatesList templates={templates ?? []} />
    </div>
  )
}
```

Client component `EmailTemplatesList.tsx` renders the list and handles edit/preview/save.

Edit modal: subject + body fields, placeholder reference sidebar, Preview button, Reset to default button (if not currently default), Cancel, Save.

Preview modal: takes the current subject/body draft, renders a sample with Bob Bigballs as the test client (clientFirstName='Bob', etc.), shows the result as it would appear in an email — including the "From" line and a fake date.

Server actions:
- `saveTemplate(id, subject, body)` — updates the row (trigger auto-sets updated_at and is_default=FALSE)
- `resetTemplateToDefault(id)` — looks up the original seed value (hard-coded in this action) and restores it, sets is_default=TRUE

Add a link to this page from the Settings index alongside Integrations.

---

## Task 5 — DocumentActions component

New shared component: `src/components/documents/DocumentActions.tsx`.

```tsx
import { isSendableType } from '@/lib/documentTypes'

interface Props {
  document: {
    id: string
    type: string
    filename: string
    // ... other doc fields
  }
  clientId: string
  clientFullName: string | null
  clientEmail: string | null
  onEmailClick: () => void  // opens the EmailComposerModal
  onViewClick: () => void   // opens signed URL
}

export function DocumentActions({ document, clientId, clientFullName, clientEmail, onEmailClick, onViewClick }: Props) {
  return (
    <div className="document-actions">
      <button onClick={onViewClick}>View</button>
      {isSendableType(document.type) && (
        <button onClick={onEmailClick}>Email</button>
      )}
    </div>
  )
}
```

Used by both the per-client Documents tab and the deal-page Documents tab.

---

## Task 6 — Wire DocumentActions into existing Documents tabs

The per-client Documents tab (`InvestmentDocsTab.tsx`) currently has the Email button visible only for portfolio statements. Replace that conditional logic with the `<DocumentActions>` component.

The deal-page Documents tab — find via grep, similar replacement.

Anywhere else documents are listed with a View link, replace inline button logic with `<DocumentActions>`.

State management: each parent component still owns the modal state (which document's modal is open). The DocumentActions component just emits events.

---

## Task 7 — EmailComposerModal updated to use new helper

The modal currently has template logic for portfolio statements only. Refactor:

1. When opened, call `getEmailTemplate(document.type, context)` where context is built from props
2. If the helper returns null (shouldn't happen now that we hide Email for sensitive types, but defensive): show a basic empty composer with just To prefilled
3. Otherwise, populate Subject and Body fields with the resolved template
4. Rest of the modal flow is unchanged (user can edit, Copy buttons work, Send button works)

---

## Task 8 — SendAllConfirmModal small update

In the bulk send modal, the "Subject" and "Body" textboxes currently pre-populate from hard-coded constants. Update to load from `email_templates.portfolio_statement` (subject and body) and apply substitution per-investor at send time (existing pattern, just sourced from DB now).

---

## Task 9 — Append Future Work 14.57-14.60

Add to `docs/specs/Juno_Phase_B_Stage_2A_Portfolio_Statement_Spec_v1.md` per spec Section 12.

---

## Anti-patterns to avoid

- **Don't keep hard-coded templates in code as a "backup".** The DB is the source of truth. If the table is empty, the application is broken — that's a deployment issue, not a runtime fallback.
- **Don't fetch the template inside `sendDocumentEmail` for bulk sends.** Bulk sends already pre-substitute templates in the confirmation modal. Re-fetching per-item would defeat the editable-per-bulk pattern.
- **Don't substitute placeholders client-side.** All substitution happens on the server in `getEmailTemplate`.
- **Don't expose the Settings → Email Templates page to non-team users.** Same auth as other Settings pages.
- **Don't allow deleting templates from the UI.** Reset-to-default is the only "undo" path. Adding new types is a code+migration change.
- **Don't add `npm run build` skip flags.** Run it locally before push.

---

## Workflow

1. Branch `feat/email-templates` from `main`
2. Commit 1: Spec file
3. Commit 2: Migration SQL — **STOP for Ed approval**
4. Ed approves, apply via MCP, commit migration file
5. Commit 3: `src/lib/documentTypes.ts` constants
6. Commit 4: `src/lib/templates.ts` refactor with `getEmailTemplate`
7. Commit 5: Settings → Email Templates page (list view)
8. Commit 6: Edit modal + Preview modal + server actions
9. Commit 7: DocumentActions component
10. Commit 8: Wire DocumentActions into per-client Documents tab
11. Commit 9: Wire DocumentActions into deal-page Documents tab
12. Commit 10: EmailComposerModal uses new helper
13. Commit 11: SendAllConfirmModal reads default from DB
14. Commit 12: Future Work 14.57-14.60 appended
15. Push, write PR description, **STOP for Ed's preview review**

Expect ~14-17 commits total once preview review surfaces issues. Run `npm run build` and `tsc --noEmit` locally before every push.

---

## Acceptance for this PR

All 26 criteria in spec Section 10. Most critical tests:
1. Edit a template in Settings → save → reload → edit persisted
2. Email button visible on transaction_statement, hidden on kyc
3. Single send on a transaction_statement uses the correct template
4. Preview modal substitutes placeholders sensibly
5. Reset to default works
6. Bulk send still works end-to-end (regression check)

---

*End of build prompt.*
