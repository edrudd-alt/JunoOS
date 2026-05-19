'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { BuyDealType, EisStatus, SetupData } from './buyWizardTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id:   string
  name: string
}

interface ShareClassOption {
  id:             string
  name:           string
  instrument_type: string
}

interface Props {
  dealType:     BuyDealType
  companies:    Company[]
  initialData?: SetupData
  onBack:       () => void
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
  background: '#fff', fontFamily: 'inherit',
}

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4,
}

const errSt: React.CSSProperties = {
  fontSize: 11, color: '#a32d2d', marginTop: 4,
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SetupStep({ dealType, companies, initialData, onBack }: Props) {
  const isFollowOn = dealType === 'follow_on'
  const supabase   = createClient()
  const router     = useRouter()

  // Company search/select
  const [companyId,       setCompanyId]       = useState(initialData?.companyId   ?? '')
  const [companyName,     setCompanyName]      = useState(initialData?.companyName ?? '')
  const [companySearch,   setCompanySearch]    = useState('')
  const [showCompanyDrop, setShowCompanyDrop]  = useState(false)
  const companyInputRef = useRef<HTMLInputElement>(null)

  // Share class — fetched from company_share_classes when company is selected
  const [shareClassId,      setShareClassId]      = useState(initialData?.shareClassId ?? '')
  const [shareClass,        setShareClass]         = useState(initialData?.shareClass  ?? '')
  const [shareClassOptions, setShareClassOptions]  = useState<ShareClassOption[]>([])
  const [loadingClasses,    setLoadingClasses]     = useState(false)

  // Other deal fields
  const [sharePrice,     setSharePrice]     = useState(initialData?.sharePrice     ?? '')
  const [investmentDate, setInvestmentDate] = useState(
    initialData?.investmentDate ?? new Date().toISOString().slice(0, 10),
  )
  const [eisQualifying, setEisQualifying] = useState<EisStatus>(
    initialData?.eisQualifying ?? 'tbc',
  )
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(companySearch.toLowerCase()),
  )

  // Fetch share classes from company_share_classes whenever company changes
  useEffect(() => {
    setShareClassId('')
    setShareClass('')
    setShareClassOptions([])
    if (!companyId) return

    setLoadingClasses(true)
    supabase
      .from('company_share_classes')
      .select('id, name, instrument_type')
      .eq('company_id', companyId)
      .order('name')
      .then(({ data }) => {
        setShareClassOptions(data ?? [])
        setLoadingClasses(false)
      })
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  function selectCompany(c: Company) {
    setCompanyId(c.id)
    setCompanyName(c.name)
    setCompanySearch('')
    setShowCompanyDrop(false)
  }

  function clearCompany() {
    setCompanyId('')
    setCompanyName('')
    setCompanySearch('')
    setShareClassId('')
    setShareClass('')
    setShareClassOptions([])
    setTimeout(() => companyInputRef.current?.focus(), 0)
  }

  async function handleSave() {
    setError('')
    if (!companyId)                                { setError('Please select a company'); return }
    if (!shareClassId)                             { setError('Please select a share class'); return }
    if (!sharePrice || parseFloat(sharePrice) <= 0) { setError('Please enter a valid share price'); return }
    if (!investmentDate)                           { setError('Please select an investment date'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .insert({
        deal_type:                 dealType,
        company_id:                companyId,
        share_class_id:            shareClassId,
        share_class:               shareClass,
        share_price:               parseFloat(sharePrice),
        investment_date:           investmentDate,
        eis_qualifying:            eisQualifying,
        status:                    'draft',
        price_confirmed_at_setup:  false,
        created_by:                user?.id ?? null,
      })
      .select('id')
      .single()

    if (dealErr || !deal) {
      setError('Failed to create deal: ' + (dealErr?.message ?? 'unknown error'))
      setSaving(false)
      return
    }

    await supabase.from('internal_updates').insert({
      company_id:  companyId,
      update_type: 'deal',
      description: `Deal created: ${isFollowOn ? 'Follow-on investment' : 'New investment'} — ${companyName}`,
      created_by:  user?.id ?? null,
    })

    router.push(`/deals/${deal.id}`)
  }

  return (
    <div>
      {/* Follow-on banner */}
      {isFollowOn && companyId && (
        <div style={{
          background: '#f0faf6', border: '0.5px solid #b8e8d4', borderRadius: 6,
          padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#0a5a3d',
        }}>
          Follow-on investment in <strong>{companyName}</strong>
        </div>
      )}

      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', marginBottom: 20, paddingBottom: 10, borderBottom: '0.5px solid #f0f0ec' }}>
          Deal details
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Company */}
          <div>
            <label style={labelSt}>Company *</label>
            {companyId ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', border: '0.5px solid #d0d0c8',
                borderRadius: 5, background: '#f9f9f7',
              }}>
                <span style={{ flex: 1, fontSize: 13, color: '#0f2744', fontWeight: 500 }}>
                  {companyName}
                </span>
                <button
                  onClick={clearCompany}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, padding: 0, lineHeight: 1 }}
                  title="Change company"
                >
                  ×
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input
                  ref={companyInputRef}
                  type="text"
                  placeholder="Search companies…"
                  value={companySearch}
                  onChange={e => { setCompanySearch(e.target.value); setShowCompanyDrop(true) }}
                  onFocus={() => setShowCompanyDrop(true)}
                  onBlur={() => setTimeout(() => setShowCompanyDrop(false), 150)}
                  style={inputSt}
                  autoComplete="off"
                />
                {showCompanyDrop && filteredCompanies.length > 0 && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
                    background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 5,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100,
                    maxHeight: 220, overflowY: 'auto',
                  }}>
                    {filteredCompanies.slice(0, 20).map(c => (
                      <button
                        key={c.id}
                        onMouseDown={() => selectCompany(c)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '9px 12px', fontSize: 13, background: 'none',
                          border: 'none', borderBottom: '0.5px solid #f5f5f2',
                          cursor: 'pointer', color: '#333', fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f2')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {showCompanyDrop && companySearch && filteredCompanies.length === 0 && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
                    background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 5,
                    padding: '10px 12px', fontSize: 12, color: '#aaa', zIndex: 100,
                  }}>
                    No companies match &ldquo;{companySearch}&rdquo;
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Share class — from company_share_classes */}
          <div>
            <label style={labelSt}>Share class *</label>
            {!companyId ? (
              <div style={{ ...inputSt, background: '#f9f9f7', color: '#aaa', cursor: 'not-allowed' }}>
                Select a company first
              </div>
            ) : loadingClasses ? (
              <div style={{ ...inputSt, background: '#f9f9f7', color: '#aaa' }}>
                Loading…
              </div>
            ) : shareClassOptions.length === 0 ? (
              <div style={{ padding: '7px 10px', border: '0.5px solid #f0c674', borderRadius: 5, background: '#fffbf0', fontSize: 12, color: '#78500a' }}>
                No share classes found. Add share classes in the{' '}
                <strong>Share classes</strong> tab on the company page first.
              </div>
            ) : (
              <select
                value={shareClassId}
                onChange={e => {
                  const id     = e.target.value
                  const option = shareClassOptions.find(sc => sc.id === id)
                  setShareClassId(id)
                  setShareClass(option?.name ?? '')
                }}
                style={inputSt}
              >
                <option value="">— Select —</option>
                {shareClassOptions.map(sc => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}{sc.instrument_type === 'cln' || sc.instrument_type === 'loan_note' ? ' (CLN)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

          {/* Share price */}
          <div>
            <label style={labelSt}>Share price per share *</label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 13, color: '#888', pointerEvents: 'none',
              }}>
                £
              </span>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={sharePrice}
                onChange={e => setSharePrice(e.target.value)}
                placeholder="0.0000"
                style={{ ...inputSt, paddingLeft: 26 }}
              />
            </div>
          </div>

          {/* Investment date */}
          <div>
            <label style={labelSt}>Investment date</label>
            <input
              type="date"
              value={investmentDate}
              onChange={e => setInvestmentDate(e.target.value)}
              style={inputSt}
            />
          </div>

          {/* EIS qualifying */}
          <div>
            <label style={labelSt}>EIS qualifying</label>
            <select
              value={eisQualifying}
              onChange={e => setEisQualifying(e.target.value as EisStatus)}
              style={inputSt}
            >
              <option value="tbc">TBC</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        {error && <p style={errSt}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '0.5px solid #f0f0ec' }}>
          <button onClick={onBack} className="btn btn-secondary" disabled={saving}>← Back</button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating deal…' : 'Create deal'}
          </button>
        </div>
      </div>
    </div>
  )
}
