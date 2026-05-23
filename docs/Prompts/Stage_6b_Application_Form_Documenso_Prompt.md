*Historical reference. Terminology updated in Sub-stage B of the Entity Model Cleanup (PR #19, May 2026): Client → Lead investor, Vehicle → Beneficial owner, Location → Legal owner. The `entity_type`, `fund_type`, and `active_fund_type` columns on the `clients` table were removed in Sub-stage A. See the current platform spec for live terminology and schema.*

# Prompt for Claude Code — Stage 6b: Application Form + Documenso Integration

Copy and paste the text between the `===PROMPT START===` and `===PROMPT END===` lines into Claude Code.

---

===PROMPT START===

Stage 6b — first real consumer of the document generation infrastructure built in Stage 6a. Builds the application form template, the Review-before-send modal, the Documenso e-signature integration, and the webhook handler.

The spec v3.4 (in `/docs/Juno_Deal_Page_Restructure_Spec_v3.4.md`) is the canonical source. Read **Section 5 (Review-before-send modal)** and **the Stage 6 architectural section near the end of the spec** before starting. This prompt builds on those.

## Documents to read first

1. `/docs/Juno_Deal_Page_Restructure_Spec_v3.4.md` — Section 5 + Stage 6 architectural section
2. `/CLAUDE.md` — two-query Supabase pattern, conventions
3. `/src/services/document-generation/` — Stage 6a's infrastructure (types, registry, fetchDealContext, generateDocument, helloWorld template). Stage 6b's template follows the same pattern.
4. `/src/app/(app)/deals/[id]/bookbuildActions.ts` — Stage 3b's existing actions including the currently-mocked Send application form. Stage 6b replaces the mock send.
5. `/src/app/(app)/deals/[id]/BookbuildTab.tsx` — Stage 3b's row UI; the "Send application form" action lives here.

## Workflow rules

- Branch: `feature/stage-6b-application-form-documenso`
- Commit logical chunks (see Tasks below)
- Push branch when done; do NOT merge to main — Ed reviews preview first
- Three approval gates during this stage (see "Approval gates" below)

## Approval gates

Stop and ask Ed for approval before proceeding past these checkpoints:

1. **After Task 1 (migration)** — show the SQL, wait for approval, apply via `apply_migration`
2. **After Task 4 (Documenso webhook URL)** — confirm the webhook URL with Ed before he registers it in Documenso
3. **After Task 11 (end-to-end test)** — show the test results before pushing the branch

## Task 1 — Migration: add document signing fields

```sql
ALTER TABLE documents
  ADD COLUMN signing_status TEXT,
  ADD COLUMN documenso_envelope_id TEXT,
  ADD COLUMN recipient_email TEXT,
  ADD COLUMN cc_emails TEXT[];

COMMENT ON COLUMN documents.signing_status IS 'Granular signing state for documents that go through e-signature: pending, signed, declined, cancelled. NULL for documents that do not require signing.';
COMMENT ON COLUMN documents.documenso_envelope_id IS 'External ID returned by Documenso when the signing envelope was created. Used to look up the document when the webhook fires.';
COMMENT ON COLUMN documents.recipient_email IS 'Email address the document was sent to via Documenso. Captured at send time for audit traceability.';
COMMENT ON COLUMN documents.cc_emails IS 'Array of CC email addresses included in the Documenso envelope. Empty array if no CCs.';
```

Show the SQL to Ed for approval. **APPROVAL GATE 1.** After approval, apply via `apply_migration`.

Commit as: "Add signing_status, documenso_envelope_id, recipient_email, cc_emails to documents".

## Task 2 — Install Documenso SDK / set up API client

Documenso REST API: https://docs.documenso.com/developers/rest-api

Two options:
- The `@documenso/sdk-typescript` npm package if current and well-maintained
- Direct fetch calls to a hand-rolled client at `/src/services/documenso/client.ts`

Investigate which is cleaner. Whatever you choose, the client needs at least:
- `createEnvelope(pdfBuffer, recipient, ccs, options)` — creates the signing envelope, returns envelope ID
- `cancelEnvelope(envelopeId)` — cancels (used in re-issue and rollback)
- `getEnvelopeStatus(envelopeId)` — checks current state
- `downloadSignedPdf(envelopeId)` — fetches signed PDF after webhook fires

Add to `.env.example`:

```
# Documenso e-signature integration
DOCUMENSO_API_KEY=your_documenso_api_key_here
DOCUMENSO_API_URL=https://app.documenso.com/api/v1
DOCUMENSO_WEBHOOK_SECRET=your_documenso_webhook_secret_here
```

Tell Ed when you reach this point so he can populate `.env.local` from his Documenso dashboard.

Commit as: "Set up Documenso API client and environment variables".

## Task 3 — Expand DealDocumentContext for application form

Stage 6a's `DealDocumentContext` lacks fields the application form needs.

**Investor fields** (extend `DealDocumentContext.investor`):
- `address_line1: string | null` — from `clients.address_line1`
- `address_line2: string | null` — from `clients.address_line2`
- `postcode: string | null` — from `clients.postcode`
- `email: string` — from `clients.email`

For investments via vehicle, the address still comes from the human client (the actual person), not the vehicle.

**Bank fields** (new top-level `DealDocumentContext.bankDetails`):
- `account_name: string | null`
- `sort_code: string | null`
- `account_number: string | null`
- `iban: string | null`
- `swift_bic: string | null`

Conditionally selected in `fetchDealContext`:
- `nominee_id IS NULL` (Direct) → from `companies.bank_*` (where company is the deal's portfolio company)
- `nominee_id IS NOT NULL` → from `nominees.bank_*`

If the relevant bank record exists but bank fields are NULL, populate `bankDetails` with all nulls.

**Investment fields** (extend `DealDocumentContext.investment`):
- `share_class_name: string | null` — from `company_share_classes.name` via `deals.share_class_id`. May be null if no share class assigned.

Update `types.ts`, `fetchDealContext.ts`, and consumers. Two-query pattern still applies — no embedded joins.

Commit as: "Expand DealDocumentContext with address, bank details, and share class".

## Task 4 — Documenso webhook URL setup

Stage 6b includes a webhook handler at `/api/webhooks/documenso/route.ts` (Next.js App Router serverless function).

Webhook URL for Documenso to send events to:

```
https://juno-os.vercel.app/api/webhooks/documenso
```

(Production URL. Preview URLs are not practical for webhook testing because they change per deployment.)

**APPROVAL GATE 2** — Tell Ed:

1. The webhook URL to register in Documenso
2. That `DOCUMENSO_WEBHOOK_SECRET` needs to be set both in Documenso's webhook config AND in Vercel's environment variables for production
3. That webhook testing is best done in production post-merge, OR via ngrok/localtunnel for local testing — Ed's choice

Wait for Ed to confirm the webhook is registered before continuing past Task 10.

Write the webhook handler skeleton at `/src/app/api/webhooks/documenso/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/services/documenso/verifyWebhook';
import { handleSignedEvent, handleDeclinedEvent, handleCancelledEvent } from '@/services/documenso/webhookHandlers';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-documenso-signature');
  if (!signature || !verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(body);

  switch (event.type) {
    case 'document.signed':
    case 'envelope.signed':
      await handleSignedEvent(event);
      break;
    case 'document.declined':
      await handleDeclinedEvent(event);
      break;
    case 'document.cancelled':
      await handleCancelledEvent(event);
      break;
    default:
      console.log('Unknown Documenso event type:', event.type);
  }

  return NextResponse.json({ received: true });
}
```

Implement `verifyWebhookSignature` and stub the three handlers. Real handler logic comes in Task 9.

Commit as: "Add Documenso webhook handler skeleton".

## Task 5 — Build the application form template

Based on Ed's existing application form template (Synchtank example provided as reference). Two-page A4 layout.

Create `/src/services/document-generation/templates/applicationForm.tsx`. Key elements:

**Header (both pages)**:
- Top-left: Company name (large, bold), "Application Form" subtitle
- Top-right: Juno logo (placeholder text "JUNO" for now; real logo file at `/public/juno-logo.png` to add later)
- Bottom centre: "Juno Capital Partners LLP | 91 Wimpole Street, London W1G 0EF" page footer (fixed)

**Page 1 content**:

1. Section "Procedure for Application"
   - One-line preamble
   - Numbered item 1: "Payment for shares should be made by electronic transfer to the following account: -"
     - Account Name, Sort Code, Account, Reference (4 rows)
     - Bank details from `bankDetails` (selected by `nominee_id` per Task 3)
     - Reference: `JUNO-{CLIENT_SURNAME}` (uppercase, dash, no space — even though existing template uses different format, new format is locked)
   - Manual fallback paragraph: "If you choose to print and sign manually, then please complete the scanned form and: return the scanned form by email to erudd@junocapital.co.uk; and send the hard copy, 'wet ink' form, to Juno Syndicate Ltd, 91 Wimpole St, London W1G 0EF."
   - Numbered item 2: "Payment for fees should be made by electronic transfer to the following account: -"
     - Juno's bank details (HARD-CODED constants in the template):
       - Account Name: "Juno Capital Partners LLP"
       - Sort Code: "60-83-71"
       - Account: "10335778"
       - Reference: same `JUNO-{CLIENT_SURNAME}` as above
   - Contact paragraph: "If you have any queries about these payments, please contact us on 020 3011 0783 or by email."

2. Section "Investor Details" — 2-row table
   - Name | (vehicle name if `investing_vehicle_id` set, else client name)
   - Address | (combined `address_line1`, `address_line2`, `postcode` comma-separated)

3. Section "Investment Details"
   - Important paragraph
   - 4-column table with 1 data row:
     - Name | Price Per Share | Quantity | Cost
     - "{company_name} {share_class_name}" | £{deal.share_price} | {investment.shares} | £{shares × share_price}
   - **Cost = shares × share_price**, NOT `confirmed_amount` — investors can't buy fractional shares so the actual cost is slightly less than the round target

**Page 2 content**:

1. Header repeats
2. Right-aligned: "Juno Fee ({fee_pct}%)" with bold £ amount
   - fee_pct from `investment.fee_pct` (in DB as decimal e.g. 0.05; render as percentage e.g. "5.0%")
   - fee amount = cost × fee_pct
3. Declaration paragraph: "I confirm that I am investing in {company_name} Limited"
4. Signature space (empty area for Documenso signature overlay)
5. Signer name as text below signature space (vehicle name if applicable, else client name)

**Notes**:
- Logo placeholder: text "JUNO" in top-right. Real logo image to be added later (Ed will provide a file)
- Documenso signature overlay placement: when creating the envelope (Task 8), specify the signer's signature field to position in the empty space on page 2
- Use `@react-pdf/renderer` primitives consistent with helloWorld template — Document, Page, Text, View, StyleSheet
- Page footer pinned to bottom with `fixed` prop on Text

Register in `templateRegistry.ts`:

```typescript
import { ApplicationFormTemplate, applicationFormVersion } from './templates/applicationForm';

export const templateRegistry = {
  helloWorld: { ... },
  applicationForm: {
    component: ApplicationFormTemplate,
    version: applicationFormVersion,
    domain: 'deal' as const,
  },
};
```

Update `TemplateId` type to include `'applicationForm'`. Update `inferDocumentType`:

```typescript
const map: Record<TemplateId, string> = {
  helloWorld: 'other',
  applicationForm: 'application_form',
};
```

`applicationFormVersion = '1.0.0'`.

Commit as: "Add applicationForm template based on existing Juno template structure".

## Task 6 — Build the Review-before-send modal

Per spec Section 5. Create `/src/app/(app)/deals/[id]/SendApplicationFormModal.tsx`.

Modal structure (top to bottom):

1. **PDF preview area** (~60% of vertical space)
   - Inline using PDF.js or `<iframe>` with blob URL
   - PDF generated when modal opens via `generateDocument('applicationForm', { dealInvestorId }, { previewOnly: true })` (see Task 7)

2. **Bank details warning** (conditional)
   - If `bankDetails.account_name` is null in the context, red banner:
     > ⛔ Bank details required. {company_name OR nominee_name}'s bank details have not been added. Investors won't know where to send funds.
   - Disable the Send button when showing
   - Stage 6b's UI has no way to add bank details (no Phase C UI yet) — direct user to Supabase dashboard or surface a message. Cyclr's bank details have been pre-populated in the database for testing.

3. **KYC warning** (conditional, lower priority)
   - If `clients.kyc_status` is 'outstanding' or 'renewal_due', amber banner per Section 5.5:
     > ⚠ KYC outstanding — Consider sending a KYC request alongside the application form.
   - Does NOT block sending. Informational.

4. **Recipient field**
   - Single email input, pre-filled with `clients.email`
   - Editable with email validation
   - Label: "Send to"

5. **CC field**
   - Multi-input chip-style: type email, press Enter or comma, becomes a chip; backspace to remove
   - Empty by default, each chip validates as email
   - Label: "CC (optional)"

6. **Footer actions**
   - Cancel (secondary), Send for signing (primary green), right-aligned

Modal width: ~720px to fit inline PDF preview at readable size.

Commit as: "Build SendApplicationFormModal with PDF preview, recipient, and CC".

## Task 7 — generateDocument options for preview-only mode

Extend `generateDocument` to support `previewOnly: true`:
- Generates PDF, returns buffer
- Does NOT upload to Storage, does NOT create documents row
- Used by the modal to show inline preview without creating artefacts

When user clicks "Send for signing", the action calls `generateDocument` again WITHOUT `previewOnly` — that's the real save. PDF generates twice; that's OK — deterministic and cheap.

In `types.ts`:

```typescript
export interface GenerationOptions {
  /** When true, generates the PDF buffer without uploading or creating a row. */
  previewOnly?: boolean;
}
```

In `generateDocument.tsx`:

```typescript
if (options.previewOnly) {
  return {
    documentId: '',
    storageUrl: '',
    templateVersion: `${templateId}@${registry.version}`,
    pdfBuffer,
  };
}
// existing upload + insert logic
```

Commit as: "Add previewOnly option to generateDocument for modal preview".

## Task 8 — sendApplicationForm action

Create `/src/app/(app)/deals/[id]/sendApplicationForm.ts` (or extend `bookbuildActions.ts`).

The action does the full send sequence with rollback:

```typescript
export async function sendApplicationForm({
  dealInvestorId,
  recipientEmail,
  ccEmails,
}: {
  dealInvestorId: string;
  recipientEmail: string;
  ccEmails: string[];
}): Promise<{ success: boolean; error?: string; documentId?: string }> {
  let documentId: string | undefined;
  let storageUrl: string | undefined;
  let envelopeId: string | undefined;

  try {
    // 1. Generate PDF (real, with upload + documents row)
    const result = await generateDocument('applicationForm', { dealInvestorId });
    documentId = result.documentId;
    storageUrl = result.storageUrl;

    // 2. Set signing-pending state and recipient details on the document row
    await supabase.from('documents').update({
      signing_status: 'pending',
      recipient_email: recipientEmail,
      cc_emails: ccEmails,
    }).eq('id', documentId);

    // 3. Create Documenso envelope
    const envelope = await documensoClient.createEnvelope({
      pdfBuffer: result.pdfBuffer,
      recipient: { name: investorName, email: recipientEmail },
      ccs: ccEmails.map(e => ({ email: e })),
    });
    envelopeId = envelope.id;

    // 4. Store envelope ID
    await supabase.from('documents').update({
      documenso_envelope_id: envelopeId,
    }).eq('id', documentId);

    // 5. Update lifecycle
    await supabase.from('deal_investors').update({
      lifecycle_status: 'app_form_sent',
    }).eq('id', dealInvestorId);

    // 6. Audit log
    await supabase.from('deal_action_logs').insert({
      deal_id: dealId,
      deal_investor_id: dealInvestorId,
      document_id: documentId,
      action_type: 'send_application_form',
      is_mock: false,
      from_status: 'confirmed',
      to_status: 'app_form_sent',
      metadata: { recipient_email: recipientEmail, cc_emails: ccEmails, documenso_envelope_id: envelopeId },
    });

    return { success: true, documentId };
  } catch (error) {
    // ROLLBACK: best-effort cleanup
    if (envelopeId) try { await documensoClient.cancelEnvelope(envelopeId); } catch {}
    if (storageUrl) try { await supabase.storage.from('documents').remove([storageUrl]); } catch {}
    if (documentId) try { await supabase.from('documents').delete().eq('id', documentId); } catch {}
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

Rollback is best-effort — if Documenso cancel fails or storage delete fails, log but don't surface to user beyond the original error.

Commit as: "Add sendApplicationForm action with full rollback on failure".

## Task 9 — Documenso webhook handlers

Implement the three webhook handlers stubbed in Task 4:

**`handleSignedEvent`**:
1. Look up document by `documenso_envelope_id`. If no match, log warning, return (could be stale event)
2. Update `documents.signing_status = 'signed'`
3. Download signed PDF from Documenso
4. Upload signed PDF to Storage at a NEW path (don't overwrite the original — keep both versions). Use path like `{original_path_without_extension}.signed.pdf`
5. Store signed path in new column `documents.signed_storage_url`

This requires a small additional migration:

```sql
ALTER TABLE documents ADD COLUMN signed_storage_url TEXT;
COMMENT ON COLUMN documents.signed_storage_url IS 'Path to the signed PDF in Storage. Populated by the Documenso webhook handler when a signature event fires. NULL until signed.';
```

Show this migration to Ed for approval (it's small enough you can include it in Task 1's SQL upfront, or as a separate gate — Ed's call).

6. Update `deal_investors.lifecycle_status = 'signed'`
7. Audit log: `action_type='document_signed_via_documenso'`, metadata with envelope ID and signing timestamp

**`handleDeclinedEvent`**:
- Update `documents.signing_status = 'declined'`
- Do NOT advance lifecycle (stays at `app_form_sent`)
- Audit log entry — team will follow up manually

**`handleCancelledEvent`**:
- Update `documents.signing_status = 'cancelled'`
- Do NOT advance lifecycle
- Audit log entry

Commit as: "Implement Documenso webhook handlers for signed/declined/cancelled events".

## Task 10 — Replace Stage 3b's mock send with the new flow

In `BookbuildTab.tsx` (or wherever the "Send application form" action lives), replace the existing mock:

```typescript
// Before (Stage 3b mock)
const handleSendAppForm = async () => { /* mock code */ };

// After (Stage 6b real)
const handleSendAppForm = (dealInvestorId: string) => {
  setSendModalDealInvestorId(dealInvestorId);
};

// Plus render <SendApplicationFormModal /> conditionally
```

`confirmInvestment` (Stage 3b → 5b modification) is unchanged. Only `sendApplicationForm` changes.

Disable bulk Send application form if it exists. Bulk sending → either N modals or N silent sends, both bad UX. Single-row only for Stage 6b.

Commit as: "Wire SendApplicationFormModal into Bookbuild, replacing Stage 3b mock send".

## Task 11 — End-to-end test

Test against a real deal_investor in the Cyclr test deal:

1. Pick an investor at `confirmed` status. If `clients.email` is null, populate it first with Ed's test email
2. Click Send application form on the Bookbuild row
3. Modal opens, PDF preview renders
4. Recipient pre-filled, add a CC
5. Click Send for signing
6. Verify:
   - documents row created: `signing_status='pending'`, `template_version='applicationForm@1.0.0'`, `documenso_envelope_id` populated
   - deal_investor at `lifecycle_status='app_form_sent'`
   - audit log entry exists
   - Documenso dashboard shows the envelope
7. Open the email Documenso sent (or use the link from Documenso dashboard)
8. Sign the document (Ed signs via his test email)
9. Verify webhook fires:
   - documents updates: `signing_status='signed'`, `signed_storage_url` populated
   - deal_investor at `lifecycle_status='signed'`
   - signed PDF retrievable from storage

**APPROVAL GATE 3** — Report results to Ed: document ID, envelope ID, before/after lifecycle. Wait for approval before pushing.

If anything fails, STOP and diagnose. Do NOT push partial Stage 6b.

## Task 12 — Push and report

Once verified:
1. Push branch to GitHub
2. Wait for Vercel preview
3. Report:
   - Vercel preview URL
   - List of commits
   - End-to-end test results (with envelope ID, document IDs)
   - Judgement calls and concerns
   - Anything needing Ed's attention before merge

DO NOT merge to main.

## Important constraints

- DO NOT touch any other tab (Closing/Completion/Documents/Invoices stay as they are)
- DO NOT modify the persistent header, summary cards, or existing modals
- DO NOT touch sell deal rendering
- DO NOT modify Stage 3b's `confirmInvestment` action (already modified once in Stage 5b)
- DO NOT use embedded join syntax. Two-query pattern only.
- DO NOT make documents bucket public or relax storage policies
- DO NOT add other email integrations (SendGrid etc.)
- DO NOT process Documenso webhooks without verifying signature
- DO NOT skip rollback logic in sendApplicationForm
- DO NOT bulk-send application forms
- The user (Ed) is non-technical. Explain things in plain English in your final report.

When everything is done and pushed, stop and report. If you hit a blocker, STOP and ask before improvising.

===PROMPT END===

---

## After Claude Code responds

The three approval gates pace this stage out:

1. **Migration approval** — small SQL change
2. **Webhook URL** — Ed registers in Documenso dashboard
3. **End-to-end test** — most important verification, Ed signs the test envelope manually

Real risks during this stage:

**Risk 1 — Documenso API behaves differently than expected**

Documenso is a real external service. Its actual API may differ from prompt assumptions. Claude Code may need to consult `https://docs.documenso.com/developers/rest-api`. Adapt as needed.

**Risk 2 — Webhook testing in preview**

Webhooks against ephemeral preview URLs are impractical. Pragmatic approach: test in production after merge with a real test investor, OR use ngrok/localtunnel for local testing.

**Risk 3 — PDF rendering quirks**

React-pdf is reliable but has limitations (Tailwind doesn't apply, some CSS not supported, fonts need explicit registration). Template content matches existing Juno template structure but rendering may need iteration.

**Risk 4 — Documenso free tier limitations**

If free tier doesn't support webhooks or has restrictive envelope limits, may need to upgrade or pivot. Verify before substantial testing.

A small honest reflection: Stage 6b is the most ambitious stage of the project so far. Multiple external dependencies (Documenso, real PDF rendering, real webhook handling), multiple approval gates, real legal/financial document being generated. Estimated 4-5 days of build, possibly 6-7 if Documenso integration surprises.

When you're ready, take this prompt to Claude Code.
