'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string
  name: string
}

interface InvestmentRow {
  client_id: string
  company_id: string
  shares_purchased: number
  sum_subscribed: number
  investment_date: string
  eis_status: string | null
  share_class: string | null
  clients: { id: string; full_name: string; email: string | null } | null
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

interface TeamMember {
  id: string
  full_name: string
}

type UpdateType = 'data_table' | 'table_with_bullets' | 'long_form'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4,
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InvestorUpdateWizard({
  companies: companiesRaw,
  investments: investmentsRaw,
  portfolio: portfolioRaw,
  teamMembers: teamMembersRaw,
}: {
  companies: Record<string, unknown>[]
  investments: Record<string, unknown>[]
  portfolio: Record<string, unknown>[]
  teamMembers: Record<string, unknown>[]
}) {
  const companies   = companiesRaw as unknown as Company[]
  const investments = investmentsRaw as unknown as InvestmentRow[]
  const portfolio   = portfolioRaw as unknown as PortfolioRow[]
  const teamMembers = teamMembersRaw as unknown as TeamMember[]

  const [updateType, setUpdateType] = useState<UpdateType | null>(null)

  if (!updateType) {
    return (
      <TypeSelector
        companies={companies}
        investments={investments}
        onSelect={setUpdateType}
      />
    )
  }

  if (updateType === 'data_table') {
    return (
      <DataTableWizard
        companies={companies}
        investments={investments}
        portfolio={portfolio}
        onBack={() => setUpdateType(null)}
      />
    )
  }

  if (updateType === 'table_with_bullets') {
    return (
      <TableWithBulletsWizard
        companies={companies}
        investments={investments}
        portfolio={portfolio}
        onBack={() => setUpdateType(null)}
      />
    )
  }

  return (
    <LongFormWizard
      companies={companies}
      investments={investments}
      portfolio={portfolio}
      teamMembers={teamMembers}
      onBack={() => setUpdateType(null)}
    />
  )
}

// ─── Type Selector ────────────────────────────────────────────────────────────

function TypeSelector({
  companies,
  investments,
  onSelect,
}: {
  companies: Company[]
  investments: InvestmentRow[]
  onSelect: (t: UpdateType) => void
}) {
  // Count companies with active investors
  const activeCompanyIds = [...new Set(investments.map(i => i.company_id))]

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 16 }}>
        <Link href="/reports" style={{ color: '#aaa', textDecoration: 'none' }}>Reports</Link>
        {' / '}
        <span style={{ color: '#555' }}>Investor update</span>
      </div>
      <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 6px' }}>New investor update</h1>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 24px' }}>
        Choose the type of update to send. All types are personalised per investor.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Type 1 */}
        <div
          className="card"
          onClick={() => onSelect('data_table')}
          style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e0eaf9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📋</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Type 1 — Data table only</div>
              <p style={{ fontSize: 12, color: '#555', margin: '0 0 8px', lineHeight: 1.5 }}>
                Portfolio statement sent to all investors in a company. Generated automatically from the database — no narrative needed. Fastest to produce.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="pill pill-grey">No narrative</span>
                <span className="pill pill-blue">Batch send</span>
                <span className="pill pill-teal">Auto-generated</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#185fa5', fontWeight: 500, whiteSpace: 'nowrap' }}>Select →</div>
          </div>
        </div>

        {/* Type 2 */}
        <div
          className="card"
          onClick={() => onSelect('table_with_bullets')}
          style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fef3dd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📝</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Type 2 — Table with brief bullets</div>
              <p style={{ fontSize: 12, color: '#555', margin: '0 0 8px', lineHeight: 1.5 }}>
                Holdings table plus short company-by-company bullet commentary. Write bullets manually or draft them from internal documents. Requires team review before sending.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="pill pill-amber">Review required</span>
                <span className="pill pill-blue">Batch send</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#185fa5', fontWeight: 500, whiteSpace: 'nowrap' }}>Select →</div>
          </div>
        </div>

        {/* Type 3 */}
        <div
          className="card"
          onClick={() => onSelect('long_form')}
          style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#d0f0e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📄</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Type 3 — Long-form company update</div>
              <p style={{ fontSize: 12, color: '#555', margin: '0 0 8px', lineHeight: 1.5 }}>
                Full narrative update with optional data blocks (valuation chart, KPI table, gain/loss). Write from scratch, upload a company document, or draft from internal board minutes. Requires approval before sending.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="pill pill-purple">5-step workflow</span>
                <span className="pill pill-amber">Approval required</span>
                <span className="pill pill-green">Personalised PDF</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#185fa5', fontWeight: 500, whiteSpace: 'nowrap' }}>Select →</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Type 1: Data table ───────────────────────────────────────────────────────

function DataTableWizard({
  companies,
  investments,
  portfolio,
  onBack,
}: {
  companies: Company[]
  investments: InvestmentRow[]
  portfolio: PortfolioRow[]
  onBack: () => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [companyId, setCompanyId] = useState('')
  const [excludedClientIds, setExcludedClientIds] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [previewClientId, setPreviewClientId] = useState('')

  const activeCompanyIds = [...new Set(investments.map(i => i.company_id))]
  const availableCompanies = companies.filter(c => activeCompanyIds.includes(c.id))
  const selectedCompany = companies.find(c => c.id === companyId)

  const companyInvestors = useMemo(() => {
    const seen = new Map<string, InvestmentRow['clients']>()
    for (const inv of investments) {
      if (inv.company_id === companyId && inv.clients && !seen.has(inv.client_id)) {
        seen.set(inv.client_id, inv.clients)
      }
    }
    return [...seen.entries()].map(([id, client]) => ({ id, client }))
  }, [investments, companyId])

  const includedInvestors = companyInvestors.filter(({ id }) => !excludedClientIds.has(id))

  function toggleClient(id: string) {
    setExcludedClientIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSend() {
    setSending(true)
    const { data: update } = await supabase
      .from('investor_updates')
      .insert({
        company_id: companyId,
        update_type: 'data_table',
        title: `${selectedCompany?.name} — Portfolio update`,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (update) {
      await supabase.from('investor_update_recipients').insert(
        includedInvestors.map(({ id }) => ({
          update_id: update.id,
          client_id: id,
          sent_at: new Date().toISOString(),
        }))
      )
    }
    setSending(false)
    setSent(true)
  }

  if (step === 1) {
    return (
      <div style={{ maxWidth: 580 }}>
        <UpdateBreadcrumb type="Type 1 — Data table" step={1} steps={['Configure', 'Preview', 'Send']} />

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Select company</div>
          <select value={companyId} onChange={e => { setCompanyId(e.target.value); setExcludedClientIds(new Set()) }} style={inputStyle}>
            <option value="">— Choose company —</option>
            {availableCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {companyId && companyInvestors.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Investors ({includedInvestors.length} of {companyInvestors.length})</div>
              <button
                onClick={() => setExcludedClientIds(excludedClientIds.size === 0 ? new Set(companyInvestors.map(i => i.id)) : new Set())}
                style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {excludedClientIds.size === 0 ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {companyInvestors.map(({ id, client }) => {
                const portRow = portfolio.find(r => r.client_id === id && r.company_id === companyId)
                return (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!excludedClientIds.has(id)} onChange={() => toggleClient(id)} style={{ accentColor: '#0f2744' }} />
                    <span style={{ flex: 1 }}>{client?.full_name ?? '—'}</span>
                    {portRow && (
                      <span style={{ fontSize: 11, color: '#888' }}>
                        {formatCurrency(portRow.current_value)}
                      </span>
                    )}
                  </label>
                )
              })}
              {companyInvestors.length > 5 && (
                <div style={{ fontSize: 11, color: '#aaa', paddingLeft: 24 }}>
                  All {companyInvestors.length} investors listed
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
          <button
            className="btn btn-primary"
            disabled={!companyId || includedInvestors.length === 0}
            onClick={() => { setPreviewClientId(includedInvestors[0]?.id ?? ''); setStep(2) }}
          >
            Preview →
          </button>
        </div>
      </div>
    )
  }

  if (step === 2) {
    const previewInvestor = includedInvestors.find(i => i.id === previewClientId) ?? includedInvestors[0]
    const investorInvs = investments.filter(i => i.client_id === previewInvestor?.id && i.company_id === companyId)
    const portRow = portfolio.find(r => r.client_id === previewInvestor?.id && r.company_id === companyId)
    const totalCurrentValue = portfolio.filter(r => r.client_id === previewInvestor?.id).reduce((s, r) => s + Number(r.current_value ?? 0), 0)

    return (
      <div style={{ maxWidth: 800 }}>
        <UpdateBreadcrumb type="Type 1 — Data table" step={2} steps={['Configure', 'Preview', 'Send']} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Preview — personalised sample</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Send to {includedInvestors.length} investors →</button>
          </div>
        </div>

        <div style={{ marginBottom: 12, fontSize: 12, color: '#888' }}>
          Showing personalised version for:{' '}
          <select value={previewClientId} onChange={e => setPreviewClientId(e.target.value)}
            style={{ ...inputStyle, width: 'auto', display: 'inline-block', padding: '3px 8px' }}>
            {includedInvestors.map(({ id, client }) => <option key={id} value={id}>{client?.full_name}</option>)}
          </select>
        </div>

        <InvestorStatementPreview
          investorName={previewInvestor?.client?.full_name ?? ''}
          companyName={selectedCompany?.name ?? ''}
          investments={investorInvs}
          portRow={portRow}
          totalPortfolioValue={totalCurrentValue}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
          <button className="btn btn-primary" onClick={() => setStep(3)}>Send to {includedInvestors.length} investors →</button>
        </div>
      </div>
    )
  }

  // Step 3: Send
  return (
    <div style={{ maxWidth: 480 }}>
      <UpdateBreadcrumb type="Type 1 — Data table" step={3} steps={['Configure', 'Preview', 'Send']} />
      {sent ? (
        <SuccessCard count={includedInvestors.length} companyName={selectedCompany?.name ?? ''} onBack={onBack} />
      ) : (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Confirm and send</div>
          <SummaryRow label="Company" value={selectedCompany?.name ?? '—'} />
          <SummaryRow label="Recipients" value={`${includedInvestors.length} investors`} />
          <SummaryRow label="Type" value="Portfolio data table" />
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? 'Sending…' : `Send to ${includedInvestors.length} investors`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Type 2: Table with bullets ───────────────────────────────────────────────

function TableWithBulletsWizard({
  companies,
  investments,
  portfolio,
  onBack,
}: {
  companies: Company[]
  investments: InvestmentRow[]
  portfolio: PortfolioRow[]
  onBack: () => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [companyId, setCompanyId] = useState('')
  const [bullets, setBullets] = useState<string[]>(['', '', ''])
  const [updateTitle, setUpdateTitle] = useState('')
  const [excludedClientIds, setExcludedClientIds] = useState<Set<string>>(new Set())
  const [previewClientId, setPreviewClientId] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const activeCompanyIds = [...new Set(investments.map(i => i.company_id))]
  const availableCompanies = companies.filter(c => activeCompanyIds.includes(c.id))
  const selectedCompany = companies.find(c => c.id === companyId)

  const companyInvestors = useMemo(() => {
    const seen = new Map<string, InvestmentRow['clients']>()
    for (const inv of investments) {
      if (inv.company_id === companyId && inv.clients && !seen.has(inv.client_id)) {
        seen.set(inv.client_id, inv.clients)
      }
    }
    return [...seen.entries()].map(([id, client]) => ({ id, client }))
  }, [investments, companyId])

  const includedInvestors = companyInvestors.filter(({ id }) => !excludedClientIds.has(id))

  function toggleClient(id: string) {
    setExcludedClientIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSend() {
    setSending(true)
    const { data: update } = await supabase
      .from('investor_updates')
      .insert({
        company_id: companyId,
        update_type: 'table_with_bullets',
        title: updateTitle || `${selectedCompany?.name} — Update`,
        narrative: bullets.filter(Boolean).join('\n'),
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (update) {
      await supabase.from('investor_update_recipients').insert(
        includedInvestors.map(({ id }) => ({
          update_id: update.id,
          client_id: id,
          sent_at: new Date().toISOString(),
        }))
      )
    }
    setSending(false)
    setSent(true)
  }

  if (step === 1) {
    return (
      <div style={{ maxWidth: 620 }}>
        <UpdateBreadcrumb type="Type 2 — Table with bullets" step={1} steps={['Narrative', 'Investors', 'Preview', 'Send']} />

        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Company & title</div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Company *</label>
            <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={inputStyle}>
              <option value="">— Choose company —</option>
              {availableCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Update title</label>
            <input value={updateTitle} onChange={e => setUpdateTitle(e.target.value)}
              placeholder={companyId ? `${selectedCompany?.name} — Q4 2024 update` : 'e.g. Q4 2024 update'}
              style={inputStyle} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Company bullet points</div>
          <p style={{ fontSize: 11, color: '#888', margin: '0 0 12px' }}>
            Write 3–5 brief bullets summarising company progress. These appear above the investor's holdings table.
          </p>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{ paddingTop: 9, fontSize: 11, color: '#aaa', userSelect: 'none' }}>•</div>
              <input
                value={b}
                onChange={e => setBullets(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                placeholder={`Bullet point ${i + 1}…`}
                style={{ ...inputStyle }}
              />
              {bullets.length > 1 && (
                <button onClick={() => setBullets(prev => prev.filter((_, j) => j !== i))}
                  style={{ paddingTop: 7, background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 16 }}>×</button>
              )}
            </div>
          ))}
          <button
            onClick={() => setBullets(prev => [...prev, ''])}
            style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            + Add bullet
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
          <button className="btn btn-primary" disabled={!companyId || bullets.filter(Boolean).length === 0}
            onClick={() => setStep(2)}>
            Select investors →
          </button>
        </div>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div style={{ maxWidth: 540 }}>
        <UpdateBreadcrumb type="Type 2 — Table with bullets" step={2} steps={['Narrative', 'Investors', 'Preview', 'Send']} />

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Investors ({includedInvestors.length} included)</div>
            <button onClick={() => setExcludedClientIds(excludedClientIds.size === 0 ? new Set(companyInvestors.map(i => i.id)) : new Set())}
              style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {excludedClientIds.size === 0 ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {companyInvestors.map(({ id, client }) => (
              <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={!excludedClientIds.has(id)} onChange={() => toggleClient(id)} style={{ accentColor: '#0f2744' }} />
                <span style={{ flex: 1 }}>{client?.full_name ?? '—'}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{client?.email ?? ''}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
          <button className="btn btn-primary" disabled={includedInvestors.length === 0}
            onClick={() => { setPreviewClientId(includedInvestors[0]?.id ?? ''); setStep(3) }}>
            Preview →
          </button>
        </div>
      </div>
    )
  }

  if (step === 3) {
    const previewInvestor = includedInvestors.find(i => i.id === previewClientId) ?? includedInvestors[0]
    const investorInvs = investments.filter(i => i.client_id === previewInvestor?.id && i.company_id === companyId)
    const portRow = portfolio.find(r => r.client_id === previewInvestor?.id && r.company_id === companyId)
    const totalPortfolioValue = portfolio.filter(r => r.client_id === previewInvestor?.id).reduce((s, r) => s + Number(r.current_value ?? 0), 0)

    return (
      <div style={{ maxWidth: 800 }}>
        <UpdateBreadcrumb type="Type 2 — Table with bullets" step={3} steps={['Narrative', 'Investors', 'Preview', 'Send']} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Preview</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(4)}>Approve & send →</button>
          </div>
        </div>

        <div style={{ marginBottom: 12, fontSize: 12, color: '#888' }}>
          Previewing:{' '}
          <select value={previewClientId} onChange={e => setPreviewClientId(e.target.value)}
            style={{ ...inputStyle, width: 'auto', display: 'inline-block', padding: '3px 8px' }}>
            {includedInvestors.map(({ id, client }) => <option key={id} value={id}>{client?.full_name}</option>)}
          </select>
        </div>

        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 4, padding: '32px 40px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontFamily: 'Georgia, serif' }}>
          <div style={{ borderBottom: '2px solid #0f2744', paddingBottom: 12, marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Juno Capital Partners LLP</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f2744', marginTop: 4 }}>
              {updateTitle || `${selectedCompany?.name} — Update`}
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Dear {previewInvestor?.client?.full_name?.split(' ')[0] ?? 'Investor'},</div>
          </div>

          {/* Bullets */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#0f2744' }}>{selectedCompany?.name} — key points</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {bullets.filter(Boolean).map((b, i) => (
                <li key={i} style={{ fontSize: 11, lineHeight: 1.7, color: '#333' }}>{b}</li>
              ))}
            </ul>
          </div>

          {/* Holdings */}
          <InvestorStatementPreview
            investorName={previewInvestor?.client?.full_name ?? ''}
            companyName={selectedCompany?.name ?? ''}
            investments={investorInvs}
            portRow={portRow}
            totalPortfolioValue={totalPortfolioValue}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
          <button className="btn btn-primary" onClick={() => setStep(4)}>Approve & send →</button>
        </div>
      </div>
    )
  }

  // Step 4: Send
  return (
    <div style={{ maxWidth: 480 }}>
      <UpdateBreadcrumb type="Type 2 — Table with bullets" step={4} steps={['Narrative', 'Investors', 'Preview', 'Send']} />
      {sent ? (
        <SuccessCard count={includedInvestors.length} companyName={selectedCompany?.name ?? ''} onBack={onBack} />
      ) : (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Confirm and send</div>
          <SummaryRow label="Company" value={selectedCompany?.name ?? '—'} />
          <SummaryRow label="Title" value={updateTitle || `${selectedCompany?.name} — Update`} />
          <SummaryRow label="Bullets" value={`${bullets.filter(Boolean).length} bullet points`} />
          <SummaryRow label="Recipients" value={`${includedInvestors.length} investors`} />
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setStep(3)}>← Back</button>
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? 'Sending…' : `Send to ${includedInvestors.length} investors`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Type 3: Long-form ────────────────────────────────────────────────────────

type LongFormStep = 1 | 2 | 3 | 4 | 5
type NarrativeSource = 'scratch' | 'upload' | 'internal_docs'

const DATA_BLOCKS = [
  { key: 'valuation_history', label: 'Valuation history' },
  { key: 'kpi_snapshot',      label: 'KPI snapshot' },
  { key: 'share_breakdown',   label: 'Share class breakdown' },
  { key: 'gain_loss',         label: 'Gain / loss since investment' },
  { key: 'cash_runway',       label: 'Cash runway indicator' },
]

function LongFormWizard({
  companies,
  investments,
  portfolio,
  teamMembers,
  onBack,
}: {
  companies: Company[]
  investments: InvestmentRow[]
  portfolio: PortfolioRow[]
  teamMembers: TeamMember[]
  onBack: () => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<LongFormStep>(1)

  // Step 1
  const [companyId, setCompanyId] = useState('')
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateDate, setUpdateDate] = useState(new Date().toISOString().split('T')[0])
  const [signedOffBy, setSignedOffBy] = useState('')
  const [narrativeSource, setNarrativeSource] = useState<NarrativeSource>('scratch')
  const [narrative, setNarrative] = useState('')
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set(['gain_loss']))
  const [drafterId, setDrafterId] = useState('')

  // Step 2
  const [excludedClientIds, setExcludedClientIds] = useState<Set<string>>(new Set())

  // Step 3 preview
  const [previewClientId, setPreviewClientId] = useState('')

  // Step 4 approve
  const [approverId, setApproverId] = useState('')
  const [approvalNote, setApprovalNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const activeCompanyIds = [...new Set(investments.map(i => i.company_id))]
  const availableCompanies = companies.filter(c => activeCompanyIds.includes(c.id))
  const selectedCompany = companies.find(c => c.id === companyId)

  const companyInvestors = useMemo(() => {
    const seen = new Map<string, InvestmentRow['clients']>()
    for (const inv of investments) {
      if (inv.company_id === companyId && inv.clients && !seen.has(inv.client_id)) {
        seen.set(inv.client_id, inv.clients)
      }
    }
    return [...seen.entries()].map(([id, client]) => ({ id, client }))
  }, [investments, companyId])

  const includedInvestors = companyInvestors.filter(({ id }) => !excludedClientIds.has(id))

  function toggleBlock(key: string) {
    setSelectedBlocks(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function toggleClient(id: string) {
    setExcludedClientIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleApproveAndSend() {
    setSending(true)
    const { data: update } = await supabase
      .from('investor_updates')
      .insert({
        company_id: companyId,
        update_type: 'long_form',
        title: updateTitle || `${selectedCompany?.name} — Update`,
        narrative,
        status: 'sent',
        drafted_by: drafterId || null,
        approved_by: approverId || null,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (update) {
      await supabase.from('investor_update_recipients').insert(
        includedInvestors.map(({ id }) => ({
          update_id: update.id,
          client_id: id,
          sent_at: new Date().toISOString(),
        }))
      )
    }
    setSending(false)
    setSent(true)
  }

  // ── Step 1: Narrative ────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ maxWidth: 680 }}>
        <UpdateBreadcrumb type="Type 3 — Long-form" step={1} steps={['Narrative', 'Investors', 'Preview', 'Approve', 'Done']} />

        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Update details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Company *</label>
              <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={inputStyle}>
                <option value="">— Choose company —</option>
                {availableCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Update date</label>
              <input type="date" value={updateDate} onChange={e => setUpdateDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Title</label>
            <input value={updateTitle} onChange={e => setUpdateTitle(e.target.value)}
              placeholder={companyId ? `${selectedCompany?.name} — Q4 2024 portfolio company update` : 'e.g. Q4 2024 portfolio company update'}
              style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Drafted by</label>
              <select value={drafterId} onChange={e => setDrafterId(e.target.value)} style={inputStyle}>
                <option value="">— Select team member —</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Signed off by</label>
              <input value={signedOffBy} onChange={e => setSignedOffBy(e.target.value)} placeholder="Name for footer" style={inputStyle} />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Narrative source</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {([
              { value: 'scratch', label: 'Write from scratch', hint: 'Start with a blank template' },
              { value: 'upload', label: 'Upload company-prepared document', hint: 'Company has provided the narrative' },
              { value: 'internal_docs', label: 'Draft from internal documents', hint: 'Use board minutes, call notes, management accounts' },
            ] as const).map(o => (
              <label key={o.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input type="radio" name="source" value={o.value} checked={narrativeSource === o.value}
                  onChange={() => setNarrativeSource(o.value)} style={{ accentColor: '#0f2744', marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{o.label}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{o.hint}</div>
                </div>
              </label>
            ))}
          </div>

          {narrativeSource === 'upload' && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Upload document</label>
              <input type="file" accept=".pdf,.doc,.docx" style={{ fontSize: 12 }} />
            </div>
          )}

          {narrativeSource === 'internal_docs' && (
            <div style={{ background: '#f7f7f5', border: '0.5px solid #e0e0d8', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 11, color: '#555' }}>
              In a future version, Claude will automatically select from board minutes, call notes, and management accounts uploaded to this company's documents, and draft the narrative. For now, write the narrative below after reviewing your internal documents.
            </div>
          )}

          <div>
            <label style={labelStyle}>Narrative *</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {['Bold', 'Italic', 'List'].map(btn => (
                <button key={btn} style={{ fontSize: 10, padding: '3px 8px', border: '0.5px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#555' }}>
                  {btn}
                </button>
              ))}
            </div>
            <textarea
              value={narrative}
              onChange={e => setNarrative(e.target.value)}
              rows={12}
              placeholder="Write the company narrative here. This same narrative will be sent to all investors — only the personal wrapper (salutation, holdings, total portfolio value) varies per investor…"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Data blocks</div>
          <p style={{ fontSize: 11, color: '#888', margin: '0 0 12px' }}>
            Select data blocks to insert after the narrative. These are generated automatically from live data.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {DATA_BLOCKS.map(block => (
              <label key={block.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedBlocks.has(block.key)}
                  onChange={() => toggleBlock(block.key)} style={{ accentColor: '#0f2744' }} />
                {block.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
          <button className="btn btn-primary"
            disabled={!companyId || narrative.length < 10}
            onClick={() => setStep(2)}>
            Select investors →
          </button>
        </div>
      </div>
    )
  }

  // ── Step 2: Investors ────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div style={{ maxWidth: 580 }}>
        <UpdateBreadcrumb type="Type 3 — Long-form" step={2} steps={['Narrative', 'Investors', 'Preview', 'Approve', 'Done']} />

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {selectedCompany?.name} investors ({includedInvestors.length} of {companyInvestors.length} included)
            </div>
            <button onClick={() => setExcludedClientIds(excludedClientIds.size === 0 ? new Set(companyInvestors.map(i => i.id)) : new Set())}
              style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {excludedClientIds.size === 0 ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {companyInvestors.slice(0, 10).map(({ id, client }) => {
              const portRow = portfolio.find(r => r.client_id === id && r.company_id === companyId)
              return (
                <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!excludedClientIds.has(id)} onChange={() => toggleClient(id)} style={{ accentColor: '#0f2744' }} />
                  <span style={{ flex: 1 }}>{client?.full_name ?? '—'}</span>
                  {portRow && <span style={{ fontSize: 11, color: '#888' }}>{formatCurrency(portRow.current_value)}</span>}
                  <button onClick={(e) => { e.preventDefault(); toggleClient(id) }}
                    style={{ fontSize: 10, color: excludedClientIds.has(id) ? '#aaa' : '#a32d2d', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {excludedClientIds.has(id) ? 'Include' : 'Exclude'}
                  </button>
                </label>
              )
            })}
            {companyInvestors.length > 10 && (
              <div style={{ fontSize: 11, color: '#aaa', paddingLeft: 24 }}>
                + {companyInvestors.length - 10} more investors (all included by default)
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
          <button className="btn btn-primary" disabled={includedInvestors.length === 0}
            onClick={() => { setPreviewClientId(includedInvestors[0]?.id ?? ''); setStep(3) }}>
            Preview →
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3: Preview ──────────────────────────────────────────────────────
  if (step === 3) {
    const previewInvestor = includedInvestors.find(i => i.id === previewClientId) ?? includedInvestors[0]
    const investorInvs = investments.filter(i => i.client_id === previewInvestor?.id && i.company_id === companyId)
    const portRow = portfolio.find(r => r.client_id === previewInvestor?.id && r.company_id === companyId)
    const totalPortfolioValue = portfolio.filter(r => r.client_id === previewInvestor?.id).reduce((s, r) => s + Number(r.current_value ?? 0), 0)
    const firstName = previewInvestor?.client?.full_name?.split(' ')[0] ?? 'Investor'

    return (
      <div style={{ maxWidth: 800 }}>
        <UpdateBreadcrumb type="Type 3 — Long-form" step={3} steps={['Narrative', 'Investors', 'Preview', 'Approve', 'Done']} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Preview — personalised sample</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(4)}>Submit for approval →</button>
          </div>
        </div>
        <div style={{ marginBottom: 12, fontSize: 12, color: '#888' }}>
          Showing personalised version for:{' '}
          <select value={previewClientId} onChange={e => setPreviewClientId(e.target.value)}
            style={{ ...inputStyle, width: 'auto', display: 'inline-block', padding: '3px 8px' }}>
            {includedInvestors.map(({ id, client }) => <option key={id} value={id}>{client?.full_name}</option>)}
          </select>
          <span style={{ marginLeft: 10, fontSize: 11, color: '#aaa' }}>
            Company narrative is identical for all investors — only holdings and totals vary
          </span>
        </div>

        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 4, padding: '40px 48px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontFamily: 'Georgia, serif' }}>
          {/* Header */}
          <div style={{ borderBottom: '2px solid #0f2744', paddingBottom: 14, marginBottom: 22 }}>
            <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Juno Capital Partners LLP</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0f2744', marginTop: 4 }}>
              {updateTitle || `${selectedCompany?.name} — Update`}
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{formatDate(updateDate)}</div>
          </div>

          {/* Salutation */}
          <div style={{ fontSize: 12, marginBottom: 18 }}>Dear {firstName},</div>

          {/* Narrative */}
          <div style={{ fontSize: 12, lineHeight: 1.8, color: '#222', marginBottom: 24, whiteSpace: 'pre-wrap' }}>
            {narrative}
          </div>

          {/* Data blocks */}
          {selectedBlocks.size > 0 && (
            <div style={{ marginBottom: 24 }}>
              {selectedBlocks.has('gain_loss') && portRow && (
                <div style={{ marginBottom: 14, padding: '12px 16px', border: '0.5px solid #e0e0d8', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#aaa', marginBottom: 8 }}>
                    Your holding in {selectedCompany?.name}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Invested</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{formatCurrency(portRow.total_invested)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current value</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{formatCurrency(portRow.current_value)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gain / loss</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: Number(portRow.gain_loss) >= 0 ? '#0f6e56' : '#a32d2d' }}>
                        {formatCurrency(portRow.gain_loss)}
                        {' '}
                        {Number(portRow.total_invested) > 0 && (
                          <span style={{ fontSize: 11 }}>
                            ({formatPercent((Number(portRow.gain_loss) / Number(portRow.total_invested)) * 100)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Holdings */}
          <InvestorStatementPreview
            investorName={previewInvestor?.client?.full_name ?? ''}
            companyName={selectedCompany?.name ?? ''}
            investments={investorInvs}
            portRow={portRow}
            totalPortfolioValue={totalPortfolioValue}
          />

          {/* Sign off */}
          {signedOffBy && (
            <div style={{ marginTop: 24, fontSize: 11, color: '#555' }}>
              <div>Kind regards,</div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{signedOffBy}</div>
              <div style={{ color: '#888' }}>Juno Capital Partners LLP</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
          <button className="btn btn-primary" onClick={() => setStep(4)}>Submit for approval →</button>
        </div>
      </div>
    )
  }

  // ── Step 4: Approve & send ────────────────────────────────────────────────
  if (step === 4) {
    const drafter = teamMembers.find(m => m.id === drafterId)
    const canApprove = approverId && approverId !== drafterId

    return (
      <div style={{ maxWidth: 560 }}>
        <UpdateBreadcrumb type="Type 3 — Long-form" step={4} steps={['Narrative', 'Investors', 'Preview', 'Approve', 'Done']} />

        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Submission summary</div>
          <SummaryRow label="Company" value={selectedCompany?.name ?? '—'} />
          <SummaryRow label="Title" value={updateTitle || `${selectedCompany?.name} — Update`} />
          <SummaryRow label="Drafted by" value={drafter?.full_name ?? 'Not specified'} />
          <SummaryRow label="Recipients" value={`${includedInvestors.length} investors`} />
          <SummaryRow label="Data blocks" value={selectedBlocks.size > 0 ? [...selectedBlocks].map(k => DATA_BLOCKS.find(b => b.key === k)?.label ?? k).join(', ') : 'None'} />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Approval</div>
          <p style={{ fontSize: 11, color: '#888', margin: '0 0 12px' }}>
            The approver must be a different team member from the drafter.
          </p>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Approving team member *</label>
            <select value={approverId} onChange={e => setApproverId(e.target.value)} style={inputStyle}>
              <option value="">— Select approver —</option>
              {teamMembers.filter(m => m.id !== drafterId).map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
            {approverId && approverId === drafterId && (
              <div style={{ fontSize: 11, color: '#a32d2d', marginTop: 4 }}>Approver must be different from drafter</div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Approval note (optional)</label>
            <textarea value={approvalNote} onChange={e => setApprovalNote(e.target.value)}
              rows={3} placeholder="Any notes for the record…" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setStep(3)}>← Review preview</button>
          <button className="btn btn-primary" disabled={!canApprove || sending} onClick={handleApproveAndSend}>
            {sending ? 'Sending…' : `Approve & send to ${includedInvestors.length} investors`}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 5: Done ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 480 }}>
      <UpdateBreadcrumb type="Type 3 — Long-form" step={5} steps={['Narrative', 'Investors', 'Preview', 'Approve', 'Done']} />
      <SuccessCard
        count={includedInvestors.length}
        companyName={selectedCompany?.name ?? ''}
        onBack={onBack}
        detail={`Drafted by ${teamMembers.find(m => m.id === drafterId)?.full_name ?? 'team'} · Approved by ${teamMembers.find(m => m.id === approverId)?.full_name ?? 'team'}`}
      />
    </div>
  )
}

// ─── Shared Sub-components ────────────────────────────────────────────────────

function InvestorStatementPreview({
  investorName,
  companyName,
  investments,
  portRow,
  totalPortfolioValue,
}: {
  investorName: string
  companyName: string
  investments: InvestmentRow[]
  portRow: PortfolioRow | undefined
  totalPortfolioValue: number
}) {
  const totalShares = portRow ? Number(portRow.total_shares) : 0
  const pricePerShare = totalShares > 0 && portRow ? Number(portRow.current_value) / totalShares : 0

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 8 }}>
        Your holdings in {companyName}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc' }}>
            {['Date', 'Shares', 'EIS', 'Share class', 'Invested', 'Current value'].map(h => (
              <th key={h} style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#666', padding: '5px 6px', textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {investments.map((inv, i) => {
            const cv = inv.shares_purchased * pricePerShare
            return (
              <tr key={i} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                <td style={{ padding: '5px 6px', fontSize: 10 }}>{formatDate(inv.investment_date)}</td>
                <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>{Number(inv.shares_purchased).toLocaleString()}</td>
                <td style={{ padding: '5px 6px', fontSize: 10 }}>
                  {inv.eis_status ? <span style={{ fontSize: 8, background: '#e0eaf9', color: '#185fa5', padding: '1px 4px', borderRadius: 99 }}>{inv.eis_status.toUpperCase()}</span> : '—'}
                </td>
                <td style={{ padding: '5px 6px', fontSize: 10 }}>{inv.share_class ?? '—'}</td>
                <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>{formatCurrency(inv.sum_subscribed)}</td>
                <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>{formatCurrency(cv)}</td>
              </tr>
            )
          })}
          {portRow && (
            <tr style={{ borderTop: '1px solid #ccc' }}>
              <td colSpan={4} style={{ padding: '5px 6px', fontSize: 10, fontWeight: 700 }}>{companyName} total</td>
              <td style={{ padding: '5px 6px', fontSize: 10, fontWeight: 700, textAlign: 'right' }}>{formatCurrency(portRow.total_invested)}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, fontWeight: 700, textAlign: 'right' }}>{formatCurrency(portRow.current_value)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ fontSize: 10, color: '#555', borderTop: '0.5px solid #ddd', paddingTop: 10 }}>
        <strong>Total Juno portfolio value:</strong> {formatCurrency(totalPortfolioValue)}
      </div>
    </div>
  )
}

function UpdateBreadcrumb({ type, step, steps }: { type: string; step: number; steps: string[] }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>
        <Link href="/reports" style={{ color: '#aaa', textDecoration: 'none' }}>Reports</Link>
        {' / '}
        <Link href="/reports/investor-update" style={{ color: '#aaa', textDecoration: 'none' }}>Investor update</Link>
        {' / '}
        <span style={{ color: '#555' }}>{type}</span>
      </div>
      <div style={{ display: 'flex', gap: 0 }}>
        {steps.map((s, i) => {
          const n = i + 1
          const active = n === step
          const done   = n < step
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', fontSize: 9, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? '#1d9e75' : active ? '#0f2744' : '#e8e7e0',
                  color: done || active ? '#fff' : '#aaa',
                }}>
                  {done ? '✓' : n}
                </div>
                <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? '#0f2744' : done ? '#1d9e75' : '#aaa' }}>
                  {s}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: 20, height: 1, background: '#ddd', margin: '0 8px' }} />
              )}
            </div>
          )
        })}
      </div>
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

function SuccessCard({ count, companyName, onBack, detail }: { count: number; companyName: string; onBack: () => void; detail?: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Update sent</div>
      <p style={{ fontSize: 12, color: '#555', margin: '0 0 6px' }}>
        {count} personalised {count === 1 ? 'email' : 'emails'} sent for {companyName}.
      </p>
      {detail && <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 20px' }}>{detail}</p>}
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 20px' }}>
        Saved to each investor's Updates sent tab.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <Link href="/reports" className="btn btn-secondary">Back to reports</Link>
        <button className="btn btn-primary" onClick={onBack}>Send another</button>
      </div>
    </div>
  )
}
