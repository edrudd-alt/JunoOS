'use client'

import { useState, useRef, useEffect } from 'react'
import type { SellDealType, SellSetupData, NetProceedsMethod } from './sellWizardTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string
  name: string
  share_classes?: string[] | null
}

interface Props {
  dealType:    SellDealType
  companies:   Company[]
  initialData?: SellSetupData
  onContinue:  (data: SellSetupData) => void
  onBack:      () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SetupStep({ dealType, companies, initialData, onContinue, onBack }: Props) {
  const isFullExit = dealType === 'full_exit'
  const today      = new Date().toISOString().slice(0, 10)

  // Company search
  const [companySearch,   setCompanySearch]   = useState('')
  const [showDropdown,    setShowDropdown]     = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(
    initialData ? (companies.find(c => c.id === initialData.companyId) ?? null) : null
  )

  // Form fields
  const [grossPrice,    setGrossPrice]   = useState(initialData?.grossPricePerShare ?? '')
  const [saleDate,      setSaleDate]     = useState(initialData?.saleDate ?? today)
  const [dealCosts,     setDealCosts]    = useState(initialData?.dealCosts ?? '')
  const [method,        setMethod]       = useState<NetProceedsMethod>(initialData?.netProceedsMethod ?? 'gross_less_costs')
  const [netPrice,      setNetPrice]     = useState(initialData?.netPricePerShare ?? '')
  const [totalNet,      setTotalNet]     = useState(initialData?.totalNetProceeds ?? '')
  const [shareClass,    setShareClass]   = useState(initialData?.shareClass ?? '')
  const [notes,         setNotes]        = useState(initialData?.notes ?? '')
  const [error,         setError]        = useState('')

  const dropdownRef = useRef<HTMLDivElement>(null)

  const filtered = companySearch.trim()
    ? companies.filter(c => c.name.toLowerCase().includes(companySearch.toLowerCase()))
    : companies

  function selectCompany(c: Company) {
    setSelectedCompany(c)
    setCompanySearch('')
    setShowDropdown(false)
    if (!shareClass && c.share_classes?.length) {
      setShareClass(c.share_classes[0])
    }
  }

  function clearCompany() {
    setSelectedCompany(null)
    setCompanySearch('')
    setShareClass('')
  }

  function handleContinue() {
    if (!selectedCompany)             { setError('Please select a company'); return }
    if (!grossPrice || parseFloat(grossPrice) <= 0) { setError('Please enter a valid gross sale price'); return }
    if (!saleDate)                    { setError('Please enter a sale date'); return }
    setError('')
    onContinue({
      companyId:          selectedCompany.id,
      companyName:        selectedCompany.name,
      grossPricePerShare: grossPrice,
      saleDate,
      dealCosts,
      netProceedsMethod:  method,
      netPricePerShare:   netPrice,
      totalNetProceeds:   totalNet,
      shareClass,
      notes,
    })
  }

  return (
    <div>
      {error && (
        <div style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#a32d2d', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 10, borderBottom: '0.5px solid #f0f0ec' }}>
          Deal details
        </div>

        {/* Company */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelSt}>Company *</label>
          {selectedCompany ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#f0f6ff', border: '0.5px solid #c5d9f5',
                borderRadius: 6, padding: '6px 12px', fontSize: 13, color: '#0f2744',
              }}>
                <span style={{ fontWeight: 500 }}>{selectedCompany.name}</span>
                <button
                  onClick={clearCompany}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 14, lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              </div>
            </div>
          ) : (
            <div style={{ position: 'relative', maxWidth: 320 }} ref={dropdownRef}>
              <input
                type="text"
                value={companySearch}
                onChange={e => { setCompanySearch(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Search companies…"
                style={{ ...inputSt, maxWidth: 320 }}
                autoComplete="off"
              />
              {showDropdown && filtered.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: '#fff', border: '0.5px solid #d0d0c8', borderRadius: 5,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxHeight: 200, overflowY: 'auto',
                  marginTop: 2,
                }}>
                  {filtered.map(c => (
                    <div
                      key={c.id}
                      onMouseDown={() => selectCompany(c)}
                      style={{
                        padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                        borderBottom: '0.5px solid #f5f5f2',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f5f9ff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '' }}
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Gross price + date row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelSt}>Gross price per share *</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#888', pointerEvents: 'none' }}>£</span>
              <input
                type="number" min="0" step="0.0001"
                value={grossPrice}
                onChange={e => setGrossPrice(e.target.value)}
                style={{ ...inputSt, paddingLeft: 24 }}
                placeholder="0.0000"
              />
            </div>
          </div>

          <div>
            <label style={labelSt}>Sale date *</label>
            <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} style={inputSt} />
          </div>

          <div>
            <label style={labelSt}>Deal costs (£)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#888', pointerEvents: 'none' }}>£</span>
              <input
                type="number" min="0" step="0.01"
                value={dealCosts}
                onChange={e => setDealCosts(e.target.value)}
                style={{ ...inputSt, paddingLeft: 24 }}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Net proceeds method */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelSt}>Net proceeds method</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {NET_METHODS.map(m => (
              <label key={m.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="net_method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value as NetProceedsMethod)}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{m.description}</div>
                </div>
              </label>
            ))}
          </div>

          {method === 'given_net_price' && (
            <div style={{ marginTop: 10, maxWidth: 220 }}>
              <label style={labelSt}>Net price per share *</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#888', pointerEvents: 'none' }}>£</span>
                <input
                  type="number" min="0" step="0.0001"
                  value={netPrice}
                  onChange={e => setNetPrice(e.target.value)}
                  style={{ ...inputSt, paddingLeft: 24 }}
                  placeholder="0.0000"
                />
              </div>
            </div>
          )}

          {method === 'calculate_from_total' && (
            <div style={{ marginTop: 10, maxWidth: 220 }}>
              <label style={labelSt}>Total net proceeds *</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#888', pointerEvents: 'none' }}>£</span>
                <input
                  type="number" min="0" step="0.01"
                  value={totalNet}
                  onChange={e => setTotalNet(e.target.value)}
                  style={{ ...inputSt, paddingLeft: 24 }}
                  placeholder="0.00"
                />
              </div>
            </div>
          )}
        </div>

        {/* Share class + notes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
          <div>
            <label style={labelSt}>Share class</label>
            <input
              type="text"
              value={shareClass}
              onChange={e => setShareClass(e.target.value)}
              style={inputSt}
              placeholder="e.g. Ordinary A"
            />
          </div>
          <div>
            <label style={labelSt}>Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={inputSt}
              placeholder="Optional internal notes"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} className="btn btn-secondary">← Back</button>
        <button onClick={handleContinue} className="btn btn-primary">
          Continue to investors →
        </button>
      </div>
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NET_METHODS = [
  {
    value:       'gross_less_costs',
    label:       'Gross less deal costs',
    description: "Deal costs deducted proportionally from each investor's gross proceeds",
  },
  {
    value:       'given_net_price',
    label:       'Given net price per share',
    description: 'A fixed net price per share is applied to each investor',
  },
  {
    value:       'calculate_from_total',
    label:       'Calculate from total net proceeds',
    description: 'A total net figure is allocated proportionally by shares sold',
  },
] as const

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 12, outline: 'none', boxSizing: 'border-box',
  background: '#fff', fontFamily: 'inherit',
}
const labelSt: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4,
}
