export default function DashboardLoading() {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -600px 0 }
          100% { background-position:  600px 0 }
        }
        .sk {
          border-radius: 4px;
          background: linear-gradient(90deg, #eeede8 25%, #e4e3de 50%, #eeede8 75%);
          background-size: 600px 100%;
          animation: shimmer 1.4s infinite linear;
        }
      `}</style>
      <div style={{ maxWidth: 1100 }}>
        {/* Title */}
        <div className="sk" style={{ height: 20, width: 100, borderRadius: 4, marginBottom: 24 }} />
        {/* 4 stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card">
              <div className="sk" style={{ height: 11, width: 80, borderRadius: 3, marginBottom: 12 }} />
              <div className="sk" style={{ height: 26, width: 120, borderRadius: 4, marginBottom: 8 }} />
              <div className="sk" style={{ height: 11, width: 60, borderRadius: 3 }} />
            </div>
          ))}
        </div>
        {/* 2-column content */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left: activity feed */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #f0f0ec' }}>
              <div className="sk" style={{ height: 13, width: 110, borderRadius: 3 }} />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '11px 16px', borderBottom: i < 5 ? '0.5px solid #f0f0ec' : undefined }}>
                <div className="sk" style={{ height: 12, width: 70, borderRadius: 3, flexShrink: 0 }} />
                <div className="sk" style={{ height: 12, flex: 1, borderRadius: 3 }} />
              </div>
            ))}
          </div>
          {/* Right: valuation changes */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #f0f0ec' }}>
              <div className="sk" style={{ height: 13, width: 140, borderRadius: 3 }} />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < 4 ? '0.5px solid #f0f0ec' : undefined }}>
                <div className="sk" style={{ height: 13, flex: 1, borderRadius: 3 }} />
                <div className="sk" style={{ height: 13, width: 70, borderRadius: 3 }} />
                <div className="sk" style={{ height: 20, width: 50, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
