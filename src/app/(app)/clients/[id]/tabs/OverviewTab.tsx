import Link from 'next/link'
import { formatCurrency, formatPercent, formatDate, calcGainLoss } from '@/lib/utils'
import type { ClientRow } from '../ClientRecord'

const DOC_TYPE_LABELS: Record<string, string> = {
  kyc: 'KYC',
  poa: 'Power of attorney',
  membership_agreement: 'Membership agreement',
  suitability_assessment: 'Suitability assessment',
  source_of_funds: 'Source of funds',
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  own_name: 'Own name', family: 'Family', corporate: 'Corporate',
}

const HOLDING_LABELS: Record<string, string> = {
  direct: 'Direct', nominee: 'Nominee', both: 'Direct + Nominee',
}

interface MembershipDoc {
  id: string
  type: string
  filename: string
  storage_url: string | null
  document_date: string | null
}

interface PortfolioRow {
  client_id: string
  total_invested: number
  current_value: number
  gain_loss: number
}

interface Props {
  client: ClientRow
  linkedEntities: ClientRow[]
  portfolioRows: PortfolioRow[]
  membershipDocs: MembershipDoc[]
}

export default function OverviewTab({ client, linkedEntities, portfolioRows, membershipDocs }: Props) {
  const isLead = !client.lead_investor_id

  // Build per-entity portfolio lookup
  const portfolioByEntity: Record<string, { totalInvested: number; currentValue: number; gainLoss: number }> = {}
  for (const row of portfolioRows) {
    const cid = row.client_id
    if (!portfolioByEntity[cid]) portfolioByEntity[cid] = { totalInvested: 0, currentValue: 0, gainLoss: 0 }
    portfolioByEntity[cid].totalInvested += Number(row.total_invested ?? 0)
    portfolioByEntity[cid].currentValue += Number(row.current_value ?? 0)
    portfolioByEntity[cid].gainLoss += Number(row.gain_loss ?? 0)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* LEFT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Contact details */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>Contact details</div>
          <dl style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px 0', fontSize: 12 }}>
            <dt style={{ color: '#888' }}>Email</dt>
            <dd style={{ margin: 0 }}>{client.email || '—'}</dd>
            <dt style={{ color: '#888' }}>Phone</dt>
            <dd style={{ margin: 0 }}>{client.phone || '—'}</dd>
            <dt style={{ color: '#888' }}>Address</dt>
            <dd style={{ margin: 0 }}>
              {[client.address_line1, client.address_line2, client.city, client.postcode]
                .filter(Boolean).join(', ') || '—'}
            </dd>
            <dt style={{ color: '#888' }}>Date joined</dt>
            <dd style={{ margin: 0 }}>{formatDate(client.date_joined)}</dd>
            <dt style={{ color: '#888' }}>Tax status</dt>
            <dd style={{ margin: 0 }}>{taxStatusLabel(client.tax_status)}</dd>
            <dt style={{ color: '#888' }}>Investor ref</dt>
            <dd style={{ margin: 0 }}>{client.investor_reference || '—'}</dd>
          </dl>

          {/* Membership documents */}
          {membershipDocs.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '0.5px solid #e8e7e0' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#888', marginBottom: 8 }}>Membership documents</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {membershipDocs.map((doc) => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="pill pill-grey" style={{ fontSize: 10 }}>
                        {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                      </span>
                      <span style={{ fontSize: 11, color: '#555' }}>{doc.filename}</span>
                    </div>
                    {doc.storage_url && (
                      <a
                        href={doc.storage_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, color: '#185fa5', textDecoration: 'none' }}
                      >
                        View
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Reporting defaults */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>Reporting defaults</div>
          <div style={{ fontSize: 12, color: '#888' }}>
            Delivery: {client.report_delivery_method === 'email'
              ? client.report_delivery_email || 'Email (not set)'
              : 'Download only'}
          </div>
        </div>

        {/* Linked entities — shown only on lead */}
        {isLead && linkedEntities.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', fontSize: 12, fontWeight: 500 }}>
              Linked entities ({linkedEntities.length})
            </div>

            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Type</th>
                  <th>Invested</th>
                  <th>Current value</th>
                  <th>Change</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {/* Aggregated row */}
                <LinkedEntityRow
                  name="All entities"
                  entityType={null}
                  holdingLocation={null}
                  portfolio={Object.values(portfolioByEntity).reduce(
                    (acc, p) => ({
                      totalInvested: acc.totalInvested + p.totalInvested,
                      currentValue: acc.currentValue + p.currentValue,
                      gainLoss: acc.gainLoss + p.gainLoss,
                    }),
                    { totalInvested: 0, currentValue: 0, gainLoss: 0 }
                  )}
                  linkId={null}
                  bold
                />
                {linkedEntities.map(entity => (
                  <LinkedEntityRow
                    key={entity.id}
                    name={entity.full_name}
                    entityType={entity.entity_type}
                    holdingLocation={entity.holding_location}
                    portfolio={portfolioByEntity[entity.id] ?? { totalInvested: 0, currentValue: 0, gainLoss: 0 }}
                    linkId={entity.id}
                    bold={false}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function LinkedEntityRow({
  name, entityType, holdingLocation, portfolio, linkId, bold,
}: {
  name: string
  entityType: string | null
  holdingLocation: string | null
  portfolio: { totalInvested: number; currentValue: number; gainLoss: number }
  linkId: string | null
  bold: boolean
}) {
  const { pct } = calcGainLoss(portfolio.totalInvested, portfolio.currentValue)

  return (
    <tr>
      <td style={{ fontWeight: bold ? 600 : 400 }}>
        {linkId ? (
          <Link href={`/clients/${linkId}`} style={{ color: '#0f2744', textDecoration: 'none' }}>
            {name}
          </Link>
        ) : name}
      </td>
      <td>
        {entityType ? (
          <span className="pill pill-grey">{ENTITY_TYPE_LABELS[entityType] ?? entityType}</span>
        ) : '—'}
      </td>
      <td>{formatCurrency(portfolio.totalInvested)}</td>
      <td style={{ fontWeight: 500 }}>{formatCurrency(portfolio.currentValue)}</td>
      <td className={portfolio.gainLoss >= 0 ? 'text-positive' : 'text-negative'}>
        {portfolio.gainLoss >= 0 ? '+' : ''}{formatCurrency(portfolio.gainLoss)}
        <div style={{ fontSize: 10 }}>{formatPercent(pct)}</div>
      </td>
      <td>
        {holdingLocation ? (
          <span className="pill pill-grey" style={{ fontSize: 10 }}>
            {ENTITY_TYPE_LABELS[holdingLocation] ?? holdingLocation}
          </span>
        ) : '—'}
      </td>
    </tr>
  )
}

function taxStatusLabel(s: string) {
  return { eis: 'EIS', seis: 'SEIS', both: 'EIS & SEIS', neither: 'No EIS/SEIS' }[s] ?? s
}
