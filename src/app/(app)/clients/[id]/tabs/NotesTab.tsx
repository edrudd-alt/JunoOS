'use client'

import { useState, useTransition } from 'react'
import { formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Note {
  id: string
  note_text: string
  created_at: string
  team_members: { full_name: string | null } | null
}

interface Props {
  notes: Record<string, unknown>[]
  clientId: string
}

export default function NotesTab({ notes, clientId }: Props) {
  const typedNotes = notes as unknown as Note[]
  const [adding, setAdding] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createClient()

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteText.trim()) return

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('client_notes').insert({
      client_id: clientId,
      note_text: noteText.trim(),
      created_by: user?.id ?? null,
    })

    setNoteText('')
    setAdding(false)
    startTransition(() => router.refresh())
  }

  return (
    <div>
      {/* Add note form */}
      {adding ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <form onSubmit={handleAddNote}>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add a note or correspondence log…"
              rows={4}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '0.5px solid #d0d0c8',
                borderRadius: 5,
                fontSize: 12,
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={isPending || !noteText.trim()}>
                Save note
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setAdding(false); setNoteText('') }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          className="btn btn-secondary"
          onClick={() => setAdding(true)}
          style={{ marginBottom: 16 }}
        >
          + Add note
        </button>
      )}

      {/* Notes list */}
      {typedNotes.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>
          No notes yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {typedNotes.map(note => (
            <div key={note.id} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#534ab7', marginTop: 4, flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {note.note_text}
                  </p>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                    {note.team_members?.full_name ?? 'Team'} · {formatDate(note.created_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
