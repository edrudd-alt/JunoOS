'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/Breadcrumb'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPrice, formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Investment {
  id:                   string
  client_id:            string
  company_id:           string
  deal_id:              string | null
  share_class:          string
  investment_date:      string
  original_share_price: number
  shares_purchased:     number
  sum_subscribed:       number
  eis_status:           string
  holding_entity:       string | null
  holding_location:     string
  held_by_entity_id:    string | null
  fee_rate:             number | null
  fee_amount:           number | null
  completion_date:      string | null
  status:               string
  fund_type:            string | null
}

interface Deal {
  id:                   string
  deal_type:            string
  share_class:          string | null
  share_price:          number | null
  eis_qualifying:       string | null
  completion_checklist: Record<string, unknown> | null
  company_id:           string | null
}

interface Document {
  id:            string
  filename:      string
  type:          string
  storage_url:   string | null
  document_date: string | null
}

interface Props {
  investment:       Record<string, unknown>
  deal:             Record<string, unknown> | null
  company:          Record<string, unknown> | null
  client:           Record<string, unknown> | null
  heldByEntity:     { full_name: string } | null
  currentValuation: Record<string, unknown> | null
  documents:        Record<string, unknown>[]
}

// ─── Config ───────────────────────────────────────────────────────────────────

const DEAL_TYPE_LABELS: Record<string, string> = {
  new_investment: 'New investment',
  follow_on:      'Follow-on',
  full_exit:      'Full exit',
  partial_exit:   'Partial exit',
  exit:           'Exit',
  kyc:            'KYC / Onboarding',
  side_letter:    'Side letter',
  membership:     'Membership',
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'pill-amber' },
  active:  { label: 'Active',  cls: 'pill-green' },
  exited:  { label: 'Exited',  cls: 'pill-grey'  },
}

const DOC_TYPE_LABELS: Record<string, string> = {
  eis_certificate:       'EIS certificate',
  transaction_statement: 'Transaction statement',
  application_form:      'Application form',
  investment_agreement:  'Investment agreement',
  subscription_agreement: 'Subscription agreement',
  share_certificate:     'Share certificate',
  other:                 'Other',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvestmentCockpit({
  investment: investmentRaw,
  deal: dealRaw,
  company: companyRaw,
  client: clientRaw,
  heldByEntity,
  currentValuation: valuationRaw,
  documents: documentsRaw,
}: Props) {
  const investment  = investmentRaw  as unknown as Investment
  const deal        = dealRaw        as unknown as Deal | null
  const company     = companyRaw     as unknown as { id: string; name: string } | null
  const client      = clientRaw      as unknown as { id: string; full_name: string; email: string | null } | null
  const valuation   = valuationRaw   as unknown as { share_price: number; valuation_date: string } | null
  const documents   = documentsRaw   as unknown as Document[]

  const supabase = createClient()

  const clientId = investment.client_id
  const isEis    = investment.eis_status === 'yes' || investment.eis_status === 'tbc'

  // Initialise checklist from deal.completion_checklist.per_investor[clientId]
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    if (!deal?.completion_checklist) return {}
    const perInvestor = (deal.completion_checklist.per_investor ?? {}) as Record<string, Record<string, boolean>>
    return perInvestor[clientId] ?? {}
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [toast,  setToast]  = useState(false)

  const saveChecklist = useCallback(async (updated: Record<string, boolean>) => {
    if (!deal) return
    setSaving(true)
    const { data: dealRow } = await supabase
      .from('deals')
      .select('completion_checklist')
      .eq('id', deal.id)
      .single()
    const existing       = (dealRow?.completion_checklist ?? {}) as Record<string, unknown>
    const perInvestor    = (existing.per_investor ?? {}) as Record<string, unknown>
    await supabase.from('deals').update({
      completion_checklist: {
        ...existing,
        per_investor: { ...perInvestor, [clientId]: updated },
      },
    }).eq('id', deal.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [deal, clientId, supabase])

  function toggleItem(key: string) {
    const updated = { ...checklist, [key]: !checklist[key] }
    setChecklist(updated)
    saveChecklist(updated)
  }

  function showToast() {
    setToast(true)
    setTimeout(() => setToast(false), 2500)
  }

  // Derived values
  const status        = STATUS_CONFIG[investment.status] ?? { label: investment.status, cls: 'pill-grey' }
  const currentValue  = valuation ? investment.shares_purchased * valuation.share_price : null
  const gainLoss      = currentValue != null ? currentValue - investment.sum_subscribed : null
  const pctChange     = gainLoss != null && investment.sum_subscribed > 0
    ? gainLoss / investment.sum_subscribed * 100
    : null

  const dealTypeLabel  = deal ? (DEAL_TYPE_LABELS[deal.deal_type] ?? deal.deal_type) : null
  const companyName    = company?.name ?? 'Unknown company'
  const clientName     = client?.full_name ?? 'Unknown investor'
  const holdingDisplay = heldByEntity?.full_name ?? investment.holding_entity ?? clientName

  return (
    <div style={{ maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Breadcrumb items={[
          { label: 'Deals', href: '/deals' },
          ...(deal ? [{ label: companyName, href: `/deals/${deal.id}` }] : []),
          { label: clientName },
        ]} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 4 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>
              {clientName}
              <span style={{ fontWeight: 400, color: '#555' }}> — {companyName}</span>
            </h1>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
              {[
                dealTypeLabel,
                investment.share_class,
                investment.investment_date ? formatDate(investment.investment_date) : null,
              ].filter(Boolean).join(' · ')}
            </div>
            <span className={`pill ${status.cls}`}>{status.label}</span>
          </div>
          {deal && (
            <Link
              href={`/deals/${deal.id}?tab=post_deal`}
              className="btn btn-secondary"
              style={{ fontSize: 12, whiteSpace: 'nowrap' }}
            >
              ← Back to deal
            </Link>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Investment details card */}
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', marginBottom: 14 }}>
            Investment details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
            <DetailRow label="Amount invested"   value={formatCurrency(investment.sum_subscribed)} />
            <DetailRow label="Shares"            value={investment.shares_purchased.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
            <DetailRow label="Price per share"   value={formatPrice(investment.original_share_price)} />
            <DetailRow label="Share class"       value={investment.share_class} />
            <DetailRow label="EIS status"        value={<EisTag status={investment.eis_status} />} />
            <DetailRow label="Fee rate"          value={investment.fee_rate != null ? `${investment.fee_rate}%` : '—'} />
            <DetailRow label="Fee amount"        value={investment.fee_amount != null ? formatCurrency(investment.fee_amount) : '—'} />
            <DetailRow
              label="Completion date"
              value={investment.completion_date ? formatDate(investment.completion_date) : '—'}
            />
            <DetailRow
              label="Holding"
              value={
                <span>
                  {holdingDisplay}
                  {' '}
                  <span className={investment.holding_location === 'nominee' ? 'pill pill-purple' : 'pill pill-grey'} style={{ fontSize: 9 }}>
                    {investment.holding_location === 'nominee' ? 'Nominee' : 'Direct'}
                  </span>
                </span>
              }
            />
          </div>
        </div>

        {/* Current valuation card */}
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', marginBottom: 14 }}>
            Current valuation
          </div>
          {valuation ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
              <DetailRow label="Current price"    value={formatPrice(valuation.share_price)} />
              <DetailRow label="Valuation date"   value={formatDate(valuation.valuation_date)} />
              <DetailRow
                label="Current value"
                value={currentValue != null ? formatCurrency(currentValue) : '—'}
              />
              <DetailRow
                label="Gain / loss"
                value={
                  gainLoss != null ? (
                    <span style={{ color: gainLoss >= 0 ? '#1d9e75' : '#a32d2d', fontWeight: 500 }}>
                      {gainLoss >= 0 ? '+' : ''}{formatCurrency(gainLoss)}
                      {pctChange != null && (
                        <span style={{ fontSize: 11, marginLeft: 4, fontWeight: 400 }}>
                          ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  ) : '—'
                }
              />
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>No current valuation on record</p>
          )}
        </div>
      </div>

      {/* Post-deal checklist */}
      {deal && investment.status !== 'pending' && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Post-deal checklist</div>
            {saving
              ? <span style={{ fontSize: 11, color: '#aaa' }}>Saving…</span>
              : saved
              ? <span style={{ fontSize: 11, color: '#1d9e75' }}>✓ Saved</span>
              : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ChecklistItem
              label="Transaction statement sent"
              checked={!!checklist.statement_sent}
              onChange={() => toggleItem('statement_sent')}
            />
            {isEis && (
              <ChecklistItem
                label="EIS certificate received"
                checked={!!checklist.eis_cert_received}
                onChange={() => toggleItem('eis_cert_received')}
              />
            )}
            {isEis && (
              <ChecklistItem
                label="EIS certificate sent to investor"
                checked={!!checklist.eis_cert_sent}
                onChange={() => toggleItem('eis_cert_sent')}
              />
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              onClick={showToast}
            >
              Generate transaction statement
            </button>
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', fontSize: 13, fontWeight: 600, color: '#0f2744' }}>
          Documents
        </div>
        {documents.length === 0 ? (
          <div style={{ padding: '28px', textAlign: 'center', color: '#888', fontSize: 13 }}>
            No documents linked to this deal for this investor
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f7' }}>
                <th style={thSt}>Name</th>
                <th style={thSt}>Type</th>
                <th style={thSt}>Date</th>
                <th style={{ ...thSt, width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id}>
                  <td style={tdSt}>{doc.filename}</td>
                  <td style={{ ...tdSt, color: '#888' }}>
                    {DOC_TYPE_LABELS[doc.type] ?? doc.type.replace(/_/g, ' ')}
                  </td>
                  <td style={{ ...tdSt, color: '#888' }}>
                    {doc.document_date ? formatDate(doc.document_date) : '—'}
                  </td>
                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    {doc.storage_url
                      ? <a href={doc.storage_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#185fa5', textDecoration: 'none' }}>View</a>
                      : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Coming soon toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#0f2744', color: '#fff', fontSize: 12, fontWeight: 500,
          padding: '10px 20px', borderRadius: 6, zIndex: 2000,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
        }}>
          Coming soon
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#0f2744' }}>{value}</div>
    </div>
  )
}

function ChecklistItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ width: 15, height: 15, accentColor: '#1d9e75', cursor: 'pointer', flexShrink: 0 }}
      />
      <span style={{ fontSize: 13, color: checked ? '#1d9e75' : '#333', fontWeight: checked ? 500 : 400 }}>
        {label}
      </span>
    </label>
  )
}

function EisTag({ status }: { status: string }) {
  if (status === 'yes') return <span className="pill pill-green" style={{ fontSize: 10 }}>EIS</span>
  if (status === 'no')  return <span className="pill pill-grey"  style={{ fontSize: 10 }}>Non-EIS</span>
  return <span className="pill pill-amber" style={{ fontSize: 10 }}>EIS TBC</span>
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  padding: '8px 12px', fontSize: 10, fontWeight: 500, color: '#888',
  textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e8e7e0',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

const tdSt: React.CSSProperties = {
  padding: '8px 12px', fontSize: 12, borderBottom: '0.5px solid #f0f0ec', verticalAlign: 'middle',
}
