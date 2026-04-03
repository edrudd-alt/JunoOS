export default function AppLoading() {
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
        {/* Search bar */}
        <div className="sk" style={{ height: 32, width: 260, marginBottom: 20, borderRadius: 6 }} />
        {/* Rows */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < 4 ? '0.5px solid #f0f0ec' : undefined }}>
              <div className="sk" style={{ height: 13, flex: 2, borderRadius: 3 }} />
              <div className="sk" style={{ height: 13, flex: 1, borderRadius: 3 }} />
              <div className="sk" style={{ height: 13, flex: 1, borderRadius: 3 }} />
              <div className="sk" style={{ height: 13, width: 60, borderRadius: 3 }} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
