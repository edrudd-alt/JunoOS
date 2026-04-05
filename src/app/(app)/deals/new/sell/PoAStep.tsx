'use client'

interface Props {
  dealId: string
}

export function PoAStep({ dealId: _dealId }: Props) {
  return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Coming soon</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#0f2744', marginBottom: 8 }}>PoA verification</div>
      <div style={{ fontSize: 12, color: '#888' }}>
        Per-investor power of attorney check — confirm PoA documents are held and current.
      </div>
    </div>
  )
}
