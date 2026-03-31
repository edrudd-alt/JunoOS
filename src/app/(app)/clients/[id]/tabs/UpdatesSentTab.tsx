import { formatDate } from '@/lib/utils'

interface UpdateRecipient {
  id: string
  sent_at: string | null
  investor_updates: {
    id: string
    title: string | null
    update_type: string
    sent_at: string | null
  } | null
}

interface Props {
  updateRecipients: Record<string, unknown>[]
}

const TYPE_CONFIG: Record<string, { label: string; dotColor: string; pillCls: string }> = {
  type1: { label: 'Portfolio statement', dotColor: '#1d9e75', pillCls: 'pill-teal' },
  type2: { label: 'Update with bullets', dotColor: '#ba7517', pillCls: 'pill-amber' },
  type3: { label: 'Company update', dotColor: '#ba7517', pillCls: 'pill-amber' },
}

export default function UpdatesSentTab({ updateRecipients }: Props) {
  const recipients = updateRecipients as unknown as UpdateRecipient[]

  if (recipients.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>
        No updates sent yet
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 16 }}></th>
            <th>Update</th>
            <th style={{ width: '18%' }}>Type</th>
            <th style={{ width: '16%' }}>Date sent</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map(rec => {
            const update = rec.investor_updates
            const type = update?.update_type ?? 'type1'
            const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.type1
            const sentAt = rec.sent_at ?? update?.sent_at

            return (
              <tr key={rec.id}>
                <td style={{ width: 16, paddingRight: 0 }}>
                  <div
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: config.dotColor,
                    }}
                  />
                </td>
                <td style={{ fontWeight: 500 }}>
                  {update?.title ?? 'Untitled update'}
                </td>
                <td>
                  <span className={`pill ${config.pillCls}`}>{config.label}</span>
                </td>
                <td style={{ color: '#888' }}>{formatDate(sentAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
