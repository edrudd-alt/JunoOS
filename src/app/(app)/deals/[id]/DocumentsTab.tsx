'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DealInvestorFull, ClientFull } from './dealUtils'
import { supersedeDocument, reinstateDocument, deleteDocument } from './documentActions'
import { isSendableType } from '@/lib/documentTypes'
import EmailComposerModal, { type ComposerDocument } from '@/app/(app)/clients/[id]/_components/EmailComposerModal'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocumentRow {
  id: string
  type: string
  filename: string
  version: number
  superseded: boolean
  superseded_at: string | null
  superseded_reason: string | null
  superseded_by_id: string | null
  document_date: string | null
  storage_url: string | null
  client_id: string | null
  deal_investor_id: string | null
}

interface DealRow { id: string; status: string }

interface DocMeta { clientName: string; clientId: string | null; clientEmail: string | null; vehicleName: string | null }

interface Props {
  deal:              DealRow
  documents:         DocumentRow[]
  dealInvestors:     DealInvestorFull[]
  clientMap:         Map<string, ClientFull>
  outlookConnected?: boolean
  onDataRefresh:     () => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  application_form:      'Application form',
  eis_certificate:       'EIS3 certificate',
  transaction_statement: 'Transaction statement',
  investment_agreement:  'Investment agreement',
  side_letter:           'Side letter',
  kyc:                   'KYC',
  poa:                   'Power of attorney',
}

const TYPE_ORDER = [
  'application_form', 'eis_certificate', 'transaction_statement',
  'investment_agreement', 'side_letter', 'kyc', 'poa',
]

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function sortByDateDesc(a: DocumentRow, b: DocumentRow): number {
  if (!a.document_date && !b.document_date) return 0
  if (!a.document_date) return 1
  if (!b.document_date) return -1
  return new Date(b.document_date).getTime() - new Date(a.document_date).getTime()
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DocumentsTab({
  deal, documents, dealInvestors, clientMap, outlookConnected, onDataRefresh,
}: Props) {
  const supabase     = createClient()
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  // ── View state (URL-synced — persists across tab switches and refresh) ─────
  const rawDocView = searchParams.get('docview')
  const docView: 'investor' | 'type' | 'date' =
    rawDocView === 'type' ? 'type' : rawDocView === 'date' ? 'date' : 'investor'

  function setDocView(v: 'investor' | 'type' | 'date') {
    const params = new URLSearchParams(searchParams.toString())
    params.set('docview', v)
    router.replace(`?${params.toString()}`)
  }

  // ── Filter / search (session-local — resets on page load as per spec) ─────
  const [showAll,  setShowAll]  = useState(false)
  const [search,   setSearch]   = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggleCollapse(sectionId: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId)
      return next
    })
  }

  // ── Menu state ────────────────────────────────────────────────────────────
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPos,    setMenuPos]    = useState<{ x: number; y: number } | null>(null)

  // ── Modal: email composer ─────────────────────────────────────────────────
  const [composerDoc, setComposerDoc] = useState<(ComposerDocument & { clientId: string; clientEmail: string | null }) | null>(null)

  // ── Modal: supersede ──────────────────────────────────────────────────────
  const [supersedeTarget,  setSupersedeTarget]  = useState<DocumentRow | null>(null)
  const [supersedeReason,  setSupersedeReason]  = useState('')
  const [supersedeError,   setSupersedeError]   = useState<string | null>(null)
  const [supersedeLoading, setSupersedeLoading] = useState(false)

  // ── Modal: delete ─────────────────────────────────────────────────────────
  const [deleteTarget,  setDeleteTarget]  = useState<DocumentRow | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) { setToast(msg);       setTimeout(() => setToast(null), 3500) }
  function showError(msg: string) { setToast(`⚠ ${msg}`); setTimeout(() => setToast(null), 5000) }

  // ── Build diMap ───────────────────────────────────────────────────────────
  const diMap = new Map(dealInvestors.map(di => [di.id, di]))

  function getDocMeta(doc: DocumentRow): DocMeta {
    const directClient = doc.client_id ? clientMap.get(doc.client_id) : null
    const di           = doc.deal_investor_id ? diMap.get(doc.deal_investor_id) : null
    const diClient     = di?.client_id ? clientMap.get(di.client_id) : null
    const client       = directClient ?? diClient
    const vehicle      = di?.investing_vehicle_id ? clientMap.get(di.investing_vehicle_id) : null
    return {
      clientName:  client?.full_name  ?? 'Unknown investor',
      clientId:    client?.id ?? doc.client_id ?? null,
      clientEmail: client?.email ?? null,
      vehicleName: vehicle?.full_name ?? null,
    }
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const visibleDocs = documents
    .filter(d => showAll || !d.superseded)
    .filter(d => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      const { clientName, vehicleName } = getDocMeta(d)
      return (
        d.filename.toLowerCase().includes(q) ||
        clientName.toLowerCase().includes(q) ||
        (vehicleName ?? '').toLowerCase().includes(q) ||
        getTypeLabel(d.type).toLowerCase().includes(q)
      )
    })

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleSupersede() {
    if (!supersedeTarget || !userId) return
    if (!supersedeReason.trim()) { setSupersedeError('Please enter a reason.'); return }
    setSupersedeLoading(true)
    const { error } = await supersedeDocument(supabase, supersedeTarget.id, deal.id, supersedeReason.trim(), userId)
    setSupersedeLoading(false)
    if (error) { showError(error); return }
    setSupersedeTarget(null); setSupersedeReason(''); setSupersedeError(null)
    showToast('Document marked as superseded.')
    onDataRefresh()
  }

  async function handleReinstate(doc: DocumentRow) {
    if (!userId) return
    const { error } = await reinstateDocument(supabase, doc.id, deal.id, userId)
    if (error) { showError(error); return }
    showToast('Document reinstated.')
    onDataRefresh()
  }

  async function handleDelete() {
    if (!deleteTarget || !userId) return
    setDeleteLoading(true)
    const { error } = await deleteDocument(supabase, deleteTarget.id, deal.id, userId)
    setDeleteLoading(false)
    if (error) { showError(error); return }
    setDeleteTarget(null)
    showToast('Document deleted.')
    onDataRefresh()
  }

  const sharedRowProps = {
    getDocMeta,
    openMenuId,
    setOpenMenuId,
    menuPos,
    setMenuPos,
    onSupersede: (doc: DocumentRow) => { setSupersedeTarget(doc); setSupersedeReason(''); setSupersedeError(null) },
    onReinstate: handleReinstate,
    onDelete:    (doc: DocumentRow) => setDeleteTarget(doc),
    onEmail: (doc: DocumentRow, clientId: string | null, clientEmail: string | null) => {
      setComposerDoc({
        documentId: doc.id,
        type:       doc.type,
        filename:   doc.filename,
        period:     doc.document_date,
        clientId:   clientId ?? '',
        clientEmail,
      })
    },
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div onClick={() => { if (openMenuId) { setOpenMenuId(null); setMenuPos(null) } }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '12px 16px', borderBottom: '0.5px solid var(--card-border)',
        background: '#fafaf8',
      }}>
        {/* View switcher */}
        <div style={{
          display: 'flex', borderRadius: 6, overflow: 'hidden',
          border: '0.5px solid var(--card-border)', flexShrink: 0,
        }}>
          {(['investor', 'type', 'date'] as const).map((v, i) => (
            <button
              key={v}
              onClick={e => { e.stopPropagation(); setDocView(v) }}
              style={{
                padding: '5px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
                borderRight: i < 2 ? '0.5px solid var(--card-border)' : 'none',
                background: docView === v ? '#0f2744' : '#fff',
                color:      docView === v ? '#fff'    : '#555',
                fontWeight: docView === v ? 600       : 400,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              By {v}
            </button>
          ))}
        </div>

        {/* Final / All toggle */}
        <button
          onClick={e => { e.stopPropagation(); setShowAll(a => !a) }}
          style={{
            padding: '5px 12px', fontSize: 12, cursor: 'pointer',
            border: '0.5px solid var(--card-border)', borderRadius: 6,
            background: showAll ? '#fff4e0' : '#fff',
            color:      showAll ? '#8b5c00' : '#555',
            fontWeight: showAll ? 600       : 400,
            flexShrink: 0,
          }}
        >
          {showAll ? 'All docs' : 'Final only'}
        </button>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <input
          type="text"
          placeholder="Search documents…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onClick={e => e.stopPropagation()}
          style={{
            fontSize: 12, padding: '5px 10px',
            border: '0.5px solid var(--card-border)', borderRadius: 6,
            outline: 'none', width: 200, background: '#fff',
          }}
        />
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ padding: 16 }}>

        {documents.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 0', color: '#aaa', fontSize: 13,
          }}>
            No documents filed for this deal yet.
          </div>

        ) : visibleDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>
              No documents match your search.
            </div>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
              >
                Clear search
              </button>
            )}
          </div>

        ) : docView === 'investor' ? (
          <ByInvestorView
            docs={visibleDocs}
            diMap={diMap}
            clientMap={clientMap}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            {...sharedRowProps}
          />

        ) : docView === 'type' ? (
          <ByTypeView
            docs={visibleDocs}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            {...sharedRowProps}
          />

        ) : (
          <ByDateView docs={visibleDocs} {...sharedRowProps} />
        )}
      </div>

      {/* ── Supersede modal ──────────────────────────────────────────────── */}
      {supersedeTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div
            style={{ background: '#fff', borderRadius: 10, padding: 24, width: 440, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              Mark as superseded
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
              {supersedeTarget.filename}
            </div>
            <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
              Reason (required)
            </label>
            <textarea
              value={supersedeReason}
              onChange={e => { setSupersedeReason(e.target.value); setSupersedeError(null) }}
              placeholder="e.g. Replaced by corrected version"
              rows={3}
              style={{
                width: '100%', fontSize: 12, padding: '8px 10px',
                border: `1.5px solid ${supersedeError ? '#a32d2d' : 'var(--card-border)'}`,
                borderRadius: 6, resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            {supersedeError && (
              <div style={{ fontSize: 11, color: '#a32d2d', marginTop: 4 }}>{supersedeError}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setSupersedeTarget(null)}
                disabled={supersedeLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSupersede}
                disabled={supersedeLoading}
                style={{ background: '#b45309' }}
              >
                {supersedeLoading ? 'Saving…' : 'Mark as superseded'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete modal ─────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div
            style={{ background: '#fff', borderRadius: 10, padding: 24, width: 400, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Delete document?</div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 20 }}>
              Delete <strong>{deleteTarget.filename}</strong>? This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleDelete}
                disabled={deleteLoading}
                style={{ background: '#a32d2d' }}
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.startsWith('⚠') ? '#a32d2d' : '#0a5a3d',
          color: '#fff', borderRadius: 8, padding: '10px 16px',
          fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}>
          {toast}
        </div>
      )}

      {/* ── Email composer ───────────────────────────────────────────────── */}
      {composerDoc && (
        <EmailComposerModal
          open={true}
          document={{ documentId: composerDoc.documentId, type: composerDoc.type, filename: composerDoc.filename, period: composerDoc.period }}
          client={{ fullName: composerDoc.clientId ? (clientMap.get(composerDoc.clientId)?.full_name ?? '') : '', email: composerDoc.clientEmail }}
          clientId={composerDoc.clientId}
          outlookConnected={outlookConnected}
          onClose={() => setComposerDoc(null)}
        />
      )}
    </div>
  )
}

// ── Shared row props type ─────────────────────────────────────────────────────

interface SharedRowProps {
  getDocMeta:     (doc: DocumentRow) => DocMeta
  openMenuId:     string | null
  setOpenMenuId:  (id: string | null) => void
  menuPos:        { x: number; y: number } | null
  setMenuPos:     (pos: { x: number; y: number } | null) => void
  onSupersede:    (doc: DocumentRow) => void
  onReinstate:    (doc: DocumentRow) => Promise<void>
  onDelete:       (doc: DocumentRow) => void
  onEmail:        (doc: DocumentRow, clientId: string | null, clientEmail: string | null) => void
}

// ── By-investor view ──────────────────────────────────────────────────────────

function ByInvestorView({
  docs, diMap, clientMap, collapsed, onToggleCollapse, ...rowProps
}: {
  docs: DocumentRow[]
  diMap: Map<string, DealInvestorFull>
  clientMap: Map<string, ClientFull>
  collapsed: Set<string>
  onToggleCollapse: (id: string) => void
} & SharedRowProps) {
  const order: string[] = []
  const groups = new Map<string, { clientName: string; vehicleName: string | null; docs: DocumentRow[] }>()

  for (const doc of docs) {
    const sectionKey = doc.deal_investor_id ?? doc.client_id ?? 'unknown'
    if (!groups.has(sectionKey)) {
      order.push(sectionKey)
      const client  = doc.client_id ? clientMap.get(doc.client_id) : null
      const di      = doc.deal_investor_id ? diMap.get(doc.deal_investor_id) : null
      const vehicle = di?.investing_vehicle_id ? clientMap.get(di.investing_vehicle_id) : null
      groups.set(sectionKey, {
        clientName:  client?.full_name  ?? 'Unknown investor',
        vehicleName: vehicle?.full_name ?? null,
        docs: [],
      })
    }
    groups.get(sectionKey)!.docs.push(doc)
  }

  const sorted = order
    .map(k => ({ key: k, ...groups.get(k)! }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.map(({ key, clientName, vehicleName, docs: sectionDocs }) => {
        const isCollapsed = collapsed.has(key)
        const sortedDocs  = [...sectionDocs].sort(sortByDateDesc)
        const count       = sectionDocs.length

        return (
          <div key={key} style={{ border: '0.5px solid var(--card-border)', borderRadius: 8, overflow: 'hidden' }}>
            <SectionHeader
              label={clientName}
              sub={vehicleName ? `via ${vehicleName}` : null}
              count={count}
              isCollapsed={isCollapsed}
              onClick={() => onToggleCollapse(key)}
            />
            {!isCollapsed && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderTop: '0.5px solid var(--card-border)', background: '#fafaf8' }}>
                    <th style={thSt}>Date</th>
                    <th style={thSt}>Type</th>
                    <th style={thSt}>Filename</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDocs.map(doc => (
                    <DocRow key={doc.id} doc={doc} showInvestor={false} showType {...rowProps} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── By-type view ──────────────────────────────────────────────────────────────

function ByTypeView({
  docs, collapsed, onToggleCollapse, ...rowProps
}: {
  docs: DocumentRow[]
  collapsed: Set<string>
  onToggleCollapse: (id: string) => void
} & SharedRowProps) {
  const order: string[] = []
  const groups = new Map<string, DocumentRow[]>()

  for (const doc of docs) {
    if (!groups.has(doc.type)) { order.push(doc.type); groups.set(doc.type, []) }
    groups.get(doc.type)!.push(doc)
  }

  const sorted = order
    .map(t => ({ type: t, docs: groups.get(t)! }))
    .sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type)
      const bi = TYPE_ORDER.indexOf(b.type)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.type.localeCompare(b.type)
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.map(({ type, docs: typeDocs }) => {
        const sectionId   = `type:${type}`
        const isCollapsed = collapsed.has(sectionId)
        const sortedDocs  = [...typeDocs].sort(sortByDateDesc)

        return (
          <div key={type} style={{ border: '0.5px solid var(--card-border)', borderRadius: 8, overflow: 'hidden' }}>
            <SectionHeader
              label={getTypeLabel(type)}
              sub={null}
              count={typeDocs.length}
              isCollapsed={isCollapsed}
              onClick={() => onToggleCollapse(sectionId)}
            />
            {!isCollapsed && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderTop: '0.5px solid var(--card-border)', background: '#fafaf8' }}>
                    <th style={thSt}>Date</th>
                    <th style={thSt}>Investor</th>
                    <th style={thSt}>Filename</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDocs.map(doc => (
                    <DocRow key={doc.id} doc={doc} showInvestor showType={false} {...rowProps} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── By-date view ──────────────────────────────────────────────────────────────

function ByDateView({ docs, ...rowProps }: { docs: DocumentRow[] } & SharedRowProps) {
  const sorted = [...docs].sort(sortByDateDesc)

  return (
    <div style={{ border: '0.5px solid var(--card-border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#fafaf8' }}>
            <th style={thSt}>Date</th>
            <th style={thSt}>Investor</th>
            <th style={thSt}>Type</th>
            <th style={thSt}>Filename</th>
            <th style={{ ...thSt, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(doc => (
            <DocRow key={doc.id} doc={doc} showInvestor showType {...rowProps} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  label, sub, count, isCollapsed, onClick,
}: {
  label: string; sub: string | null; count: number
  isCollapsed: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '10px 14px', background: '#f7f7f4', border: 'none',
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span style={{
        fontSize: 11, color: '#888',
        display: 'inline-block',
        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s',
        lineHeight: 1,
      }}>
        ▾
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f2744' }}>{label}</span>
      {sub && <span style={{ fontSize: 12, color: '#888' }}>{sub}</span>}
      <span style={{
        fontSize: 10, fontWeight: 500, background: '#e8f0fb', color: '#185fa5',
        borderRadius: 10, padding: '1px 7px', marginLeft: 4, flexShrink: 0,
      }}>
        {count} {count === 1 ? 'document' : 'documents'}
      </span>
    </button>
  )
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocRow({
  doc, showInvestor, showType,
  getDocMeta, openMenuId, setOpenMenuId, menuPos, setMenuPos,
  onSupersede, onReinstate, onDelete, onEmail,
}: {
  doc: DocumentRow
  showInvestor: boolean
  showType: boolean
} & SharedRowProps) {
  const isOpen = openMenuId === doc.id
  const { clientName, clientId, clientEmail, vehicleName } = getDocMeta(doc)

  return (
    <tr style={{
      borderTop: '0.5px solid var(--card-border)',
      background: '#fff',
      opacity: doc.superseded ? 0.6 : 1,
    }}>
      {/* Date */}
      <td style={{ ...tdSt, whiteSpace: 'nowrap', color: '#555' }}>
        {fmtDate(doc.document_date)}
      </td>

      {/* Investor — only in by-type and by-date views */}
      {showInvestor && (
        <td style={tdSt}>
          <span style={{ fontSize: 12, color: '#555' }}>
            {clientName}{vehicleName ? ` via ${vehicleName}` : ''}
          </span>
        </td>
      )}

      {/* Type — only in by-investor and by-date views */}
      {showType && (
        <td style={tdSt}>
          <span style={{
            fontSize: 10, fontWeight: 500, background: '#f0f0ec', color: '#666',
            borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap',
          }}>
            {getTypeLabel(doc.type)}
          </span>
        </td>
      )}

      {/* Filename */}
      <td style={{ ...tdSt, maxWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            title={doc.filename}
            style={{
              fontSize: 12, fontWeight: 500, color: '#0f2744',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: doc.superseded ? 'line-through' : undefined,
            }}
          >
            {doc.filename}
          </span>
          {doc.version > 1 && (
            <span style={{
              fontSize: 10, fontWeight: 500, background: '#e8f0fb', color: '#185fa5',
              borderRadius: 4, padding: '1px 5px', flexShrink: 0,
            }}>
              v{doc.version}
            </span>
          )}
          {doc.superseded && (
            <span style={{
              fontSize: 10, fontWeight: 600, background: '#f0f0ec', color: '#888',
              borderRadius: 4, padding: '1px 6px', flexShrink: 0,
            }}>
              Superseded
            </span>
          )}
        </div>
      </td>

      {/* Actions */}
      <td style={{ ...tdSt, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button
          onClick={e => {
            e.stopPropagation()
            if (isOpen) {
              setOpenMenuId(null); setMenuPos(null)
            } else {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setMenuPos({ x: rect.right, y: rect.bottom + 4 })
              setOpenMenuId(doc.id)
            }
          }}
          style={{
            background: isOpen ? '#f0f0ec' : 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, color: '#888', padding: '2px 6px', borderRadius: 4,
            lineHeight: 1,
          }}
          title="Document actions"
        >
          ⋯
        </button>

        {isOpen && menuPos && (
          <div
            style={{
              position: 'fixed',
              left: Math.min(menuPos.x - 190, window.innerWidth - 190 - 8),
              top: Math.min(menuPos.y, window.innerHeight - 160 - 8),
              zIndex: 600,
              background: '#fff', border: '0.5px solid var(--card-border)',
              borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
              minWidth: 190, overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <MenuItem
              label="View document"
              disabled={!doc.storage_url}
              disabledHint="Document not yet uploaded"
              onClick={() => { if (doc.storage_url) { window.open(doc.storage_url, '_blank'); setOpenMenuId(null) } }}
            />
            <MenuItem
              label="Download"
              disabled={!doc.storage_url}
              disabledHint="Document not yet uploaded"
              onClick={() => {
                if (doc.storage_url) {
                  const a = document.createElement('a'); a.href = doc.storage_url!; a.download = doc.filename; a.click()
                  setOpenMenuId(null)
                }
              }}
            />
            {isSendableType(doc.type) && (
              <MenuItem
                label="Email document"
                onClick={() => { setOpenMenuId(null); onEmail(doc, clientId, clientEmail) }}
              />
            )}
            <div style={{ height: '0.5px', background: 'var(--card-border)', margin: '2px 0' }} />
            {!doc.superseded ? (
              <MenuItem
                label="Mark as superseded"
                onClick={() => { setOpenMenuId(null); onSupersede(doc) }}
              />
            ) : (
              <MenuItem
                label="Reinstate"
                onClick={() => { setOpenMenuId(null); onReinstate(doc) }}
              />
            )}
            <MenuItem
              label="Delete"
              danger
              onClick={() => { setOpenMenuId(null); onDelete(doc) }}
            />
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Table styles ─────────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 10, fontWeight: 600, color: '#888',
  textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em',
}

const tdSt: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 12, color: '#0f2744',
  verticalAlign: 'middle',
}

// ── Menu item ─────────────────────────────────────────────────────────────────

function MenuItem({
  label, disabled, disabledHint, onClick, danger,
}: {
  label: string
  disabled?: boolean
  disabledHint?: string
  onClick: () => void
  danger?: boolean
}) {
  if (disabled) {
    return (
      <div
        title={disabledHint}
        style={{ padding: '9px 14px', cursor: 'not-allowed' }}
      >
        <div style={{ fontSize: 12, color: '#ccc' }}>{label}</div>
        {disabledHint && <div style={{ fontSize: 10, color: '#ccc', marginTop: 1 }}>{disabledHint}</div>}
      </div>
    )
  }
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '9px 14px', fontSize: 12,
        color: danger ? '#a32d2d' : '#333',
        background: 'none', border: 'none', cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
