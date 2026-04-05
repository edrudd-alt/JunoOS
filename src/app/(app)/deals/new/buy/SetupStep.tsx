'use client'

import { useState, useRef, useEffect } from 'react'
import type { BuyDealType, EisStatus, SetupData } from './buyWizardTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id:            string
  name:          string
  share_classes: { name: string; type?: string }[] | null
}

interface Props {
  dealType:     BuyDealType
  companies:    Company[]
  initialData?: SetupData    // pre-fill when navigating back from step 2
  onContinue:   (data: SetupData) => void
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

export function SetupStep({ dealType, companies, initialData, onContinue, onBack }: Props) {
  const isFollowOn = dealType === 'follow_on'

  // Company search/select
  const [companyId,        setCompanyId]        = useState(initialData?.companyId   ?? '')
  const [companyName,      setCompanyName]       = useState(initialData?.companyName ?? '')
  const [companySearch,    setCompanySearch]     = useState('')
  const [showCompanyDrop,  setShowCompanyDrop]   = useState(false)
  const companyInputRef = useRef<HTMLInputElement>(null)

  // Deal fields
  const [shareClass,       setShareClass]       = useState(initialData?.shareClass     ?? '')
  const [shareClassCustom, setShareClassCustom] = useState('')
  const [sharePrice,       setSharePrice]       = useState(initialData?.sharePrice     ?? '')
  const [investmentDate,   setInvestmentDate]   = useState(
    initialData?.investmentDate ?? new Date().toISOString().slice(0, 10),
  )
  const [eisQualifying, setEisQualifying] = useState<EisStatus>(
    initialData?.eisQualifying ?? 'tbc',
  )
  const [error, setError] = useState('')

  const selectedCompany = companies.find(c => c.id === companyId) ?? null
  const shareClasses: { name: string }[] = Array.isArray(selectedCompany?.share_classes)
    ? (selectedCompany!.share_classes as { name: string }[])
    : []

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(companySearch.toLowerCase()),
  )

  // Effective share class — 'custom' means user typed their own value
  const effectiveShareClass = shareClass === '_custom' ? shareClassCustom : shareClass

  // When company changes, reset share class
  useEffect(() => {
    setShareClass('')
    setShareClassCustom('')
  }, [companyId])

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
    setShareClass('')
    setShareClassCustom('')
    setTimeout(() => companyInputRef.current?.focus(), 0)
  }

  function handleContinue() {
    setError('')
    if (!companyId)                                         { setError('Please select a company'); return }
    if (!sharePrice || parseFloat(sharePrice) <= 0)         { setError('Please enter a valid share price'); return }
    if (!investmentDate)                                    { setError('Please select an investment date'); return }

    onContinue({
      companyId,
      companyName,
      shareClass:     effectiveShareClass,
      sharePrice,
      investmentDate,
      eisQualifying,
    })
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
              /* Selected state */
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
              /* Search state */
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

          {/* Share class */}
          <div>
            <label style={labelSt}>Share class</label>
            {shareClasses.length > 0 ? (
              <>
                <select
                  value={shareClass}
                  onChange={e => setShareClass(e.target.value)}
                  style={inputSt}
                  disabled={!companyId}
                >
                  <option value="">— Select —</option>
                  {shareClasses.map(sc => (
                    <option key={sc.name} value={sc.name}>{sc.name}</option>
                  ))}
                  <option value="_custom">Other (type below)…</option>
                </select>
                {shareClass === '_custom' && (
                  <input
                    type="text"
                    value={shareClassCustom}
                    onChange={e => setShareClassCustom(e.target.value)}
                    placeholder="e.g. Preference"
                    style={{ ...inputSt, marginTop: 6 }}
                  />
                )}
              </>
            ) : (
              <input
                type="text"
                value={shareClass}
                onChange={e => setShareClass(e.target.value)}
                placeholder={companyId ? 'e.g. Ordinary, Preference…' : 'Select a company first'}
                style={{ ...inputSt, background: companyId ? '#fff' : '#f9f9f7' }}
                disabled={!companyId}
              />
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
          <button onClick={onBack} className="btn btn-secondary">← Back</button>
          <button onClick={handleContinue} className="btn btn-primary">
            Continue → Investors
          </button>
        </div>
      </div>
    </div>
  )
}
