'use client'

import Link from 'next/link'

export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>Settings</h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Platform configuration and data management</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Fund management — active */}
        <Link href="/settings/fund-management" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e8f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>⚖️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Fund management</div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                  Syndicate and Multi Manager fund types, fee structures and client assignments
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#185fa5', fontWeight: 500 }}>Open →</div>
            </div>
          </div>
        </Link>

        {/* Nominees — active */}
        <Link href="/settings/nominees" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#ede8f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🏛️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Nominees</div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                  Manage nominee entities used for nominee-held client investments
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#185fa5', fontWeight: 500 }}>Open →</div>
            </div>
          </div>
        </Link>

        {/* Share prices — active */}
        <Link href="/settings/share-prices" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e8f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>£</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Share prices</div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                  Update valuations for all portfolio companies and share classes
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#185fa5', fontWeight: 500 }}>Open →</div>
            </div>
          </div>
        </Link>

        {/* Bulk Upload — active */}
        <Link href="/settings/bulk-upload" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e0eaf9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📥</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Bulk upload</div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                  Import companies, clients, investments, valuations and KPI data from spreadsheets
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#185fa5', fontWeight: 500 }}>Open →</div>
            </div>
          </div>
        </Link>

        {/* Integrations — active */}
        <Link href="/settings/integrations" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e0eaf9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🔌</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>Integrations</div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                  Connect external services — Outlook, Xero, OneDrive and more
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#185fa5', fontWeight: 500 }}>Open →</div>
            </div>
          </div>
        </Link>

        {/* Future phase items */}
        {[
          { icon: '🔗', title: 'Xero integration', desc: 'Connect to Xero for invoice sync and payment tracking' },
          { icon: '☁️', title: 'OneDrive connection', desc: 'Link OneDrive folder structure for document management' },
          { icon: '✍️', title: 'Documenso connection', desc: 'Configure e-signature provider for deal documents' },
          { icon: '⚙️', title: 'Platform defaults', desc: 'Default disclaimer text, fee rates, notification preferences' },
          { icon: '👥', title: 'Team members', desc: 'Manage team member accounts and permissions' },
        ].map(item => (
          <div key={item.title} className="card" style={{ opacity: 0.55 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f0f0ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{item.title}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{item.desc}</div>
              </div>
              <span className="pill pill-grey" style={{ fontSize: 10 }}>Coming soon</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
