import path from 'path'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { PortfolioStatementContext } from '../types'

export const portfolioValuationStatementVersion = '1.0.0'

const LOGO_SRC  = path.join(process.cwd(), 'public', 'juno-logo.png')
const JUNO_NAME = 'Juno Capital Partners LLP'

const JUNO_DARK  = '#1A1A2E'
const JUNO_NAVY  = '#1B3272'
const LIGHT_GREY = '#F5F5F5'
const MID_GREY   = '#CCCCCC'

// A4 landscape: 841.89 × 595.28 pt
// Margins: 1.5 cm left/right (~42.5 pt), 3.5 cm top (~99 pt), 2.2 cm bottom (~62 pt)
const PAD_H = 42.5
const PAD_T = 99
const PAD_B = 64  // slightly larger than 62 to leave room for fixed footer

// Column auto-sizing (mirrors juno-investor-reports/report_generator.py _auto_col_widths):
// natural width = max(headerWidth, maxDataWidth) + CELL_PAD + BUFFER, then scaled to page.
// A4 landscape usable width ≈ 751pt (841.89 − 2×42.5 − 6pt row padding).
const CELL_PAD = 8
const BUFFER   = 6
const USABLE_W = 841.89 - PAD_H * 2 - 6

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: PAD_H,
    paddingTop:        PAD_T,
    paddingBottom:     PAD_B,
    fontFamily: 'Helvetica',
    fontSize:   9,
    color:      JUNO_DARK,
  },
  // ── Header ───────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    marginBottom: 4,
  },
  headerTitle:  { fontSize: 18, fontFamily: 'Helvetica-Bold', color: JUNO_DARK },
  headerPeriod: { fontSize: 10, color: '#888', marginTop: 3 },
  headerLogo:   { height: 45, objectFit: 'contain' },
  goldLine:     { height: 2, backgroundColor: MID_GREY, marginBottom: 8 },
  // ── Client sub-header ────────────────────────────────────────────────────────
  subHeader: {
    flexDirection: 'row', gap: 24, marginBottom: 12,
  },
  subField: { flexDirection: 'row', gap: 4 },
  subLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  subValue: { fontSize: 9 },
  // ── Section title ─────────────────────────────────────────────────────────
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: JUNO_DARK, marginBottom: 8 },
  // ── Table shared ─────────────────────────────────────────────────────────────
  tableHeaderRow: {
    flexDirection: 'row', backgroundColor: JUNO_NAVY,
    paddingVertical: 5, paddingHorizontal: 3,
  },
  tableDataRow: {
    flexDirection: 'row',
    paddingVertical: 4, paddingHorizontal: 3,
    borderBottomWidth: 0.25, borderBottomColor: MID_GREY,
  },
  tableDataRowAlt: {
    flexDirection: 'row', backgroundColor: LIGHT_GREY,
    paddingVertical: 4, paddingHorizontal: 3,
    borderBottomWidth: 0.25, borderBottomColor: MID_GREY,
  },
  tableTotalRow: {
    flexDirection: 'row', backgroundColor: LIGHT_GREY,
    paddingVertical: 5, paddingHorizontal: 3,
    borderTopWidth: 1.5, borderTopColor: JUNO_DARK,
  },
  thCell:       { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
  tdCell:       { fontSize: 8, color: JUNO_DARK },
  tdBold:       { fontSize: 8, fontFamily: 'Helvetica-Bold', color: JUNO_DARK },
  tdTotalBold:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: JUNO_DARK },
  tdTotalLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: JUNO_DARK, textAlign: 'right' },
  // ── Footer (absolute, repeated on every page via fixed prop) ──────────────
  footer: {
    position: 'absolute',
    bottom: 8,
    left: PAD_H,
    right: PAD_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: MID_GREY,
    paddingTop: 4,
  },
  footerLeft:   { flex: 1, fontSize: 7, color: '#888' },
  footerCenter: { flex: 2 },
  footerRight:  { flex: 1, textAlign: 'right', fontSize: 7, color: '#888' },
})

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtDDMMYY(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${String(y).slice(2)}`
}

function fmtLongDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtCurrency(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPrice(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
}

function fmtShares(n: number): string {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

// ── Column auto-sizing ────────────────────────────────────────────────────────

interface ColSpec { header: string; values: string[] }

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55
}

function computeColumnWidths(
  cols: ColSpec[],
  usableWidth: number,
  hdrSize: number,
  cellSize: number,
): number[] {
  const naturals = cols.map(col => {
    const hw = estimateTextWidth(col.header, hdrSize)
    const dw = col.values.length > 0
      ? Math.max(...col.values.map(v => estimateTextWidth(v, cellSize)))
      : 0
    return Math.max(hw, dw) + CELL_PAD + BUFFER
  })
  const total = naturals.reduce((s, w) => s + w, 0)
  const scale = usableWidth / total
  return naturals.map(w => Math.round(w * scale * 10) / 10)
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function PageHeader({ periodDate }: { periodDate: string }) {
  return (
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Portfolio Summary</Text>
          <Text style={styles.headerPeriod}>{fmtLongDate(periodDate)}</Text>
        </View>
        <Image src={LOGO_SRC} style={styles.headerLogo} />
      </View>
      <View style={styles.goldLine} />
    </>
  )
}

function PageFooter({ generatedOn }: { generatedOn: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerLeft}>{`Generated on ${fmtLongDate(generatedOn)}`}</Text>
      <View style={styles.footerCenter}>
        <Text style={{ fontSize: 7, color: '#888', textAlign: 'center' }}>{JUNO_NAME}</Text>
      </View>
      <Text
        style={styles.footerRight}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  )
}

// ── Template component ────────────────────────────────────────────────────────

export function PortfolioValuationStatementTemplate({
  client, period, lots, companySummary, grandTotals, showDividendColumn,
}: PortfolioStatementContext) {

  // Right-align shorthand for numeric columns
  const RA = { textAlign: 'right' as const }

  // ── Detail table column widths ─────────────────────────────────────────────
  // Grand total formatted values are included so the totals row never clips.
  const dColSpecs: ColSpec[] = [
    { header: 'Company',     values: lots.map(l => l.company_name) },
    { header: 'Share Class', values: lots.map(l => l.share_class_name) },
    { header: 'EIS',         values: lots.map(l => l.eis_status === 'yes' ? 'EIS' : '') },
    { header: 'Date',        values: lots.map(l => fmtDDMMYY(l.investment_date)) },
    { header: 'Orig. Price', values: lots.map(l => fmtPrice(l.original_share_price)) },
    { header: 'Shares',      values: lots.map(l => fmtShares(l.shares_purchased)) },
    { header: 'Subscribed',  values: [...lots.map(l => fmtCurrency(l.sum_subscribed)),   fmtCurrency(grandTotals.subscribed)] },
    { header: 'Curr. Price', values: lots.map(l => fmtPrice(l.current_share_price)) },
    { header: 'Curr. Value', values: [...lots.map(l => fmtCurrency(l.current_valuation)), fmtCurrency(grandTotals.current_valuation)] },
    { header: 'Change',      values: [...lots.map(l => fmtCurrency(l.valuation_change)),  fmtCurrency(grandTotals.valuation_change)] },
  ]
  if (showDividendColumn) {
    dColSpecs.push({ header: 'Dividends', values: [...lots.map(l => fmtCurrency(l.dividend_allocation)), fmtCurrency(grandTotals.dividends)] })
  }
  const dW = computeColumnWidths(dColSpecs, USABLE_W, 8, 8)
  const [dwCompany, dwClass, dwEis, dwDate, dwOrigPrice, dwShares, dwSub, dwCurrPrice, dwCurrVal, dwChange] = dW
  const dwDiv = dW[10] ?? 0

  // ── Summary table column widths ────────────────────────────────────────────
  const sColSpecs: ColSpec[] = [
    { header: 'Company',           values: companySummary.map(r => r.company_name) },
    { header: 'Share Class',       values: companySummary.map(r => r.share_class_name) },
    { header: 'Shares Purchased',  values: companySummary.map(r => fmtShares(r.total_shares)) },
    { header: 'Sum Subscribed',    values: [...companySummary.map(r => fmtCurrency(r.total_subscribed)),       fmtCurrency(grandTotals.subscribed)] },
    { header: 'Current Valuation', values: [...companySummary.map(r => fmtCurrency(r.total_current_valuation)), fmtCurrency(grandTotals.current_valuation)] },
    { header: 'Valuation Change',  values: [...companySummary.map(r => fmtCurrency(r.total_valuation_change)),  fmtCurrency(grandTotals.valuation_change)] },
  ]
  if (showDividendColumn) {
    sColSpecs.push({ header: 'Cumulative Dividend', values: [...companySummary.map(r => fmtCurrency(r.total_dividends)), fmtCurrency(grandTotals.dividends)] })
  }
  const sW = computeColumnWidths(sColSpecs, USABLE_W, 8, 8)
  const [swCompany, swClass, swShares, swSub, swCurrVal, swChange] = sW
  const swDiv = sW[6] ?? 0

  return (
    <Document>
      {/* ── Page 1: Per-lot detail table ─────────────────────────────────── */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        <PageHeader periodDate={period.date} />

        <View style={styles.subHeader}>
          <View style={styles.subField}>
            <Text style={styles.subLabel}>Full Name:</Text>
            <Text style={styles.subValue}>{client.full_name}</Text>
          </View>
          {client.investor_reference && (
            <View style={styles.subField}>
              <Text style={styles.subLabel}>Investor Reference:</Text>
              <Text style={styles.subValue}>{client.investor_reference}</Text>
            </View>
          )}
        </View>

        {/* Table header */}
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.thCell, { width: dwCompany }]}>Company</Text>
          <Text style={[styles.thCell, { width: dwClass }]}>Share Class</Text>
          <Text style={[styles.thCell, { width: dwEis }]}>EIS</Text>
          <Text style={[styles.thCell, { width: dwDate }]}>Date</Text>
          <Text style={[styles.thCell, { width: dwOrigPrice }]}>Orig. Price</Text>
          <Text style={[styles.thCell, { width: dwShares, ...RA }]}>Shares</Text>
          <Text style={[styles.thCell, { width: dwSub, ...RA }]}>Subscribed</Text>
          <Text style={[styles.thCell, { width: dwCurrPrice }]}>Curr. Price</Text>
          <Text style={[styles.thCell, { width: dwCurrVal, ...RA }]}>Curr. Value</Text>
          <Text style={[styles.thCell, { width: dwChange, ...RA }]}>Change</Text>
          {showDividendColumn && (
            <Text style={[styles.thCell, { width: dwDiv, ...RA }]}>Dividends</Text>
          )}
        </View>

        {/* Lot rows */}
        {lots.map((lot, i) => (
          <View
            key={lot.investment_id}
            style={i % 2 === 0 ? styles.tableDataRow : styles.tableDataRowAlt}
            wrap={false}
          >
            <Text style={[styles.tdCell, { width: dwCompany }]}>{lot.company_name}</Text>
            <Text style={[styles.tdCell, { width: dwClass }]}>{lot.share_class_name}</Text>
            <Text style={[styles.tdCell, { width: dwEis }]}>{lot.eis_status === 'yes' ? 'EIS' : ''}</Text>
            <Text style={[styles.tdCell, { width: dwDate }]}>{fmtDDMMYY(lot.investment_date)}</Text>
            <Text style={[styles.tdCell, { width: dwOrigPrice }]}>{fmtPrice(lot.original_share_price)}</Text>
            <Text style={[styles.tdCell, { width: dwShares, ...RA }]}>{fmtShares(lot.shares_purchased)}</Text>
            <Text style={[styles.tdCell, { width: dwSub, ...RA }]}>{fmtCurrency(lot.sum_subscribed)}</Text>
            <Text style={[styles.tdCell, { width: dwCurrPrice }]}>{fmtPrice(lot.current_share_price)}</Text>
            <Text style={[styles.tdCell, { width: dwCurrVal, ...RA }]}>{fmtCurrency(lot.current_valuation)}</Text>
            <Text style={[styles.tdCell, { width: dwChange, ...RA }]}>{fmtCurrency(lot.valuation_change)}</Text>
            {showDividendColumn && (
              <Text style={[styles.tdCell, { width: dwDiv, ...RA }]}>{fmtCurrency(lot.dividend_allocation)}</Text>
            )}
          </View>
        ))}

        {/* Totals row */}
        <View style={styles.tableTotalRow} wrap={false}>
          <Text style={[styles.tdTotalLabel, { width: dwCompany }]}>Total</Text>
          <Text style={[styles.tdCell,       { width: dwClass }]}>{''}</Text>
          <Text style={[styles.tdCell,       { width: dwEis }]}>{''}</Text>
          <Text style={[styles.tdCell,       { width: dwDate }]}>{''}</Text>
          <Text style={[styles.tdCell,       { width: dwOrigPrice }]}>{''}</Text>
          <Text style={[styles.tdCell,       { width: dwShares }]}>{''}</Text>
          <Text style={[styles.tdTotalBold,  { width: dwSub, ...RA }]}>{fmtCurrency(grandTotals.subscribed)}</Text>
          <Text style={[styles.tdCell,       { width: dwCurrPrice }]}>{''}</Text>
          <Text style={[styles.tdTotalBold,  { width: dwCurrVal, ...RA }]}>{fmtCurrency(grandTotals.current_valuation)}</Text>
          <Text style={[styles.tdTotalBold,  { width: dwChange, ...RA }]}>{fmtCurrency(grandTotals.valuation_change)}</Text>
          {showDividendColumn && (
            <Text style={[styles.tdTotalBold, { width: dwDiv, ...RA }]}>{fmtCurrency(grandTotals.dividends)}</Text>
          )}
        </View>

        <PageFooter generatedOn={period.generatedOn} />
      </Page>

      {/* ── Page 2: Summary by company ───────────────────────────────────── */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        <PageHeader periodDate={period.date} />

        <Text style={styles.sectionTitle}>Summary by Company</Text>

        {/* Table header */}
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.thCell, { width: swCompany }]}>Company</Text>
          <Text style={[styles.thCell, { width: swClass }]}>Share Class</Text>
          <Text style={[styles.thCell, { width: swShares, ...RA }]}>Shares Purchased</Text>
          <Text style={[styles.thCell, { width: swSub, ...RA }]}>Sum Subscribed</Text>
          <Text style={[styles.thCell, { width: swCurrVal, ...RA }]}>Current Valuation</Text>
          <Text style={[styles.thCell, { width: swChange, ...RA }]}>Valuation Change</Text>
          {showDividendColumn && (
            <Text style={[styles.thCell, { width: swDiv, ...RA }]}>Cumulative Dividend</Text>
          )}
        </View>

        {/* Summary rows */}
        {companySummary.map((row, i) => (
          <View
            key={`${row.company_name}:${row.share_class_name}`}
            style={i % 2 === 0 ? styles.tableDataRow : styles.tableDataRowAlt}
            wrap={false}
          >
            <Text style={[styles.tdCell, { width: swCompany }]}>{row.company_name}</Text>
            <Text style={[styles.tdCell, { width: swClass }]}>{row.share_class_name}</Text>
            <Text style={[styles.tdCell, { width: swShares, ...RA }]}>{fmtShares(row.total_shares)}</Text>
            <Text style={[styles.tdCell, { width: swSub, ...RA }]}>{fmtCurrency(row.total_subscribed)}</Text>
            <Text style={[styles.tdCell, { width: swCurrVal, ...RA }]}>{fmtCurrency(row.total_current_valuation)}</Text>
            <Text style={[styles.tdCell, { width: swChange, ...RA }]}>{fmtCurrency(row.total_valuation_change)}</Text>
            {showDividendColumn && (
              <Text style={[styles.tdCell, { width: swDiv, ...RA }]}>{fmtCurrency(row.total_dividends)}</Text>
            )}
          </View>
        ))}

        {/* Summary totals row */}
        <View style={styles.tableTotalRow} wrap={false}>
          <Text style={[styles.tdTotalLabel, { width: swCompany }]}>Total</Text>
          <Text style={[styles.tdCell,       { width: swClass }]}>{''}</Text>
          <Text style={[styles.tdCell,       { width: swShares }]}>{''}</Text>
          <Text style={[styles.tdTotalBold,  { width: swSub, ...RA }]}>{fmtCurrency(grandTotals.subscribed)}</Text>
          <Text style={[styles.tdTotalBold,  { width: swCurrVal, ...RA }]}>{fmtCurrency(grandTotals.current_valuation)}</Text>
          <Text style={[styles.tdTotalBold,  { width: swChange, ...RA }]}>{fmtCurrency(grandTotals.valuation_change)}</Text>
          {showDividendColumn && (
            <Text style={[styles.tdTotalBold, { width: swDiv, ...RA }]}>{fmtCurrency(grandTotals.dividends)}</Text>
          )}
        </View>

        <PageFooter generatedOn={period.generatedOn} />
      </Page>
    </Document>
  )
}
