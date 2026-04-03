'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f5f5f2' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 8,
            border: '0.5px solid #e8e7e0',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            maxWidth: 440,
            width: '100%',
            textAlign: 'center',
            padding: '40px 32px',
          }}>
            <div style={{ fontSize: 28, marginBottom: 16 }}>⚠</div>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0f2744', margin: '0 0 8px' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 12, color: '#999', margin: '0 0 28px' }}>
              A critical error occurred. Please reload the page.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '7px 18px', fontSize: 12, fontWeight: 500,
                background: '#0f2744', color: '#fff',
                border: 'none', borderRadius: 5, cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
