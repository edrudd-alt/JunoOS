# Third follow-up to portfolio statement PR — Detail table missing a column boundary

**Branch:** `feat/portfolio-statement-generation` (still PR #11)
**Status:** One structural bug in the detail-table rendering. The dynamic column-width algorithm from the previous follow-up is working correctly — leave it alone.

---

## Why this follow-up exists

After previous attempts at fixing column spacing, the latest preview PDF shows the underlying issue clearly: **Subscribed and Curr. Price are rendering into the same cell**, not into two adjacent cells. Verbatim from the rendered PDF:

```
Header:  SubscribedCurr. Price
Row 1:   £10,000.00£2.5000
Row 2:   £25,000.00£1.0000
Row 3:   £8,750.00£2.5000
```

No whitespace between them, no column boundary, no horizontal padding. The values are concatenated as if both fields are being emitted into one `<Text>` element inside a single `<View>` cell.

This is NOT a width problem (the surrounding columns are correctly proportioned). It's a **column-count or rendering-loop problem** in the detail table — Subscribed and Curr. Price aren't getting their own cells.

For confirmation: the **summary table on page 2** does not exhibit this bug. Its columns (Shares Purchased, Sum Subscribed, Current Valuation, Valuation Change) render with correct separation. The bug is localised to the detail-table row component.

---

## Task — Fix the detail-table column rendering

### 1. Find the detail-table row component

In `portfolioValuationStatement.tsx`, locate:
- The columns array / column definitions for the detail (per-lot) table
- The component that renders each row

The columns array should define 10 columns (or 11 if dividends are present): Company, Share Class, EIS, Date, Orig. Price, Shares, **Subscribed, Curr. Price**, Curr. Value, Change. The bug is around the bolded pair.

### 2. Diagnose the merge

There are three plausible causes; check in this order:

**(a) Two fields in one column definition.** Something like:
```typescript
{ label: 'Subscribed', format: r => `${fmtGBP(r.sum_subscribed)}${fmtGBP4(r.current_share_price)}` }
```
If a single column's `format` function concatenates both fields, you'll see exactly the symptom in the PDF. Split into two separate column entries.

**(b) Missing cell in the render loop.** The row component might map over columns but render fewer cells than columns array length (off-by-one in indices, or a `slice(0, n)` that's cutting off too early). Check the row-rendering JSX.

**(c) Adjacent `<Text>` elements inside one `<View>`.** Less likely with react-pdf since each column should be wrapped in a `<View style={{ width: widths[i] }}>`, but worth checking that each cell has its own wrapper.

### 3. Fix the column boundary

Whichever of (a)/(b)/(c) is the root cause, the fix is: Subscribed and Curr. Price are two distinct columns with two distinct entries in the columns array, two distinct cells in the rendered row, and two distinct entries in the totals row.

### 4. Don't touch the dynamic-width algorithm

The previous follow-up's `computeColumnWidths()` function is working correctly. Don't modify it. The bug is upstream — wrong number of items being passed to it, or wrong number of cells being rendered after it returns.

### 5. Confirm by re-checking the rendered values

After fixing, the detail table should show 10 distinct columns:

| # | Column | Sample value |
|---|---|---|
| 1 | Company | AI Forge Ltd |
| 2 | Share Class | Ordinary |
| 3 | EIS | EIS |
| 4 | Date | 15/09/23 |
| 5 | Orig. Price | £1.0000 |
| 6 | Shares | 10,000 |
| 7 | **Subscribed** | **£10,000.00** |
| 8 | **Curr. Price** | **£2.5000** |
| 9 | Curr. Value | £25,000.00 |
| 10 | Change | £15,000.00 |

The totals row should match: empty cells for Company/Share Class/EIS/Date/Orig. Price/Shares, then Subscribed total £110,000.00, blank Curr. Price (or hidden), Curr. Value total £187,500.00, Change total £77,500.00.

---

## Acceptance

1. Regenerate Barry O'Brien III's statement on the preview
2. The detail table on page 1 has 10 visibly distinct columns (or 11 if dividends column added back later)
3. The header row reads "Subscribed" and "Curr. Price" as separate column headers with whitespace between them
4. Every data row has separate values for Subscribed and Curr. Price, with clear horizontal separation
5. The totals row at the bottom of the detail table has £110,000.00 in the Subscribed column with the Curr. Price cell blank or empty next to it
6. The summary table on page 2 is unchanged (it was already correct)
7. No regression to: the grey accent line, totals row styling, footer, logo size, title size, or dynamic column widths

---

## Workflow

1. Stay on `feat/portfolio-statement-generation`.
2. One commit: `Detail table: separate Subscribed and Curr. Price into distinct columns`.
3. Push. Preview redeploys.
4. Add a short note to the PR description's "Follow-up commits" section: the previous attempts at fixing "column crashing" were diagnosing it as a width problem; the actual bug was structural — two fields rendering into one cell.
5. **Stop. Wait for Ed.**

---

*End of follow-up prompt.*
