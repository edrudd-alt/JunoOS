export default function CompanyPageLoading() {
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
            <div className="sk" style={{ height: 22, width: 180, borderRadius: 4 }} />
            <div className="sk" style={{ height: 13, width: 120, borderRadius: 3 }} />
          </div>
          <div className="sk" style={{ height: 32, width: 100, borderRadius: 5 }} />
        </div>
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card">
              <div className="sk" style={{ height: 11, width: 70, borderRadius: 3, marginBottom: 10 }} />
              <div className="sk" style={{ height: 22, width: 110, borderRadius: 4 }} />
            </div>
          ))}
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {[80, 90, 100, 80].map((w, i) => (
            <div key={i} className="sk" style={{ height: 30, width: w, borderRadius: 5 }} />
          ))}
        </div>
        {/* Chart area */}
        <div className="card" style={{ height: 260, marginBottom: 16 }}>
          <div className="sk" style={{ height: 13, width: 130, borderRadius: 3, marginBottom: 16 }} />
          <div className="sk" style={{ height: 180, width: '100%', borderRadius: 6 }} />
        </div>
        {/* Investors table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '0.5px solid #f0f0ec', background: '#f9f9f7' }}>
            {[140, 80, 90, 80].map((w, i) => (
              <div key={i} className="sk" style={{ height: 10, width: w, borderRadius: 3 }} />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < 3 ? '0.5px solid #f0f0ec' : undefined }}>
              <div className="sk" style={{ height: 13, width: 140, borderRadius: 3 }} />
              <div className="sk" style={{ height: 13, flex: 1, borderRadius: 3 }} />
              <div className="sk" style={{ height: 13, flex: 1, borderRadius: 3 }} />
              <div className="sk" style={{ height: 13, width: 80, borderRadius: 3 }} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
