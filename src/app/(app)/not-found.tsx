import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div className="card" style={{ maxWidth: 440, width: '100%', textAlign: 'center', padding: '40px 32px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#ccc', letterSpacing: '0.08em', marginBottom: 12 }}>
          404
        </div>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0f2744', margin: '0 0 8px' }}>
          Page not found
        </h1>
        <p style={{ fontSize: 12, color: '#999', margin: '0 0 28px' }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '7px 18px' }}
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
