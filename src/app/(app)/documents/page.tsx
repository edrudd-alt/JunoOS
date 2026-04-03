const FILTER_PILLS = ['All', 'Board minutes', 'Management accounts', 'KPIs', 'Investor docs', 'Legal']

export default function DocumentsPage() {
  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>Documents</h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Company and investor documents</p>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search documents…"
          disabled
          style={{
            padding: '7px 12px', fontSize: 12,
            border: '0.5px solid #d0d0c8', borderRadius: 5,
            background: '#f5f5f2', color: '#aaa', width: 240,
            outline: 'none', cursor: 'not-allowed',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTER_PILLS.map((label, i) => (
            <span
              key={label}
              className={i === 0 ? 'pill pill-navy' : 'pill pill-grey'}
              style={{ fontSize: 11, cursor: 'default' }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Empty state */}
      <div className="card" style={{ textAlign: 'center', padding: '52px 32px' }}>
        <div style={{ fontSize: 28, marginBottom: 16 }}>📄</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#0f2744', marginBottom: 8 }}>
          Documents section coming soon
        </div>
        <div style={{ fontSize: 12, color: '#888', maxWidth: 440, margin: '0 auto 24px' }}>
          Upload and manage documents from individual company and client pages.
        </div>
        <div style={{
          display: 'inline-block', fontSize: 11, color: '#888',
          background: '#f7f7f5', border: '0.5px solid #e8e7e0',
          borderRadius: 6, padding: '10px 16px', maxWidth: 480,
        }}>
          Documents uploaded via deals, client records, and company pages will appear here once this section is built.
        </div>
      </div>
    </div>
  )
}
