export default function ClientDetailLoading() {
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
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="sk" style={{ height: 22, width: 200, borderRadius: 4 }} />
            <div className="sk" style={{ height: 13, width: 140, borderRadius: 3 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="sk" style={{ height: 32, width: 90, borderRadius: 5 }} />
            <div className="sk" style={{ height: 32, width: 70, borderRadius: 5 }} />
          </div>
        </div>
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card">
              <div className="sk" style={{ height: 11, width: 80, borderRadius: 3, marginBottom: 10 }} />
              <div className="sk" style={{ height: 22, width: 100, borderRadius: 4 }} />
            </div>
          ))}
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {[70, 80, 90, 60].map((w, i) => (
            <div key={i} className="sk" style={{ height: 30, width: w, borderRadius: 5 }} />
          ))}
        </div>
        {/* Content area — two column */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ height: 220 }}>
            <div className="sk" style={{ height: 13, width: 120, borderRadius: 3, marginBottom: 16 }} />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div className="sk" style={{ height: 12, width: 90, borderRadius: 3 }} />
                <div className="sk" style={{ height: 12, flex: 1, borderRadius: 3 }} />
              </div>
            ))}
          </div>
          <div className="card" style={{ height: 220 }}>
            <div className="sk" style={{ height: 13, width: 140, borderRadius: 3, marginBottom: 16 }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div className="sk" style={{ height: 12, width: 80, borderRadius: 3 }} />
                <div className="sk" style={{ height: 12, flex: 1, borderRadius: 3 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
