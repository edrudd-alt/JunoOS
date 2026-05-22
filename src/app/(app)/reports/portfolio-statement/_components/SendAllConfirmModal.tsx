'use client'

import { useState, useTransition, useEffect } from 'react'
import { getRawEmailTemplate } from '@/app/(app)/settings/email-templates/emailTemplateActions'
import { startBulkSend, type BulkRunSummary } from '../bulkRunActions'

interface Props {
  sourceRun: BulkRunSummary
  outlookEmail: string
  onClose: () => void
  onStarted: (bulkRunId: string) => void
}

export default function SendAllConfirmModal({ sourceRun, outlookEmail, onClose, onStarted }: Props) {
  const [subject, setSubject] = useState('')
  const [body,    setBody]    = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Load template from DB on each open (sourceRun identity change = new open)
  useEffect(() => {
    setError(null)
    getRawEmailTemplate('portfolio_statement').then(tmpl => {
      if (tmpl) {
        setSubject(tmpl.subject)
        setBody(tmpl.body)
      }
    })
  }, [sourceRun.id])

  // Trap Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const sendCount = sourceRun.succeeded_count

  const labelRowSt: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: '#888', marginBottom: 4,
  }
  const inputSt: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    border: '0.5px solid #e8e7e0', borderRadius: 5,
    fontSize: 12, outline: 'none', boxSizing: 'border-box',
    background: '#fafaf8', color: '#0f2744', fontFamily: 'inherit',
  }

  function handleSend() {
    setError(null)
    startTransition(async () => {
      try {
        const { bulkRunId } = await startBulkSend({
          sourceRunId:     sourceRun.id,
          subjectTemplate: subject.trim(),
          bodyTemplate:    body.trim(),
        })
        onStarted(bulkRunId)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start send run')
      }
    })
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
      <div
        className="card"
        style={{ width: 600, maxWidth: '92vw', padding: '24px 28px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#0f2744' }}>Send all via Outlook</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            tabIndex={-1}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', lineHeight: 1, padding: '0 2px' }}
          >
            ×
          </button>
        </div>

        {/* Summary row */}
        <div style={{
          background: '#f5f5f2', borderRadius: 6, padding: '10px 14px',
          marginBottom: 16, border: '0.5px solid #e8e7e0',
          display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recipients</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744', marginTop: 2 }}>{sendCount} investor{sendCount !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ width: 1, background: '#e8e7e0', alignSelf: 'stretch' }} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sending from</div>
            <div style={{ fontSize: 12, color: '#0f2744', marginTop: 2 }}>{outlookEmail}</div>
          </div>
        </div>

        {/* Placeholder hint */}
        <div style={{
          background: '#f0f9ff', border: '0.5px solid #bae6fd',
          borderRadius: 6, padding: '8px 12px', marginBottom: 16,
          fontSize: 11, color: '#0369a1', lineHeight: 1.6,
        }}>
          Use <code style={{ background: '#e0f2fe', borderRadius: 3, padding: '1px 4px' }}>{'{{client_first_name}}'}</code> and{' '}
          <code style={{ background: '#e0f2fe', borderRadius: 3, padding: '1px 4px' }}>{'{{period}}'}</code> as placeholders — substituted per investor at send time.
        </div>

        {/* Subject */}
        <div style={{ marginBottom: 12 }}>
          <div style={labelRowSt}><span>Subject</span></div>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            style={inputSt}
          />
        </div>

        {/* Body */}
        <div style={{ marginBottom: 16 }}>
          <div style={labelRowSt}><span>Body</span></div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            style={{ ...inputSt, resize: 'vertical', minHeight: 160, lineHeight: 1.6 }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '0.5px solid #fca5a5',
            borderRadius: 6, padding: '8px 12px', marginBottom: 12,
            fontSize: 11, color: '#991b1b',
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 12, borderTop: '0.5px solid #f0f0ea', gap: 12,
        }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={pending || !subject.trim() || !body.trim()}
            onClick={handleSend}
            style={{ fontSize: 12 }}
          >
            {pending ? 'Starting…' : `Send ${sendCount} statement${sendCount !== 1 ? 's' : ''} via Outlook`}
          </button>
        </div>
      </div>
    </div>
  )
}
