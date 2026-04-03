'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DealInvestor } from './wizardTypes'

interface Props {
  dealId: string
  investors: DealInvestor[]
  checklist: Record<string, boolean>
  companyId: string
  companyName: string
  eisQualifying: string
  onDone: () => void
}

export function CompleteStep({
  dealId, investors, checklist, companyId, companyName, eisQualifying, onDone,
}: Props) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({
    signed_application:    false,
    signed_agreement:      false,
    share_certificate:     false,
    eis_certificate:       false,
    transaction_statement: false,
  })
  const [uploading, setUploading] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const CHECKLIST_LABELS: Record<string, string> = {
    signed_application:    'Signed application form',
    signed_agreement:      'Signed investment agreement',
    share_certificate:     'Share certificate',
    eis_certificate:       'EIS certificate',
    transaction_statement: 'Transaction statement',
  }

  const requiredItems = Object.entries(checklist)
    .filter(([key, required]) => {
      if (!required) return false
      if (key === 'eis_certificate' && eisQualifying === 'no') return false
      return true
    })

  const allTicked = requiredItems.every(([key]) => ticked[key])

  async function handleGenerate(key: string) {
    const supabase = createClient()
    await supabase.from('internal_updates').insert({
      company_id:  companyId || null,
      update_type: 'document',
      description: `Generated: ${CHECKLIST_LABELS[key]} — ${companyName}`,
      created_by:  null,
    })
    setTicked(prev => ({ ...prev, [key]: true }))
  }

  async function handleUpload(key: string, file: File) {
    setUploading(key)
    const supabase = createClient()

    const companySlug  = companyName.toLowerCase().replace(/\s+/g, '-')
    const investorName = investors[0]?.name ?? 'unknown'
    const investorSlug = investorName.toLowerCase().replace(/\s+/g, '-')
    const path = `${companySlug}/${investorSlug}/${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: true })

    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
      await supabase.from('documents').insert({
        deal_id:       dealId,
        filename:      file.name,
        type:          key as 'share_certificate',
        storage_url:   publicUrl,
        document_date: new Date().toISOString().slice(0, 10),
      })
      setTicked(prev => ({ ...prev, [key]: true }))
    }

    setUploading(null)
  }

  async function markComplete() {
    setCompleting(true)
    const supabase = createClient()

    await supabase.from('deals').update({ status: 'complete', updated_at: new Date().toISOString() }).eq('id', dealId)

    for (const inv of investors) {
      await supabase
        .from('investments')
        .update({ status: 'active' })
        .eq('client_id', inv.clientId)
        .eq('status', 'pending')
    }

    await supabase.from('internal_updates').insert({
      company_id:  companyId || null,
      update_type: 'deal',
      description: `Deal completed: ${companyName}`,
      created_by:  null,
    })

    setCompleting(false)
    onDone()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
      {/* Left: checklist */}
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 14, paddingBottom: 6, borderBottom: '0.5px solid #e8e7e0' }}>
            Completion checklist
          </div>

          {requiredItems.map(([key]) => {
            const done     = ticked[key]
            const isEis    = key === 'eis_certificate'
            const isStmt   = key === 'transaction_statement'
            const canUpload = key === 'share_certificate' || isEis || key === 'signed_application' || key === 'signed_agreement'

            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: '0.5px solid #f0f0ec',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: done ? '#1d9e75' : isEis && !done ? 'transparent' : '#e8e7e0',
                    border: isEis && !done ? '1.5px dashed #ba7517' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {done && <span style={{ fontSize: 11, color: '#fff', fontWeight: 700 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{
                      fontSize: 12, fontWeight: done ? 400 : 500,
                      color: done ? '#888' : '#333',
                      textDecoration: done ? 'line-through' : 'none',
                    }}>
                      {CHECKLIST_LABELS[key]}
                    </div>
                    {isEis && !done && (
                      <div style={{ fontSize: 10, color: '#ba7517', marginTop: 2 }}>Awaiting HMRC (typically 3–6 months)</div>
                    )}
                  </div>
                </div>

                {!done && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {done ? (
                      <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 10px' }}>View</button>
                    ) : null}
                    {isStmt && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 10, padding: '3px 10px' }}
                        onClick={() => handleGenerate(key)}
                      >
                        Generate
                      </button>
                    )}
                    {canUpload && (
                      <>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 10, padding: '3px 10px' }}
                          disabled={uploading === key}
                          onClick={() => fileInputRefs.current[key]?.click()}
                        >
                          {uploading === key ? 'Uploading…' : 'Upload'}
                        </button>
                        <input
                          ref={el => { fileInputRefs.current[key] = el }}
                          type="file"
                          style={{ display: 'none' }}
                          accept=".pdf,.doc,.docx"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) handleUpload(key, file)
                          }}
                        />
                      </>
                    )}
                  </div>
                )}

                {done && (
                  <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 10px' }}>View</button>
                )}
              </div>
            )
          })}
        </div>

        {allTicked && (
          <div style={{
            background: '#f0faf5', border: '0.5px solid #a8dfc5',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            fontSize: 12, color: '#0f5c38',
          }}>
            All required items complete. Mark the deal as complete to activate the investment.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={markComplete}
            disabled={!allTicked || completing}
            style={{ padding: '8px 24px', opacity: allTicked ? 1 : 0.5 }}
          >
            {completing ? 'Completing…' : 'Mark deal complete ✓'}
          </button>
          <button className="btn btn-secondary" onClick={onDone}>
            Save &amp; finish later
          </button>
        </div>
        {!allTicked && (
          <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
            Complete all required items to mark the deal as complete.
          </p>
        )}
      </div>

      {/* Right: deal summary + OneDrive preview */}
      <div>
        <div className="card" style={{ background: '#f9f9f7', fontSize: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deal summary</div>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
            <dt style={{ color: '#888' }}>Company</dt>
            <dd style={{ margin: 0, fontWeight: 500 }}>{companyName || '—'}</dd>
            <dt style={{ color: '#888' }}>Investors</dt>
            <dd style={{ margin: 0 }}>{investors.map(i => i.name).join(', ') || '—'}</dd>
            <dt style={{ color: '#888' }}>Status</dt>
            <dd style={{ margin: 0 }}><span className="pill pill-amber" style={{ fontSize: 10 }}>Completing</span></dd>
          </dl>
        </div>

        <div className="card" style={{ background: '#f9f9f7', fontSize: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0f2744', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>OneDrive filing</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Documents will be filed at:</div>
          {investors.slice(0, 2).map(inv => (
            <div key={inv.clientId} style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', marginBottom: 4, wordBreak: 'break-all' }}>
              Deals / {companyName} / {inv.name} /
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
