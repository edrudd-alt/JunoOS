'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/Breadcrumb'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPrice, formatDate } from '@/lib/utils'
import { generateTransactionStatement } from '@/lib/services/statementGenerator'

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
  const router   = useRouter()

  const clientId = investment.client_id
  const isEis    = investment.eis_status === 'yes' || investment.eis_status === 'tbc'

  // Initialise checklist from deal.completion_checklist.per_investor[clientId]
  const [checklist,    setChecklist]    = useState<Record<string, boolean>>(() => {
    if (!deal?.completion_checklist) return {}
    const perInvestor = (deal.completion_checklist.per_investor ?? {}) as Record<string, Record<string, boolean>>
    return perInvestor[clientId] ?? {}
  })
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [generating,   setGenerating]   = useState(false)
  const [statementUrl, setStatementUrl] = useState<string | null>(null)
  const [genError,     setGenError]     = useState<string | null>(null)

  // Shared helper — merges updated per-investor checklist into deals.completion_checklist
  const persistChecklist = useCallback(async (updated: Record<string, boolean>) => {
    if (!deal) return
    const { data: dealRow } = await supabase
      .from('deals')
      .select('completion_checklist')
      .eq('id', deal.id)
      .single()
    const existing    = (dealRow?.completion_checklist ?? {}) as Record<string, unknown>
    const perInvestor = (existing.per_investor ?? {}) as Record<string, unknown>
    await supabase.from('deals').update({
      completion_checklist: {
        ...existing,
        per_investor: { ...perInvestor, [clientId]: updated },
      },
    }).eq('id', deal.id)
  }, [deal, clientId, supabase])

  const saveChecklist = useCallback(async (updated: Record<string, boolean>) => {
    setSaving(true)
    await persistChecklist(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [persistChecklist])

  function toggleItem(key: string) {
    const updated = { ...checklist, [key]: !checklist[key] }
    setChecklist(updated)
    saveChecklist(updated)
  }

  async function handleGenerateStatement() {
    if (!deal || !company || !client) return
    setGenerating(true)
    setGenError(null)
    try {
      const eisLabel =
        investment.eis_status === 'yes' ? 'EIS qualifying' :
        investment.eis_status === 'no'  ? 'Non-EIS' :
        'EIS TBC'

      const blob = await generateTransactionStatement({
        investorName:    clientName,
        companyName,
        eisStatus:       eisLabel,
        investmentDate:  formatDate(investment.investment_date),
        shareClass:      investment.share_class,
        purchasePrice:   formatPrice(investment.original_share_price),
        sharesPurchased: investment.shares_purchased.toLocaleString(undefined, { maximumFractionDigits: 0 }),
        sumSubscribed:   formatCurrency(investment.sum_subscribed),
        junoFee:         investment.fee_amount != null ? formatCurrency(investment.fee_amount) : '—',
        totalCost:       formatCurrency(investment.sum_subscribed + (investment.fee_amount ?? 0)),
      })

      const today        = new Date().toISOString().slice(0, 10)
      const companySlug  = companyName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const investorSlug = clientName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const fileSlug     = `${today}-${investorSlug}-${companySlug}-transaction-statement.pdf`
      const filename     = `${today} — ${clientName} — ${companyName} — Transaction Statement.pdf`
      const storagePath  = `${companySlug}/${investorSlug}/${fileSlug}`

      const { data: { session } } = await supabase.auth.getSession()
      console.log('Session at upload time:', {
        hasSession:   !!session,
        hasToken:     !!session?.access_token,
        tokenPreview: session?.access_token?.slice(0, 20),
      })

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true })

      if (uploadError) throw new Error(uploadError.message)

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(storagePath)

      const { data: { user } } = await supabase.auth.getUser()
      console.log('auth.getUser at insert time:', { userId: user?.id ?? null, userNull: user === null })

      const { error: docError } = await supabase.from('documents').insert({
        type:          'transaction_statement',
        company_id:    investment.company_id,
        client_id:     clientId,
        deal_id:       investment.deal_id,
        filename,
        storage_url:   publicUrl,
        document_date: today,
        uploaded_by:   user?.id ?? null,
      })
      if (docError) {
        console.error('documents insert failed:', {
          code:    docError.code,
          message: docError.message,
          details: docError.details,
          hint:    docError.hint,
          full:    docError,
        })
      } else {
        console.log('documents insert succeeded')
      }

      // Mark statement_sent in the checklist
      const updatedChecklist = { ...checklist, statement_sent: true }
      setChecklist(updatedChecklist)
      await persistChecklist(updatedChecklist)

      setStatementUrl(publicUrl)
      router.refresh()
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate statement')
    } finally {
      setGenerating(false)
    }
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
          <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 12 }}
              onClick={handleGenerateStatement}
              disabled={generating}
            >
              {generating ? 'Generating…' : statementUrl ? '✓ Statement generated' : 'Generate transaction statement'}
            </button>
            {statementUrl && (
              <a
                href={statementUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#185fa5', textDecoration: 'underline' }}
              >
                Download PDF
              </a>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, opacity: 0.5, cursor: 'not-allowed' }}
              disabled
              title="Email integration coming soon"
            >
              Send to investor
            </button>
          </div>
          {genError && (
            <p style={{ fontSize: 12, color: '#a32d2d', marginTop: 8 }}>{genError}</p>
          )}
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
