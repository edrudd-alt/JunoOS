# FW 14.61 — Documents Tab Locations Enumeration

Searched 2026-05-22. Two locations require fixes; four are already compliant or out of scope.

## Locations requiring fixes

### 1. `src/app/(app)/clients/[id]/tabs/InvestmentDocsTab.tsx`
- **Pattern:** `<div>` rows — accordion grouped by company → year (not a `<table>`)
- **Per row today:** type pill · filename · period (inline) · `created_at` (unlabelled) · green "Sent {date}" badge (unlabelled) · DocumentActions
- **Problem:** Two dates side-by-side with no column headers — readers can't tell which is which
- **Fix:** Convert rows to a proper `<table>` with 5 labelled columns inside each year accordion section

### 2. `src/app/(app)/deals/[id]/DocumentsTab.tsx`
- **Pattern:** `<div>` rows via shared `DocRow` component — three view modes (by investor, by type, by date); each mode has collapsible `SectionHeader` sections containing `DocRow` items
- **Per row today:** 📄 icon · filename + badges · type badge (conditional) · `document_date` (unlabelled) · ⋯ menu
- **Problem:** `document_date` appears with no column header; Email action is in the ⋯ menu (not an inline column) so there's no "Sent" column at all, but the date is still unlabelled
- **Fix:** Add a `<table>` + `<thead>` inside each collapsible section; section collapse buttons remain as-is above each table. `showInvestor`/`showType` flags control which cells render — headers should match.

## Locations already compliant (no change)

### 3. `src/app/(app)/investments/[id]/InvestmentCockpit.tsx`
- Already a `<table>` with `<thead>`: Name · Type · Date · (View action)

### 4. `src/app/(app)/clients/[id]/_components/GenerateStatementSection.tsx`
- Mini-widget, not a document list. Date is inline-labelled "(generated {timestamp})". Ed confirmed: skip.

### 5. `src/app/(app)/reports/portfolio-statement/_components/PastRunDetails.tsx`
- Already a `<table>` with `<thead>`: Status · Investor · Recipient · (actions). No document dates.

### 6. `src/app/(app)/documents/page.tsx`
- Placeholder/empty state only — no document listing exists.
