# Spec v1.2 amendment — CLN handling clarification

**Add this to `docs/specs/Juno_Phase_B_Stage_2_Share_Prices_Spec_v1.md`** as a new section before the version history (which becomes Section 10 instead of 9). Update the version history table at the very end to add the v1.2 row.

---

## 9. Amendment — CLN-via-share-class model (v1.2, 19 May 2026)

### 9.1 Why this amendment

During Sub-stage 2B.2 review, Ed clarified that the original specification handled CLNs incorrectly. The original spec said CLN rows on the share-prices page were "read-only at principal with N/A for date". That was wrong on three counts:

1. **CLNs are bought via the existing buy-deal wizard.** A CLN purchase goes through the same flow as an equity purchase: the team picks the company, picks "CLN" from the share-class dropdown, enters a share price of £1.00, and the number of "shares" equals the principal amount. On completion, an `investments` row is created exactly like any equity purchase.

2. **CLN holdings have a real acquisition date.** Captured automatically by the deal wizard on `investments.investment_date`. Displaying "N/A" loses information the platform already holds.

3. **CLN valuations are not read-only.** A CLN can be impaired (company in trouble, recoverable value below principal) or, rarely, written up. The team needs a manual override mechanism — the same Update button as equity rows.

The fully-structured CLN management workflow (capturing interest rate, conversion terms, maturity date, conversion triggers) — supported by the existing `cln_positions` table that today sits empty — is a future stage. For v1 of the share-prices work, CLNs are pragmatically modelled as a share class with `instrument_type = 'cln'`, behaving like a special-case equity row.

### 9.2 The CLN-via-share-class model

A CLN holding is represented by:

- **A row in `company_share_classes`** with `name = 'CLN'`, `type = 'ordinary'`, `instrument_type = 'cln'`. Added via the Share Classes tab on the company record page (no inline shortcut on the Add Company form).
- **A row in `investments`** created when a CLN deal completes, with `share_class_id` pointing at the CLN class, `original_share_price = 1.00`, `shares_purchased = principal_amount`, `sum_subscribed = principal_amount`.
- **Optionally, a row in `valuations`** with `share_class_id` pointing at the CLN class, holding a manually-entered write-down or write-up. NULL `share_class_id` is not used for CLN rows; the FK is always populated for instrumented classes.

CLN-specific attributes (interest rate, conversion mechanics, maturity date) are NOT captured by this model. They live in legal documents and the team's institutional memory until a dedicated CLN management workflow is built. Future Work 14.16 covers the accrued-interest estimate; the conversion workflow is broader (Future Work 14.22, added by this amendment).

### 9.3 Display rules — share-prices page

For each row on the share-prices page:

**Equity rows** (`instrument_type = 'equity'`):
- Price: the latest valuation from `company_current_valuations`, or "Never valued" if none
- Date: the latest `valuation_date`, or "—" if no valuation
- Update button: opens the standard price-update modal

**CLN rows** (`instrument_type IN ('cln', 'loan_note')`):
- Price: `£1.00 (principal)` if no valuation row exists for this share class. If a valuation row exists, show its `share_price` followed by a small italic tag `(overridden)` to make the override visible.
- Date: the earliest `investment_date` from `investments` for this share class, formatted as `Acquired DD MMM YYYY`. If no `investments` row exists yet (the share class is set up but nothing bought), show "—" or "Not yet acquired".
- Update button: present, same as equity rows. Opens the standard price-update modal (write-down/up support comes via the same form fields).

When the company has at least one CLN/loan-note row, a small footnote appears at the bottom of the page section:

> *CLN holdings default to principal value. Use Update to record a write-down or recovery.*

### 9.4 Display rules — valuation statement PDF (Phase B Stage 2A, future)

The forthcoming portfolio valuation statement PDF will treat CLN line items identically to equity line items, using `original_share_price`, `shares_purchased`, `sum_subscribed`, and the latest valuation (or principal default). The "Investment Date" column on the PDF picks up `investments.investment_date` naturally — no special-case logic for CLNs.

### 9.5 Add Company form — explicit non-change

The Add Company form does NOT include an `instrument_type` selector. All classes created via this form default to `instrument_type = 'equity'`. CLN classes are added later via the Share Classes tab on the company record page. This is a deliberate friction trade-off: in practice, CLN classes are set up at the same time as the first CLN deal (not at company creation), so the cost is minimal and the form stays simple.

### 9.6 Deal wizard — explicit non-filter

The buy-deal wizard share-class dropdown does NOT filter by `instrument_type`. All share classes for the chosen company appear in the dropdown, including CLN. This is required so the team can create CLN deals via the existing wizard.

### 9.7 Future Work additions arising from this amendment

Add the following to the platform Future Work list:

- **14.22 — CLN conversion workflow.** When a CLN converts to equity, a structured workflow is needed: take the converting CLN holding, compute the conversion price (based on stored discount/cap terms — currently not captured), create new equity `investments` rows on the conversion date, mark the CLN holding as converted, generate transaction statements. Out of scope for Phase B Stage 2; belongs in a dedicated CLN/ASA stage that also starts using the existing `cln_positions` table. See `TRANSACTION_WORKFLOW_SPEC.md` for the broader scope.
- **14.23 — CLN terms capture.** The platform currently does not store CLN-specific terms (interest rate, interest treatment rolled-up vs paid, conversion price formula, discount rate, valuation cap, maturity date, conversion triggers). For v1 these live in legal documents. Future work to capture them in the `cln_positions` table when the conversion workflow is built.

---

## 10. Version history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1 | 19 May 2026 | Ed + chat-Claude | Initial spec, approved for build |
| v1.1 | 19 May 2026 | Ed + chat-Claude | Section 5.1.4 correction: TRUNCATE CASCADE wipes dependent tables, does not just null FK columns |
| v1.2 | 19 May 2026 | Ed + chat-Claude | New Section 9 — CLN-via-share-class model. Original "read-only at principal with N/A for date" replaced by "default to principal, show acquisition date, overrideable via Update button" |

---

*End of v1.2 amendment.*
