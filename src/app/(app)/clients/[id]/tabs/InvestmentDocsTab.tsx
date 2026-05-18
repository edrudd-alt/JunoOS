export default function InvestmentDocsTab() {
  return (
    <div
      style={{
        background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8,
        padding: '40px 16px', textAlign: 'center', color: '#888',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: '#0f2744', marginBottom: 6 }}>
        Investment docs
      </div>
      <p style={{ fontSize: 12, margin: 0 }}>
        Two-level document tree (Company → Year → Documents) coming in sub-stage 1.5.
      </p>
    </div>
  )
}
