'use client'

import { useEffect, useRef } from 'react'
import { formatDocumentTimestamp } from '@/lib/utils'
import { formatPeriodDateUK } from '@/lib/templateUtils'
import { getDownloadUrlForDocument } from '../documentActions'

export interface DecisionModalStatement {
  documentId: string
  filename: string
  periodDate: string
  generatedAtIso: string
}

interface Props {
  open: boolean
  onClose: () => void
  onEmail: () => void
  statement: DecisionModalStatement
}

export default function StatementDecisionModal({ open, onClose, onEmail, statement }: Props) {
  const viewBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    viewBtnRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  async function handleView() {
    const url = await getDownloadUrlForDocument(statement.documentId)
    if (url) window.open(url, '_blank')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 480, maxWidth: '92vw', padding: '24px 28px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#0f2744' }}>Statement generated</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', lineHeight: 1, padding: '0 2px' }}
          >
            ×
          </button>
        </div>

        {/* Meta line */}
        <p style={{ fontSize: 11, color: '#888', margin: '0 0 16px', lineHeight: 1.6 }}>
          Period: {formatPeriodDateUK(statement.periodDate)}
          {' · '}Generated {formatDocumentTimestamp(statement.generatedAtIso)}
          {' · '}Saved to Documents
        </p>

        {/* PDF preview card */}
        <div style={{
          background: '#f5f5f2', borderRadius: 6, padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 14,
          marginBottom: 20, border: '0.5px solid #e8e7e0',
        }}>
          <div style={{
            width: 36, height: 44, flexShrink: 0,
            background: '#fff', border: '0.5px solid #d0d0c8',
            borderRadius: 4, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 9, fontWeight: 600,
            color: '#aaa', letterSpacing: '0.02em',
          }}>
            PDF
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>{statement.filename}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>2 pages · A4 landscape</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            ref={viewBtnRef}
            className="btn btn-secondary"
            onClick={handleView}
            style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
          >
            View
          </button>
          <button
            className="btn btn-primary"
            onClick={onEmail}
            style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
          >
            Email to client
          </button>
        </div>
      </div>
    </div>
  )
}
