'use client'

interface Props {
  dealId: string
}

export function CompleteStep({ dealId: _dealId }: Props) {
  return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Coming soon</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#0f2744', marginBottom: 8 }}>Complete deal</div>
      <div style={{ fontSize: 12, color: '#888' }}>
        Completion checklist — create sell transactions, deduct shares from holdings, log valuation.
      </div>
    </div>
  )
}
