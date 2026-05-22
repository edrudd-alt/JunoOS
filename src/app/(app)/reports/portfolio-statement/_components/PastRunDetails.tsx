'use client'

import { useState, useEffect } from 'react'
import {
  loadRunItemsWithDetails,
  getSignedUrlForDocument,
  type BulkRunItemDetail,
} from '../bulkRunActions'

interface Props {
  runId: string
}

export default function PastRunDetails({ runId }: Props) {
  const [items, setItems]     = useState<BulkRunItemDetail[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadRunItemsWithDetails(runId)
      .then(setItems)
      .catch(err => setLoadError(err instanceof Error ? err.message : String(err)))
  }, [runId])

  if (loadError) {
    return <p style={{ fontSize: 12, color: '#c0392b', padding: '8px 0' }}>{loadError}</p>
  }
  if (!items) {
    return <p style={{ fontSize: 12, color: '#999', padding: '8px 0' }}>Loading…</p>
  }
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: '#999', padding: '8px 0' }}>No items found.</p>
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '0.5px solid #e8e7e0' }}>
          <th style={th}>Status</th>
          <th style={th}>Investor</th>
          <th style={th}></th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.id} style={{ borderBottom: '0.5px solid #f5f4f0' }}>
            <td style={{ ...td, width: 100 }}>
              <StatusLabel status={item.status} />
            </td>
            <td style={td}>{item.client_name}</td>
            <td style={{ ...td, width: 140 }}>
              {item.status === 'succeeded' && item.storage_url && (
                <ViewButton storagePath={item.storage_url} />
              )}
              {item.status === 'failed' && item.error_message && (
                <span style={{ color: '#c0392b' }}>{item.error_message}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── ViewButton ────────────────────────────────────────────────────────────────

function ViewButton({ storagePath }: { storagePath: string }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  async function handleView() {
    setLoading(true)
    setErr(null)
    try {
      const url = await getSignedUrlForDocument(storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to open')
    } finally {
      setLoading(false)
    }
  }

  if (err) return <span style={{ color: '#c0392b', fontSize: 11 }}>{err}</span>

  return (
    <button
      onClick={handleView}
      disabled={loading}
      style={{
        border: 'none', background: 'transparent', padding: 0,
        fontSize: 12, color: '#185fa5', cursor: loading ? 'default' : 'pointer',
        textDecoration: 'underline', opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? 'Opening…' : 'View'}
    </button>
  )
}

// ── StatusLabel ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, [string, string]> = {
  pending:     ['Pending',     '#999'],
  in_progress: ['Generating',  '#185fa5'],
  succeeded:   ['Done',        '#1d9e75'],
  failed:      ['Failed',      '#c0392b'],
  skipped:     ['Skipped',     '#aaa'],
}

function StatusLabel({ status }: { status: string }) {
  const [label, color] = STATUS_MAP[status] ?? [status, '#666']
  return <span style={{ color, fontWeight: 500 }}>{label}</span>
}

// ── Styles ────────────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#888',
  textAlign: 'left',
}

const td: React.CSSProperties = {
  padding: '6px 10px', color: '#333', verticalAlign: 'middle',
}
