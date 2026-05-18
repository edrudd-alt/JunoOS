import { formatDate } from '@/lib/utils'
import type { Client } from '@/types'

interface Props {
  lead: Client
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div style={{ fontSize: 11, color: '#999' }}>{label}</div>
      <div style={{ fontSize: 12, color: '#333' }}>{value || '—'}</div>
    </>
  )
}

function taxStatusLabel(s: string): string {
  const map: Record<string, string> = {
    eis: 'EIS qualifying', seis: 'SEIS qualifying',
    both: 'EIS & SEIS', neither: 'No EIS/SEIS',
  }
  return map[s] ?? s
}

export default function OverviewTab({ lead }: Props) {
  const address = [lead.address_line1, lead.address_line2, lead.city, lead.postcode]
    .filter(Boolean).join(', ') || null

  return (
    <div>
      {/* Contact details — shown in stub so the preview page is not empty */}
      <div
        style={{
          background: '#fff', border: '0.5px solid #e8e7e0',
          borderRadius: 8, padding: '16px 18px', marginBottom: 14,
          maxWidth: 520,
        }}
      >
        <div
          style={{
            fontSize: 11, fontWeight: 500, color: '#0f2744',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            marginBottom: 12,
          }}
        >
          Contact details
        </div>
        <div
          style={{
            display: 'grid', gridTemplateColumns: '110px 1fr',
            rowGap: 9, columnGap: 14,
          }}
        >
          <Row label="Email"              value={lead.email} />
          <Row label="Phone"              value={lead.phone} />
          <Row label="Address"            value={address} />
          <Row label="Date joined"        value={formatDate(lead.date_joined)} />
          <Row label="Tax status"         value={taxStatusLabel(lead.tax_status)} />
          <Row label="Investor reference" value={lead.investor_reference} />
          <Row label="Default fee rate"   value={lead.default_fee_rate != null ? `${lead.default_fee_rate}%` : null} />
          <Row label="Report email"       value={lead.report_delivery_email} />
        </div>
      </div>

      {/* Overview panels stub */}
      <div
        style={{
          background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8,
          padding: '40px 16px', textAlign: 'center', color: '#888',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0f2744', marginBottom: 6 }}>Overview</div>
        <p style={{ fontSize: 12, margin: 0 }}>
          Linked entities, reporting defaults, and membership documents panels coming in sub-stage 1.3.
        </p>
      </div>
    </div>
  )
}
