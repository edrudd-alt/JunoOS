# Future Work 14.49 — Universal Email + Database-backed Editable Templates

**Status:** Draft v1
**Depends on:** PR #15 (2A.3b) — Outlook send infrastructure, EmailComposerModal, `email_sends` audit table

---

## 1. Purpose

Today, the Email button on the Documents tab is restricted to portfolio statements. This sub-stage:

- Makes the Email button available everywhere a document appears with a View/Download option
- Hides it for sensitive document types where emailing to a client would be inappropriate
- Replaces hard-coded templates with database-backed editable templates managed in Settings
- Provides sensible per-type defaults out of the box

End state after this sub-stage: when a team member uploads or generates any sendable document, they can email it to the client from anywhere it appears, using templates the team can edit centrally without touching code.

---

## 2. Out of scope

- Per-investor or per-fund-type template overrides (deferred)
- Template version history / rollback (deferred — last-edited-by/at is captured but not surfaced)
- Multi-language templates (deferred)
- Per-template attachment options (the document being sent is the only attachment)
- AI-generated email body (Future Work 14.24 cover letter generation territory)
- Template variables beyond the standard set defined here

---

## 3. Sendable vs sensitive document types

The 21 document types in `documents.type` CHECK constraint fall into three buckets.

### 3.1 Sendable types (Email button visible)

| Type | Default subject | Notes |
|------|-----------------|-------|
| `portfolio_statement` | Portfolio statement as at {{period}} | Already in use; this just moves the template to DB |
| `transaction_statement` | Transaction statement — {{period}} | |
| `application_form` | Signed application form — {{company_name}} | Usually post-signature |
| `eis_certificate` | EIS3 certificate — {{company_name}} | Tax record for investor |
| `investment_agreement` | Investment agreement — {{company_name}} | Signed copy |
| `side_letter` | Side letter — {{company_name}} | Signed copy |
| `membership_agreement` | Membership agreement | Signed copy |
| `ceo_update` | {{company_name}} — CEO update | Investor comms |
| `press_release` | {{company_name}} — Press release | Public |
| `company_update` | {{company_name}} — Update | Investor comms |
| `exit_statement` | Exit statement — {{company_name}} | End-of-deal communication |
| `board_minutes` | {{company_name}} — Board minutes | Sometimes shared — Email visible by default |
| `management_accounts` | {{company_name}} — Management accounts | Sometimes shared |
| `kpi_spreadsheet` | {{company_name}} — KPI report | Sometimes shared |
| `invoice` | Invoice — {{reference}} | When sent to clients |
| `other` | Document — {{filename}} | Generic fallback |

### 3.2 Sensitive types (Email button HIDDEN, never shown)

| Type | Reason |
|------|--------|
| `kyc` | Sensitive personal data; flows from client TO JunoOS, not back |
| `poa` | Power of attorney; legal document, not for routine email |
| `suitability_assessment` | Internal compliance record about the client |
| `source_of_funds` | KYC-adjacent sensitive personal data |
| `call_notes` | Internal investment-team notes, never appropriate to email a client |

The codebase's allowed-list (sendable types) is the source of truth. Anything not in the list — including future new document types — defaults to no Email button until explicitly added.

### 3.3 Default body templates

Each sendable type gets a default body template. For most, the default is:

```
Hi {{client_first_name}},

Please find attached.

Kind regards,
{{sender_first_name}}
```

For `portfolio_statement` specifically, the existing template from 2A.1.5 is preserved as the default (full quarterly-statement body).

For `ceo_update`, `company_update`, `press_release`:

```
Hi {{client_first_name}},

Please find the latest update on {{company_name}} attached.

Kind regards,
{{sender_first_name}}
```

These are starting points only — once 14.49 ships, the team edits them in Settings to taste.

---

## 4. Template variables

Available placeholders, substituted at send time:

| Placeholder | Source | Always available? |
|------------|--------|-------------------|
| `{{client_first_name}}` | derived from `clients.full_name` | Yes |
| `{{client_full_name}}` | `clients.full_name` | Yes |
| `{{sender_first_name}}` | current team member's name | Yes |
| `{{sender_full_name}}` | current team member's name | Yes |
| `{{period}}` | UK-formatted period date | Only for portfolio/transaction statements |
| `{{company_name}}` | linked company name via `documents.company_id` | Only when document has a company |
| `{{filename}}` | the document filename | Yes |
| `{{reference}}` | invoice or document reference (if applicable) | Type-dependent |

If a placeholder is used in a template but the value isn't available (e.g. `{{company_name}}` on a portfolio statement), substitution produces an empty string, NOT a literal `{{company_name}}` left in the output. The build prompt enforces this.

---

## 5. Database changes

### 5.1 New table — `email_templates`

```sql
CREATE TABLE email_templates (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_type         TEXT NOT NULL UNIQUE,  -- one template per type
  subject               TEXT NOT NULL,
  body                  TEXT NOT NULL,
  is_default            BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE for seeded defaults, FALSE after edit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID REFERENCES team_members(id) ON DELETE SET NULL
);

CREATE INDEX email_templates_type_idx ON email_templates (document_type);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Platform-pattern RLS (matches all other tables)
CREATE POLICY "authenticated full access on email_templates"
  ON email_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

### 5.2 Seed data

The migration also seeds one row per sendable type listed in Section 3.1 (16 rows total), with `is_default=TRUE`. The defaults match the subject/body templates documented in Section 3.

### 5.3 Trigger to update `updated_at`

```sql
CREATE OR REPLACE FUNCTION trigger_set_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.is_default = FALSE;  -- editing clears is_default
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_templates_updated_at();
```

---

## 6. Settings → Email Templates page

New page at `/settings/email-templates`.

Layout: a list of all 16 sendable types, each row showing:

- Document type label (human-readable: "Portfolio statement", not `portfolio_statement`)
- Current subject (truncated if long)
- "Default" badge if `is_default=TRUE`, "Edited" badge otherwise with last edited date
- Edit button

Click Edit → modal opens with:

- Document type (read-only)
- Subject field (single-line input)
- Body field (multi-line textarea, ~10 rows visible)
- Right-hand panel listing available placeholders for this doc type (helpful but not interactive)
- Preview button — opens a separate preview modal showing what a sample email would look like with placeholders substituted (use Bob Bigballs as the sample client, with sensible defaults for missing fields)
- "Reset to default" button (if edited) — restores the original seeded template
- Cancel | Save buttons

Validation: subject non-empty, body non-empty. Allow saving with any placeholder set — unused placeholders are not an error.

After save: modal closes, list refreshes, "Edited" badge appears.

---

## 7. The send path changes

### 7.1 Template lookup

The existing `sendDocumentEmail` server action gets a small refactor. Instead of taking pre-built `subject` and `bodyText`, it can also accept just a `documentId` and look up the template itself:

```typescript
// Old (still supported for bulk send where templates are pre-substituted):
sendDocumentEmail({
  documentId, recipientEmail, subject, bodyText, ...
})

// New (for single-send from the modal):
sendDocumentEmail({
  documentId, recipientEmail,
  // subject and bodyText are now optional — if absent, looked up from email_templates
})
```

When subject/bodyText are absent, the server action:
1. Looks up the document's type
2. Loads the `email_templates` row for that type
3. Substitutes placeholders from the document + client + team-member context
4. Uses the result as subject and body

### 7.2 Bulk send path

Bulk send (2A.3b) already does per-investor template substitution. It needs a small update to load the body template from `email_templates` rather than hard-coded constants:

- The SendAllConfirmModal's "Subject" and "Body" fields pre-populate from `email_templates.portfolio_statement` rather than constants
- The rest of the bulk send flow is unchanged

This is a one-line lookup change in the existing modal.

### 7.3 Composer modal opening

The EmailComposerModal currently has hardcoded template logic. It needs:

1. On open: look up the template for the document's type from `email_templates`
2. Substitute placeholders using the client + team-member context
3. Populate Subject and Body fields with the substituted values
4. (Existing behaviour) team can edit before sending

---

## 8. Documents tab changes — Email button everywhere

Today, the Email button appears next to portfolio statements on the per-client Documents tab. After 14.49:

1. **Per-client Documents tab** — Email button on every row where `documents.type IN SENDABLE_TYPES`
2. **Deal-page Documents tab** (used by transaction statements, application forms) — same
3. **Anywhere else documents are rendered with a View link** — same

The implementation pattern: a single `<DocumentActions>` component that renders View + Email + any other actions based on the document's type. Reused everywhere documents are listed.

For sensitive types (kyc, poa, suitability_assessment, source_of_funds, call_notes), no Email button is rendered at all. The View button stays — internal team can still access the doc.

---

## 9. Edge cases

- **Document has no client** — some document types (e.g. company_update) may be company-scoped not client-scoped. The Email button still appears but the modal prompts the team for a recipient. *(Out of scope for first pass: defer to follow-on if it surfaces.)*
- **Client has no email** — same behaviour as today: modal opens with empty To field, team fills in manually.
- **Template references unavailable placeholder** — substitute empty string, don't leave literal `{{...}}` in output.
- **Sender's name isn't set on team_members row** — fall back to email address local part (e.g. "edrudd" from "edrudd@junocapital.co.uk").

---

## 10. Acceptance criteria

### Database and seeding
1. `email_templates` table exists with one row per sendable type (16 rows)
2. Each seeded row has `is_default=TRUE`
3. Editing a row sets `is_default=FALSE` and updates `updated_at` automatically
4. Sensitive types have NO row in email_templates

### Settings page
5. `/settings/email-templates` lists all 16 sendable types
6. Each row shows type label, current subject (truncated), default/edited badge, last edited if applicable
7. Sensitive types do NOT appear in the list
8. Edit modal allows updating subject and body
9. Preview button shows substituted sample output using Bob Bigballs as test client
10. Reset to default restores the seeded template and re-sets is_default=TRUE
11. Save persists and refreshes the list

### Documents tab — Email button visibility
12. Email button appears on portfolio_statement rows (existing behaviour preserved)
13. Email button appears on transaction_statement, application_form, share_certificate, and other sendable types
14. Email button does NOT appear on kyc, poa, suitability_assessment, source_of_funds, or call_notes rows
15. View button appears on ALL rows including sensitive ones
16. Behaviour is consistent across per-client Documents tab AND deal-page Documents tab

### Sending
17. Clicking Email on a transaction statement opens the modal with the correct subject and body from the template
18. Placeholder substitution works: client_first_name, sender_first_name, period, company_name, filename
19. Unused placeholders for a doc type substitute to empty string (e.g. portfolio_statement template uses {{company_name}} → empty)
20. Send actually delivers the email, audit row in email_sends records it correctly
21. Documents tab Sent column shows "Sent on {date}" after successful single-send (existing behaviour)

### Bulk send
22. Bulk send confirmation modal pre-populates subject and body from `email_templates.portfolio_statement` (not hard-coded constants)
23. Editing in the modal applies per-send (existing behaviour preserved — no template change)
24. Bulk send still works end-to-end for portfolio statements

### Build cleanliness
25. `npm run build` and `tsc --noEmit` both pass
26. No console errors in normal flow

---

## 11. Implementation order

1. Spec file added to `docs/specs/`
2. Migration: `email_templates` table + seed data + updated_at trigger — STOP for Ed's approval
3. Settings → Email Templates page (list view)
4. Edit modal + Preview modal
5. Template helper refactor — `getEmailTemplate(documentType, context)` reads from DB
6. EmailComposerModal updated to use new helper
7. SENDABLE_TYPES constant + DocumentActions component
8. Documents tab(s) wired to use DocumentActions
9. Bulk send updated to read template from DB
10. Reset-to-default action

---

## 12. Future Work items added

```markdown
- **14.57 — Per-investor template overrides.** Allow setting bespoke subject/body for specific investors (e.g. corporate vs individual). Would extend `email_templates` with an optional `client_id` for overrides.
- **14.58 — Template version history.** Track every edit to an email template with the before/after snapshot. Currently we only track latest updated_by/at; for compliance, full history might matter.
- **14.59 — Default recipient logic per type.** Some doc types (e.g. eis_certificate) might always go to the client, others (e.g. invoice) might go to a different default address. Currently every Email opens with the client's email as the recipient.
- **14.60 — Editable templates for non-document email types.** When transaction-workflow emails arrive (Future Work 14.51), they're not tied to a documents row but should still use centrally-managed templates. Will need a separate `notification_templates` or similar.
```

---

*End of spec.*
