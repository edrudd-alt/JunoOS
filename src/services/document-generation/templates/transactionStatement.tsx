import path from 'path'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { TransactionDocumentContext } from '../types'

export const transactionStatementVersion = '1.0.0'

const LOGO_SRC  = path.join(process.cwd(), 'public', 'juno-logo.png')
const JUNO_NAME = 'Juno Capital Partners LLP'
const H_PAD     = 71  // ~25 mm in points
const NAVY      = '#0f2744'
const DIVIDER   = '#e0e0d8'
// TODO: extract NAVY, DIVIDER, H_PAD into a shared pdfTheme.ts once a second PDF template is built

const styles = StyleSheet.create({
  page: {
    paddingTop: 48, paddingBottom: 24, paddingHorizontal: H_PAD,
    fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a',
    lineHeight: 1.35, flexDirection: 'column',
  },
  // ── Header ───────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end', paddingBottom: 10, marginBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: '#1a1a1a',
  },
  headerLeft:     { flex: 1, flexDirection: 'column' },
  headerTitle:    { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  headerSubtitle: { fontSize: 15 },
  headerDate:     { fontSize: 10, color: '#888', marginTop: 3 },
  headerLogo:     { height: 50, objectFit: 'contain' },
  // ── Detail line ──────────────────────────────────────────────────────────────
  detailBlock: { marginBottom: 20 },
  detailRow:   { flexDirection: 'row' },
  detailLabel: { width: 80, fontFamily: 'Helvetica-Bold' },
  detailValue: { flex: 1 },
  // ── Table ────────────────────────────────────────────────────────────────────
  tableHeaderRow: {
    flexDirection: 'row', backgroundColor: NAVY,
    paddingVertical: 6, paddingHorizontal: 4,
  },
  thCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
  tableDataRow: {
    flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 4,
    borderBottomWidth: 0.25, borderBottomColor: DIVIDER,
  },
  tableSubRow: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4,
    borderBottomWidth: 0.25, borderBottomColor: DIVIDER,
  },
  tableTotalRow: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4,
  },
  tdCell:     { fontSize: 10 },
  tdCellBold: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  // Column flex widths — must match between header and data rows
  colCompany: { flex: 2.0 },
  colClass:   { flex: 1.5 },
  colEIS:     { flex: 0.9 },
  colDate:    { flex: 1.5 },
  colPrice:   { flex: 1.2 },
  colShares:  { flex: 1.2, textAlign: 'right' },
  colSum:     { flex: 1.5, textAlign: 'right' },
  // EIS pill
  eisPill:     { backgroundColor: '#d0f0e6', borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5, alignSelf: 'flex-start' },
  eisPillText: { fontSize: 8, color: '#0a5a3d', fontFamily: 'Helvetica-Bold' },
  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    marginTop: 'auto', flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 0.5, borderTopColor: '#1a1a1a', paddingTop: 5,
  },
  footerLeft:   { flex: 1, fontSize: 9, color: '#666' },
  footerCenter: { flex: 2, textAlign: 'center', fontSize: 9, color: '#666' },
  footerRight:  { flex: 1, textAlign: 'right', fontSize: 9, color: '#666' },
})

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtShortDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtLongDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtCurrency(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtShares(n: number): string {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

// ── Template component ────────────────────────────────────────────────────────

export function TransactionStatementTemplate({
  investor, company, investment,
}: TransactionDocumentContext) {
  const feePct      = investment.fee_pct
  const feeAmount   = feePct != null
    ? Math.round(investment.sum_subscribed * feePct * 100) / 100
    : null
  const totalCost   = feeAmount != null
    ? investment.sum_subscribed + feeAmount
    : investment.sum_subscribed
  const feePctLabel = feePct != null
    ? `${parseFloat((feePct * 100).toFixed(10))}%`
    : ''

  const generatedDate  = new Date()
  const generatedLabel = fmtLongDate(generatedDate)

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Transaction Statement</Text>
            <Text style={styles.headerSubtitle}>{company.name}</Text>
            <Text style={styles.headerDate}>{generatedLabel}</Text>
          </View>
          <Image src={LOGO_SRC} style={styles.headerLogo} />
        </View>

        {/* Detail line */}
        <View style={styles.detailBlock}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Full Name:</Text>
            <Text style={styles.detailValue}>{investor.full_name}</Text>
          </View>
        </View>

        {/* Transaction table */}
        <View>
          {/* Header row */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thCell, styles.colCompany]}>Company</Text>
            <Text style={[styles.thCell, styles.colClass]}>Share Class</Text>
            <Text style={[styles.thCell, styles.colEIS]}>EIS Status</Text>
            <Text style={[styles.thCell, styles.colDate]}>Investment Date</Text>
            <Text style={[styles.thCell, styles.colPrice]}>Purchase Price</Text>
            <Text style={[styles.thCell, styles.colShares]}>Shares Purchased</Text>
            <Text style={[styles.thCell, styles.colSum]}>Sum Subscribed</Text>
          </View>

          {/* Row 1: transaction data */}
          <View style={styles.tableDataRow}>
            <Text style={[styles.tdCell, styles.colCompany]}>{company.name}</Text>
            <Text style={[styles.tdCell, styles.colClass]}>{investment.share_class}</Text>
            <View style={styles.colEIS}>
              {investment.eis_status === 'yes' && (
                <View style={styles.eisPill}>
                  <Text style={styles.eisPillText}>EIS</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tdCell, styles.colDate]}>{fmtShortDate(investment.investment_date)}</Text>
            <Text style={[styles.tdCell, styles.colPrice]}>{fmtCurrency(investment.original_share_price)}</Text>
            <Text style={[styles.tdCell, styles.colShares]}>{fmtShares(investment.shares_purchased)}</Text>
            <Text style={[styles.tdCell, styles.colSum]}>{fmtCurrency(investment.sum_subscribed)}</Text>
          </View>

          {/* Row 2: Juno Fee (omitted when no fee_pct) */}
          {feeAmount != null && (
            <View style={styles.tableSubRow}>
              <Text style={[styles.tdCell, styles.colCompany]}>{`Juno Fee (${feePctLabel})`}</Text>
              <Text style={[styles.tdCell, styles.colClass]}>{''}</Text>
              <View style={styles.colEIS} />
              <Text style={[styles.tdCell, styles.colDate]}>{''}</Text>
              <Text style={[styles.tdCell, styles.colPrice]}>{''}</Text>
              <Text style={[styles.tdCell, styles.colShares]}>{''}</Text>
              <Text style={[styles.tdCell, styles.colSum]}>{fmtCurrency(feeAmount)}</Text>
            </View>
          )}

          {/* Row 3: Total Cost */}
          <View style={styles.tableTotalRow}>
            <Text style={[styles.tdCellBold, styles.colCompany]}>Total Cost</Text>
            <Text style={[styles.tdCell, styles.colClass]}>{''}</Text>
            <View style={styles.colEIS} />
            <Text style={[styles.tdCell, styles.colDate]}>{''}</Text>
            <Text style={[styles.tdCell, styles.colPrice]}>{''}</Text>
            <Text style={[styles.tdCell, styles.colShares]}>{''}</Text>
            <Text style={[styles.tdCellBold, styles.colSum]}>{fmtCurrency(totalCost)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerLeft}>{`Generated on ${generatedLabel}`}</Text>
          <Text style={styles.footerCenter}>{JUNO_NAME}</Text>
          <Text
            style={styles.footerRight}
            render={({ pageNumber }) => `Page ${pageNumber}`}
            fixed
          />
        </View>

      </Page>
    </Document>
  )
}
