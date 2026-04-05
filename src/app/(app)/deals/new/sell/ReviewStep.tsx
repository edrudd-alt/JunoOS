'use client'

interface Props {
  dealId: string
}

export function ReviewStep({ dealId: _dealId }: Props) {
  return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Coming soon</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#0f2744', marginBottom: 8 }}>Review &amp; fee calculations</div>
      <div style={{ fontSize: 12, color: '#888' }}>
        Full fee calculations — Syndicate: profit × fee rate; Multi-Manager: 2% × cost × years (capped at 10%).
      </div>
    </div>
  )
}
