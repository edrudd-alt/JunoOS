'use client'

import { useState } from 'react'
import { getInitials } from '@/lib/utils'
import type { Client } from '@/types'

interface Props {
  lead: Client
  linkedEntityCount: number
}

function StubModal({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff', border: '0.5px solid #e8e7e0',
          borderRadius: 8, padding: '28px 32px', minWidth: 340, maxWidth: 460,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#0f2744' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#888', margin: 0, lineHeight: 1.5 }}>
          This feature comes in a later sub-stage.
        </p>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', fontSize: 12, fontWeight: 500,
              background: '#0f2744', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const ACTION_GROUPS = [
  {
    label: 'Reporting',
    items: ['Generate portfolio statement', 'Generate investor update letter', 'Generate EIS confirmation'],
  },
  {
    label: 'Documents & signatures',
    items: ['Send document for signature', 'Upload document'],
  },
  {
    label: 'Client',
    items: ['Add note', 'Edit client details'],
  },
]

export default function ClientHeader({ lead, linkedEntityCount }: Props) {
  const [modal,       setModal]       = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)

  const initials   = getInitials(lead.full_name)
  const entityTag  = linkedEntityCount > 0 ? `Lead · ${linkedEntityCount} entities` : 'Individual'

  // KYC pill
  const today     = new Date()
  const todayMs   = today.getTime()
  const NINETY    = 90 * 24 * 60 * 60 * 1000
  let kycBg: string, kycColor: string, kycLabel: string
  if (lead.kyc_status !== 'verified') {
    kycBg    = '#fde8e8'; kycColor = '#a32d2d'
    kycLabel = lead.kyc_status === 'renewal_due' ? 'KYC renewal due' : 'KYC outstanding'
  } else if (lead.kyc_expiry && new Date(lead.kyc_expiry).getTime() < todayMs) {
    kycBg    = '#fde8e8'; kycColor = '#a32d2d'
    kycLabel = 'KYC expired'
  } else if (lead.kyc_expiry && new Date(lead.kyc_expiry).getTime() - todayMs < NINETY) {
    kycBg    = '#fdf3e1'; kycColor = '#92571b'
    kycLabel = 'KYC expiring'
  } else {
    kycBg    = '#e1f5ee'; kycColor = '#085041'
    kycLabel = 'KYC verified'
  }

  // Date joined
  const joinedDate = lead.date_joined
    ? new Date(lead.date_joined).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null

  const showEis = lead.tax_status === 'eis' || lead.tax_status === 'both' || lead.tax_status === 'seis'

  const tagStyle: React.CSSProperties = {
    fontSize: 10, padding: '2px 7px', borderRadius: 5, fontWeight: 500,
  }

  const btnBase: React.CSSProperties = {
    fontSize: 12, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Avatar */}
        <div
          style={{
            width: 48, height: 48, borderRadius: '50%',
            background: '#1d9e75', color: '#fff',
            fontSize: 16, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, letterSpacing: '0.02em',
          }}
        >
          {initials}
        </div>

        {/* Name + meta row */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 500, color: '#0f2744' }}>
            {lead.full_name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
            {lead.investor_reference && (
              <span style={{ fontSize: 11, color: '#888' }}>
                <strong style={{ color: '#555', fontWeight: 500 }}>Ref</strong>{' '}
                {lead.investor_reference}
              </span>
            )}
            {joinedDate && (
              <span style={{ fontSize: 11, color: '#888' }}>
                <strong style={{ color: '#555', fontWeight: 500 }}>Joined</strong>{' '}
                {joinedDate}
              </span>
            )}
            <span style={{ ...tagStyle, background: '#eef2f7', color: '#4a6fa5' }}>
              {entityTag}
            </span>
            {showEis && (
              <span style={{ ...tagStyle, background: '#e1f5ee', color: '#085041' }}>
                EIS qualifying
              </span>
            )}
            <span style={{ ...tagStyle, background: kycBg, color: kycColor }}>
              {kycLabel}
            </span>
          </div>
        </div>

        {/* Action cluster */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexShrink: 0 }}>
          <button
            style={{ ...btnBase, background: '#0f2744', color: '#fff', border: '0.5px solid #0f2744', fontWeight: 500 }}
            onMouseEnter={e => (e.currentTarget.style.background = '#183553')}
            onMouseLeave={e => (e.currentTarget.style.background = '#0f2744')}
            onClick={() => setModal('Generate report')}
          >
            Generate report
          </button>
          <button
            style={{ ...btnBase, background: '#fff', color: '#444', border: '0.5px solid #d8d7d0' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f0f0ec')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            onClick={() => setModal('Add investment')}
          >
            + Add investment
          </button>

          {/* ⋯ Actions dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              style={{ ...btnBase, padding: '6px 8px', background: '#fff', color: '#444', border: '0.5px solid #d8d7d0' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f0ec')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
              onClick={() => setActionsOpen(o => !o)}
            >
              ⋯
            </button>
            {actionsOpen && (
              <div
                style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  background: '#fff', border: '0.5px solid #e8e7e0',
                  borderRadius: 6, minWidth: 240, zIndex: 100,
                  boxShadow: '0 4px 12px rgba(15,39,68,0.08)', padding: '6px 0',
                }}
                onMouseLeave={() => setActionsOpen(false)}
              >
                {ACTION_GROUPS.map((group, gi) => (
                  <div
                    key={group.label}
                    style={gi < ACTION_GROUPS.length - 1 ? { paddingBottom: 4, borderBottom: '0.5px solid #f2f2ef' } : { paddingBottom: 4 }}
                  >
                    <div style={{
                      fontSize: 10, color: '#aaa',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      padding: '4px 14px', fontWeight: 500,
                    }}>
                      {group.label}
                    </div>
                    {group.items.map(item => (
                      <button
                        key={item}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '6px 14px', fontSize: 12, color: '#333',
                          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#fafaf8')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        onClick={() => { setActionsOpen(false); setModal(item) }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {modal && <StubModal title={modal} onClose={() => setModal(null)} />}
    </>
  )
}
