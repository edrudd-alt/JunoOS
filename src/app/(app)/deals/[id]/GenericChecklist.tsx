'use client'

interface ChecklistItem {
  key: string
  label: string
}

interface Props {
  items: ChecklistItem[]
  checklist: Record<string, boolean>
  setChecklist: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  dealStatus: string
  saving: boolean
  saved: boolean
  onSave: () => void
}

export function GenericChecklist({ items, checklist, setChecklist, dealStatus, saving, saved, onSave }: Props) {
  const completedCount = items.filter(i => checklist[i.key]).length

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Completion checklist</div>
        <div style={{ fontSize: 11, color: '#888' }}>
          {completedCount} / {items.length}
        </div>
      </div>
      <div style={{ height: 4, background: '#f0f0ec', borderRadius: 2, marginBottom: 14, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2, background: '#1d9e75',
          width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%`,
          transition: 'width 0.2s',
        }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={checklist[item.key] ?? false}
              onChange={e => setChecklist(prev => ({ ...prev, [item.key]: e.target.checked }))}
              disabled={dealStatus === 'complete'}
              style={{ accentColor: '#1d9e75' }}
            />
            <span style={{
              textDecoration: checklist[item.key] ? 'line-through' : 'none',
              color: checklist[item.key] ? '#aaa' : '#333',
            }}>
              {item.label}
            </span>
          </label>
        ))}
      </div>
      {dealStatus !== 'complete' && (
        <button
          className="btn"
          onClick={onSave}
          disabled={saving}
          style={{ marginTop: 14, fontSize: 12, padding: '6px 14px' }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
        </button>
      )}
    </div>
  )
}
