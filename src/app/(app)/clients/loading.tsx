export default function ClientsLoading() {
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
      <div style={{ maxWidth: 900 }}>
        {/* Title + search row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="sk" style={{ height: 20, width: 80, borderRadius: 4 }} />
          <div className="sk" style={{ height: 32, width: 220, borderRadius: 6 }} />
        </div>
        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '0.5px solid #f0f0ec', background: '#f9f9f7' }}>
            {[120, 160, 80, 80, 60].map((w, i) => (
              <div key={i} className="sk" style={{ height: 10, width: w, borderRadius: 3 }} />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < 4 ? '0.5px solid #f0f0ec' : undefined }}>
              <div className="sk" style={{ height: 13, width: 160, borderRadius: 3 }} />
              <div className="sk" style={{ height: 13, width: 120, borderRadius: 3 }} />
              <div className="sk" style={{ height: 13, flex: 1, borderRadius: 3 }} />
              <div className="sk" style={{ height: 13, width: 80, borderRadius: 3 }} />
              <div className="sk" style={{ height: 20, width: 40, borderRadius: 10 }} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
