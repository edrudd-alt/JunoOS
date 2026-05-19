'use client'

import { useState, useMemo, useEffect } from 'react'
import type { NoteRecord, TeamMemberRecord } from '../ClientRecord'
import { addNoteAction } from '../notesActions'
import { formatDate } from '@/lib/utils'

interface Props {
  notes: NoteRecord[]
  clientId: string
  teamMembers: TeamMemberRecord[]
  onSaved: () => void
}

export default function NotesTab({ notes, clientId, teamMembers, onSaved }: Props) {
  const [localNotes, setLocalNotes] = useState<NoteRecord[]>(notes)
  const [text,       setText]       = useState('')
  const [flagged,    setFlagged]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)

  // Sync when server data refreshes after a save
  useEffect(() => { setLocalNotes(notes) }, [notes])

  const memberMap = useMemo(
    () => new Map(teamMembers.map(tm => [tm.id, tm])),
    [teamMembers],
  )

  async function handleSave() {
    if (!text.trim() || saving) return
    setSaving(true)
    setSaveError(null)

    const savedText    = text.trim()
    const savedFlagged = flagged

    const tempNote: NoteRecord = {
      id:               `temp_${Date.now()}`,
      client_id:        clientId,
      note_text:        savedText,
      flag_for_followup: savedFlagged,
      created_by:       null,
      created_at:       new Date().toISOString(),
    }

    setLocalNotes(prev => [tempNote, ...prev])
    setText('')
    setFlagged(false)

    const result = await addNoteAction(clientId, savedText, savedFlagged)

    if (result.success && result.note) {
      setLocalNotes(prev =>
        prev.map(n => n.id === tempNote.id ? (result.note as NoteRecord) : n),
      )
      onSaved()
    } else {
      setLocalNotes(prev => prev.filter(n => n.id !== tempNote.id))
      setText(savedText)
      setFlagged(savedFlagged)
      setSaveError(result.error ?? 'Failed to save note')
    }

    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Add note form */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '14px 16px' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            fontSize: 13, color: '#333', lineHeight: 1.5,
            border: '0.5px solid #e0e0dc', borderRadius: 6,
            padding: '8px 10px', resize: 'vertical',
            fontFamily: 'inherit', outline: 'none',
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#555', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={flagged}
              onChange={e => setFlagged(e.target.checked)}
              style={{ accentColor: '#ba7517', cursor: 'pointer' }}
            />
            Flag for follow-up
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {saveError && (
              <span style={{ fontSize: 11, color: '#c0392b' }}>{saveError}</span>
            )}
            <button
              onClick={handleSave}
              disabled={!text.trim() || saving}
              className="btn btn-primary"
              style={{ fontSize: 12, opacity: (!text.trim() || saving) ? 0.5 : 1 }}
            >
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      </div>

      {/* Notes list */}
      {localNotes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {localNotes.map(note => {
            const author = note.created_by ? memberMap.get(note.created_by) : null
            const isTemp = note.id.startsWith('temp_')
            return (
              <div
                key={note.id}
                style={{
                  background:  note.flag_for_followup ? '#fef7eb' : '#fff',
                  border:      '0.5px solid #e8e7e0',
                  borderLeft:  note.flag_for_followup ? '3px solid #ba7517' : '0.5px solid #e8e7e0',
                  borderRadius: 8,
                  padding:     '12px 14px',
                  opacity:     isTemp ? 0.6 : 1,
                }}
              >
                <div style={{ fontSize: 13, color: '#1a1a1a', whiteSpace: 'pre-wrap', lineHeight: 1.55, marginBottom: 8 }}>
                  {note.note_text}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#999' }}>
                  {author?.full_name && (
                    <>
                      <span style={{ color: '#666', fontWeight: 500 }}>{author.full_name}</span>
                      <span>·</span>
                    </>
                  )}
                  <span>{formatDate(note.created_at)}</span>
                  {note.flag_for_followup && (
                    <>
                      <span>·</span>
                      <span style={{ color: '#ba7517', fontWeight: 500 }}>Flagged for follow-up</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {localNotes.length === 0 && (
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '24px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>No notes yet. Add the first one above.</p>
        </div>
      )}
    </div>
  )
}
