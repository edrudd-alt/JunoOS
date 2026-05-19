'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Company, Client, DealInvestor } from './wizardTypes'
import { DEAL_TYPES, inputStyle } from './wizardTypes'
import { Field } from './wizardHelpers'

interface Props {
  // Deal details state
  dealType: string
  setDealType: (v: string) => void
  companyId: string
  setCompanyId: (v: string) => void
  shareClass: string
  setShareClass: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  sharePrice: string
  setSharePrice: (v: string) => void
  investmentDate: string
  setInvestmentDate: (v: string) => void
  eisQualifying: 'yes' | 'no' | 'tbc'
  setEisQualifying: (v: 'yes' | 'no' | 'tbc') => void
  // Investors state
  investors: DealInvestor[]
  setInvestors: React.Dispatch<React.SetStateAction<DealInvestor[]>>
  clientSearch: string
  setClientSearch: (v: string) => void
  // Checklist state
  checklist: Record<string, boolean>
  setChecklist: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  // Passed data
  companies: Company[]
  clients: Client[]
  // Status
  error: string
  saving: boolean
  // Callbacks
  onNext: () => void
}

export function DealSetupStep({
  dealType, setDealType, companyId, setCompanyId, shareClass, setShareClass,
  amount, setAmount, sharePrice, setSharePrice, investmentDate, setInvestmentDate,
  eisQualifying, setEisQualifying, investors, setInvestors, clientSearch, setClientSearch,
  checklist, setChecklist, companies, clients, error, saving, onNext,
}: Props) {
  const isInvestmentDeal = dealType === 'new_investment' || dealType === 'follow_on'

  const [shareClassOptions, setShareClassOptions] = useState<{ name: string }[]>([])
  useEffect(() => {
    setShareClassOptions([])
    if (!companyId) return
    createClient()
      .from('company_share_classes')
      .select('name')
      .eq('company_id', companyId)
      .order('name')
      .then(({ data }) => setShareClassOptions(data ?? []))
  }, [companyId])

  const sharesCalc = amount && sharePrice
    ? (parseFloat(amount) / parseFloat(sharePrice)).toFixed(0)
    : null
  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) &&
    !investors.find(i => i.clientId === c.id)
  )

  function addInvestor(client: Client) {
    setInvestors(prev => [...prev, {
      clientId: client.id,
      name:     client.full_name,
      email:    client.email ?? '',
      feeRate:  client.default_fee_rate,
      poaHeld:  false,
    }])
    setClientSearch('')
  }

  function removeInvestor(clientId: string) {
    setInvestors(prev => prev.filter(i => i.clientId !== clientId))
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
          Deal details
        </div>

        <Field label="Deal type" required>
          <select value={dealType} onChange={e => setDealType(e.target.value)} style={inputStyle}>
            {DEAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>

        {isInvestmentDeal && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Company" required>
                <select value={companyId} onChange={e => { setCompanyId(e.target.value); setShareClass('') }} style={inputStyle}>
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Share class">
                <select value={shareClass} onChange={e => setShareClass(e.target.value)} style={inputStyle} disabled={!companyId}>
                  <option value="">Select…</option>
                  {shareClassOptions.map(sc => <option key={sc.name} value={sc.name}>{sc.name}</option>)}
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="Investment amount (£)" required>
                <input
                  type="number" min="0" step="0.01"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="50000" style={inputStyle}
                />
              </Field>
              <Field label="Share price (£)" required>
                <input
                  type="number" min="0" step="0.0001"
                  value={sharePrice} onChange={e => setSharePrice(e.target.value)}
                  placeholder="1.0000" style={inputStyle}
                />
              </Field>
              <Field label="Shares" hint="Auto-calculated">
                <input
                  type="text" readOnly
                  value={sharesCalc ? parseInt(sharesCalc).toLocaleString() : '—'}
                  style={{ ...inputStyle, background: '#f9f9f7', color: '#888' }}
                />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Investment date">
                <input type="date" value={investmentDate} onChange={e => setInvestmentDate(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="EIS qualifying">
                <select value={eisQualifying} onChange={e => setEisQualifying(e.target.value as 'yes' | 'no' | 'tbc')} style={inputStyle}>
                  <option value="tbc">TBC</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
            </div>
          </>
        )}
      </div>

      {/* Investors */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
          Investors for this deal
        </div>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Search and add investors…"
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
            style={inputStyle}
          />
          {clientSearch && filteredClients.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: '#fff', border: '0.5px solid #d0d0c8',
              borderRadius: 5, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              zIndex: 50, maxHeight: 200, overflowY: 'auto',
            }}>
              {filteredClients.slice(0, 8).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => addInvestor(c)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', fontSize: 12, background: 'none',
                    border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f2')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {c.full_name}
                  {c.email && <span style={{ color: '#aaa', marginLeft: 8 }}>{c.email}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {investors.length === 0 ? (
          <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>No investors added yet</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Investor</th>
                <th>Email</th>
                <th style={{ width: 100 }}>POA held</th>
                <th style={{ width: 80 }}>Fee rate</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {investors.map((inv, i) => (
                <tr key={inv.clientId}>
                  <td style={{ fontWeight: 500 }}>{inv.name}</td>
                  <td style={{ color: '#888', fontSize: 11 }}>{inv.email || '—'}</td>
                  <td>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={inv.poaHeld}
                        onChange={e => setInvestors(prev => prev.map((p, j) => j === i ? { ...p, poaHeld: e.target.checked } : p))}
                      />
                      {inv.poaHeld ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12 }}>
                      <input
                        type="number" step="0.1" min="0" max="100"
                        value={inv.feeRate}
                        onChange={e => setInvestors(prev => prev.map((p, j) => j === i ? { ...p, feeRate: parseFloat(e.target.value) || 0 } : p))}
                        style={{ width: 50, padding: '4px 6px', border: '0.5px solid #d0d0c8', borderRadius: 4, fontSize: 12, outline: 'none' }}
                      />
                      <span style={{ color: '#888' }}>%</span>
                    </div>
                  </td>
                  <td>
                    <button type="button" onClick={() => removeInvestor(inv.clientId)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d', fontSize: 16 }}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Completion checklist */}
      {isInvestmentDeal && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Completion checklist
            <span style={{ fontSize: 10, fontWeight: 400, color: '#888', marginLeft: 8 }}>Select what&apos;s required for this deal</span>
          </div>
          {[
            { key: 'signed_application',   label: 'Signed application form'     },
            { key: 'signed_agreement',      label: 'Signed investment agreement' },
            { key: 'share_certificate',     label: 'Share certificate'           },
            { key: 'eis_certificate',       label: 'EIS certificate'             },
            { key: 'transaction_statement', label: 'Transaction statement'       },
          ].map(item => (
            <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={checklist[item.key as keyof typeof checklist]}
                onChange={e => setChecklist(prev => ({ ...prev, [item.key]: e.target.checked }))}
              />
              {item.label}
            </label>
          ))}
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={onNext} disabled={saving} style={{ padding: '8px 20px' }}>
          {saving ? 'Saving…' : 'Next: Documents →'}
        </button>
        <Link href="/deals" className="btn btn-secondary">Cancel</Link>
      </div>
    </div>
  )
}
