import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { DealDocumentContext } from '../types'

export const applicationFormVersion = '1.0.0'

// ── Juno hard-coded bank constants ─────────────────────────────────────────────
const JUNO_BANK = {
  accountName: 'Juno Capital Partners LLP',
  sortCode: '60-83-71',
  account: '10335778',
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 45,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1a1a1a',
  },
  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    borderBottomStyle: 'solid',
  },
  headerLeft: { flex: 1 },
  headerCompany: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  headerSubtitle: { fontSize: 9, color: '#444', marginTop: 2 },
  headerLogo: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#2a5298', letterSpacing: 2 },
  // ── Sections ────────────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#888',
    borderBottomStyle: 'solid',
    paddingBottom: 3,
  },
  para: { marginBottom: 6, lineHeight: 1.5 },
  numberedRow: { flexDirection: 'row', marginBottom: 6 },
  numberedLabel: { width: 14, fontFamily: 'Helvetica-Bold' },
  numberedBody: { flex: 1, lineHeight: 1.5 },
  // ── Bank detail rows ────────────────────────────────────────────────────────
  bankTable: { marginLeft: 14, marginTop: 4, marginBottom: 8 },
  bankRow: { flexDirection: 'row', marginBottom: 3 },
  bankLabel: { width: 100, color: '#444' },
  bankValue: { flex: 1, fontFamily: 'Helvetica-Bold' },
  // ── Investor details table ───────────────────────────────────────────────────
  detailsTable: { marginTop: 4, marginBottom: 8 },
  detailsRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
    borderBottomStyle: 'solid',
    paddingVertical: 4,
  },
  detailsLabel: { width: 80, color: '#444', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  detailsValue: { flex: 1 },
  // ── Investment table ────────────────────────────────────────────────────────
  investTable: { marginTop: 4, marginBottom: 8 },
  investHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  investDataRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
    borderBottomStyle: 'solid',
  },
  investColName: { flex: 3 },
  investColPrice: { flex: 1.5, textAlign: 'right' },
  investColQty: { flex: 1, textAlign: 'right' },
  investColCost: { flex: 1.5, textAlign: 'right' },
  investHeaderText: { fontFamily: 'Helvetica-Bold', fontSize: 8 },
  // ── Page 2 elements ─────────────────────────────────────────────────────────
  feeBlock: { alignItems: 'flex-end', marginTop: 14, marginBottom: 14 },
  feeLine: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  signatureBlock: {
    borderWidth: 1,
    borderColor: '#aaa',
    borderStyle: 'solid',
    height: 80,
    marginTop: 16,
    marginBottom: 8,
  },
  signerName: { fontSize: 9, color: '#444', marginBottom: 16 },
  // ── Footer ──────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 45,
    right: 45,
    borderTopWidth: 0.5,
    borderTopColor: '#aaa',
    borderTopStyle: 'solid',
    paddingTop: 5,
    textAlign: 'center',
  },
  footerText: { fontSize: 7, color: '#666' },
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

/** Last word of a full name — used as surname in the payment reference. */
function surname(fullName: string): string {
  return fullName.trim().split(/\s+/).pop()?.toUpperCase() ?? fullName.toUpperCase()
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PageHeader({ companyName }: { companyName: string }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        <Text style={styles.headerCompany}>{companyName}</Text>
        <Text style={styles.headerSubtitle}>Application Form</Text>
      </View>
      <Text style={styles.headerLogo}>JUNO</Text>
    </View>
  )
}

function PageFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        Juno Capital Partners LLP  |  91 Wimpole Street, London W1G 0EF
      </Text>
    </View>
  )
}

function BankRows({
  accountName,
  sortCode,
  account,
  reference,
  iban,
  swiftBic,
}: {
  accountName: string | null
  sortCode: string | null
  account: string | null
  reference: string
  iban?: string | null
  swiftBic?: string | null
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
      {iban && (
        <View style={styles.bankRow}>
          <Text style={styles.bankLabel}>IBAN:</Text>
          <Text style={styles.bankValue}>{iban}</Text>
        </View>
      )}
      {swiftBic && (
        <View style={styles.bankRow}>
          <Text style={styles.bankLabel}>SWIFT/BIC:</Text>
          <Text style={styles.bankValue}>{swiftBic}</Text>
        </View>
      )}
      <View style={styles.bankRow}>
        <Text style={styles.bankLabel}>Reference:</Text>
        <Text style={styles.bankValue}>{reference}</Text>
      </View>
    </View>
  )
}

// ── Main template ──────────────────────────────────────────────────────────────

export function ApplicationFormTemplate({ deal, investor, investment, bankDetails }: DealDocumentContext) {
  const investorDisplayName = investor.investing_vehicle_name ?? investor.full_name
  const ref = `JUNO-${surname(investor.full_name)}`

  const addressParts = [investor.address_line1, investor.address_line2, investor.postcode]
    .filter(Boolean).join(', ')

  const shareName = [deal.company_name, deal.share_class_name].filter(Boolean).join(' ')

  const cost = (investment.shares != null && deal.share_price != null)
    ? investment.shares * deal.share_price
    : null

  const feePct = investment.fee_pct ?? 0
  const feePctDisplay = `${(feePct * 100).toFixed(1)}%`
  const feeAmount = cost != null ? cost * feePct : null

  return (
    <Document>

      {/* ── Page 1 ─────────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <PageHeader companyName={deal.company_name} />

        {/* Section: Procedure for Application */}
        <Text style={styles.sectionTitle}>Procedure for Application</Text>

        <View style={styles.numberedRow}>
          <Text style={styles.numberedLabel}>1.</Text>
          <View style={styles.numberedBody}>
            <Text>
              Payment for shares should be made by electronic transfer to the following account: -
            </Text>
            <BankRows
              accountName={bankDetails.account_name}
              sortCode={bankDetails.sort_code}
              account={bankDetails.account_number}
              reference={ref}
              iban={bankDetails.iban}
              swiftBic={bankDetails.swift_bic}
            />
          </View>
        </View>

        <Text style={styles.para}>
          If you choose to print and sign manually, then please complete the scanned form and:
          return the scanned form by email to erudd@junocapital.co.uk; and send the hard copy,
          &apos;wet ink&apos; form, to Juno Syndicate Ltd, 91 Wimpole St, London W1G 0EF.
        </Text>

        <View style={styles.numberedRow}>
          <Text style={styles.numberedLabel}>2.</Text>
          <View style={styles.numberedBody}>
            <Text>
              Payment for fees should be made by electronic transfer to the following account: -
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
          If you have any queries about these payments, please contact us on 020 3011 0783 or by email.
        </Text>

        {/* Section: Investor Details */}
        <Text style={styles.sectionTitle}>Investor Details</Text>
        <View style={styles.detailsTable}>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsLabel}>Name</Text>
            <Text style={styles.detailsValue}>{investorDisplayName}</Text>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsLabel}>Address</Text>
            <Text style={styles.detailsValue}>{addressParts || '—'}</Text>
          </View>
        </View>

        {/* Section: Investment Details */}
        <Text style={styles.sectionTitle}>Investment Details</Text>
        <Text style={styles.para}>
          I/We confirm that I/We wish to apply for the following investment and understand
          that this application is subject to the terms and conditions set out herein.
        </Text>

        <View style={styles.investTable}>
          <View style={styles.investHeaderRow}>
            <Text style={[styles.investColName,  styles.investHeaderText]}>Name</Text>
            <Text style={[styles.investColPrice, styles.investHeaderText]}>Price Per Share</Text>
            <Text style={[styles.investColQty,   styles.investHeaderText]}>Quantity</Text>
            <Text style={[styles.investColCost,  styles.investHeaderText]}>Cost</Text>
          </View>
          <View style={styles.investDataRow}>
            <Text style={styles.investColName}>{shareName || deal.company_name}</Text>
            <Text style={styles.investColPrice}>{fmt(deal.share_price)}</Text>
            <Text style={styles.investColQty}>{fmtNum(investment.shares)}</Text>
            <Text style={styles.investColCost}>{fmt(cost)}</Text>
          </View>
        </View>

        <PageFooter />
      </Page>

      {/* ── Page 2 ─────────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <PageHeader companyName={deal.company_name} />

        {/* Fee line */}
        <View style={styles.feeBlock}>
          <Text style={styles.feeLine}>Juno Fee ({feePctDisplay}):  {fmt(feeAmount)}</Text>
        </View>

        {/* Declaration */}
        <Text style={styles.para}>
          I confirm that I am investing in {deal.company_name} Limited and agree to the terms of
          this application. I understand that my application will be processed by Juno Capital
          Partners LLP on my behalf.
        </Text>

        {/* Signature space — Documenso overlays the signature field here at signing. */}
        <Text style={{ fontSize: 8, color: '#888', marginTop: 14, marginBottom: 4 }}>Signature</Text>
        <View style={styles.signatureBlock} />
        <Text style={styles.signerName}>{investorDisplayName}</Text>

        <PageFooter />
      </Page>

    </Document>
  )
}
