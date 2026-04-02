'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface FundType {
  id: string
  name: string
  code: string
  description: string | null
  annual_management_fee_pct: number | null
  fee_cap_pct: number | null
  fee_cap_years: number | null
  fee_deferred: boolean | null
  fee_basis: string | null
  exit_fee_default_pct: number | null
}

interface ClientRow {
  id: string
  full_name: string
  fund_type: string
  active_fund_type: string | null
}

const FUND_TYPE_LABELS: Record<string, string> = {
  syndicate: 'Syndicate',
  multi_manager: 'Multi Manager',
  both: 'Both',
}

const FUND_SUMMARIES: Record<string, string> = {
  syndicate: 'Entry fee 5% of investment. No annual management fee. No deferred fees.',
  multi_manager: 'Entry fee varies. Annual management fee 2% of original cost per year, deferred until exit. Capped at 10% of original cost (5 years). Exit fee defaults to 20% of cost.',
}

export default function FundManagementClient({
  fundTypes: fundTypesRaw,
  clients: clientsRaw,
}: {
  fundTypes: Record<string, unknown>[]
  clients: Record<string, unknown>[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const fundTypes = fundTypesRaw as unknown as FundType[]
  const clients   = clientsRaw   as unknown as ClientRow[]

  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editDesc,    setEditDesc]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [fundFilter,  setFundFilter]  = useState<'all' | 'syndicate' | 'multi_manager' | 'both'>('all')

  const syndicateCount    = clients.filter(c => c.fund_type === 'syndicate').length
  const multiManagerCount = clients.filter(c => c.fund_type === 'multi_manager').length
  const bothCount         = clients.filter(c => c.fund_type === 'both').length

  function startEdit(ft: FundType) {
    setEditingId(ft.id)
    setEditDesc(ft.description ?? '')
  }

  async function saveDesc(id: string) {
    setSaving(true)
    await supabase.from('fund_types').update({ description: editDesc }).eq('id', id)
    setSaving(false)
    setEditingId(null)
    router.refresh()
  }

  const filteredClients = fundFilter === 'all'
    ? clients
    : clients.filter(c => c.fund_type === fundFilter)

  const cardStyle = (code: string): React.CSSProperties => ({
    flex: 1,
    background: '#fff',
    border: `1px solid ${code === 'multi_manager' ? '#e8a820' : '#1d9e75'}22`,
    borderRadius: 10,
    padding: 20,
    position: 'relative',
  })

  const thSt: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: '#888', textAlign: 'left', padding: '8px 14px', borderBottom: '0.5px solid #e8e7e0' }
  const tdSt: React.CSSProperties = { fontSize: 12, padding: '8px 14px', borderBottom: '0.5px solid #f5f5f2', verticalAlign: 'middle' }

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/settings" style={{ color: '#888', textDecoration: 'none' }}>Settings</Link>
        {' › '}Fund management
      </div>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>Fund management</h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          Syndicate and Multi Manager fund structures. Multi Manager is closed to new clients.
        </p>
      </div>

      {/* Note about new clients */}
      <div style={{ background: '#f0f4fa', border: '0.5px solid #c0d0e8', borderRadius: 8, padding: '10px 16px', marginBottom: 24, fontSize: 12, color: '#1a3a6a' }}>
        Multi Manager is closed to new clients. All new clients are onboarded as Syndicate.
      </div>

      {/* Fund type cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {fundTypes.map(ft => (
          <div key={ft.id} style={cardStyle(ft.code)}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744' }}>{ft.name}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
                  {ft.code === 'syndicate' ? syndicateCount : ft.code === 'multi_manager' ? multiManagerCount : 0} clients
                </div>
              </div>
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 4,
                background: ft.code === 'multi_manager' ? '#fff3e0' : '#e8f5f0',
                color:      ft.code === 'multi_manager' ? '#e0952a' : '#1d9e75',
                fontWeight: 600,
              }}>
                {ft.code === 'syndicate' ? 'S' : 'MM'}
              </span>
            </div>

            {/* Fee structure summary — read-only */}
            <div style={{ fontSize: 12, color: '#444', marginBottom: 12, lineHeight: 1.5 }}>
              {FUND_SUMMARIES[ft.code]}
            </div>

            {/* Description (editable) */}
            {editingId === ft.id ? (
              <div>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', padding: '7px 10px', fontSize: 12,
                    border: '0.5px solid #d0d0c8', borderRadius: 5,
                    outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 11, padding: '4px 12px' }}
                    disabled={saving}
                    onClick={() => saveDesc(ft.id)}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 11, color: '#888', fontStyle: ft.description ? 'normal' : 'italic' }}>
                  {ft.description || 'No additional description'}
                </div>
                <button
                  onClick={() => startEdit(ft)}
                  style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  Edit desc
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Client summary table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            Clients by fund type
            <span style={{ fontWeight: 400, color: '#888', marginLeft: 8 }}>
              {syndicateCount} Syndicate · {multiManagerCount} Multi Manager
              {bothCount > 0 ? ` · ${bothCount} Both` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'syndicate', 'multi_manager', 'both'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFundFilter(f)}
                style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: fundFilter === f ? '#0f2744' : '#f5f5f2',
                  color:      fundFilter === f ? '#fff' : '#555',
                  fontWeight: fundFilter === f ? 600 : 400,
                }}
              >
                {f === 'all' ? 'All' : FUND_TYPE_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {filteredClients.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#888', fontSize: 12 }}>
            No clients in this category
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f7' }}>
                <th style={thSt}>Client</th>
                <th style={thSt}>Fund type</th>
                <th style={thSt}>Active fund</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => (
                <tr key={client.id}>
                  <td style={tdSt}>
                    <Link href={`/clients/${client.id}`} style={{ color: '#0f2744', textDecoration: 'none', fontWeight: 500 }}>
                      {client.full_name}
                    </Link>
                  </td>
                  <td style={tdSt}>
                    <FundTypePill code={client.fund_type} />
                  </td>
                  <td style={{ ...tdSt, color: '#888' }}>
                    {client.fund_type === 'both'
                      ? <FundTypePill code={client.active_fund_type ?? 'syndicate'} />
                      : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function FundTypePill({ code }: { code: string }) {
  const isMM = code === 'multi_manager'
  const isBoth = code === 'both'
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
      background: isMM ? '#fff3e0' : isBoth ? '#f0f0ec' : '#e8f5f0',
      color:      isMM ? '#e0952a' : isBoth ? '#555'    : '#1d9e75',
    }}>
      {isMM ? 'Multi Manager' : isBoth ? 'Both' : 'Syndicate'}
    </span>
  )
}
