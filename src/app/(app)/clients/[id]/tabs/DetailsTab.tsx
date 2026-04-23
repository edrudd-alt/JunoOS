'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatPercent, formatDate, calcGainLoss } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { ClientRow } from '../ClientRecord'

const DOC_TYPE_LABELS: Record<string, string> = {
  kyc: 'KYC',
  poa: 'Power of attorney',
  membership_agreement: 'Membership agreement',
  suitability_assessment: 'Suitability assessment',
  source_of_funds: 'Source of funds',
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  own_name: 'Own name', family: 'Family', corporate: 'Corporate',
}

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  nominee:   'Nominee',
  corporate: 'Corporate vehicle',
  trust:     'Trust',
  estate:    'Estate',
  pension:   'Pension',
}

interface MembershipDoc {
  id: string
  type: string
  filename: string
  storage_url: string | null
  document_date: string | null
}

interface PortfolioRow {
  client_id: string
  total_invested: number
  current_value: number
  gain_loss: number
}

interface InvestmentRow {
  id: string
  share_class: string
  investment_date: string
  original_share_price: number
  shares_purchased: number
  sum_subscribed: number
  fund_type?: string
  companies: { id: string; name: string } | null
}

interface RelationshipRow {
  id: string
  client_id: string
  related_client_id: string
  other_client_id: string
  related_client_name: string
  relationship_type: string
  active: boolean
  notes: string | null
}

interface Props {
  client: ClientRow
  linkedEntities: ClientRow[]
  portfolioRows: PortfolioRow[]
  membershipDocs: MembershipDoc[]
  lastActivity: string | null
  investments?: Record<string, unknown>[]
  relationships?: Record<string, unknown>[]
  feeSchedules?: { id: string; name: string }[]
}

export default function DetailsTab({ client, linkedEntities, portfolioRows, membershipDocs, lastActivity, investments: investmentsRaw, relationships: relationshipsRaw, feeSchedules }: Props) {
  const investments   = (investmentsRaw   ?? []) as unknown as InvestmentRow[]
  const relationships = (relationshipsRaw ?? []) as unknown as RelationshipRow[]
  const isLead        = !client.lead_investor_id

  const router  = useRouter()
  const supabase = createClient()

  const [showAddModal,        setShowAddModal]        = useState(false)
  const [showAddLinkedModal,  setShowAddLinkedModal]  = useState(false)
  const [editingEntityId,     setEditingEntityId]     = useState<string | null>(null)
  const [changingFeeSchedule, setChangingFeeSchedule] = useState(false)
  const [pendingFeeScheduleId, setPendingFeeScheduleId] = useState(client.fee_schedule_id ?? '')

  async function handleFeeScheduleSave() {
    await supabase
      .from('clients')
      .update({ fee_schedule_id: pendingFeeScheduleId || null })
      .eq('id', client.id)
    setChangingFeeSchedule(false)
    router.refresh()
  }

  async function handleDeactivate(relationshipId: string) {
    if (!window.confirm('Mark this relationship as inactive?')) return
    await supabase.from('client_relationships').update({ active: false }).eq('id', relationshipId)
    router.refresh()
  }

  const portfolioByEntity: Record<string, { totalInvested: number; currentValue: number; gainLoss: number }> = {}
  for (const row of portfolioRows) {
    const cid = row.client_id
    if (!portfolioByEntity[cid]) portfolioByEntity[cid] = { totalInvested: 0, currentValue: 0, gainLoss: 0 }
    portfolioByEntity[cid].totalInvested += Number(row.total_invested ?? 0)
    portfolioByEntity[cid].currentValue  += Number(row.current_value  ?? 0)
    portfolioByEntity[cid].gainLoss      += Number(row.gain_loss       ?? 0)
  }

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* LEFT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Contact details */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>Contact details</div>
          <dl style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px 0', fontSize: 12 }}>
            <dt style={{ color: '#888' }}>Email</dt>
            <dd style={{ margin: 0 }}>{client.email || '—'}</dd>
            <dt style={{ color: '#888' }}>Phone</dt>
            <dd style={{ margin: 0 }}>{client.phone || '—'}</dd>
            <dt style={{ color: '#888' }}>Address</dt>
            <dd style={{ margin: 0 }}>
              {[client.address_line1, client.address_line2, client.city, client.postcode]
                .filter(Boolean).join(', ') || '—'}
            </dd>
            <dt style={{ color: '#888' }}>Date joined</dt>
            <dd style={{ margin: 0 }}>{formatDate(client.date_joined)}</dd>
            <dt style={{ color: '#888' }}>Last activity</dt>
            <dd style={{ margin: 0 }}>{lastActivity ? formatDate(lastActivity) : '—'}</dd>
            <dt style={{ color: '#888' }}>Tax status</dt>
            <dd style={{ margin: 0 }}>{taxStatusLabel(client.tax_status)}</dd>
            <dt style={{ color: '#888' }}>Investor ref</dt>
            <dd style={{ margin: 0 }}>{client.investor_reference || '—'}</dd>
            <dt style={{ color: '#888' }}>Fund type</dt>
            <dd style={{ margin: 0 }}>
              <FundTypeDisplay fundType={client.fund_type ?? 'syndicate'} activeFundType={client.active_fund_type ?? null} />
            </dd>
            <dt style={{ color: '#888' }}>Fee schedule</dt>
            <dd style={{ margin: 0 }}>
              {changingFeeSchedule ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <select
                    value={pendingFeeScheduleId}
                    onChange={e => setPendingFeeScheduleId(e.target.value)}
                    style={{ padding: '3px 6px', fontSize: 12, border: '0.5px solid #d0d0c8', borderRadius: 4, fontFamily: 'inherit', outline: 'none' }}
                  >
                    <option value="">None assigned</option>
                    {(feeSchedules ?? []).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleFeeScheduleSave}
                    style={{ fontSize: 11, color: '#fff', background: '#0f2744', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setChangingFeeSchedule(false); setPendingFeeScheduleId(client.fee_schedule_id ?? '') }}
                    style={{ fontSize: 11, color: '#555', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {(feeSchedules ?? []).find(s => s.id === client.fee_schedule_id)?.name ?? 'None assigned'}
                  <button
                    onClick={() => { setPendingFeeScheduleId(client.fee_schedule_id ?? ''); setChangingFeeSchedule(true) }}
                    style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                  >
                    Change
                  </button>
                </span>
              )}
            </dd>
          </dl>

          {membershipDocs.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '0.5px solid #e8e7e0' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#888', marginBottom: 8 }}>Membership documents</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {membershipDocs.map((doc) => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="pill pill-grey" style={{ fontSize: 10 }}>
                        {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                      </span>
                      <span style={{ fontSize: 11, color: '#555' }}>{doc.filename}</span>
                    </div>
                    {doc.storage_url && (
                      <a href={doc.storage_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#185fa5', textDecoration: 'none' }}>
                        View
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {(client.fund_type === 'multi_manager' || client.fund_type === 'both') && (
          <AccruedFeeCard investments={investments} />
        )}
      </div>

      {/* RIGHT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>Reporting defaults</div>
          <div style={{ fontSize: 12, color: '#888' }}>
            Delivery: {client.report_delivery_method === 'email'
              ? client.report_delivery_email || 'Email (not set)'
              : 'Download only'}
          </div>
        </div>

        {isLead && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>Related clients</div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => setShowAddModal(true)}
              >
                + Add relationship
              </button>
            </div>
            {relationships.length === 0 ? (
              <div style={{ padding: '14px 16px', fontSize: 12, color: '#888' }}>No related clients</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f9f9f7' }}>
                    <th style={{ padding: '7px 12px', fontSize: 10, fontWeight: 500, color: '#888', textAlign: 'left', borderBottom: '0.5px solid #e8e7e0' }}>Client</th>
                    <th style={{ padding: '7px 12px', fontSize: 10, fontWeight: 500, color: '#888', textAlign: 'left', borderBottom: '0.5px solid #e8e7e0' }}>Type</th>
                    <th style={{ padding: '7px 12px', fontSize: 10, fontWeight: 500, color: '#888', textAlign: 'left', borderBottom: '0.5px solid #e8e7e0' }}>Status</th>
                    <th style={{ padding: '7px 12px', fontSize: 10, fontWeight: 500, color: '#888', textAlign: 'left', borderBottom: '0.5px solid #e8e7e0' }}>Notes</th>
                    <th style={{ padding: '7px 12px', borderBottom: '0.5px solid #e8e7e0', width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {relationships.map(r => (
                    <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                      <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f0f0ec' }}>
                        <Link href={`/clients/${r.other_client_id}`} style={{ color: '#185fa5', textDecoration: 'none', fontWeight: 500 }}>
                          {r.related_client_name}
                        </Link>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f0f0ec' }}>
                        <span className="pill pill-grey" style={{ fontSize: 10, textTransform: 'capitalize' }}>{r.relationship_type}</span>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f0f0ec' }}>
                        {r.active
                          ? <span className="pill pill-green" style={{ fontSize: 10 }}>Active</span>
                          : <span className="pill pill-grey" style={{ fontSize: 10 }}>Inactive</span>}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f0f0ec', color: '#888', fontSize: 11 }}>
                        {r.notes || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f0f0ec', textAlign: 'right' }}>
                        {r.active && (
                          <button
                            onClick={() => handleDeactivate(r.id)}
                            style={{ fontSize: 11, color: '#a32d2d', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {isLead && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>
                Linked entities{linkedEntities.length > 0 ? ` (${linkedEntities.length})` : ''}
              </div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => setShowAddLinkedModal(true)}
              >
                + Add linked entity
              </button>
            </div>
            {linkedEntities.length === 0 ? (
              <div style={{ padding: '14px 16px', fontSize: 12, color: '#888' }}>No linked entities</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Type</th>
                    <th>Vehicle type</th>
                    <th>Invested</th>
                    <th>Current value</th>
                    <th>Change</th>
                    <th>Location</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <LinkedEntityRow
                    name="All entities"
                    entityType={null}
                    vehicleType={null}
                    holdingLocation={null}
                    portfolio={Object.values(portfolioByEntity).reduce(
                      (acc, p) => ({
                        totalInvested: acc.totalInvested + p.totalInvested,
                        currentValue:  acc.currentValue  + p.currentValue,
                        gainLoss:      acc.gainLoss      + p.gainLoss,
                      }),
                      { totalInvested: 0, currentValue: 0, gainLoss: 0 }
                    )}
                    linkId={null}
                    bold
                    onEdit={null}
                  />
                  {linkedEntities.map(entity => (
                    <LinkedEntityRow
                      key={entity.id}
                      name={entity.full_name}
                      entityType={entity.entity_type}
                      vehicleType={entity.vehicle_type}
                      holdingLocation={entity.holding_location}
                      portfolio={portfolioByEntity[entity.id] ?? { totalInvested: 0, currentValue: 0, gainLoss: 0 }}
                      linkId={entity.id}
                      bold={false}
                      onEdit={() => setEditingEntityId(entity.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>

    {showAddModal && (
      <AddRelationshipModal
        clientId={client.id}
        onClose={() => setShowAddModal(false)}
        onSaved={() => { setShowAddModal(false); router.refresh() }}
      />
    )}
    {showAddLinkedModal && (
      <AddLinkedEntityModal
        leadClientId={client.id}
        onClose={() => setShowAddLinkedModal(false)}
        onSaved={() => { setShowAddLinkedModal(false); router.refresh() }}
      />
    )}
    {editingEntityId && (
      <EditVehicleTypeModal
        entityId={editingEntityId}
        currentValue={linkedEntities.find(e => e.id === editingEntityId)?.vehicle_type ?? null}
        onClose={() => setEditingEntityId(null)}
        onSaved={() => { setEditingEntityId(null); router.refresh() }}
      />
    )}
    </>
  )
}

function AddRelationshipModal({ clientId, onClose, onSaved }: { clientId: string; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [search,           setSearch]           = useState('')
  const [selectedId,       setSelectedId]       = useState('')
  const [selectedName,     setSelectedName]     = useState('')
  const [showDrop,         setShowDrop]         = useState(false)
  const [relationshipType, setRelationshipType] = useState('spouse')
  const [notes,            setNotes]            = useState('')
  const [saving,           setSaving]           = useState(false)
  const [allClients,       setAllClients]       = useState<{ id: string; full_name: string }[]>([])

  useState(() => {
    supabase
      .from('clients')
      .select('id, full_name')
      .is('lead_investor_id', null)
      .neq('id', clientId)
      .order('full_name')
      .then(({ data }) => setAllClients(data ?? []))
  })

  const filtered = allClients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSave() {
    if (!selectedId) return
    setSaving(true)
    await supabase.from('client_relationships').insert({
      client_id:         clientId,
      related_client_id: selectedId,
      relationship_type: relationshipType,
      notes:             notes.trim() || null,
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 440, padding: '24px 28px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 18px' }}>Add relationship</h2>

        <div style={{ marginBottom: 14, position: 'relative' }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>Client</label>
          <input
            type="text"
            value={selectedId ? selectedName : search}
            placeholder="Search clients…"
            onChange={e => { setSearch(e.target.value); setSelectedId(''); setSelectedName(''); setShowDrop(true) }}
            onFocus={() => setShowDrop(true)}
            style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #d0d0c8', borderRadius: 5, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          {showDrop && filtered.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '0.5px solid #e0e0d8', borderRadius: 5, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 180, overflowY: 'auto' }}>
              {filtered.slice(0, 20).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={() => { setSelectedId(c.id); setSelectedName(c.full_name); setSearch(''); setShowDrop(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {c.full_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>Relationship type</label>
          <select
            value={relationshipType}
            onChange={e => setRelationshipType(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #d0d0c8', borderRadius: 5, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          >
            <option value="spouse">Spouse</option>
            <option value="family">Family</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Married 2018"
            style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #d0d0c8', borderRadius: 5, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!selectedId || saving} style={{ fontSize: 12 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LinkedEntityRow({
  name, entityType, vehicleType, holdingLocation, portfolio, linkId, bold, onEdit,
}: {
  name: string
  entityType: string | null
  vehicleType: string | null
  holdingLocation: string | null
  portfolio: { totalInvested: number; currentValue: number; gainLoss: number }
  linkId: string | null
  bold: boolean
  onEdit: (() => void) | null
}) {
  const { pct } = calcGainLoss(portfolio.totalInvested, portfolio.currentValue)
  return (
    <tr>
      <td style={{ fontWeight: bold ? 600 : 400 }}>
        {linkId
          ? <Link href={`/clients/${linkId}`} style={{ color: '#0f2744', textDecoration: 'none' }}>{name}</Link>
          : name}
      </td>
      <td>
        {entityType
          ? <span className="pill pill-grey">{ENTITY_TYPE_LABELS[entityType] ?? entityType}</span>
          : '—'}
      </td>
      <td>
        {vehicleType
          ? <span className="pill pill-grey">{VEHICLE_TYPE_LABELS[vehicleType] ?? vehicleType}</span>
          : linkId
            ? <span style={{ fontSize: 11, color: '#b45309' }}>Not set</span>
            : '—'}
      </td>
      <td>{formatCurrency(portfolio.totalInvested)}</td>
      <td style={{ fontWeight: 500 }}>{formatCurrency(portfolio.currentValue)}</td>
      <td className={portfolio.gainLoss >= 0 ? 'text-positive' : 'text-negative'}>
        {portfolio.gainLoss >= 0 ? '+' : ''}{formatCurrency(portfolio.gainLoss)}
        <div style={{ fontSize: 10 }}>{formatPercent(pct)}</div>
      </td>
      <td>
        {holdingLocation
          ? <span className="pill pill-grey" style={{ fontSize: 10 }}>{holdingLocation}</span>
          : '—'}
      </td>
      <td style={{ textAlign: 'right' }}>
        {onEdit && (
          <button
            onClick={onEdit}
            style={{ fontSize: 11, color: '#185fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  )
}

function VehicleTypeSelect({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #d0d0c8', borderRadius: 5, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
    >
      <option value="">Select vehicle type…</option>
      <option value="nominee">Nominee</option>
      <option value="corporate">Corporate vehicle</option>
      <option value="trust">Trust</option>
      <option value="estate">Estate</option>
      <option value="pension">Pension</option>
    </select>
  )
}

function EditVehicleTypeModal({ entityId, currentValue, onClose, onSaved }: {
  entityId: string
  currentValue: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [vehicleType, setVehicleType] = useState(currentValue ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!vehicleType) return
    setSaving(true)
    await supabase.from('clients').update({ vehicle_type: vehicleType }).eq('id', entityId)
    setSaving(false)
    onSaved()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 360, padding: '24px 28px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 18px' }}>Edit vehicle type</h2>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>Vehicle type</label>
          <VehicleTypeSelect value={vehicleType} onChange={setVehicleType} required />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!vehicleType || saving} style={{ fontSize: 12 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddLinkedEntityModal({ leadClientId, onClose, onSaved }: {
  leadClientId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [fullName,    setFullName]    = useState('')
  const [vehicleType, setVehicleType] = useState('')
  const [email,       setEmail]       = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function handleSave() {
    if (!fullName.trim() || !vehicleType) return
    setSaving(true)
    setError('')
    const { error: dbError } = await supabase.from('clients').insert({
      full_name:        fullName.trim(),
      email:            email.trim() || null,
      lead_investor_id: leadClientId,
      vehicle_type:     vehicleType,
      fund_type:        'syndicate',
      tax_status:       'neither',
      kyc_status:       'outstanding',
      default_fee_rate: 5,
      entity_type:      'own_name',
      holding_location: 'direct',
      report_delivery_method: 'download',
    })
    if (dbError) { setError(dbError.message); setSaving(false); return }
    setSaving(false)
    onSaved()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    border: '0.5px solid #d0d0c8', borderRadius: 5,
    fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 440, padding: '24px 28px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 18px' }}>Add linked entity</h2>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>
            Full name <span style={{ color: '#a32d2d' }}>*</span>
          </label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Barry O'Brien Family Trust"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>
            Vehicle type <span style={{ color: '#a32d2d' }}>*</span>
          </label>
          <VehicleTypeSelect value={vehicleType} onChange={setVehicleType} required />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>Email (optional)</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="entity@example.com"
            style={inputStyle}
          />
        </div>

        {error && <p style={{ fontSize: 12, color: '#a32d2d', margin: '0 0 14px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!fullName.trim() || !vehicleType || saving}
            style={{ fontSize: 12 }}
          >
            {saving ? 'Saving…' : 'Add entity'}
          </button>
        </div>
      </div>
    </div>
  )
}

function taxStatusLabel(s: string) {
  return { eis: 'EIS', seis: 'SEIS', both: 'EIS & SEIS', neither: 'No EIS/SEIS' }[s] ?? s
}

function FundTypeDisplay({ fundType, activeFundType }: { fundType: string; activeFundType: string | null }) {
  const labels: Record<string, string> = {
    syndicate: 'Syndicate', multi_manager: 'Multi Manager', both: 'Both',
  }
  if (fundType === 'both' && activeFundType) {
    return <span>{labels[fundType]} <span style={{ color: '#888' }}>(active: {labels[activeFundType] ?? activeFundType})</span></span>
  }
  return <span>{labels[fundType] ?? fundType}</span>
}

function AccruedFeeCard({ investments }: { investments: InvestmentRow[] }) {
  const today = new Date()

  const mmInvs = investments.filter(i =>
    (i.fund_type === 'multi_manager' || !i.fund_type) &&
    i.sum_subscribed > 0 &&
    i.shares_purchased > 0
  )

  if (mmInvs.length === 0) return null

  const rows = mmInvs.map(inv => {
    const invDate    = new Date(inv.investment_date + 'T00:00:00')
    const yearsHeld  = Math.max(0, (today.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24 * 365))
    const feePct     = Math.min(yearsHeld * 2, 10)
    const feeAmount  = (feePct / 100) * inv.sum_subscribed
    const companyName = (inv.companies as { name: string } | null)?.name ?? '—'
    return { inv, companyName, yearsHeld, feePct, feeAmount }
  })

  const totalFee = rows.reduce((s, r) => s + r.feeAmount, 0)

  const thSt: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: '#888', textAlign: 'left', padding: '6px 12px', borderBottom: '0.5px solid #e8e7e0' }
  const tdSt: React.CSSProperties = { fontSize: 11, padding: '7px 12px', borderBottom: '0.5px solid #f5f5f2', verticalAlign: 'middle' }
  const tdR:  React.CSSProperties = { ...tdSt, textAlign: 'right' }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>Accrued management fee (indicative)</div>
        <span style={{ fontSize: 10, color: '#888' }}>Indicative only — confirmed at exit</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9f9f7' }}>
            <th style={thSt}>Company</th>
            <th style={{ ...thSt, textAlign: 'right' }}>Investment date</th>
            <th style={{ ...thSt, textAlign: 'right' }}>Original cost</th>
            <th style={{ ...thSt, textAlign: 'right' }}>Years held</th>
            <th style={{ ...thSt, textAlign: 'right' }}>Fee %</th>
            <th style={{ ...thSt, textAlign: 'right' }}>Accrued fee</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ inv, companyName, yearsHeld, feePct, feeAmount }) => (
            <tr key={inv.id}>
              <td style={tdSt}>{companyName}</td>
              <td style={tdR}>{formatDate(inv.investment_date)}</td>
              <td style={tdR}>{formatCurrency(inv.sum_subscribed)}</td>
              <td style={tdR}>{yearsHeld.toFixed(1)}y</td>
              <td style={tdR}>{feePct.toFixed(1)}%</td>
              <td style={{ ...tdR, fontWeight: 500 }}>{formatCurrency(feeAmount)}</td>
            </tr>
          ))}
          <tr style={{ background: '#f9f9f7' }}>
            <td style={{ ...tdSt, fontWeight: 600 }} colSpan={5}>Total accrued</td>
            <td style={{ ...tdR, fontWeight: 600 }}>{formatCurrency(totalFee)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
