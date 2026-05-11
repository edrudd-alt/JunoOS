'use client'

import { useState, useEffect, useRef } from 'react'
import { previewApplicationForm, sendApplicationFormAction } from './applicationFormActions'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  dealInvestorId: string
  isReissue?: boolean
  onSent: () => void
  onClose: () => void
}

export default function SendApplicationFormModal({
  dealInvestorId, isReissue = false, onSent, onClose,
}: Props) {
  // Preview state
  const [pdfBlobUrl,     setPdfBlobUrl]     = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [previewError,   setPreviewError]   = useState<string | null>(null)
  const [bankDetailsOk,  setBankDetailsOk]  = useState(true)
  const [companyName,    setCompanyName]    = useState('')
  const [kycStatus,      setKycStatus]      = useState<string | null>(null)

  // Form state
  const [recipientEmail, setRecipientEmail] = useState('')
  const [ccEmails,       setCcEmails]       = useState<string[]>([])
  const [ccInput,        setCcInput]        = useState('')
  const [ccInputError,   setCcInputError]   = useState<string | null>(null)
  const ccInputRef = useRef<HTMLInputElement>(null)

  // Send state
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Fetch PDF preview on mount
  useEffect(() => {
    let objectUrl: string | null = null
    previewApplicationForm(dealInvestorId).then(result => {
      if ('error' in result) {
        setPreviewError(result.error)
        setLoadingPreview(false)
        return
      }
      setBankDetailsOk(result.bankDetailsOk)
      setCompanyName(result.companyName)
      setKycStatus(result.kycStatus)
      setRecipientEmail(result.investorEmail ?? '')

      // Convert base64 to blob URL for inline iframe display
      try {
        const bytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        setPdfBlobUrl(objectUrl)
      } catch {
        setPreviewError('Failed to render PDF preview.')
      }
      setLoadingPreview(false)
    })
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [dealInvestorId])

  // CC chip management
  function commitCcInput() {
    const email = ccInput.trim().replace(/,+$/, '')
    if (!email) return
    if (!EMAIL_RE.test(email)) { setCcInputError('Invalid email address'); return }
    if (ccEmails.includes(email)) { setCcInputError('Already added'); return }
    setCcEmails(prev => [...prev, email])
    setCcInput('')
    setCcInputError(null)
  }

  function handleCcKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitCcInput()
    } else if (e.key === 'Backspace' && ccInput === '' && ccEmails.length > 0) {
      setCcEmails(prev => prev.slice(0, -1))
    } else {
      setCcInputError(null)
    }
  }

  async function handleSend() {
    if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
      setSendError('A valid recipient email is required.')
      return
    }
    setSending(true)
    setSendError(null)
    const result = await sendApplicationFormAction({
      dealInvestorId,
      recipientEmail,
      ccEmails,
      isReissue,
    })
    setSending(false)
    if (!result.success) {
      setSendError(result.error ?? 'Send failed — please try again.')
      return
    }
    onSent()
  }

  const canSend = !loadingPreview && bankDetailsOk && !sending

  const kycWarning = kycStatus === 'outstanding' || kycStatus === 'renewal_due'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10,
        width: 720, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '0.5px solid #e8e8e0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744' }}>
              {isReissue ? 'Re-issue application form' : 'Send application form'}
            </div>
            {companyName && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{companyName}</div>
            )}
          </div>
          <button
            onClick={onClose} disabled={sending}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#aaa', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* PDF preview area — ~60% of modal height */}
        <div style={{
          height: 400, flexShrink: 0, background: '#f5f5f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '0.5px solid #e8e8e0',
        }}>
          {loadingPreview && (
            <div style={{ color: '#888', fontSize: 12 }}>Generating preview…</div>
          )}
          {previewError && !loadingPreview && (
            <div style={{ color: '#a32d2d', fontSize: 12, padding: '0 32px', textAlign: 'center' }}>
              Preview failed: {previewError}
            </div>
          )}
          {pdfBlobUrl && !loadingPreview && (
            <iframe
              src={pdfBlobUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Application form preview"
            />
          )}
        </div>

        {/* Controls */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flexShrink: 0 }}>

          {/* Bank details warning — blocks send */}
          {!loadingPreview && !bankDetailsOk && (
            <div style={{
              background: '#fff0f0', border: '1px solid #f5a0a0', borderRadius: 6,
              padding: '10px 12px', fontSize: 12, color: '#a32d2d', marginBottom: 12,
            }}>
              <strong>⛔ Bank details required.</strong>{' '}
              {companyName || 'This company'}&apos;s bank details have not been added.
              Investors won&apos;t know where to send funds.
              Please add bank details to the company record before sending.
            </div>
          )}

          {/* KYC warning — informational only */}
          {kycWarning && (
            <div style={{
              background: '#fff8e8', border: '1px solid #e8c84a', borderRadius: 6,
              padding: '10px 12px', fontSize: 12, color: '#8a6000', marginBottom: 12,
            }}>
              <strong>⚠ KYC {kycStatus === 'outstanding' ? 'outstanding' : 'renewal due'}</strong>{' '}
              — Consider sending a KYC request alongside the application form.
            </div>
          )}

          {/* Re-issue note */}
          {isReissue && (
            <div style={{
              background: '#f5f5f0', border: '1px solid #d0d0c8', borderRadius: 6,
              padding: '10px 12px', fontSize: 12, color: '#555', marginBottom: 12,
            }}>
              The existing application form will be marked <strong>superseded</strong> and the
              Documenso envelope cancelled. A new form and envelope will be created.
            </div>
          )}

          {/* Recipient */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4 }}>
              Send to
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={e => setRecipientEmail(e.target.value)}
              disabled={sending}
              placeholder="investor@example.com"
              style={{
                width: '100%', padding: '7px 10px', fontSize: 12,
                border: '1px solid #d0d0c8', borderRadius: 6, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* CC */}
          <div style={{ marginBottom: 4 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4 }}>
              CC (optional)
            </label>
            <div
              onClick={() => ccInputRef.current?.focus()}
              style={{
                minHeight: 36, padding: '4px 8px',
                border: '1px solid #d0d0c8', borderRadius: 6,
                display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
                cursor: 'text', background: sending ? '#fafaf8' : '#fff',
              }}
            >
              {ccEmails.map(email => (
                <span key={email} style={{
                  background: '#e8f0fb', borderRadius: 4, padding: '2px 6px',
                  fontSize: 11, color: '#0f2744', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {email}
                  <button
                    onClick={e => { e.stopPropagation(); setCcEmails(prev => prev.filter(e2 => e2 !== email)) }}
                    disabled={sending}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#888', padding: 0, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                ref={ccInputRef}
                type="text"
                value={ccInput}
                onChange={e => { setCcInput(e.target.value); setCcInputError(null) }}
                onKeyDown={handleCcKeyDown}
                onBlur={commitCcInput}
                disabled={sending}
                placeholder={ccEmails.length === 0 ? 'Type email and press Enter…' : ''}
                style={{
                  flex: 1, minWidth: 120, border: 'none', outline: 'none',
                  fontSize: 12, padding: '2px 2px', background: 'transparent',
                }}
              />
            </div>
            {ccInputError && (
              <div style={{ fontSize: 11, color: '#a32d2d', marginTop: 3 }}>{ccInputError}</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '0.5px solid #e8e8e0', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
        }}>
          {sendError && (
            <span style={{ fontSize: 11, color: '#a32d2d', flex: 1 }}>{sendError}</span>
          )}
          <button onClick={onClose} disabled={sending} className="btn btn-secondary" style={{ fontSize: 12 }}>
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              fontSize: 12, padding: '6px 18px', borderRadius: 6, border: 'none',
              background: canSend ? '#1d8c5e' : '#a8d5c2',
              color: '#fff', fontWeight: 600,
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}
          >
            {sending ? 'Sending…' : (isReissue ? 'Re-issue' : 'Send for signing')}
          </button>
        </div>
      </div>
    </div>
  )
}
