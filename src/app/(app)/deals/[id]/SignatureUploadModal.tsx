'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadSignedForm } from './bookbuildActions'
import type { DealInvestorFull, ClientFull } from './dealUtils'

interface Props {
  di: DealInvestorFull
  client: ClientFull | null
  dealId: string
  dealCompanyId: string | null
  userId: string
  onUploaded: (investorName: string) => void
  onClose: () => void
}

export default function SignatureUploadModal({
  di, client, dealId, dealCompanyId, userId, onUploaded, onClose,
}: Props) {
  const supabase   = createClient()
  const fileRef    = useRef<HTMLInputElement>(null)
  const [file,     setFile]    = useState<File | null>(null)
  const [saving,   setSaving]  = useState(false)
  const [error,    setError]   = useState<string | null>(null)

  const investorName = client?.full_name ?? 'Unknown investor'
  const today = new Date().toISOString().split('T')[0]

  async function handleUpload() {
    if (!file)   { setError('Please select a PDF file.'); return }
    if (!userId) { setError('Not authenticated.'); return }

    setSaving(true); setError(null)
    const result = await uploadSignedForm(
      supabase, dealId, di.id, di.client_id, dealCompanyId,
      investorName, file, userId,
    )
    setSaving(false)
    if (result.error) { setError(result.error); return }
    onUploaded(investorName)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: '24px',
        width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', marginBottom: 6 }}>
          Upload signed application form
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
          {investorName}
        </div>

        {/* File input */}
        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Signed form (PDF)
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={e => {
              const f = e.target.files?.[0] ?? null
              if (f && f.type !== 'application/pdf') {
                setError('Only PDF files are accepted.'); setFile(null); return
              }
              setFile(f); setError(null)
            }}
            style={{ fontSize: 12, color: '#555' }}
          />
          {file && (
            <div style={{ fontSize: 11, color: '#1d9e75', marginTop: 4 }}>
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
        </label>

        <div style={{
          background: '#f5f5f0', borderRadius: 6, padding: '10px 12px',
          fontSize: 11, color: '#888', marginBottom: 20, lineHeight: 1.6,
        }}>
          Uploading will mark this investor as <strong>Signed</strong> and move them to the Signed &amp; beyond section.
        </div>

        {error && <div style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 12 }} disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={saving || !file}
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none',
              background: '#1d8c5e', color: '#fff', fontWeight: 600,
              cursor: (saving || !file) ? 'not-allowed' : 'pointer',
              opacity: (saving || !file) ? 0.6 : 1,
            }}
          >
            {saving ? 'Uploading…' : 'Upload and mark as signed'}
          </button>
        </div>
      </div>
    </div>
  )
}
