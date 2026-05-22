'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { formatPeriodDateUK } from '@/lib/templates'
import {
  createBulkRun,
  cancelBulkRun,
  retryFailedItems,
  savePreset,
  renamePreset,
  deletePreset,
  type BulkRunSummary,
  type BulkRunItem,
  type TickResult,
  type BulkRunPreset,
} from './bulkRunActions'
import PastRunDetails from './_components/PastRunDetails'
import SendAllConfirmModal from './_components/SendAllConfirmModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string
  full_name: string
  email: string | null
  is_favourite: boolean
}

interface InvestmentRow {
  client_id: string
  fund_type: string | null
  shares_purchased: number
}

interface StatementRow {
  client_id: string
  period: string | null
  created_at: string
}

interface FilterState {
  activeInvestments: boolean
  favouritesOnly:    boolean
  fundSyndicate:     boolean
  fundMultiManager:  boolean
  fundEisFund:       boolean
  notSentThisPeriod: boolean
  hasEmail:          boolean
}

interface Props {
  clients:             ClientRow[]
  investments:         InvestmentRow[]
  statements:          StatementRow[]
  activeRun:           Record<string, unknown> | null
  activeRunItems:      Record<string, unknown>[]
  pastRuns:            Record<string, unknown>[]
  initialPresets:      Record<string, unknown>[]
  preselectedClientId: string | null
  outlookEmail?:       string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultPeriodDate(): string {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth() + 1   // 1-based
  if (m >= 10)      return `${y}-09-30`
  if (m >= 7)       return `${y}-06-30`
  if (m >= 4)       return `${y}-03-31`
  return `${y - 1}-12-31`
}

function quarterLabel(isoDate: string): string {
  const m = parseInt(isoDate.slice(5, 7), 10)
  if (m === 3)  return 'Q1 end'
  if (m === 6)  return 'Q2 end'
  if (m === 9)  return 'Q3 end'
  if (m === 12) return 'Q4 end'
  return ''
}

function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BulkStatementRunPage({
  clients,
  investments,
  statements,
  activeRun:     initialActiveRun,
  activeRunItems: initialActiveRunItems,
  pastRuns:      initialPastRuns,
  initialPresets,
  preselectedClientId,
  outlookEmail = '',
}: Props) {
  const [periodDate, setPeriodDate] = useState<string>(defaultPeriodDate)
  const [filters, setFilters] = useState<FilterState>({
    activeInvestments: true,
    favouritesOnly:    false,
    fundSyndicate:     false,
    fundMultiManager:  false,
    fundEisFund:       false,
    notSentThisPeriod: false,
    hasEmail:          true,
  })
  const [search, setSearch]                         = useState('')
  const [selectedIds, setSelectedIds]               = useState<Set<string>>(
    () => preselectedClientId ? new Set([preselectedClientId]) : new Set()
  )
  const [activeRun, setActiveRun]                   = useState<BulkRunSummary | null>(
    initialActiveRun as BulkRunSummary | null
  )
  const [runItems, setRunItems]                     = useState<BulkRunItem[]>(
    initialActiveRunItems as unknown as BulkRunItem[]
  )
  const [pastRuns, setPastRuns]                     = useState<BulkRunSummary[]>(
    initialPastRuns as unknown as BulkRunSummary[]
  )
  const [presets, setPresets]                       = useState<BulkRunPreset[]>(
    initialPresets as unknown as BulkRunPreset[]
  )
  const [isPolling, setIsPolling]                   = useState(!!initialActiveRun)
  const [isStartingRun, setIsStartingRun]           = useState(false)
  const [isCancelling, setIsCancelling]             = useState(false)
  const [loadedPresetId, setLoadedPresetId]         = useState<string | null>(null)
  const [loadedPresetModified, setLoadedPresetModified] = useState(false)
  const [presetLoadedMsg, setPresetLoadedMsg]       = useState<string | null>(null)
  const [showSavePreset, setShowSavePreset]         = useState(false)
  const [showManagePresets, setShowManagePresets]   = useState(false)
  const [runError, setRunError]                     = useState<string | null>(null)
  const [expandedRunId, setExpandedRunId]           = useState<string | null>(null)
  const [sendConfirmRun, setSendConfirmRun]         = useState<BulkRunSummary | null>(null)

  const pollingRef = useRef(false)

  // ── Derived data ─────────────────────────────────────────────────────────────

  const investmentsByClient = useMemo(() => {
    const map = new Map<string, { fundTypes: Set<string>; hasActive: boolean }>()
    for (const inv of investments) {
      const entry = map.get(inv.client_id) ?? { fundTypes: new Set<string>(), hasActive: false }
      if (inv.fund_type) entry.fundTypes.add(inv.fund_type)
      if (inv.shares_purchased > 0) entry.hasActive = true
      map.set(inv.client_id, entry)
    }
    return map
  }, [investments])

  const statementsByClient = useMemo(() => {
    const map = new Map<string, { lastDate: string | null; hasCurrent: boolean }>()
    for (const stmt of statements) {
      const existing = map.get(stmt.client_id)
      const hasCurrent = stmt.period === periodDate
      if (!existing) {
        map.set(stmt.client_id, {
          lastDate:   stmt.created_at,
          hasCurrent,
        })
      } else {
        // statements are ordered newest-first from server; keep the first (latest)
        map.set(stmt.client_id, {
          lastDate:   existing.lastDate,
          hasCurrent: existing.hasCurrent || hasCurrent,
        })
      }
    }
    return map
  }, [statements, periodDate])

  const filteredClients = useMemo(() => {
    const fundFilters = [
      filters.fundSyndicate    && 'syndicate',
      filters.fundMultiManager && 'multi_manager',
      filters.fundEisFund      && 'eis',
    ].filter(Boolean) as string[]
    const anyFundFilter = fundFilters.length > 0

    return clients.filter(c => {
      const inv = investmentsByClient.get(c.id)
      const stmt = statementsByClient.get(c.id)

      if (filters.activeInvestments && !inv?.hasActive)     return false
      if (filters.favouritesOnly    && !c.is_favourite)      return false
      if (filters.hasEmail          && !c.email)             return false
      if (filters.notSentThisPeriod && stmt?.hasCurrent)     return false
      if (anyFundFilter) {
        const clientFunds = inv?.fundTypes ?? new Set<string>()
        if (!fundFilters.some(f => clientFunds.has(f)))       return false
      }
      if (search.trim()) {
        if (!c.full_name.toLowerCase().includes(search.trim().toLowerCase())) return false
      }
      return true
    })
  }, [clients, investments, investmentsByClient, statementsByClient, filters, search, periodDate])

  const preRunStats = useMemo(() => {
    const selected = clients.filter(c => selectedIds.has(c.id))
    const alreadyHaveCurrent = selected.filter(c => statementsByClient.get(c.id)?.hasCurrent).length
    const noEmail            = selected.filter(c => !c.email).length
    const fundBreakdown: Record<string, number> = {}
    for (const c of selected) {
      const fundTypes = investmentsByClient.get(c.id)?.fundTypes ?? new Set<string>()
      for (const ft of fundTypes) {
        fundBreakdown[ft] = (fundBreakdown[ft] ?? 0) + 1
      }
    }
    return { total: selected.length, alreadyHaveCurrent, noEmail, fundBreakdown }
  }, [clients, selectedIds, statementsByClient, investmentsByClient])

  // ── Polling ───────────────────────────────────────────────────────────────────

  const poll = useCallback(async (runId: string) => {
    if (!pollingRef.current) return
    try {
      const res  = await fetch(`/api/bulk-runs/${runId}/tick`, { method: 'POST' })
      const data = await res.json() as TickResult
      setActiveRun(data.run)
      setRunItems(data.items)
      if (data.run.status !== 'in_progress') {
        pollingRef.current = false
        setIsPolling(false)
        setPastRuns(prev => [data.run, ...prev.filter(r => r.id !== data.run.id)])
        setActiveRun(null)
        setRunItems([])
        return
      }
    } catch {
      // swallow network errors; retry on next tick
    }
    if (pollingRef.current) {
      setTimeout(() => poll(runId), 3000)
    }
  }, [])

  useEffect(() => {
    if (initialActiveRun) {
      pollingRef.current = true
      poll((initialActiveRun as unknown as BulkRunSummary).id)
    }
    return () => { pollingRef.current = false }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function toggleFilter(key: keyof FilterState) {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleClient(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      if (loadedPresetId) setLoadedPresetModified(true)
      return next
    })
  }

  function toggleAllVisible(select: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const c of filteredClients) {
        if (select) next.add(c.id); else next.delete(c.id)
      }
      if (loadedPresetId) setLoadedPresetModified(true)
      return next
    })
  }

  async function handleRunBulk() {
    setRunError(null)
    setIsStartingRun(true)
    try {
      const clientIds = [...selectedIds]
      const { runId } = await createBulkRun(clientIds, periodDate)
      const res  = await fetch(`/api/bulk-runs/${runId}/tick`, { method: 'POST' })
      const data = await res.json() as TickResult
      setActiveRun(data.run)
      setRunItems(data.items)
      pollingRef.current = true
      setIsPolling(true)
      setTimeout(() => poll(runId), 3000)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStartingRun(false)
    }
  }

  async function handleCancel() {
    if (!activeRun) return
    setIsCancelling(true)
    pollingRef.current = false
    setIsPolling(false)
    try {
      await cancelBulkRun(activeRun.id)
      const cancelled = { ...activeRun, status: 'cancelled' as const, cancelled_at: new Date().toISOString() }
      setPastRuns(prev => [cancelled, ...prev.filter(r => r.id !== activeRun.id)])
      setActiveRun(null)
      setRunItems([])
    } finally {
      setIsCancelling(false)
    }
  }

  async function handleRetry(runId: string) {
    const { runId: newRunId } = await retryFailedItems(runId)
    const res  = await fetch(`/api/bulk-runs/${newRunId}/tick`, { method: 'POST' })
    const data = await res.json() as TickResult
    setActiveRun(data.run)
    setRunItems(data.items)
    pollingRef.current = true
    setIsPolling(true)
    setTimeout(() => poll(newRunId), 3000)
  }

  function handleLoadPreset(preset: BulkRunPreset) {
    setFilters(preset.filter_state as unknown as FilterState)
    setSelectedIds(new Set(preset.client_ids))
    setLoadedPresetId(preset.id)
    setLoadedPresetModified(false)
    setPresetLoadedMsg(`Loaded preset "${preset.name}" — ${preset.client_ids.length} investors selected`)
    setTimeout(() => setPresetLoadedMsg(null), 4000)
  }

  function handleExpandRun(runId: string) {
    setExpandedRunId(prev => (prev === runId ? null : runId))
  }

  function handleSendAll(run: BulkRunSummary) {
    setSendConfirmRun(run)
  }

  async function handleSendStarted(bulkRunId: string) {
    setSendConfirmRun(null)
    const res  = await fetch(`/api/bulk-runs/${bulkRunId}/tick`, { method: 'POST' })
    const data = await res.json() as TickResult
    setActiveRun(data.run)
    setRunItems(data.items)
    pollingRef.current = true
    setIsPolling(true)
    setTimeout(() => poll(bulkRunId), 3000)
  }

  // ── Preset label ──────────────────────────────────────────────────────────────

  const loadedPreset = presets.find(p => p.id === loadedPresetId)
  const presetLabel  = loadedPreset
    ? loadedPresetModified
      ? `${loadedPreset.name} (modified)`
      : loadedPreset.name
    : 'Load preset'

  // ── Layout ────────────────────────────────────────────────────────────────────

  const showProgress = !!activeRun

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f2744', marginBottom: 4 }}>
        Portfolio statements
      </h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 28 }}>
        Generate statements for one or more investors.
      </p>

      {/* ── Progress view ─────────────────────────────────────────────────── */}
      {showProgress && (
        <BulkRunProgress
          run={activeRun}
          items={runItems}
          onCancel={handleCancel}
          isCancelling={isCancelling}
          clients={clients}
        />
      )}

      {/* ── Configure section (hidden while run in progress) ─────────────── */}
      {!showProgress && (
        <>
          {/* Period date */}
          <Section title="Period date">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input
                type="date"
                value={periodDate}
                onChange={e => setPeriodDate(e.target.value)}
                style={inputStyle}
              />
              {periodDate && (
                <span style={{ color: '#666', fontSize: 13 }}>
                  {formatPeriodDateUK(periodDate)}
                  {quarterLabel(periodDate) ? ` (${quarterLabel(periodDate)})` : ''}
                </span>
              )}
            </div>
          </Section>

          {/* Filter & select */}
          <Section title="Select investors">
            {/* Preset bar */}
            <PresetBar
              presets={presets}
              presetLabel={presetLabel}
              loadedPresetId={loadedPresetId}
              loadedPresetModified={loadedPresetModified}
              selectedCount={selectedIds.size}
              presetLoadedMsg={presetLoadedMsg}
              onLoad={handleLoadPreset}
              onSave={() => setShowSavePreset(true)}
              onManage={() => setShowManagePresets(true)}
            />

            {/* Filter chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0 12px' }}>
              {([
                ['activeInvestments', 'Active investments'],
                ['favouritesOnly',    'Favourites only'],
                ['fundSyndicate',     'Fund: Syndicate'],
                ['fundMultiManager',  'Fund: Multi Manager'],
                ['fundEisFund',       'Fund: EIS Fund'],
                ['notSentThisPeriod', 'Not sent this quarter'],
                ['hasEmail',          'Has email'],
              ] as [keyof FilterState, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleFilter(key)}
                  style={chipStyle(filters[key])}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, width: 280, marginBottom: 12 }}
            />

            {/* Table header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={smallBtn} onClick={() => toggleAllVisible(true)}>Select all visible</button>
                <button style={smallBtn} onClick={() => toggleAllVisible(false)}>Deselect all</button>
              </div>
              <span style={{ fontSize: 13, color: '#555' }}>
                {selectedIds.size} of {clients.length} selected
              </span>
            </div>

            {/* Investor table */}
            <InvestorTable
              clients={filteredClients}
              allClients={clients}
              selectedIds={selectedIds}
              investmentsByClient={investmentsByClient}
              statementsByClient={statementsByClient}
              periodDate={periodDate}
              onToggle={toggleClient}
            />
          </Section>

          {/* Pre-run review */}
          {selectedIds.size > 0 && (
            <Section title="Review">
              <PreRunReview
                stats={preRunStats}
                periodDate={periodDate}
                isStarting={isStartingRun}
                error={runError}
                onRun={handleRunBulk}
              />
            </Section>
          )}
        </>
      )}

      {/* ── Past runs ─────────────────────────────────────────────────────── */}
      {pastRuns.length > 0 && (
        <Section title="Past runs">
          <PastRunsTable
            runs={pastRuns}
            expandedRunId={expandedRunId}
            onExpand={handleExpandRun}
            onRetry={handleRetry}
            outlookEmail={outlookEmail}
            onSendAll={handleSendAll}
          />
        </Section>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showSavePreset && (
        <SavePresetModal
          selectedCount={selectedIds.size}
          onClose={() => setShowSavePreset(false)}
          onSave={async (name) => {
            const result = await savePreset(name, [...selectedIds], filters as unknown as Record<string, unknown>)
            if ('error' in result) throw new Error(result.error)
            setPresets(prev => [result.preset, ...prev])
            setLoadedPresetId(result.preset.id)
            setLoadedPresetModified(false)
            setShowSavePreset(false)
          }}
        />
      )}

      {showManagePresets && (
        <ManagePresetsModal
          presets={presets}
          loadedPresetId={loadedPresetId}
          onClose={() => setShowManagePresets(false)}
          onRename={async (id, name) => {
            const result = await renamePreset(id, name)
            if (result?.error) throw new Error(result.error)
            setPresets(prev => prev.map(p => p.id === id ? { ...p, name } : p))
          }}
          onDelete={async (id) => {
            await deletePreset(id)
            setPresets(prev => prev.filter(p => p.id !== id))
            if (loadedPresetId === id) {
              setLoadedPresetId(null)
              setLoadedPresetModified(false)
            }
          }}
        />
      )}

      {sendConfirmRun && outlookEmail && (
        <SendAllConfirmModal
          sourceRun={sendConfirmRun}
          outlookEmail={outlookEmail}
          onClose={() => setSendConfirmRun(null)}
          onStarted={handleSendStarted}
        />
      )}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '20px 24px',
      marginBottom: 20, background: '#fff',
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', marginBottom: 16 }}>{title}</h2>
      {children}
    </div>
  )
}

// ── PresetBar ─────────────────────────────────────────────────────────────────

function PresetBar({
  presets,
  presetLabel,
  loadedPresetId,
  loadedPresetModified,
  selectedCount,
  presetLoadedMsg,
  onLoad,
  onSave,
  onManage,
}: {
  presets:              BulkRunPreset[]
  presetLabel:          string
  loadedPresetId:       string | null
  loadedPresetModified: boolean
  selectedCount:        number
  presetLoadedMsg:      string | null
  onLoad:               (p: BulkRunPreset) => void
  onSave:               () => void
  onManage:             () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {/* Load preset dropdown */}
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          style={{ ...smallBtn, minWidth: 160 }}
          onClick={() => setOpen(o => !o)}
        >
          {presetLabel} {presets.length > 0 ? '▾' : ''}
        </button>
        {open && presets.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
            background: '#fff', border: '0.5px solid #e8e7e0', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 220,
          }}>
            {presets.map(p => (
              <button
                key={p.id}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', fontSize: 13, color: '#0f2744',
                  background: p.id === loadedPresetId ? '#f5f7ff' : 'transparent',
                  border: 'none', cursor: 'pointer',
                }}
                onClick={() => { onLoad(p); setOpen(false) }}
              >
                {p.name}
                <span style={{ color: '#999', marginLeft: 8 }}>({p.client_ids.length})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        style={{ ...smallBtn, opacity: selectedCount === 0 ? 0.4 : 1 }}
        disabled={selectedCount === 0}
        onClick={onSave}
      >
        Save selection as preset
      </button>

      <button style={{ ...linkBtn }} onClick={onManage}>
        Manage presets
      </button>

      {presetLoadedMsg && (
        <span style={{ fontSize: 13, color: '#1d9e75' }}>{presetLoadedMsg}</span>
      )}
    </div>
  )
}

// ── InvestorTable ─────────────────────────────────────────────────────────────

const FUND_LABELS: Record<string, string> = {
  syndicate:     'Syndicate',
  multi_manager: 'Multi Manager',
  eis:           'EIS Fund',
}

function InvestorTable({
  clients,
  allClients,
  selectedIds,
  investmentsByClient,
  statementsByClient,
  periodDate,
  onToggle,
}: {
  clients:             ClientRow[]
  allClients:          ClientRow[]
  selectedIds:         Set<string>
  investmentsByClient: Map<string, { fundTypes: Set<string>; hasActive: boolean }>
  statementsByClient:  Map<string, { lastDate: string | null; hasCurrent: boolean }>
  periodDate:          string
  onToggle:            (id: string) => void
}) {
  const filteredSet = useMemo(() => new Set(clients.map(c => c.id)), [clients])

  // Rows: filtered clients first, then selected-but-filtered-out (greyed)
  const filteredOutSelected = useMemo(
    () => allClients.filter(c => selectedIds.has(c.id) && !filteredSet.has(c.id)),
    [allClients, selectedIds, filteredSet]
  )

  const rows = [...clients, ...filteredOutSelected]

  if (rows.length === 0) {
    return <p style={{ color: '#999', fontSize: 13, padding: '12px 0' }}>No investors match the current filters.</p>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid #e8e7e0', textAlign: 'left' }}>
            <th style={th}></th>
            <th style={th}>Name</th>
            <th style={th}>Email</th>
            <th style={th}>Fund types</th>
            <th style={th}>Last statement</th>
            <th style={th}>For this period</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const isFiltered = !filteredSet.has(c.id)
            const inv   = investmentsByClient.get(c.id)
            const stmt  = statementsByClient.get(c.id)
            const funds = [...(inv?.fundTypes ?? [])]
            return (
              <tr
                key={c.id}
                style={{
                  borderBottom: '0.5px solid #f0efea',
                  opacity: isFiltered ? 0.45 : 1,
                  cursor: 'pointer',
                  background: selectedIds.has(c.id) ? '#f5f7ff' : 'transparent',
                }}
                onClick={() => onToggle(c.id)}
              >
                <td style={td}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onClick={e => e.stopPropagation()}
                    onChange={() => onToggle(c.id)}
                  />
                </td>
                <td style={{ ...td, fontWeight: selectedIds.has(c.id) ? 500 : 400 }}>{c.full_name}</td>
                <td style={{ ...td, color: c.email ? '#333' : '#ccc' }}>
                  {c.email ?? 'No email'}
                </td>
                <td style={td}>
                  {funds.length === 0
                    ? <span style={{ color: '#ccc' }}>—</span>
                    : funds.map(f => (
                        <span key={f} style={fundPill}>{FUND_LABELS[f] ?? f}</span>
                      ))
                  }
                </td>
                <td style={{ ...td, color: '#555' }}>
                  {stmt?.lastDate
                    ? new Date(stmt.lastDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : <span style={{ color: '#ccc' }}>Never</span>
                  }
                </td>
                <td style={{ ...td, color: stmt?.hasCurrent ? '#1d9e75' : '#ccc' }}>
                  {stmt?.hasCurrent ? 'Yes' : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── PreRunReview ──────────────────────────────────────────────────────────────

function PreRunReview({
  stats,
  periodDate,
  isStarting,
  error,
  onRun,
}: {
  stats:      { total: number; alreadyHaveCurrent: number; noEmail: number; fundBreakdown: Record<string, number> }
  periodDate: string
  isStarting: boolean
  error:      string | null
  onRun:      () => void
}) {
  return (
    <div>
      <p style={{ fontSize: 14, color: '#0f2744', marginBottom: 8 }}>
        You&apos;re about to generate <strong>{stats.total}</strong> statement{stats.total !== 1 ? 's' : ''} for
        the period <strong>{formatPeriodDateUK(periodDate)}</strong>.
      </p>

      {stats.alreadyHaveCurrent > 0 && (
        <p style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
          {stats.alreadyHaveCurrent} of these investors already have a current statement for this period.
          Those will be superseded (the old version preserved in the archive).
        </p>
      )}

      {stats.noEmail > 0 && (
        <p style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
          {stats.noEmail} selected investor{stats.noEmail !== 1 ? 's have' : ' has'} no email on file.
          You&apos;ll be able to download those statements but not email them.
        </p>
      )}

      {Object.keys(stats.fundBreakdown).length > 0 && (
        <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
          <strong>Fund breakdown:</strong>
          {Object.entries(stats.fundBreakdown).map(([ft, count]) => (
            <div key={ft} style={{ marginLeft: 16, marginTop: 2 }}>
              {FUND_LABELS[ft] ?? ft}: {count} investor{count !== 1 ? 's' : ''}
            </div>
          ))}
          {Object.values(stats.fundBreakdown).reduce((a, b) => a + b, 0) > stats.total && (
            <div style={{ marginLeft: 16, color: '#999', marginTop: 2 }}>
              (Some investors hold across multiple funds)
            </div>
          )}
        </div>
      )}

      {error && (
        <p style={{ fontSize: 13, color: '#c0392b', marginBottom: 12 }}>{error}</p>
      )}

      <button
        style={primaryBtn}
        disabled={isStarting || stats.total === 0}
        onClick={onRun}
      >
        {isStarting ? 'Starting...' : `Run bulk generation (${stats.total})`}
      </button>
    </div>
  )
}

// ── BulkRunProgress ───────────────────────────────────────────────────────────

function BulkRunProgress({
  run,
  items,
  onCancel,
  isCancelling,
  clients,
}: {
  run:         BulkRunSummary
  items:       BulkRunItem[]
  onCancel:    () => void
  isCancelling: boolean
  clients:     ClientRow[]
}) {
  const clientMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clients) m.set(c.id, c.full_name)
    return m
  }, [clients])

  const inProgress = items.find(i => i.status === 'in_progress')
  const pct = run.total_items > 0
    ? Math.round(((run.succeeded_count + run.failed_count) / run.total_items) * 100)
    : 0
  const remaining = run.total_items - run.succeeded_count - run.failed_count

  return (
    <div style={{
      border: '0.5px solid #e8e7e0', borderRadius: 8, padding: '20px 24px',
      marginBottom: 20, background: '#fff',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', marginBottom: 2 }}>
            Bulk run in progress
          </h2>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
            Started {formatRunDate(run.started_at)} &middot; Period: {run.period_date ? formatPeriodDateUK(run.period_date) : '—'}
          </p>
        </div>
        <button
          style={{ ...smallBtn, color: '#c0392b', borderColor: '#c0392b' }}
          disabled={isCancelling}
          onClick={onCancel}
        >
          {isCancelling ? 'Cancelling...' : 'Cancel run'}
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ background: '#eee', borderRadius: 4, height: 10, marginBottom: 12 }}>
        <div style={{ background: '#1d9e75', borderRadius: 4, height: 10, width: `${pct}%`, transition: 'width 0.4s' }} />
      </div>

      <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#555', marginBottom: 12 }}>
        <span style={{ color: '#1d9e75' }}>✓ {run.succeeded_count} succeeded</span>
        {run.failed_count > 0 && <span style={{ color: '#c0392b' }}>✗ {run.failed_count} failed</span>}
        <span>{remaining} remaining ({pct}% complete)</span>
      </div>

      {inProgress && (
        <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
          Currently generating: <strong>{clientMap.get(inProgress.client_id) ?? inProgress.client_id}</strong>
        </p>
      )}

      {/* Per-item status table */}
      {items.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #e8e7e0' }}>
                <th style={th}>Status</th>
                <th style={th}>Client</th>
                <th style={th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: '0.5px solid #f0efea' }}>
                  <td style={{ ...td, width: 90 }}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td style={td}>{clientMap.get(item.client_id) ?? item.client_id}</td>
                  <td style={{ ...td, color: '#c0392b' }}>
                    {item.error_message ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── PastRunsTable ─────────────────────────────────────────────────────────────

function PastRunsTable({
  runs,
  expandedRunId,
  onExpand,
  onRetry,
  outlookEmail,
  onSendAll,
}: {
  runs:          BulkRunSummary[]
  expandedRunId: string | null
  onExpand:      (id: string) => void
  onRetry:       (id: string) => void
  outlookEmail?: string
  onSendAll:     (run: BulkRunSummary) => void
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '0.5px solid #e8e7e0' }}>
          <th style={th}>Started</th>
          <th style={th}>Type</th>
          <th style={th}>Period</th>
          <th style={th}>Count</th>
          <th style={th}>Succeeded</th>
          <th style={th}>Failed</th>
          <th style={th}>Status</th>
          <th style={th}></th>
        </tr>
      </thead>
      <tbody>
        {runs.map(run => (
          <>
            <tr key={run.id} style={{ borderBottom: '0.5px solid #f0efea' }}>
              <td style={td}>{formatRunDate(run.started_at)}</td>
              <td style={td}>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                  background: run.type === 'portfolio_statement_send' ? '#e1f5ee' : '#f0f0ea',
                  color:      run.type === 'portfolio_statement_send' ? '#085041' : '#555',
                }}>
                  {run.type === 'portfolio_statement_send' ? 'Send' : 'Generate'}
                </span>
              </td>
              <td style={td}>{run.period_date ? formatPeriodDateUK(run.period_date) : '—'}</td>
              <td style={td}>{run.total_items}</td>
              <td style={{ ...td, color: '#1d9e75' }}>{run.succeeded_count}</td>
              <td style={{ ...td, color: run.failed_count > 0 ? '#c0392b' : '#999' }}>
                {run.failed_count}
              </td>
              <td style={td}><StatusBadge status={run.status} /></td>
              <td style={{ ...td, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={linkBtn} onClick={() => onExpand(run.id)}>
                  {expandedRunId === run.id ? 'Hide details' : 'View details'}
                </button>
                {run.failed_count > 0 && run.status === 'completed' && (
                  <button style={{ ...linkBtn, color: '#c0392b' }} onClick={() => onRetry(run.id)}>
                    Retry failed
                  </button>
                )}
                {run.type === 'portfolio_statement' && run.status === 'completed' && run.succeeded_count > 0 && outlookEmail && (
                  <button style={{ ...linkBtn, color: '#1d9e75' }} onClick={() => onSendAll(run)}>
                    Send all via Outlook
                  </button>
                )}
              </td>
            </tr>
            {expandedRunId === run.id && (
              <tr key={`${run.id}-expanded`}>
                <td colSpan={8} style={{ padding: '8px 16px', background: '#fafaf8' }}>
                  <PastRunDetails runId={run.id} />
                </td>
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
  )
}

// ── SavePresetModal ───────────────────────────────────────────────────────────

function SavePresetModal({
  selectedCount,
  onClose,
  onSave,
}: {
  selectedCount: number
  onClose:       () => void
  onSave:        (name: string) => Promise<void>
}) {
  const [name, setName]     = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0)
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSave() {
    if (!name.trim()) { setError('Preset name is required.'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ padding: '24px 28px', width: 400 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f2744', marginBottom: 16 }}>
          Save selection as preset
        </h2>
        <label style={labelStyle}>Preset name</label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          style={{ ...inputStyle, width: '100%', marginBottom: 4 }}
        />
        {error && <p style={{ fontSize: 12, color: '#c0392b', marginBottom: 8 }}>{error}</p>}
        <p style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
          {selectedCount} investor{selectedCount !== 1 ? 's' : ''} selected. Shared with the team.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={smallBtn} onClick={onClose}>Cancel</button>
          <button style={primaryBtn} disabled={saving} onClick={handleSave}>
            {saving ? 'Saving...' : 'Save preset'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ── ManagePresetsModal ────────────────────────────────────────────────────────

function ManagePresetsModal({
  presets,
  loadedPresetId,
  onClose,
  onRename,
  onDelete,
}: {
  presets:        BulkRunPreset[]
  loadedPresetId: string | null
  onClose:        () => void
  onRename:       (id: string, name: string) => Promise<void>
  onDelete:       (id: string) => Promise<void>
}) {
  const [renamingId, setRenamingId]     = useState<string | null>(null)
  const [renameValue, setRenameValue]   = useState('')
  const [renameError, setRenameError]   = useState<string | null>(null)
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function doRename(id: string) {
    if (!renameValue.trim()) { setRenameError('Name is required.'); return }
    try {
      await onRename(id, renameValue.trim())
      setRenamingId(null)
      setRenameError(null)
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : String(err))
    }
  }

  async function doDelete(id: string) {
    setDeletingId(id)
    try {
      await onDelete(id)
      setConfirmDeleteId(null)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ padding: '24px 28px', width: 560, maxHeight: '80vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f2744', marginBottom: 16 }}>
          Manage presets
        </h2>

        {presets.length === 0 && (
          <p style={{ color: '#999', fontSize: 13 }}>No presets saved yet.</p>
        )}

        {presets.map(p => (
          <div key={p.id} style={{
            borderBottom: '0.5px solid #f0efea', paddingBottom: 12, marginBottom: 12,
          }}>
            {renamingId === p.id ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doRename(p.id); if (e.key === 'Escape') setRenamingId(null) }}
                  style={{ ...inputStyle, flex: 1 }}
                  autoFocus
                />
                <button style={smallBtn} onClick={() => doRename(p.id)}>Save</button>
                <button style={smallBtn} onClick={() => { setRenamingId(null); setRenameError(null) }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#0f2744' }}>{p.name}</span>
                  {p.id === loadedPresetId && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#1d9e75' }}>loaded</span>
                  )}
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {p.client_ids.length} investors &middot; Created {new Date(p.created_at).toLocaleDateString('en-GB')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={linkBtn} onClick={() => { setRenamingId(p.id); setRenameValue(p.name) }}>Rename</button>
                  <button
                    style={{ ...linkBtn, color: '#c0392b' }}
                    onClick={() => setConfirmDeleteId(p.id)}
                  >Delete</button>
                </div>
              </div>
            )}
            {renamingId === p.id && renameError && (
              <p style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>{renameError}</p>
            )}
            {confirmDeleteId === p.id && (
              <div style={{ marginTop: 8, background: '#fff8f6', border: '0.5px solid #f5c6c6', borderRadius: 6, padding: '10px 14px' }}>
                <p style={{ fontSize: 13, color: '#333', marginBottom: 8 }}>
                  Delete preset &ldquo;{p.name}&rdquo;? This cannot be undone. Other team members will no longer be able to use this preset.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={{ ...smallBtn, color: '#c0392b', borderColor: '#c0392b' }}
                    disabled={deletingId === p.id}
                    onClick={() => doDelete(p.id)}
                  >
                    {deletingId === p.id ? 'Deleting...' : 'Delete'}
                  </button>
                  <button style={smallBtn} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button style={primaryBtn} onClick={onClose}>Done</button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ── ModalOverlay ──────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    pending:     ['○ Pending',     '#999'],
    in_progress: ['● Generating',  '#185fa5'],
    succeeded:   ['✓ Done',        '#1d9e75'],
    failed:      ['✗ Failed',      '#c0392b'],
    skipped:     ['— Skipped',     '#aaa'],
    completed:   ['Completed',     '#1d9e75'],
    cancelled:   ['Cancelled',     '#ba7517'],
    in_progress_run: ['In progress', '#185fa5'],
  }
  const [label, color] = map[status] ?? [status, '#666']
  return <span style={{ color, fontWeight: 500 }}>{label}</span>
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  border: '0.5px solid #d0cfc8', borderRadius: 6, padding: '6px 10px',
  fontSize: 13, color: '#0f2744', outline: 'none',
}

const smallBtn: React.CSSProperties = {
  border: '0.5px solid #d0cfc8', borderRadius: 6, padding: '5px 12px',
  fontSize: 12, color: '#0f2744', background: '#fff', cursor: 'pointer',
}

const linkBtn: React.CSSProperties = {
  border: 'none', background: 'transparent', padding: '4px 2px',
  fontSize: 12, color: '#185fa5', cursor: 'pointer', textDecoration: 'underline',
}

const primaryBtn: React.CSSProperties = {
  border: 'none', borderRadius: 6, padding: '8px 18px',
  fontSize: 13, fontWeight: 500, color: '#fff', background: '#0f2744', cursor: 'pointer',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 6,
}

const th: React.CSSProperties = {
  padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#555',
  textAlign: 'left', whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '8px 10px', fontSize: 13, color: '#333', verticalAlign: 'middle',
}

const fundPill: React.CSSProperties = {
  display: 'inline-block', fontSize: 11, padding: '1px 7px', borderRadius: 4,
  background: '#eeedfe', color: '#3c3489', marginRight: 4,
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    border: active ? '1.5px solid #0f2744' : '0.5px solid #d0cfc8',
    borderRadius: 20, padding: '4px 12px', fontSize: 12,
    background: active ? '#0f2744' : '#fff',
    color: active ? '#fff' : '#555',
    cursor: 'pointer', fontWeight: active ? 500 : 400,
  }
}
