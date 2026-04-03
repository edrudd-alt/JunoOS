'use client'

import Link from 'next/link'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div className="card" style={{ maxWidth: 440, width: '100%', textAlign: 'center', padding: '40px 32px' }}>
        <div style={{ fontSize: 28, marginBottom: 16 }}>⚠</div>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0f2744', margin: '0 0 8px' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 12, color: '#999', margin: '0 0 28px', lineHeight: 1.6 }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={reset}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '7px 18px' }}
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '7px 18px' }}
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
