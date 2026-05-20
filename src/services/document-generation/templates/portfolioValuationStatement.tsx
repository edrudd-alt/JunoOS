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
  // ── Detail table columns (Page 1) ─────────────────────────────────────────
  //
  // Column auto-sizing measures the max content width per column (header
  // label + every data cell, formatted) plus a fixed cell padding and a
  // small buffer, then scales all columns proportionally to fill the page.
  // Ported from juno-investor-reports/report_generator.py _auto_col_widths.
  // Critical: measure against the SAME font and font size used to render
  // the cells. Mismatched measurement is the typical cause of crushed or
  // over-spaced columns.
  //
  // A4 landscape usable width ≈ 751pt (841.89 − 2×42.5 − 6pt row padding).
  // Natural widths below estimated at Helvetica 8pt (avg digit ≈ 4.45pt,
  // avg alpha ≈ 4pt) + CELL_PAD=8 + BUFFER=6 = 14pt extra per column,
  // then scaled to 751pt. Header label is included in the max().
  dColCompany:   { flex: 1.1 },                          // "Sky Medical"  ~45pt → 59pt nat → 85pt final
  dColClass:     { flex: 1.3 },                          // "B Preference" ~53pt → 67pt nat → 97pt final
  dColEis:       { flex: 0.5 },                          // "EIS"          ~13pt → 27pt nat → 37pt final
  dColDate:      { flex: 0.9 },                          // "DD/MM/YY"     ~33pt → 47pt nat → 68pt final
  dColOrigPrice: { flex: 1.0 },                          // hdr "Orig. Price" ~39pt → 53pt nat → 77pt final
  dColShares:    { flex: 0.8,  textAlign: 'right' },     // "10,000"       ~26pt → 40pt nat → 58pt final
  dColSub:       { flex: 1.1,  textAlign: 'right' },     // "£25,000.00"   ~41pt → 55pt nat → 80pt final
  dColCurrPrice: { flex: 1.0 },                          // hdr "Curr. Price" ~40pt → 54pt nat → 78pt final
  dColCurrVal:   { flex: 1.2,  textAlign: 'right' },     // hdr "Curr. Value" ~47pt → 61pt nat → 88pt final
  dColChange:    { flex: 1.1,  textAlign: 'right' },     // "£25,000.00"   ~41pt → 55pt nat → 80pt final
  dColDiv:       { flex: 1.1,  textAlign: 'right' },     // same as Change
  // ── Summary table columns (Page 2) ────────────────────────────────────────
  // Same approach: fewer columns → each gets more space. Header labels
  // ("Shares Purchased", "Current Valuation") drive the wider columns.
  sColCompany: { flex: 1.3 },                            // "Sky Medical"  ~59pt nat → 98pt final
  sColClass:   { flex: 1.5 },                            // "B Preference" ~67pt nat → 112pt final
  sColShares:  { flex: 1.8,  textAlign: 'right' },       // hdr 16 chars   ~82pt nat → 137pt final
  sColSub:     { flex: 1.6,  textAlign: 'right' },       // hdr "Sum Subscribed" → 123pt final
  sColCurrVal: { flex: 1.9,  textAlign: 'right' },       // hdr "Current Valuation" → 145pt final
  sColChange:  { flex: 1.8,  textAlign: 'right' },       // hdr "Valuation Change" → 137pt final
  sColDiv:     { flex: 1.8,  textAlign: 'right' },       // hdr "Cumulative Dividend" → same
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
          <Text style={[styles.thCell, styles.dColCompany]}>Company</Text>
          <Text style={[styles.thCell, styles.dColClass]}>Share Class</Text>
          <Text style={[styles.thCell, styles.dColEis]}>EIS</Text>
          <Text style={[styles.thCell, styles.dColDate]}>Date</Text>
          <Text style={[styles.thCell, styles.dColOrigPrice]}>Orig. Price</Text>
          <Text style={[styles.thCell, styles.dColShares]}>Shares</Text>
          <Text style={[styles.thCell, styles.dColSub]}>Subscribed</Text>
          <Text style={[styles.thCell, styles.dColCurrPrice]}>Curr. Price</Text>
          <Text style={[styles.thCell, styles.dColCurrVal]}>Curr. Value</Text>
          <Text style={[styles.thCell, styles.dColChange]}>Change</Text>
          {showDividendColumn && (
            <Text style={[styles.thCell, styles.dColDiv]}>Dividends</Text>
          )}
        </View>

        {/* Lot rows */}
        {lots.map((lot, i) => (
          <View
            key={lot.investment_id}
            style={i % 2 === 0 ? styles.tableDataRow : styles.tableDataRowAlt}
            wrap={false}
          >
            <Text style={[styles.tdCell, styles.dColCompany]}>{lot.company_name}</Text>
            <Text style={[styles.tdCell, styles.dColClass]}>{lot.share_class_name}</Text>
            <Text style={[styles.tdCell, styles.dColEis]}>{lot.eis_status === 'yes' ? 'EIS' : ''}</Text>
            <Text style={[styles.tdCell, styles.dColDate]}>{fmtDDMMYY(lot.investment_date)}</Text>
            <Text style={[styles.tdCell, styles.dColOrigPrice]}>{fmtPrice(lot.original_share_price)}</Text>
            <Text style={[styles.tdCell, styles.dColShares]}>{fmtShares(lot.shares_purchased)}</Text>
            <Text style={[styles.tdCell, styles.dColSub]}>{fmtCurrency(lot.sum_subscribed)}</Text>
            <Text style={[styles.tdCell, styles.dColCurrPrice]}>{fmtPrice(lot.current_share_price)}</Text>
            <Text style={[styles.tdCell, styles.dColCurrVal]}>{fmtCurrency(lot.current_valuation)}</Text>
            <Text style={[styles.tdCell, styles.dColChange]}>{fmtCurrency(lot.valuation_change)}</Text>
            {showDividendColumn && (
              <Text style={[styles.tdCell, styles.dColDiv]}>{fmtCurrency(lot.dividend_allocation)}</Text>
            )}
          </View>
        ))}

        {/* Totals row */}
        <View style={styles.tableTotalRow} wrap={false}>
          <Text style={[styles.tdTotalLabel, styles.dColCompany]}>Total</Text>
          <Text style={[styles.tdCell,       styles.dColClass]}>{''}</Text>
          <Text style={[styles.tdCell,       styles.dColEis]}>{''}</Text>
          <Text style={[styles.tdCell,       styles.dColDate]}>{''}</Text>
          <Text style={[styles.tdCell,       styles.dColOrigPrice]}>{''}</Text>
          <Text style={[styles.tdCell,       styles.dColShares]}>{''}</Text>
          <Text style={[styles.tdTotalBold,  styles.dColSub]}>{fmtCurrency(grandTotals.subscribed)}</Text>
          <Text style={[styles.tdCell,       styles.dColCurrPrice]}>{''}</Text>
          <Text style={[styles.tdTotalBold,  styles.dColCurrVal]}>{fmtCurrency(grandTotals.current_valuation)}</Text>
          <Text style={[styles.tdTotalBold,  styles.dColChange]}>{fmtCurrency(grandTotals.valuation_change)}</Text>
          {showDividendColumn && (
            <Text style={[styles.tdTotalBold, styles.dColDiv]}>{fmtCurrency(grandTotals.dividends)}</Text>
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
          <Text style={[styles.thCell, styles.sColCompany]}>Company</Text>
          <Text style={[styles.thCell, styles.sColClass]}>Share Class</Text>
          <Text style={[styles.thCell, styles.sColShares]}>Shares Purchased</Text>
          <Text style={[styles.thCell, styles.sColSub]}>Sum Subscribed</Text>
          <Text style={[styles.thCell, styles.sColCurrVal]}>Current Valuation</Text>
          <Text style={[styles.thCell, styles.sColChange]}>Valuation Change</Text>
          {showDividendColumn && (
            <Text style={[styles.thCell, styles.sColDiv]}>Cumulative Dividend</Text>
          )}
        </View>

        {/* Summary rows */}
        {companySummary.map((row, i) => (
          <View
            key={`${row.company_name}:${row.share_class_name}`}
            style={i % 2 === 0 ? styles.tableDataRow : styles.tableDataRowAlt}
            wrap={false}
          >
            <Text style={[styles.tdCell, styles.sColCompany]}>{row.company_name}</Text>
            <Text style={[styles.tdCell, styles.sColClass]}>{row.share_class_name}</Text>
            <Text style={[styles.tdCell, styles.sColShares]}>{fmtShares(row.total_shares)}</Text>
            <Text style={[styles.tdCell, styles.sColSub]}>{fmtCurrency(row.total_subscribed)}</Text>
            <Text style={[styles.tdCell, styles.sColCurrVal]}>{fmtCurrency(row.total_current_valuation)}</Text>
            <Text style={[styles.tdCell, styles.sColChange]}>{fmtCurrency(row.total_valuation_change)}</Text>
            {showDividendColumn && (
              <Text style={[styles.tdCell, styles.sColDiv]}>{fmtCurrency(row.total_dividends)}</Text>
            )}
          </View>
        ))}

        {/* Summary totals row */}
        <View style={styles.tableTotalRow} wrap={false}>
          <Text style={[styles.tdTotalLabel, styles.sColCompany]}>Total</Text>
          <Text style={[styles.tdCell,       styles.sColClass]}>{''}</Text>
          <Text style={[styles.tdCell,       styles.sColShares]}>{''}</Text>
          <Text style={[styles.tdTotalBold,  styles.sColSub]}>{fmtCurrency(grandTotals.subscribed)}</Text>
          <Text style={[styles.tdTotalBold,  styles.sColCurrVal]}>{fmtCurrency(grandTotals.current_valuation)}</Text>
          <Text style={[styles.tdTotalBold,  styles.sColChange]}>{fmtCurrency(grandTotals.valuation_change)}</Text>
          {showDividendColumn && (
            <Text style={[styles.tdTotalBold, styles.sColDiv]}>{fmtCurrency(grandTotals.dividends)}</Text>
          )}
        </View>

        <PageFooter generatedOn={period.generatedOn} />
      </Page>
    </Document>
  )
}
