export type TabKey = 'overview' | 'investments' | 'investment_docs' | 'updates_sent' | 'notes'

interface TabDef {
  key: TabKey
  label: string
  count?: number
}

interface Props {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  investmentCount: number
  investmentDocsCount: number
  updatesSentCount: number
  notesCount: number
}

export default function ClientTabs({
  activeTab, onTabChange,
  investmentCount, investmentDocsCount, updatesSentCount, notesCount,
}: Props) {
  const tabs: TabDef[] = [
    { key: 'overview',        label: 'Overview' },
    { key: 'investments',     label: 'Investments',     count: investmentCount },
    { key: 'investment_docs', label: 'Investment docs', count: investmentDocsCount },
    { key: 'updates_sent',    label: 'Updates sent',    count: updatesSentCount },
    { key: 'notes',           label: 'Notes',           count: notesCount },
  ]

  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '0.5px solid #e8e7e0', marginBottom: 0 }}>
      {tabs.map(tab => {
        const isActive = tab.key === activeTab
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              padding: '10px 18px',
              fontSize: 12,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? '#0f2744' : '#888',
              background: 'none',
              border: 'none',
              borderBottom: isActive ? '2px solid #0f2744' : '2px solid transparent',
              marginBottom: '-0.5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 0,
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.color = '#0f2744'
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.color = '#888'
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                style={{
                  fontSize: 10,
                  color: isActive ? '#888' : '#bbb',
                  marginLeft: 5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
