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
  bank_account_name: string | null
  bank_sort_code: string | null
  bank_account_number: string | null
  bank_iban: string | null
  bank_swift_bic: string | null
}

export default function NomineesClient({ nominees: nomineesRaw }: { nominees: Record<string, unknown>[] }) {
  const nominees = nomineesRaw as unknown as NomineeRow[]
  const router   = useRouter()
  const supabase = createClient()

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
                  {nominee.bank_account_name && (
                    <span className="pill" style={{ fontSize: 10, background: '#f0f3f7', color: '#555' }}>Bank details set</span>
                  )}
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
  const supabase = createClient()
  const isEdit   = nominee !== null

  const [name,               setName]              = useState(nominee?.name ?? '')
  const [description,        setDescription]       = useState(nominee?.description ?? '')
  const [active,             setActive]            = useState(nominee?.active ?? true)
  const [bankAccountName,    setBankAccountName]   = useState(nominee?.bank_account_name ?? '')
  const [bankSortCode,       setBankSortCode]      = useState(nominee?.bank_sort_code ?? '')
  const [bankAccountNumber,  setBankAccountNumber] = useState(nominee?.bank_account_number ?? '')
  const [bankIban,           setBankIban]          = useState(nominee?.bank_iban ?? '')
  const [bankSwiftBic,       setBankSwiftBic]      = useState(nominee?.bank_swift_bic ?? '')
  const [saving,             setSaving]            = useState(false)
  const [error,              setError]             = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    border: '0.5px solid #d0d0c8', borderRadius: 5,
    fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4,
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError('')

    const payload = {
      name:                name.trim(),
      description:         description.trim() || null,
      bank_account_name:   bankAccountName.trim() || null,
      bank_sort_code:      bankSortCode.trim() || null,
      bank_account_number: bankAccountNumber.trim() || null,
      bank_iban:           bankIban.trim() || null,
      bank_swift_bic:      bankSwiftBic.trim() || null,
    }

    if (isEdit) {
      const { error: dbError } = await supabase
        .from('nominees')
        .update({ ...payload, active })
        .eq('id', nominee.id)
      if (dbError) { setError(dbError.message); setSaving(false); return }
    } else {
      const { error: dbError } = await supabase
        .from('nominees')
        .insert(payload)
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
      <div className="card" style={{ width: 520, padding: '24px 28px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 18px' }}>
          {isEdit ? 'Edit nominee' : 'Add nominee'}
        </h2>

        {/* Identity */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Name <span style={{ color: '#a32d2d' }}>*</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Juno Nominees Ltd" style={inputStyle} />
        </div>

        <div style={{ marginBottom: isEdit ? 14 : 20 }}>
          <label style={labelStyle}>Description (optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Any notes about this nominee…" style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {isEdit && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Active
            </label>
          </div>
        )}

        {/* Bank details */}
        <div style={{ borderTop: '0.5px solid #e8e7e0', paddingTop: 16, marginBottom: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744', marginBottom: 12 }}>Bank details</div>
          <p style={{ fontSize: 11, color: '#888', margin: '0 0 14px' }}>Used on application forms. Leave blank if not applicable.</p>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Account name</label>
            <input type="text" value={bankAccountName} onChange={e => setBankAccountName(e.target.value)} placeholder="Juno Nominees Ltd" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Sort code</label>
              <input type="text" value={bankSortCode} onChange={e => setBankSortCode(e.target.value)} placeholder="00-00-00" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Account number</label>
              <input type="text" value={bankAccountNumber} onChange={e => setBankAccountNumber(e.target.value)} placeholder="00000000" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>IBAN</label>
              <input type="text" value={bankIban} onChange={e => setBankIban(e.target.value)} placeholder="GB00 XXXX…" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>SWIFT / BIC</label>
              <input type="text" value={bankSwiftBic} onChange={e => setBankSwiftBic(e.target.value)} placeholder="XXXXGB2L" style={inputStyle} />
            </div>
          </div>
        </div>

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
