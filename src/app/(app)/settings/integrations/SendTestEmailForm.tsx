'use client'

import { useState, useTransition } from 'react'
import { sendTestEmail } from '@/app/(app)/settings/outlookActions'

export default function SendTestEmailForm() {
  const [to, setTo]           = useState('')
  const [subject, setSubject] = useState('')
  const [result, setResult]   = useState<{ ok: true } | { error: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      const res = await sendTestEmail({ to, subject: subject || undefined })
      setResult(res)
    })
  }

  return (
    <div style={{
      background: '#f7f7f5',
      border: '0.5px solid #e8e7e0',
      borderRadius: 8,
      padding: '14px 16px',
      marginTop: 14,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 10 }}>
        Send test email
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>To</label>
          <input
            type="email"
            required
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="recipient@example.com"
            style={{
              width: '100%',
              fontSize: 12,
              padding: '6px 8px',
              border: '0.5px solid #d0cfc8',
              borderRadius: 6,
              background: '#fff',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>
            Subject <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="JunoOS Outlook test"
            style={{
              width: '100%',
              fontSize: 12,
              padding: '6px 8px',
              border: '0.5px solid #d0cfc8',
              borderRadius: 6,
              background: '#fff',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary"
            style={{ fontSize: 12 }}
          >
            {pending ? 'Sending…' : 'Send test email'}
          </button>
          {result && 'ok' in result && (
            <span style={{ fontSize: 12, color: '#1d9e75' }}>
              Test email sent to {to}
            </span>
          )}
          {result && 'error' in result && (
            <span style={{ fontSize: 12, color: '#c0392b' }}>{result.error}</span>
          )}
        </div>
      </form>
    </div>
  )
}
