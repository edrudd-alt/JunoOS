'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string
  full_name: string
  email: string | null
}

interface Company {
  id: string
  name: string
}

interface PortfolioRow {
  client_id: string
  company_id: string
  company_name: string
  total_shares: number
  total_invested: number
  current_value: number
  gain_loss: number
}

interface Investment {
  id: string
  client_id: string
  company_id: string
  shares_purchased: number
  sum_subscribed: number
  investment_date: string
  eis_status: string | null
  share_class: string | null
}

const GROUPING_OPTIONS = [
  { value: 'share_class', label: 'By share class' },
  { value: 'eis_status',  label: 'By EIS status' },
  { value: 'year',        label: 'By year of investment' },
  { value: 'none',        label: 'No subheadings' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4,
}

const DISCLAIMER = `This portfolio statement is provided for information purposes only by Juno Capital Partners LLP. It does not constitute financial advice. Past performance is not a reliable indicator of future results. The value of investments and any income from them can fall as well as rise. All valuations are based on the most recent available data and may not reflect current market conditions. Juno Capital Partners LLP is authorised and regulated by the Financial Conduct Authority.`

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PortfolioStatementWizard({
  clients: clientsRaw,
  companies: companiesRaw,
  portfolio: portfolioRaw,
  investments: investmentsRaw,
}: {
  clients: Record<string, unknown>[]
  companies: Record<string, unknown>[]
  portfolio: Record<string, unknown>[]
  investments: Record<string, unknown>[]
}) {
  const clients     = clientsRaw as unknown as Client[]
  const companies   = companiesRaw as unknown as Company[]
  const portfolio   = portfolioRaw as unknown as PortfolioRow[]
  const investments = investmentsRaw as unknown as Investment[]

  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1 config
  const [selectedClientId, setSelectedClientId] = useState('')

  // Auto-select client from ?client= query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const clientParam = params.get('client')
    if (clientParam && clients.some(c => c.id === clientParam)) {
      setSelectedClientId(clientParam)
    }
  }, [clients])
  const [excludedCompanyIds, setExcludedCompanyIds] = useState<Set<string>>(new Set())
  const [grouping, setGrouping] = useState('share_class')
  const [reportDate, setReportDate] = useState<'today' | 'month_end' | 'custom'>('today')
  const [customDate, setCustomDate] = useState('')
  const [includeSummary, setIncludeSummary] = useState(true)
  const [deliveryEmail, setDeliveryEmail] = useState('')
  const [downloadOnly, setDownloadOnly] = useState(false)
  const [coveringNote, setCoveringNote] = useState('')
  const [includeDisclaimer, setIncludeDisclaimer] = useState(true)

  // Step 3
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const selectedClient = clients.find(c => c.id === selectedClientId)

  // Portfolio data for selected client
  const clientPortfolio = useMemo(() =>
    portfolio.filter(r => r.client_id === selectedClientId && !excludedCompanyIds.has(r.company_id)),
    [portfolio, selectedClientId, excludedCompanyIds]
  )

  const clientInvestments = useMemo(() =>
    investments.filter(i => i.client_id === selectedClientId && !excludedCompanyIds.has(i.company_id)),
    [investments, selectedClientId, excludedCompanyIds]
  )

  // Companies this client has investments in
  const clientCompanyIds = useMemo(() =>
    [...new Set(investments.filter(i => i.client_id === selectedClientId).map(i => i.company_id))],
    [investments, selectedClientId]
  )

  const clientCompanies = useMemo(() =>
    companies.filter(c => clientCompanyIds.includes(c.id)),
    [companies, clientCompanyIds]
  )

  const totalInvested     = clientPortfolio.reduce((s, r) => s + Number(r.total_invested ?? 0), 0)
  const totalCurrentValue = clientPortfolio.reduce((s, r) => s + Number(r.current_value ?? 0), 0)
  const totalGainLoss     = totalCurrentValue - totalInvested
  const totalGainPct      = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0

  function toggleCompany(id: string) {
    setExcludedCompanyIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleClientChange(id: string) {
    setSelectedClientId(id)
    setExcludedCompanyIds(new Set())
    const c = clients.find(c => c.id === id)
    setDeliveryEmail(c?.email ?? '')
  }

  function canProceed() {
    if (!selectedClientId) return false
    if (clientPortfolio.length === 0) return false
    return true
  }

  async function handleSend() {
    setSending(true)
    const client = clients.find(c => c.id === selectedClientId)
    const { data: update } = await supabase
      .from('investor_updates')
      .insert({
        update_type: 'portfolio_statement',
        title: `Portfolio statement — ${client?.full_name}`,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (update) {
      await supabase.from('investor_update_recipients').insert({
        update_id: update.id,
        client_id: selectedClientId,
        sent_at: new Date().toISOString(),
      })
    }
    setSending(false)
    setSent(true)
  }

  // ── Step 1: Configure ──────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ maxWidth: 680 }}>
        <Breadcrumb step={1} />
        <StepHeader step={1} title="Configure portfolio statement" />

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Investor</div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Select investor *</label>
            <select
              value={selectedClientId}
              onChange={e => handleClientChange(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Choose investor —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>

          {selectedClientId && clientCompanies.length > 0 && (
            <div>
              <label style={labelStyle}>
                Companies to include
                <button
                  onClick={() => setExcludedCompanyIds(
                    excludedCompanyIds.size === 0
                      ? new Set(clientCompanyIds)
                      : new Set()
                  )}
                  style={{ marginLeft: 8, fontSize: 10, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {excludedCompanyIds.size === 0 ? 'Deselect all' : 'Select all'}
                </button>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {clientCompanies.map(c => {
                  const row = portfolio.find(r => r.client_id === selectedClientId && r.company_id === c.id)
                  return (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!excludedCompanyIds.has(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        style={{ accentColor: '#0f2744' }}
                      />
                      <span style={{ flex: 1 }}>{c.name}</span>
                      {row && (
                        <span style={{ fontSize: 11, color: '#888' }}>
                          {formatCurrency(row.current_value)} current · {formatCurrency(row.total_invested)} invested
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Format</div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Subheadings</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {GROUPING_OPTIONS.map(o => (
                <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" name="grouping" value={o.value} checked={grouping === o.value}
                    onChange={() => setGrouping(o.value)} style={{ accentColor: '#0f2744' }} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Report date</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['today', 'month_end', 'custom'] as const).map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="radio" name="reportDate" value={v} checked={reportDate === v}
                      onChange={() => setReportDate(v)} style={{ accentColor: '#0f2744' }} />
                    {v === 'today' ? 'Today' : v === 'month_end' ? 'Month end' : 'Custom date'}
                  </label>
                ))}
                {reportDate === 'custom' && (
                  <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                    style={{ ...inputStyle, marginTop: 4 }} />
                )}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Options</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeSummary} onChange={e => setIncludeSummary(e.target.checked)}
                    style={{ accentColor: '#0f2744' }} />
                  Include summary page
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeDisclaimer} onChange={e => setIncludeDisclaimer(e.target.checked)}
                    style={{ accentColor: '#0f2744' }} />
                  Include disclaimer
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Delivery</div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={downloadOnly} onChange={e => setDownloadOnly(e.target.checked)}
                style={{ accentColor: '#0f2744' }} />
              Download only (don't send by email)
            </label>
          </div>

          {!downloadOnly && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Send to email</label>
              <input type="email" value={deliveryEmail} onChange={e => setDeliveryEmail(e.target.value)}
                placeholder="investor@example.com" style={inputStyle} />
            </div>
          )}

          <div>
            <label style={labelStyle}>Covering note (optional)</label>
            <textarea value={coveringNote} onChange={e => setCoveringNote(e.target.value)}
              rows={3} placeholder="Add a personal note to accompany the statement…"
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/reports" className="btn btn-secondary">← Back</Link>
          <button
            className="btn btn-primary"
            onClick={() => setStep(2)}
            disabled={!canProceed()}
          >
            Preview →
          </button>
          {!canProceed() && (
            <span style={{ fontSize: 11, color: '#aaa', alignSelf: 'center' }}>
              {!selectedClientId ? 'Select an investor to continue' : 'No holdings to show (all companies excluded)'}
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── Step 2: Preview ────────────────────────────────────────────────────────
  if (step === 2) {
    const dateLabel = reportDate === 'today'
      ? formatDate(new Date().toISOString())
      : reportDate === 'month_end'
        ? formatDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString())
        : customDate ? formatDate(customDate) : '—'

    return (
      <div style={{ maxWidth: 860 }}>
        <Breadcrumb step={2} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <StepHeader step={2} title="Preview" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back to configure</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Generate & send →</button>
          </div>
        </div>

        {/* PDF Preview */}
        <div style={{
          background: '#fff', border: '1px solid #ddd', borderRadius: 4,
          padding: '40px 48px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          fontFamily: 'Georgia, serif',
        }}>
          {/* Header */}
          <div style={{ borderBottom: '2px solid #0f2744', paddingBottom: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Juno Capital Partners LLP
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>
                  Portfolio Statement
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#555' }}>
                <div style={{ fontWeight: 600 }}>{selectedClient?.full_name}</div>
                <div>{dateLabel}</div>
              </div>
            </div>
          </div>

          {/* Holdings table — Page 1 */}
          <div style={{ marginBottom: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ccc' }}>
                  {['Company', 'Date', 'Share class', 'EIS', 'Shares', 'Invested', 'Current value', 'Gain / loss', '%'].map(h => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#666', padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const rows: React.ReactNode[] = []
                  const grouped = groupInvestments(clientInvestments, clientPortfolio, grouping)

                  for (const [heading, invs] of grouped) {
                    if (grouping !== 'none' && heading) {
                      rows.push(
                        <tr key={`h-${heading}`}>
                          <td colSpan={9} style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '12px 8px 4px', borderBottom: '0.5px solid #eee' }}>
                            {heading}
                          </td>
                        </tr>
                      )
                    }
                    for (const inv of invs) {
                      const portRow = clientPortfolio.find(r => r.company_id === inv.company_id)
                      const companyName = companies.find(c => c.id === inv.company_id)?.name ?? '—'
                      const currentPricePerShare = portRow && portRow.total_shares > 0
                        ? portRow.current_value / portRow.total_shares : 0
                      const currentValue = inv.shares_purchased * currentPricePerShare
                      const gainLoss = currentValue - inv.sum_subscribed
                      const gainPct = inv.sum_subscribed > 0 ? (gainLoss / inv.sum_subscribed) * 100 : 0
                      rows.push(
                        <tr key={inv.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                          <td style={{ padding: '7px 8px', fontSize: 11, fontWeight: 500 }}>{companyName}</td>
                          <td style={{ padding: '7px 8px', fontSize: 11, color: '#555' }}>{formatDate(inv.investment_date)}</td>
                          <td style={{ padding: '7px 8px', fontSize: 11, color: '#555' }}>{inv.share_class ?? '—'}</td>
                          <td style={{ padding: '7px 8px', fontSize: 10 }}>
                            {inv.eis_status ? <span style={{ fontSize: 9, background: '#e0eaf9', color: '#185fa5', padding: '1px 5px', borderRadius: 99, fontWeight: 600 }}>{inv.eis_status.toUpperCase()}</span> : '—'}
                          </td>
                          <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right' }}>{Number(inv.shares_purchased).toLocaleString()}</td>
                          <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right' }}>{formatCurrency(inv.sum_subscribed)}</td>
                          <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right' }}>{formatCurrency(currentValue)}</td>
                          <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right', color: gainLoss >= 0 ? '#0f6e56' : '#a32d2d' }}>
                            {formatCurrency(gainLoss)}
                          </td>
                          <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right', color: gainPct >= 0 ? '#0f6e56' : '#a32d2d' }}>
                            {formatPercent(gainPct)}
                          </td>
                        </tr>
                      )
                    }
                  }
                  return rows
                })()}

                {/* Totals row */}
                <tr style={{ borderTop: '1.5px solid #0f2744' }}>
                  <td colSpan={5} style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700 }}>Total</td>
                  <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>{formatCurrency(totalInvested)}</td>
                  <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>{formatCurrency(totalCurrentValue)}</td>
                  <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right', color: totalGainLoss >= 0 ? '#0f6e56' : '#a32d2d' }}>
                    {formatCurrency(totalGainLoss)}
                  </td>
                  <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right', color: totalGainPct >= 0 ? '#0f6e56' : '#a32d2d' }}>
                    {formatPercent(totalGainPct)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Page 2: Summary */}
          {includeSummary && (
            <div style={{ borderTop: '2px solid #eee', paddingTop: 28, marginTop: 28 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2744', marginBottom: 16 }}>Summary by company</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ccc' }}>
                    {['Company', 'Shares', 'Invested', 'Current value', 'Gain / loss', 'Return'].map(h => (
                      <th key={h} style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#666', padding: '6px 8px', textAlign: 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientPortfolio.map(row => {
                    const pct = Number(row.total_invested) > 0
                      ? ((Number(row.current_value) - Number(row.total_invested)) / Number(row.total_invested)) * 100 : 0
                    const gl = Number(row.current_value) - Number(row.total_invested)
                    return (
                      <tr key={row.company_id} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                        <td style={{ padding: '7px 8px', fontSize: 11, fontWeight: 500 }}>{row.company_name}</td>
                        <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right' }}>{Number(row.total_shares).toLocaleString()}</td>
                        <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right' }}>{formatCurrency(row.total_invested)}</td>
                        <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right' }}>{formatCurrency(row.current_value)}</td>
                        <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right', color: gl >= 0 ? '#0f6e56' : '#a32d2d' }}>{formatCurrency(gl)}</td>
                        <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right', color: pct >= 0 ? '#0f6e56' : '#a32d2d' }}>{formatPercent(pct)}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '1.5px solid #0f2744' }}>
                    <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700 }}>Total</td>
                    <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>—</td>
                    <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>{formatCurrency(totalInvested)}</td>
                    <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>{formatCurrency(totalCurrentValue)}</td>
                    <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right', color: totalGainLoss >= 0 ? '#0f6e56' : '#a32d2d' }}>{formatCurrency(totalGainLoss)}</td>
                    <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right', color: totalGainPct >= 0 ? '#0f6e56' : '#a32d2d' }}>{formatPercent(totalGainPct)}</td>
                  </tr>
                </tbody>
              </table>

              {includeDisclaimer && (
                <div style={{ marginTop: 28, borderTop: '0.5px solid #ddd', paddingTop: 14, fontSize: 9, color: '#999', lineHeight: 1.5 }}>
                  {DISCLAIMER}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={() => setStep(1)}>← Make a change</button>
          <button className="btn btn-primary" onClick={() => setStep(3)}>Generate & send →</button>
        </div>
      </div>
    )
  }

  // ── Step 3: Generate & Send ────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 540 }}>
      <Breadcrumb step={3} />
      <StepHeader step={3} title="Generate & send" />

      {sent ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Statement generated</div>
          <p style={{ fontSize: 12, color: '#555', margin: '0 0 20px' }}>
            {downloadOnly
              ? 'Your PDF is ready to download.'
              : `Sent to ${deliveryEmail} and saved to ${selectedClient?.full_name}'s Updates sent tab.`}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Link href="/reports" className="btn btn-secondary">Back to reports</Link>
            <button className="btn btn-primary" onClick={() => { setStep(1); setSent(false) }}>
              Generate another
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Confirm and send</div>
            <SummaryRow label="Investor" value={selectedClient?.full_name ?? '—'} />
            <SummaryRow label="Companies" value={`${clientPortfolio.length} of ${clientCompanies.length}`} />
            <SummaryRow label="Total value" value={formatCurrency(totalCurrentValue)} />
            <SummaryRow label="Total gain / loss" value={`${formatCurrency(totalGainLoss)} (${formatPercent(totalGainPct)})`} />
            <SummaryRow label="Delivery" value={downloadOnly ? 'Download only' : deliveryEmail || '—'} />
            {coveringNote && <SummaryRow label="Covering note" value={coveringNote} />}
          </div>

          {!downloadOnly && !deliveryEmail && (
            <div style={{ background: '#fef3dd', border: '0.5px solid #f5d87a', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#7a5a00', marginBottom: 14 }}>
              No email address set. Return to configure or tick "Download only".
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={sending || (!downloadOnly && !deliveryEmail)}
            >
              {sending ? 'Generating…' : downloadOnly ? 'Generate PDF' : 'Generate & send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupInvestments(
  investments: Investment[],
  portfolio: PortfolioRow[],
  grouping: string
): [string, Investment[]][] {
  if (grouping === 'none') return [['', investments]]

  const map = new Map<string, Investment[]>()
  for (const inv of investments) {
    let key = ''
    if (grouping === 'share_class') key = inv.share_class ?? 'Unknown'
    else if (grouping === 'eis_status') key = inv.eis_status ?? 'No EIS'
    else if (grouping === 'year') key = inv.investment_date ? new Date(inv.investment_date).getFullYear().toString() : 'Unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(inv)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function Breadcrumb({ step }: { step: number }) {
  return (
    <div style={{ fontSize: 11, color: '#aaa', marginBottom: 16 }}>
      <Link href="/reports" style={{ color: '#aaa', textDecoration: 'none' }}>Reports</Link>
      {' / '}
      <span style={{ color: '#555' }}>Portfolio statement</span>
      {' / '}
      <span>Step {step} of 3</span>
    </div>
  )
}

function StepHeader({ step, title }: { step: number; title: string }) {
  const steps = ['Configure', 'Preview', 'Generate & send']
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
        {steps.map((s, i) => {
          const n = i + 1
          const active = n === step
          const done   = n < step
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? '#1d9e75' : active ? '#0f2744' : '#e8e7e0',
                  color: done || active ? '#fff' : '#aaa',
                }}>
                  {done ? '✓' : n}
                </div>
                <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#0f2744' : done ? '#1d9e75' : '#aaa' }}>
                  {s}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: 24, height: 1, background: '#ddd', margin: '0 8px' }} />
              )}
            </div>
          )
        })}
      </div>
      <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{title}</h1>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid #f0f0ec', fontSize: 12 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}
