# Second follow-up to portfolio statement PR — Column auto-sizing (real)

**Branch:** `feat/portfolio-statement-generation` (still the same PR)
**Status:** One fix needed before merge. The static-ratio approach from the previous follow-up didn't solve the crash; replacing with the proper dynamic algorithm.

---

## Why this follow-up exists

The previous follow-up (commit "Visual polish...") tried to fix the column crashing problem by recomputing static flex ratios offline from font metrics. After preview testing, the same two columns are still crashing into each other: **Subscribed → Curr. Price**.

Diagnosis: the static-ratio approach evidently measured data widths but not header-label widths. "Curr. Price" is an 11-character header but its data is short (`£32.45`, 6 characters). Static ratios derived from data alone leave Curr. Price too narrow to fit its header, so the header text crashes into the preceding column.

The proper fix is the dynamic algorithm the Python builder uses (`_auto_col_widths` in `juno-investor-reports/report_generator.py`): for each column, take `max(headerWidth, max(dataWidth))` + padding + buffer, then scale all columns proportionally to fill the page. This handles the wide-header / narrow-data case correctly.

---

## Task — Implement the dynamic column-width algorithm

### 1. Add a width estimator

React-pdf doesn't expose font-metric measurement the way ReportLab does, so we approximate. Add to `portfolioValuationStatement.tsx` (or a small util file alongside):

```typescript
// Approximate text width in points. Based on Helvetica's average glyph
// width (~0.55 × font size). Slight over-estimate is safer than under —
// better to leave a small gap than to crash adjacent columns.
function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55
}
```

### 2. Replace the static column widths with a dynamic computation

Find the current static flex values (Company 1.1, Share Class 1.3, etc.) and delete them. Replace with a function that computes widths at render time:

```typescript
// Mirrors juno-investor-reports/report_generator.py _auto_col_widths.
// For each column, the natural width is max(header label width, max data
// cell width) + cell padding + small buffer. Sum all naturals, scale
// proportionally to fill the page's usable width.
//
// Critical detail: header labels MUST be measured at the header font size
// (typically slightly larger and bold than data cells). Otherwise wide-
// header / narrow-data columns (e.g. "Curr. Price" with £-amounts) come
// out too narrow and crash into adjacent columns.
function computeColumnWidths(
  columns: { label: string; format: (row: Row) => string }[],
  rows: Row[],
  usableWidth: number,
  headerFontSize: number,
  cellFontSize: number,
): number[] {
  const CELL_PAD = 8
  const BUFFER = 6
  
  const naturals = columns.map(col => {
    const headerW = estimateTextWidth(col.label, headerFontSize)
    const dataWidths = rows.map(r => estimateTextWidth(col.format(r), cellFontSize))
    const maxDataW = dataWidths.length > 0 ? Math.max(...dataWidths) : 0
    return Math.max(headerW, maxDataW) + CELL_PAD + BUFFER
  })
  
  const totalNatural = naturals.reduce((a, b) => a + b, 0)
  const scale = usableWidth / totalNatural
  return naturals.map(n => n * scale)
}
```

### 3. Apply to both tables

Both the detail table (per-lot) and the per-company summary table need dynamic widths. The summary table has fewer columns and different content shapes, so it will get its own width array — that's fine, the function handles it.

For the detail table, the row shape passed to `format()` is the per-lot row. For the summary table, it's the per-company-summary row.

### 4. Page width

The usable width is `pageWidth - leftMargin - rightMargin`. For A4 landscape with the existing margins, that's roughly `841.89 - 42.5 - 42.5 = 756.89pt`. Use the existing margin and page-size constants rather than hardcoding.

### 5. Sanity check on first render

After implementing, log the computed widths once (or add a temporary debug print) to confirm:
- Sum of all widths ≈ usable width (within 1pt)
- Curr. Price column is at least as wide as `estimateTextWidth("Curr. Price", 8)` + padding (~58pt)
- Subscribed column is at least as wide as the widest formatted £-value in the data

Remove the debug logging before merging.

---

## Acceptance

1. Regenerate Barry O'Brien III's statement after pushing
2. No adjacent column headers crash into each other anywhere in the detail table
3. No adjacent column data crashes into each other in any row
4. Same checks on the per-company summary table on page 2
5. Try a second client (e.g. Bibi Netanahu — has Ball Co B Preference which is a wider share-class label) and confirm columns still render cleanly
6. No regressions to the other visual polish from the previous follow-up (grey line, totals row, footer, logo, title)

---

## Workflow

1. Stay on `feat/portfolio-statement-generation`.
2. One commit, titled `Column auto-sizing: replace static flex with dynamic algorithm`.
3. Push. Preview redeploys.
4. Add a short note to the PR description's "Follow-up commits" section explaining: static ratios from previous commit insufficient because they measured data widths only, not header-label widths; replaced with dynamic max(header, data) algorithm matching the Python builder.
5. **Stop. Wait for Ed.**

---

*End of follow-up prompt.*
