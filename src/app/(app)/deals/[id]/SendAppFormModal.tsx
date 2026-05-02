'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendApplicationForm, reIssueApplicationForm } from './bookbuildActions'
import type { DealInvestorFull, ClientFull } from './dealUtils'

interface Props {
  di: DealInvestorFull
  client: ClientFull | null
  dealId: string
  dealCompanyId: string | null
  userId: string
  isReissue?: boolean
  onSent: (investorName: string) => void
  onClose: () => void
}

export default function SendAppFormModal({
  di, client, dealId, dealCompanyId, userId, isReissue = false, onSent, onClose,
}: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const investorName = client?.full_name ?? 'Unknown investor'
  const feeDisplay   = di.fee_pct != null ? `${(Number(di.fee_pct) * 100).toFixed(2)}%` : '—'
  const kycOutstanding = client?.kyc_status === 'outstanding'
  const kycRenewal     = client?.kyc_status === 'renewal_due'

  async function handleSend() {
    if (!userId) { setError('Not authenticated.'); return }
    setSaving(true); setError(null)

    const result = isReissue
      ? await reIssueApplicationForm(supabase, dealId, di.id, dealCompanyId, di.client_id, investorName, userId)
      : await sendApplicationForm(supabase, dealId, di.id, dealCompanyId, di.client_id, investorName, userId)

    setSaving(false)
    if (result.error) { setError(result.error); return }
    onSent(investorName)
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
          {isReissue ? 'Re-issue application form' : 'Send application form'}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
          {investorName}
        </div>

        {(kycOutstanding || kycRenewal) && (
          <div style={{
            background: '#fff8e8', border: '1px solid #e8c84a', borderRadius: 6,
            padding: '10px 12px', fontSize: 12, color: '#8a6000', marginBottom: 16,
          }}>
            <strong>⚠ KYC {kycOutstanding ? 'outstanding' : 'renewal due'}</strong> — Consider sending a KYC request alongside the application form. KYC handling is currently outside JunoOS.
          </div>
        )}

        {isReissue && (
          <div style={{
            background: '#f5f5f0', border: '1px solid #d0d0c8', borderRadius: 6,
            padding: '10px 12px', fontSize: 12, color: '#555', marginBottom: 16,
          }}>
            The existing draft will be marked <strong>superseded</strong> and a new version created.
          </div>
        )}

        <div style={{
          background: '#f5f5f0', borderRadius: 6, padding: '12px',
          fontSize: 12, color: '#555', marginBottom: 20, lineHeight: 1.6,
        }}>
          <div><strong>Investor:</strong> {investorName}</div>
          <div><strong>Fee:</strong> {feeDisplay} — will be locked on send</div>
        </div>

        <div style={{
          fontSize: 11, color: '#888',
          borderTop: '0.5px solid #e8e8e0', paddingTop: 12, marginBottom: 16,
        }}>
          🔒 Sending will lock the fee on this document. A placeholder draft will be created (Outlook integration coming soon).
        </div>

        {error && <div style={{ fontSize: 12, color: '#a32d2d', marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 12 }} disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleSend} disabled={saving}
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none',
              background: '#1d8c5e', color: '#fff', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Sending…' : (isReissue ? 'Re-issue' : 'Send')}
          </button>
        </div>
      </div>
    </div>
  )
}
