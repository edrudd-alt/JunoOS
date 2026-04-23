'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface NomineeRow {
  id: string
  name: string
  description: string | null
  active: boolean
  created_at: string
}

export default function NomineesClient({ nominees: nomineesRaw }: { nominees: Record<string, unknown>[] }) {
  const nominees = nomineesRaw as unknown as NomineeRow[]
  const router    = useRouter()
  const supabase  = createClient()

  const [showModal,      setShowModal]      = useState(false)
  const [editingNominee, setEditingNominee] = useState<NomineeRow | null>(null)

  function openAdd() {
    setEditingNominee(null)
    setShowModal(true)
  }

  function openEdit(nominee: NomineeRow) {
    setEditingNominee(nominee)
    setShowModal(true)
  }

  async function handleDeactivate(id: string) {
    if (!window.confirm('Deactivate this nominee? It will no longer appear in selection lists.')) return
    await supabase.from('nominees').update({ active: false }).eq('id', id)
    router.refresh()
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/settings" style={{ color: '#888', textDecoration: 'none' }}>Settings</Link>
        {' › '}Nominees
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>Nominees</h1>
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
            Nominee entities used for nominee-held client investments.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} style={{ fontSize: 12 }}>
          + Add nominee
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {nominees.length === 0 && (
          <div className="card" style={{ padding: '24px 20px', textAlign: 'center', color: '#888', fontSize: 13 }}>
            No nominees yet. Add one to get started.
          </div>
        )}
        {nominees.map(nominee => (
          <div key={nominee.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: nominee.description ? 4 : 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>{nominee.name}</span>
                  {nominee.active
                    ? <span className="pill pill-green" style={{ fontSize: 10 }}>Active</span>
                    : <span className="pill pill-grey" style={{ fontSize: 10 }}>Inactive</span>}
                </div>
                {nominee.description && (
                  <div style={{ fontSize: 12, color: '#666' }}>{nominee.description}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => openEdit(nominee)}
                >
                  Edit
                </button>
                {nominee.active && (
                  <button
                    style={{ fontSize: 11, padding: '4px 10px', color: '#a32d2d', background: 'none', border: '0.5px solid #e0c8c8', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}
                    onClick={() => handleDeactivate(nominee.id)}
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <NomineeModal
          nominee={editingNominee}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function NomineeModal({ nominee, onClose, onSaved }: {
  nominee: NomineeRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase  = createClient()
  const isEdit    = nominee !== null
  const [name,        setName]        = useState(nominee?.name ?? '')
  const [description, setDescription] = useState(nominee?.description ?? '')
  const [active,      setActive]      = useState(nominee?.active ?? true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    border: '0.5px solid #d0d0c8', borderRadius: 5,
    fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError('')

    if (isEdit) {
      const { error: dbError } = await supabase
        .from('nominees')
        .update({ name: name.trim(), description: description.trim() || null, active })
        .eq('id', nominee.id)
      if (dbError) { setError(dbError.message); setSaving(false); return }
    } else {
      const { error: dbError } = await supabase
        .from('nominees')
        .insert({ name: name.trim(), description: description.trim() || null })
      if (dbError) { setError(dbError.message); setSaving(false); return }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 440, padding: '24px 28px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 18px' }}>
          {isEdit ? 'Edit nominee' : 'Add nominee'}
        </h2>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>
            Name <span style={{ color: '#a32d2d' }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Juno Nominees Ltd"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: isEdit ? 14 : 20 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="Any notes about this nominee…"
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {isEdit && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={active}
                onChange={e => setActive(e.target.checked)}
              />
              Active
            </label>
          </div>
        )}

        {error && <p style={{ fontSize: 12, color: '#a32d2d', margin: '0 0 14px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!name.trim() || saving}
            style={{ fontSize: 12 }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add nominee'}
          </button>
        </div>
      </div>
    </div>
  )
}
