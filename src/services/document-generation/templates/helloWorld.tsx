import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { DealDocumentContext } from '../types'

export const helloWorldVersion = '1.0.0'

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontFamily: 'Helvetica',
    fontSize: 12,
    color: '#1a1a2e',
  },
  header: {
    marginBottom: 32,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a5298',
    borderBottomStyle: 'solid',
  },
  logo: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#2a5298',
    letterSpacing: 1,
  },
  logoSub: {
    fontSize: 9,
    color: '#888',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  testBadge: {
    backgroundColor: '#e8f0fb',
    borderRadius: 4,
    padding: '6 12',
    marginBottom: 20,
  },
  testBadgeText: {
    fontSize: 11,
    color: '#2a5298',
    fontFamily: 'Helvetica-Bold',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    color: '#666',
    width: 130,
  },
  value: {
    fontSize: 11,
    color: '#1a1a2e',
    flex: 1,
    fontFamily: 'Helvetica-Bold',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    borderTopStyle: 'solid',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#999',
  },
})

export function HelloWorldTemplate({ deal, investor, investment }: DealDocumentContext) {
  const generatedDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  const formattedAmount = investment.confirmed_amount != null
    ? `£${investment.confirmed_amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

  const dealLabel = [deal.title, deal.company_name].filter(Boolean).join(' — ') || '—'

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>JUNO OS</Text>
          <Text style={styles.logoSub}>Document Generation Infrastructure</Text>
        </View>

        {/* Test badge */}
        <View style={styles.testBadge}>
          <Text style={styles.testBadgeText}>Infrastructure Test Document — not for distribution</Text>
        </View>

        {/* Investor details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Investor</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{investor.full_name}</Text>
          </View>
          {investor.investing_vehicle_name && (
            <View style={styles.row}>
              <Text style={styles.label}>Investing vehicle</Text>
              <Text style={styles.value}>{investor.investing_vehicle_name}</Text>
            </View>
          )}
          {investor.nominee_name && (
            <View style={styles.row}>
              <Text style={styles.label}>Nominee</Text>
              <Text style={styles.value}>{investor.nominee_name}</Text>
            </View>
          )}
        </View>

        {/* Deal details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deal</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Deal</Text>
            <Text style={styles.value}>{dealLabel}</Text>
          </View>
          {deal.share_price != null && (
            <View style={styles.row}>
              <Text style={styles.label}>Share price</Text>
              <Text style={styles.value}>£{deal.share_price.toFixed(2)}</Text>
            </View>
          )}
          {deal.eis_qualifying && (
            <View style={styles.row}>
              <Text style={styles.label}>EIS qualifying</Text>
              <Text style={styles.value}>{deal.eis_qualifying}</Text>
            </View>
          )}
        </View>

        {/* Investment details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Investment</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Amount</Text>
            <Text style={styles.value}>{formattedAmount}</Text>
          </View>
          {investment.fee_pct != null && (
            <View style={styles.row}>
              <Text style={styles.label}>Fee rate</Text>
              <Text style={styles.value}>{(investment.fee_pct * 100).toFixed(2)}%</Text>
            </View>
          )}
          {investment.shares != null && (
            <View style={styles.row}>
              <Text style={styles.label}>Shares</Text>
              <Text style={styles.value}>{investment.shares.toLocaleString('en-GB')}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Juno Capital Partners LLP</Text>
          <Text style={styles.footerText}>Generated {generatedDate}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          } />
        </View>

      </Page>
    </Document>
  )
}
