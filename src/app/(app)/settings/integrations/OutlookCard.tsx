'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { disconnectOutlook } from '@/app/(app)/settings/outlookActions'
import SendTestEmailForm from './SendTestEmailForm'

type ConnectionStatus =
  | { connected: false }
  | { connected: true; email: string; connectedAt: string }

function formatDate(isoString: string): string {
  const d = new Date(isoString)
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export default function OutlookCard({ status }: { status: ConnectionStatus }) {
  const router = useRouter()
  const [disconnecting, startDisconnect] = useTransition()

  function handleDisconnect() {
    startDisconnect(async () => {
      await disconnectOutlook()
      router.refresh()
    })
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: '#e0eaf9', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>
            📧
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Outlook</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
              Send portfolio statements directly from your Outlook mailbox.
            </div>
          </div>
        </div>

        {status.connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1d9e75', display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: '#1d9e75', fontWeight: 500 }}>Connected</span>
          </div>
        )}
      </div>

      {status.connected ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>
            Connected as: <span style={{ color: '#0f2744', fontWeight: 500 }}>{status.email}</span>
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            Connected on: {formatDate(status.connectedAt)}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="btn"
              style={{ fontSize: 12, color: '#c0392b', borderColor: '#c0392b' }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
            <a
              href="/api/auth/microsoft/start"
              className="btn"
              style={{ fontSize: 12, textDecoration: 'none' }}
            >
              Reconnect
            </a>
          </div>

          <SendTestEmailForm />
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
            Status: Not connected
          </div>
          <a
            href="/api/auth/microsoft/start"
            className="btn btn-primary"
            style={{ fontSize: 12, textDecoration: 'none', display: 'inline-block' }}
          >
            Connect Outlook
          </a>
        </div>
      )}
    </div>
  )
}
