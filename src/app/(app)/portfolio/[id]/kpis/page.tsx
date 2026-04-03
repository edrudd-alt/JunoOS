import { BarChart2 } from 'lucide-react'

export default function KpiPage() {
  return (
    <div>
      <h1 style={{ fontSize: 17, fontWeight: 500, marginBottom: 16 }}>KPI History</h1>
      <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#888' }}>
          <BarChart2 size={24} strokeWidth={1.5} />
          <p style={{ fontSize: 13, margin: 0 }}>KPI tracking is being built</p>
          <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>In the meantime, you can upload company documents from the company page.</p>
        </div>
      </div>
    </div>
  )
}
