import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import path from 'path'
import type { DealDocumentContext } from '../types'

export const applicationFormV1_1Version = '1.1.0'

const LOGO_SRC = path.join(process.cwd(), 'public', 'juno-logo.png')
const JUNO_BANK = {
  accountName: 'Juno Capital Partners LLP',
  sortCode: '60-83-71',
  account: '10335778',
}
const TEAM_EMAIL = 'erudd@junocapital.co.uk'
const H_PAD = 71  // ~25 mm in points

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 62,
    paddingHorizontal: H_PAD,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    lineHeight: 1.35,
  },
  // ── Header ────────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 10,
    marginBottom: 18,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
    borderBottomStyle: 'solid',
  },
  headerLeft: { flex: 1 },
  headerCompany: { fontSize: 22, marginBottom: 4 },
  headerSubtitle: { fontSize: 16 },
  headerLogo: { height: 50, objectFit: 'contain' },
  // ── Footer ────────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 24,
    left: H_PAD,
    right: H_PAD,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#1a1a1a',
    borderTopStyle: 'solid',
    paddingTop: 5,
  },
  footerSpacer: { flex: 1 },
  footerCenter: { flex: 2, textAlign: 'center', fontSize: 9, color: '#666' },
  footerRight: { flex: 1, textAlign: 'right', fontSize: 9, color: '#666' },
  // ── Typography ────────────────────────────────────────────────────────────────
  sectionHeading: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginTop: 16,
    marginBottom: 7,
  },
  para: { marginBottom: 6 },
  bold: { fontFamily: 'Helvetica-Bold' },
  // ── Numbered list ─────────────────────────────────────────────────────────────
  numRow: { flexDirection: 'row', marginBottom: 6 },
  numLabel: { width: 22 },
  numBody: { flex: 1 },
  // ── Bank detail rows ──────────────────────────────────────────────────────────
  bankTable: { marginLeft: 22, marginTop: 5, marginBottom: 10 },
  bankRow: { flexDirection: 'row', marginBottom: 3 },
  bankLabel: { width: 100 },
  bankValue: { flex: 1, fontFamily: 'Helvetica-Bold' },
  // ── Investor details table ────────────────────────────────────────────────────
  detailsTable: {
    marginTop: 6,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: '#1a1a1a',
    borderStyle: 'solid',
  },
  detailsRowDivider: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
    borderBottomStyle: 'solid',
  },
  detailsRowLast: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  detailsLabel: { width: 80, fontFamily: 'Helvetica-Bold' },
  detailsValue: { flex: 1 },
  // ── Investment details table ──────────────────────────────────────────────────
  investTable: { marginTop: 6, marginBottom: 10 },
  investHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTopWidth: 0.5,
    borderTopColor: '#1a1a1a',
    borderTopStyle: 'solid',
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
    borderBottomStyle: 'solid',
  },
  investDataRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
    borderBottomStyle: 'solid',
  },
  iColName: { flex: 3 },
  iColPrice: { flex: 2, textAlign: 'right' },
  iColQty: { flex: 1.5, textAlign: 'right' },
  iColCost: { flex: 2, textAlign: 'right' },
  iHeaderText: { fontFamily: 'Helvetica-Bold' },
  // ── Page 2 ───────────────────────────────────────────────────────────────────
  feeLine: { textAlign: 'right', marginTop: 10 },
  signerName: { marginTop: 4 },
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-GB')
}

function lastName(fullName: string): string {
  return fullName.trim().split(/\s+/).pop() ?? fullName.trim()
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Header({ companyName }: { companyName: string }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        <Text style={styles.headerCompany}>{companyName}</Text>
        <Text style={styles.headerSubtitle}>Application Form</Text>
      </View>
      <Image style={styles.headerLogo} src={LOGO_SRC} />
    </View>
  )
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerSpacer} />
      <Text style={styles.footerCenter}>Juno Capital Partners LLP</Text>
      <Text
        style={styles.footerRight}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  )
}

function BankRows({
  accountName,
  sortCode,
  account,
  reference,
}: {
  accountName: string | null
  sortCode: string | null
  account: string | null
  reference: string
}) {
  return (
    <View style={styles.bankTable}>
      <View style={styles.bankRow}>
        <Text style={styles.bankLabel}>Account Name:</Text>
        <Text style={styles.bankValue}>{accountName ?? '—'}</Text>
      </View>
      <View style={styles.bankRow}>
        <Text style={styles.bankLabel}>Sort Code:</Text>
        <Text style={styles.bankValue}>{sortCode ?? '—'}</Text>
      </View>
      <View style={styles.bankRow}>
        <Text style={styles.bankLabel}>Account:</Text>
        <Text style={styles.bankValue}>{account ?? '—'}</Text>
      </View>
      <View style={styles.bankRow}>
        <Text style={styles.bankLabel}>Reference:</Text>
        <Text style={styles.bankValue}>{reference}</Text>
      </View>
    </View>
  )
}

// ── Main template ──────────────────────────────────────────────────────────────

export function ApplicationFormV1_1Template({
  deal,
  investor,
  investment,
  bankDetails,
}: DealDocumentContext) {
  // TODO: when vehicles gain their own registered address in the context
  // (fetchDealContext currently always uses the primary client's address),
  // use the vehicle address here instead and remove this fallback warn.
  if (investor.investing_vehicle_id) {
    console.warn(
      `[applicationFormV1_1] deal_investor ${investment.deal_investor_id}: ` +
      `investing_vehicle ${investor.investing_vehicle_id} ("${investor.investing_vehicle_name}") — ` +
      `falling back to primary client address (vehicle registered address not yet surfaced in context)`,
    )
  }

  const displayName = investor.investing_vehicle_name ?? investor.full_name
  const ref = `Juno/${lastName(investor.full_name)}`

  const addressParts = [investor.address_line1, investor.address_line2, investor.postcode]
    .filter(Boolean)
    .join(', ')

  const shareLabel = [deal.company_name, deal.share_class_name ?? deal.share_class, 'shares']
    .filter(Boolean)
    .join(' ')

  const cost =
    investment.shares != null && deal.share_price != null
      ? Math.round(investment.shares * deal.share_price * 100) / 100
      : null

  const feePct = investment.fee_pct ?? 0
  const feePctDisplay = `${(feePct * 100).toFixed(1)}%`
  const feeAmount = cost != null ? Math.round(cost * feePct * 100) / 100 : null

  return (
    <Document>

      {/* ── Page 1 ──────────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <Header companyName={deal.company_name} />

        <Text style={styles.sectionHeading}>Procedure for Application</Text>

        <Text style={styles.para}>
          Please check the figures entered in the Investment Details section below, amend if
          necessary and complete the online signature process.
        </Text>

        <View style={styles.numRow}>
          <Text style={styles.numLabel}>(1)</Text>
          <View style={styles.numBody}>
            <Text style={styles.para}>
              Payment for <Text style={styles.bold}>shares</Text> should be made by electronic
              transfer to the following account:
            </Text>
            <BankRows
              accountName={bankDetails.account_name}
              sortCode={bankDetails.sort_code}
              account={bankDetails.account_number}
              reference={ref}
            />
          </View>
        </View>

        <Text style={styles.para}>
          If you choose to print and sign manually, then please complete the scanned form and
          return the scanned form by email to {TEAM_EMAIL}; and send the hard copy, 'wet ink'
          form, to Juno Syndicate Ltd, 91 Wimpole Street, London W1G 0EF.
        </Text>

        <View style={styles.numRow}>
          <Text style={styles.numLabel}>(2)</Text>
          <View style={styles.numBody}>
            <Text style={styles.para}>
              Payment for <Text style={styles.bold}>fees</Text> should be made by electronic
              transfer to the following account:
            </Text>
            <BankRows
              accountName={JUNO_BANK.accountName}
              sortCode={JUNO_BANK.sortCode}
              account={JUNO_BANK.account}
              reference={ref}
            />
          </View>
        </View>

        <Text style={styles.para}>
          If you have any queries about these payments, please contact us on 020 3011 0783 or
          by email.
        </Text>

        <Text style={styles.sectionHeading}>Investor Details</Text>
        <View style={styles.detailsTable}>
          <View style={styles.detailsRowDivider}>
            <Text style={styles.detailsLabel}>Name</Text>
            <Text style={styles.detailsValue}>{displayName}</Text>
          </View>
          <View style={styles.detailsRowLast}>
            <Text style={styles.detailsLabel}>Address</Text>
            <Text style={styles.detailsValue}>{addressParts || '—'}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>Investment Details</Text>
        <Text style={styles.para}>
          <Text style={styles.bold}>Important: </Text>Please check the figures below, then
          transfer the share purchase amount to {deal.company_name} and the investment fee to Juno
        </Text>

        <View style={styles.investTable} wrap={false}>
          <View style={styles.investHeaderRow}>
            <Text style={[styles.iColName, styles.iHeaderText]}>Name</Text>
            <Text style={[styles.iColPrice, styles.iHeaderText]}>Price Per Share</Text>
            <Text style={[styles.iColQty, styles.iHeaderText]}>Quantity</Text>
            <Text style={[styles.iColCost, styles.iHeaderText]}>Cost</Text>
          </View>
          <View style={styles.investDataRow}>
            <Text style={styles.iColName}>{shareLabel}</Text>
            <Text style={styles.iColPrice}>{fmt(deal.share_price)}</Text>
            <Text style={styles.iColQty}>{fmtNum(investment.shares)}</Text>
            <Text style={styles.iColCost}>{fmt(cost)}</Text>
          </View>
        </View>

        <Footer />
      </Page>

      {/* ── Page 2 ──────────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <Header companyName={deal.company_name} />

        <Text style={styles.feeLine}>
          {`Juno Fee (${feePctDisplay}) `}
          <Text style={styles.bold}>{fmt(feeAmount)}</Text>
        </Text>

        <View style={{ height: 30 }} />

        <Text style={styles.para}>
          I confirm that I am investing in {deal.company_name}
        </Text>

        <View style={{ height: 50 }} />

        <Text style={styles.signerName}>{displayName}</Text>

        <Footer />
      </Page>

    </Document>
  )
}
