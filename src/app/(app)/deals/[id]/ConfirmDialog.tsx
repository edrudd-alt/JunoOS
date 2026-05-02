'use client'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  saving?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', danger = false, saving = false,
  onConfirm, onCancel,
}: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: '24px',
        width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', marginBottom: 10 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5, marginBottom: 20 }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              background: danger ? '#a32d2d' : 'var(--teal)',
              color: '#fff', fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
