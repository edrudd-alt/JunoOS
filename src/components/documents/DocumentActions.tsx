import { isSendableType } from '@/lib/documentTypes'

interface Props {
  document: { id: string; type: string; storage_url?: string | null }
  onEmailClick?: () => void
  onViewClick?: () => void
}

const btnSt: React.CSSProperties = {
  fontSize: 12, background: 'none', border: 'none',
  cursor: 'pointer', padding: 0, fontFamily: 'inherit',
}

export function DocumentActions({ document, onEmailClick, onViewClick }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {isSendableType(document.type) && onEmailClick && (
        <button onClick={onEmailClick} style={{ ...btnSt, color: '#555' }}>
          Email
        </button>
      )}
      {document.storage_url && onViewClick && (
        <button onClick={onViewClick} style={{ ...btnSt, color: '#185fa5' }}>
          View
        </button>
      )}
    </div>
  )
}
