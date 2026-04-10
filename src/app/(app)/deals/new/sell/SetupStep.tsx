'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SellDealType } from './sellWizardTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id:   string
  name: string
}

interface ShareClassOption {
  id:   string
  name: string
}

interface SelectedClass {
  id:    string
  name:  string
  price: string
}

interface Props {
  dealType:  SellDealType
  companies: Company[]
  onBack:    () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SetupStep({ dealType, companies, onBack }: Props) {
  const isFullExit = dealType === 'full_exit'
  const today      = new Date().toISOString().slice(0, 10)
  const supabase   = createClient()
  const router     = useRouter()

  // Company
  const [companyId,       setCompanyId]      = useState('')
  const [companyName,     setCompanyName]    = useState('')
  const [companySearch,   setCompanySearch]  = useState('')
  const [showCompanyDrop, setShowCompanyDrop] = useState(false)
  const companyInputRef = useRef<HTMLInputElement>(null)

  // Share classes
  const [shareClassOptions, setShareClassOptions] = useState<ShareClassOption[]>([])
  const [loadingClasses,    setLoadingClasses]    = useState(false)
  const [selectedClasses,   setSelectedClasses]   = useState<SelectedClass[]>([])

  // Other fields
  const [saleDate, setSaleDate] = useState(today)
  const [notes,    setNotes]    = useState('')
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(companySearch.toLowerCase()),
  )

  // Fetch share classes whenever company changes
  useEffect(() => {
    setSelectedClasses([])
    setShareClassOptions([])
    if (!companyId) return

    setLoadingClasses(true)
    supabase
      .from('company_share_classes')
      .select('id, name')
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
    setSelectedClasses([])
    setShareClassOptions([])
    setTimeout(() => companyInputRef.current?.focus(), 0)
  }

  function toggleClass(option: ShareClassOption, checked: boolean) {
    if (checked) {
      setSelectedClasses(prev => [...prev, { id: option.id, name: option.name, price: '' }])
    } else {
      setSelectedClasses(prev => prev.filter(sc => sc.id !== option.id))
    }
  }

  function updatePrice(id: string, price: string) {
    setSelectedClasses(prev => prev.map(sc => sc.id === id ? { ...sc, price } : sc))
  }

  async function handleSave() {
    setError('')
    if (!companyId)                   { setError('Please select a company'); return }
    if (selectedClasses.length === 0) { setError('Please select at least one share class'); return }
    if (selectedClasses.some(sc => !sc.price || parseFloat(sc.price) <= 0)) {
      setError('Please enter a valid price for each selected share class'); return
    }
    if (!saleDate) { setError('Please enter a sale date'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const shareClassPrices = Object.fromEntries(
      selectedClasses.map(sc => [sc.name, parseFloat(sc.price)]),
    )

    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .insert({
        deal_type:            dealType,
        company_id:           companyId,
        investment_date:      saleDate,
        status:               'draft',
        created_by:           user?.id ?? null,
        share_class:          selectedClasses.map(sc => sc.name).join(', '),
        share_price:          parseFloat(selectedClasses[0].price),
        notes:                notes.trim() || null,
        completion_checklist: { share_class_prices: shareClassPrices },
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
      description: `Deal created: ${isFullExit ? 'Full exit' : 'Partial exit'} — ${companyName}`,
      created_by:  user?.id ?? null,
    })

    router.push(`/deals/${deal.id}`)
  }

  return (
    <div>
      {error && (
        <div style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#a32d2d', marginBottom: 16 }}>
          {error}
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
                <span style={{ flex: 1, fontSize: 13, color: '#0f2744', fontWeight: 500 }}>{companyName}</span>
                <button
                  onClick={clearCompany}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, padding: 0, lineHeight: 1 }}
                  title="Change company"
                >×</button>
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
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
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

          {/* Sale date */}
          <div>
            <label style={labelSt}>Sale date *</label>
            <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} style={inputSt} />
          </div>
        </div>

        {/* Share classes */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelSt}>Share classes *</label>
          {!companyId ? (
            <div style={{ ...inputSt, background: '#f9f9f7', color: '#aaa', cursor: 'not-allowed' }}>
              Select a company first
            </div>
          ) : loadingClasses ? (
            <div style={{ ...inputSt, background: '#f9f9f7', color: '#aaa' }}>Loading…</div>
          ) : shareClassOptions.length === 0 ? (
            <div style={{ padding: '7px 10px', border: '0.5px solid #f0c674', borderRadius: 5, background: '#fffbf0', fontSize: 12, color: '#78500a' }}>
              No share classes found. Add share classes in the <strong>Share classes</strong> tab on the company page first.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shareClassOptions.map(option => {
                const selected = selectedClasses.find(sc => sc.id === option.id)
                return (
                  <div key={option.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', minWidth: 160 }}>
                      <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={e => toggleClass(option, e.target.checked)}
                      />
                      <span style={{ fontSize: 13, color: '#0f2744' }}>{option.name}</span>
                    </label>
                    {selected && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#888' }}>Price per share</span>
                        <div style={{ position: 'relative' }}>
                          <span style={{
                            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                            fontSize: 12, color: '#888', pointerEvents: 'none',
                          }}>£</span>
                          <input
                            type="number" min="0" step="0.0001"
                            value={selected.price}
                            onChange={e => updatePrice(option.id, e.target.value)}
                            placeholder="0.0000"
                            style={{ ...inputSt, width: 130, paddingLeft: 24 }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelSt}>
            Notes <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional internal notes"
            style={inputSt}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: '0.5px solid #f0f0ec' }}>
          <button onClick={onBack} className="btn btn-secondary" disabled={saving}>← Back</button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating deal…' : 'Create deal'}
          </button>
        </div>
      </div>
    </div>
  )
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
