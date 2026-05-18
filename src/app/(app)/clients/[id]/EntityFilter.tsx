interface EntityRow {
  id: string
  full_name: string
  entity_type: string
}

interface InvestmentRow {
  client_id: string
}

interface Props {
  lead: EntityRow
  linkedEntities: EntityRow[]
  allInvestments: InvestmentRow[]
  selectedEntity: string
  onSelect: (entityId: string) => void
}

export default function EntityFilter({
  lead, linkedEntities, allInvestments, selectedEntity, onSelect,
}: Props) {
  const allCount = allInvestments.length

  const countFor = (id: string) =>
    allInvestments.filter(i => i.client_id === id).length

  const chips = [
    { id: 'all', label: 'All entities', count: allCount },
    { id: lead.id, label: lead.full_name, count: countFor(lead.id) },
    ...linkedEntities.map(e => ({ id: e.id, label: e.full_name, count: countFor(e.id) })),
  ]

  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid #e8e7e0',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>Showing</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chips.map(chip => {
          const isActive = selectedEntity === chip.id
          return (
            <button
              key={chip.id}
              onClick={() => onSelect(chip.id)}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 14,
                border: '0.5px solid',
                borderColor: isActive ? '#0f2744' : '#d8d7d0',
                background: isActive ? '#0f2744' : '#fff',
                color: isActive ? '#fff' : '#555',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = '#fafaf8'
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.background = '#fff'
              }}
            >
              {chip.label}
              <span
                style={{
                  fontSize: 10,
                  color: isActive ? 'rgba(255,255,255,0.6)' : '#aaa',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {chip.count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
