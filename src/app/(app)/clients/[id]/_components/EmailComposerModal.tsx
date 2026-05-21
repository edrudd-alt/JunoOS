'use client'

import { useEffect, useRef, useState } from 'react'
import {
  deriveClientFirstName,
  formatPeriodDateUK,
  PORTFOLIO_STATEMENT_SUBJECT_TEMPLATE,
  PORTFOLIO_STATEMENT_BODY_TEMPLATE,
} from '@/lib/templates'
import { getDownloadUrlForDocument } from '../documentActions'

export interface ComposerStatement {
  documentId: string
  filename: string
  periodDate: string
}

interface Props {
  open: boolean
  onClose: () => void
  statement: ComposerStatement
  client: {
    fullName: string
    email: string | null
  }
}

type CopyState = 'idle' | 'copied' | 'failed'

function useCopyButton(): { label: string; copy: (value: string) => void } {
  const [state, setState] = useState<CopyState>('idle')
  function copy(value: string) {
    navigator.clipboard.writeText(value).then(
      () => { setState('copied'); setTimeout(() => setState('idle'), 1500) },
      () => { setState('failed'); setTimeout(() => setState('idle'), 1500) },
    )
  }
  return {
    label: state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy',
    copy,
  }
}

export default function EmailComposerModal({ open, onClose, statement, client }: Props) {
  const subjectRef = useRef<HTMLInputElement>(null)
  const toCopy      = useCopyButton()
  const subjectCopy = useCopyButton()
  const bodyCopy    = useCopyButton()

  const periodFormatted  = formatPeriodDateUK(statement.periodDate)
  const clientFirstName  = deriveClientFirstName(client.fullName)
  const ctx = { clientFirstName, periodDateFormatted: periodFormatted }

  const [subject, setSubject] = useState(() => PORTFOLIO_STATEMENT_SUBJECT_TEMPLATE(ctx))
  const [body,    setBody]    = useState(() => PORTFOLIO_STATEMENT_BODY_TEMPLATE(ctx))

  // Reset fields and focus Subject on every open
  useEffect(() => {
    if (!open) return
    setSubject(PORTFOLIO_STATEMENT_SUBJECT_TEMPLATE({ clientFirstName: deriveClientFirstName(client.fullName), periodDateFormatted: formatPeriodDateUK(statement.periodDate) }))
    setBody(PORTFOLIO_STATEMENT_BODY_TEMPLATE({ clientFirstName: deriveClientFirstName(client.fullName), periodDateFormatted: formatPeriodDateUK(statement.periodDate) }))
    setTimeout(() => subjectRef.current?.focus(), 0)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, client.fullName, statement.periodDate])

  if (!open) return null

  async function handleDownload() {
    const url = await getDownloadUrlForDocument(statement.documentId)
    if (url) window.open(url, '_blank')
  }

  const labelRowSt: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: '#888', marginBottom: 4,
  }
  const inputSt: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    border: '0.5px solid #e8e7e0', borderRadius: 5,
    fontSize: 12, outline: 'none', boxSizing: 'border-box',
    background: '#fafaf8', color: '#0f2744',
  }
  const copyBtnSt: React.CSSProperties = {
    fontSize: 10, padding: '2px 8px',
    border: '0.5px solid #d0d0c8', borderRadius: 4,
    background: '#fff', cursor: 'pointer', color: '#555',
    whiteSpace: 'nowrap', fontFamily: 'inherit',
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
        style={{ width: 580, maxWidth: '92vw', padding: '24px 28px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#0f2744' }}>Email portfolio statement</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            tabIndex={-1}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', lineHeight: 1, padding: '0 2px' }}
          >
            ×
          </button>
        </div>

        {/* Context row — which statement is being emailed */}
        <div style={{
          background: '#f5f5f2', borderRadius: 6, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 12, border: '0.5px solid #e8e7e0',
        }}>
          <span style={{
            fontSize: 9, fontWeight: 600, color: '#aaa',
            border: '0.5px solid #d0d0c8', borderRadius: 3,
            padding: '2px 5px', background: '#fff',
          }}>
            PDF
          </span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>{statement.filename}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{periodFormatted}</div>
          </div>
        </div>

        {/* Warning banner */}
        <div style={{
          background: '#fffbeb', border: '0.5px solid #f0c674',
          borderRadius: 6, padding: '8px 12px', marginBottom: 16,
          fontSize: 11, color: '#78500a', lineHeight: 1.6,
        }}>
          Outlook integration not yet available. Use Copy buttons to paste into your email client. The PDF needs to be downloaded and attached manually.
        </div>

        {/* To field */}
        <div style={{ marginBottom: 12 }}>
          <div style={labelRowSt}>
            <span>To</span>
            <button
              style={copyBtnSt}
              aria-label="Copy recipient address"
              onClick={() => toCopy.copy(client.email ?? '')}
            >
              {toCopy.label}
            </button>
          </div>
          <input
            readOnly
            tabIndex={-1}
            value={client.email ?? ''}
            placeholder="No email on file"
            style={{
              ...inputSt,
              color: client.email ? '#0f2744' : '#aaa',
              cursor: 'default',
            }}
          />
        </div>

        {/* Subject field */}
        <div style={{ marginBottom: 12 }}>
          <div style={labelRowSt}>
            <span>Subject</span>
            <button
              style={copyBtnSt}
              aria-label="Copy subject"
              onClick={() => subjectCopy.copy(subject)}
            >
              {subjectCopy.label}
            </button>
          </div>
          <input
            ref={subjectRef}
            value={subject}
            onChange={e => setSubject(e.target.value)}
            style={inputSt}
          />
        </div>

        {/* Body field */}
        <div style={{ marginBottom: 12 }}>
          <div style={labelRowSt}>
            <span>Body</span>
            <button
              style={copyBtnSt}
              aria-label="Copy body"
              onClick={() => bodyCopy.copy(body)}
            >
              {bodyCopy.label}
            </button>
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            style={{
              ...inputSt,
              resize: 'vertical',
              minHeight: 140,
              fontFamily: 'inherit',
              lineHeight: 1.6,
            }}
          />
        </div>

        {/* Attachment row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: '#f5f5f2', borderRadius: 6,
          border: '0.5px solid #e8e7e0', marginBottom: 16, gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span className="pill pill-grey" style={{ fontSize: 10, flexShrink: 0 }}>PDF</span>
            <span style={{ fontSize: 11, color: '#0f2744', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {statement.filename}
            </span>
          </div>
          <button onClick={handleDownload} style={{ ...copyBtnSt, fontSize: 11, flexShrink: 0 }}>
            Download attachment
          </button>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 12, borderTop: '0.5px solid #f0f0ea', gap: 12,
        }}>
          <span style={{ fontSize: 11, color: '#aaa' }}>
            Send button enabled once Outlook integration ships
          </span>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 12, flexShrink: 0 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
