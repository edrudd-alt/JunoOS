'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type DataType = 'companies' | 'clients' | 'investments' | 'valuations' | 'kpis' | 'documents'
type Step = 1 | 2 | 3 | 4 | 5

interface FieldDef {
  key: string
  label: string
  required: boolean
  hint?: string
  transform?: string
}

interface ParsedFile {
  headers: string[]
  rows: Record<string, string>[]
  fileName: string
}

interface ColumnMapping {
  sourceCol: string
  targetField: string | null  // null = ignore
}

interface ValidationResult {
  rowIndex: number
  row: Record<string, string>
  issues: { field: string; message: string; severity: 'error' | 'warning' }[]
  status: 'ready' | 'warning' | 'error'
  duplicate?: boolean
}

interface ImportResult {
  imported: number
  warnings: number
  skipped: number
  errors: string[]
}

// ─── Field definitions per data type ─────────────────────────────────────────

const FIELD_DEFS: Record<DataType, FieldDef[]> = {
  companies: [
    { key: 'name',         label: 'Company name',    required: true },
    { key: 'sector',       label: 'Sector',           required: false },
    { key: 'stage',        label: 'Stage',            required: false, hint: 'e.g. Series A, Seed' },
    { key: 'website',      label: 'Website',          required: false },
    { key: 'country',      label: 'Country',          required: false },
    { key: 'founded_year', label: 'Founded year',     required: false },
    { key: 'description',  label: 'Description',      required: false },
  ],
  clients: [
    { key: 'full_name',        label: 'Full name',        required: true },
    { key: 'email',            label: 'Email address',    required: false },
    { key: 'phone',            label: 'Phone',            required: false },
    { key: 'address',          label: 'Address',          required: false },
    { key: 'nationality',      label: 'Nationality',      required: false },
    { key: 'tax_reference',    label: 'Tax reference',    required: false },
    { key: 'default_fee_rate', label: 'Default fee rate', required: false, hint: 'Number e.g. 5', transform: 'Strip % symbol' },
    { key: 'poa_held',         label: 'POA held',         required: false, hint: 'Y/N or Yes/No', transform: 'Y/N → boolean' },
    { key: 'notes',            label: 'Notes',            required: false },
  ],
  investments: [
    { key: 'client_name',      label: 'Client name',       required: true, hint: 'Must match existing client' },
    { key: 'company_name',     label: 'Company name',      required: true, hint: 'Must match existing company' },
    { key: 'shares_purchased', label: 'Shares purchased',  required: true },
    { key: 'sum_subscribed',   label: 'Amount invested',   required: true, transform: 'Strip £ and commas' },
    { key: 'investment_date',  label: 'Investment date',   required: true, transform: 'Normalise date format' },
    { key: 'share_class',      label: 'Share class',       required: false },
    { key: 'eis_status',       label: 'EIS status',        required: false, hint: 'EIS, SEIS, or blank' },
    { key: 'nominee_held',     label: 'Nominee held',      required: false, hint: 'Y/N', transform: 'Y/N → boolean' },
  ],
  valuations: [
    { key: 'company_name',    label: 'Company name',   required: true, hint: 'Must match existing company' },
    { key: 'share_price',     label: 'Share price',    required: true, transform: 'Strip £ and commas' },
    { key: 'valuation_date',  label: 'Valuation date', required: true, transform: 'Normalise date format' },
    { key: 'valuation_type',  label: 'Valuation type', required: false, hint: 'e.g. 409A, Board approved' },
    { key: 'notes',           label: 'Notes',          required: false },
  ],
  kpis: [
    { key: 'company_name',  label: 'Company name',  required: true },
    { key: 'kpi_name',      label: 'KPI name',      required: true, hint: 'e.g. ARR, Headcount, MRR' },
    { key: 'period_label',  label: 'Period',        required: true, hint: 'e.g. Q1 2024, Jan 2024' },
    { key: 'value',         label: 'Value',         required: true },
    { key: 'unit',          label: 'Unit',          required: false, hint: 'e.g. £, %, number' },
  ],
  documents: [
    { key: 'company_name',  label: 'Company name',  required: false },
    { key: 'client_name',   label: 'Client name',   required: false },
    { key: 'document_name', label: 'Document name', required: true },
    { key: 'document_type', label: 'Document type', required: false },
    { key: 'file_path',     label: 'File path / URL', required: false },
    { key: 'date',          label: 'Date',          required: false, transform: 'Normalise date format' },
  ],
}

const DATA_TYPE_CONFIG: Record<DataType, { label: string; icon: string; description: string; order: number }> = {
  companies:   { label: 'Companies',   icon: '🏢', description: 'Portfolio companies with sector, stage, website', order: 1 },
  clients:     { label: 'Clients',     icon: '👤', description: 'Investors with contact details and fee rates',    order: 2 },
  investments: { label: 'Investments', icon: '💷', description: 'Investment transactions per client and company',  order: 3 },
  valuations:  { label: 'Valuations',  icon: '📈', description: 'Share price history per company and date',       order: 4 },
  kpis:        { label: 'KPI history', icon: '📊', description: 'Company KPI data over time (ARR, headcount…)',   order: 5 },
  documents:   { label: 'Documents',   icon: '📄', description: 'Match existing files to client/company records', order: 6 },
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff',
}

// ─── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? '').replace(/^"|"$/g, '').trim()]))
  }).filter(row => Object.values(row).some(v => v !== ''))
  return { headers, rows }
}

// ─── Auto-mapper ───────────────────────────────────────────────────────────────

function autoMap(headers: string[], fields: FieldDef[]): ColumnMapping[] {
  return headers.map(header => {
    const norm = header.toLowerCase().replace(/[^a-z0-9]/g, '')
    const match = fields.find(f => {
      const fNorm = f.key.toLowerCase().replace(/[^a-z0-9]/g, '')
      const lNorm = f.label.toLowerCase().replace(/[^a-z0-9]/g, '')
      const aliases: Record<string, string[]> = {
        full_name:      ['name', 'fullname', 'investorname', 'clientname'],
        sum_subscribed: ['amount', 'invested', 'investment', 'sumsubscribed', 'subscribed'],
        investment_date:['date', 'investmentdate', 'transactiondate'],
        share_price:    ['price', 'shareprice', 'pricepersh'],
        valuation_date: ['date', 'valuationdate'],
        company_name:   ['company', 'companyname'],
        client_name:    ['client', 'clientname', 'investor', 'investorname'],
        eis_status:     ['eis', 'eisstatus', 'eistype'],
        default_fee_rate:['feerate', 'fee', 'feepercentage'],
      }
      const fieldAliases = aliases[f.key] ?? []
      return norm === fNorm || norm === lNorm || fieldAliases.includes(norm)
    })
    return { sourceCol: header, targetField: match?.key ?? null }
  })
}

// ─── Transforms ───────────────────────────────────────────────────────────────

function transformValue(value: string, fieldKey: string): string {
  let v = value.trim()
  // Strip currency symbols and commas
  if (['sum_subscribed', 'share_price', 'default_fee_rate'].includes(fieldKey)) {
    v = v.replace(/[£$€,\s]/g, '').replace(/%$/, '')
  }
  // Y/N → true/false
  if (['poa_held', 'nominee_held'].includes(fieldKey)) {
    const lower = v.toLowerCase()
    if (['y', 'yes', 'true', '1'].includes(lower)) return 'true'
    if (['n', 'no', 'false', '0'].includes(lower)) return 'false'
  }
  // Normalise date
  if (['investment_date', 'valuation_date', 'date'].includes(fieldKey)) {
    const parsed = new Date(v)
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0]
    // Try dd/mm/yyyy
    const parts = v.split(/[\/\-\.]/)
    if (parts.length === 3) {
      const [a, b, c] = parts
      if (c.length === 4) return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
    }
  }
  // Capitalise names
  if (['full_name', 'company_name', 'client_name'].includes(fieldKey)) {
    return v.replace(/\b\w/g, l => l.toUpperCase())
  }
  return v
}

// ─── Validator ────────────────────────────────────────────────────────────────

function validateRows(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
  dataType: DataType
): ValidationResult[] {
  const fields = FIELD_DEFS[dataType]
  const seenKeys = new Set<string>()

  return rows.map((row, idx) => {
    // Build mapped row
    const mapped: Record<string, string> = {}
    for (const m of mappings) {
      if (m.targetField) {
        mapped[m.targetField] = transformValue(row[m.sourceCol] ?? '', m.targetField)
      }
    }

    const issues: ValidationResult['issues'] = []

    // Check required fields
    for (const f of fields.filter(f => f.required)) {
      if (!mapped[f.key]) {
        issues.push({ field: f.label, message: `${f.label} is required`, severity: 'error' })
      }
    }

    // Type-specific validation
    if (dataType === 'investments') {
      if (mapped.sum_subscribed && isNaN(Number(mapped.sum_subscribed))) {
        issues.push({ field: 'Amount invested', message: 'Must be a number', severity: 'error' })
      }
      if (mapped.shares_purchased && isNaN(Number(mapped.shares_purchased))) {
        issues.push({ field: 'Shares purchased', message: 'Must be a number', severity: 'error' })
      }
      if (mapped.investment_date && isNaN(new Date(mapped.investment_date).getTime())) {
        issues.push({ field: 'Investment date', message: 'Unrecognised date format', severity: 'warning' })
      }
    }
    if (dataType === 'valuations') {
      if (mapped.share_price && isNaN(Number(mapped.share_price))) {
        issues.push({ field: 'Share price', message: 'Must be a number', severity: 'error' })
      }
    }
    if (dataType === 'clients') {
      if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) {
        issues.push({ field: 'Email', message: 'Email format looks incorrect', severity: 'warning' })
      }
      if (mapped.default_fee_rate && (isNaN(Number(mapped.default_fee_rate)) || Number(mapped.default_fee_rate) > 100)) {
        issues.push({ field: 'Fee rate', message: 'Fee rate should be a number 0–100', severity: 'warning' })
      }
    }

    // Duplicate check
    const dedupeKey = dataType === 'companies' ? mapped.name
      : dataType === 'clients' ? mapped.full_name
      : dataType === 'valuations' ? `${mapped.company_name}:${mapped.valuation_date}`
      : null

    let duplicate = false
    if (dedupeKey) {
      const k = dedupeKey.toLowerCase()
      if (seenKeys.has(k)) {
        duplicate = true
        issues.push({ field: 'Row', message: 'Possible duplicate within this file', severity: 'warning' })
      } else {
        seenKeys.add(k)
      }
    }

    const hasError   = issues.some(i => i.severity === 'error')
    const hasWarning = issues.some(i => i.severity === 'warning')
    const status = hasError ? 'error' : hasWarning ? 'warning' : 'ready'

    return { rowIndex: idx + 2, row: mapped, issues, status, duplicate }
  })
}

// ─── Template generator ───────────────────────────────────────────────────────

function downloadTemplate(dataType: DataType) {
  const fields = FIELD_DEFS[dataType]
  const headers = fields.map(f => f.label)
  const example: Record<string, string> = {
    companies:   'Acme Corp,Fintech,Series A,https://acme.co,UK,2019,B2B payments platform',
    clients:     'Jane Smith,jane@example.com,+44 7700 900000,London UK,British,AB123456C,5,Y,High net worth investor',
    investments: 'Jane Smith,Acme Corp,10000,50000,01/03/2023,Ordinary,EIS,N',
    valuations:  'Acme Corp,5.50,31/12/2023,Board approved,Year-end valuation',
    kpis:        'Acme Corp,ARR,Q4 2023,1200000,£',
    documents:   ',Jane Smith,Investment Agreement 2023,investment_agreement,/path/to/file.pdf,01/03/2023',
  }
  const csv = [headers.join(','), example[dataType]].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `juno_${dataType}_template.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function downloadErrorReport(results: ValidationResult[], dataType: DataType) {
  const fields = FIELD_DEFS[dataType]
  const problemRows = results.filter(r => r.status !== 'ready')
  const headers = ['Row', ...fields.map(f => f.label), 'Issues']
  const rows = problemRows.map(r => [
    r.rowIndex,
    ...fields.map(f => r.row[f.key] ?? ''),
    r.issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`).join('; ')
  ])
  const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `juno_${dataType}_errors.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BulkUploadWizard() {
  const [step, setStep] = useState<Step>(1)
  const [dataType, setDataType] = useState<DataType | null>(null)
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null)
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importStage, setImportStage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // ── Step 1: Choose data type ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ maxWidth: 680 }}>
        <Breadcrumb step={1} />

        <p style={{ fontSize: 12, color: '#555', margin: '0 0 20px', lineHeight: 1.6 }}>
          Import data in the recommended order below — companies and clients first, then investments and valuations.
          Download the CSV template for each type, fill it in, then upload it here.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {(Object.entries(DATA_TYPE_CONFIG) as [DataType, typeof DATA_TYPE_CONFIG[DataType]][])
            .sort(([, a], [, b]) => a.order - b.order)
            .map(([key, cfg]) => (
              <div
                key={key}
                onClick={() => { setDataType(key); setStep(2) }}
                className="card"
                style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f0f0ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      <span style={{ color: '#aaa', fontSize: 11, marginRight: 6 }}>{cfg.order}.</span>
                      {cfg.label}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{cfg.description}</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); downloadTemplate(key) }}
                    style={{ fontSize: 11, color: '#185fa5', background: 'none', border: '0.5px solid #c8d8f0', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    ↓ Template
                  </button>
                  <div style={{ fontSize: 12, color: '#185fa5', fontWeight: 500, marginLeft: 8 }}>Upload →</div>
                </div>
              </div>
            ))}
        </div>

        <Link href="/settings" className="btn btn-secondary">← Back to settings</Link>
      </div>
    )
  }

  // ── Step 2: Upload & map ──────────────────────────────────────────────────
  if (step === 2 && dataType) {
    const fields = FIELD_DEFS[dataType]
    const cfg    = DATA_TYPE_CONFIG[dataType]

    function handleFile(file: File) {
      const reader = new FileReader()
      reader.onload = e => {
        const text = e.target?.result as string
        const parsed = parseCSV(text)
        setParsedFile({ ...parsed, fileName: file.name })
        const auto = autoMap(parsed.headers, fields)
        setMappings(auto)
      }
      reader.readAsText(file)
    }

    const unmappedRequired = fields
      .filter(f => f.required)
      .filter(f => !mappings.some(m => m.targetField === f.key))

    return (
      <div style={{ maxWidth: 800 }}>
        <Breadcrumb step={2} dataType={dataType} />

        {/* Upload zone */}
        {!parsedFile ? (
          <div
            className="card"
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = '#f0f7ff' }}
            onDragLeave={e => { e.currentTarget.style.background = '' }}
            onDrop={e => {
              e.preventDefault()
              e.currentTarget.style.background = ''
              const file = e.dataTransfer.files[0]
              if (file) handleFile(file)
            }}
            style={{ textAlign: 'center', padding: '40px 24px', cursor: 'pointer', marginBottom: 16 }}
            onClick={() => fileRef.current?.click()}
          >
            <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Drop your CSV here, or click to browse</div>
            <div style={{ fontSize: 11, color: '#888' }}>CSV files supported. One sheet, any column order.</div>
            <div style={{ marginTop: 12 }}>
              <button
                onClick={e => { e.stopPropagation(); downloadTemplate(dataType) }}
                style={{ fontSize: 11, color: '#185fa5', background: 'none', border: '0.5px solid #c8d8f0', borderRadius: 4, padding: '5px 12px', cursor: 'pointer' }}
              >
                ↓ Download template first
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
        ) : (
          <>
            {/* File loaded */}
            <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>📄</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{parsedFile.fileName}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {parsedFile.rows.length} rows · {parsedFile.headers.length} columns
                  </div>
                </div>
              </div>
              <button onClick={() => { setParsedFile(null); setMappings([]) }}
                style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>
                Replace file ×
              </button>
            </div>

            {/* Column mapping table */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Column mapping</div>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 14px' }}>
                Auto-matched columns are highlighted. Adjust any that are wrong, or set to "Ignore" to skip.
              </p>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Your column</th>
                    <th style={{ width: '28%' }}>Sample data</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>→</th>
                    <th style={{ width: '28%' }}>Maps to</th>
                    <th style={{ width: '8%' }}>Transform</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m, i) => {
                    const isAutoMatched = m.targetField !== null
                    const targetField   = fields.find(f => f.key === m.targetField)
                    const sampleVal     = parsedFile.rows[0]?.[m.sourceCol] ?? ''
                    return (
                      <tr key={m.sourceCol} style={{ background: isAutoMatched ? '#f5fff9' : undefined }}>
                        <td style={{ fontSize: 12, fontWeight: 500 }}>
                          {isAutoMatched && <span style={{ color: '#1d9e75', marginRight: 4 }}>✓</span>}
                          {m.sourceCol}
                        </td>
                        <td style={{ fontSize: 11, color: '#888', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sampleVal || <span style={{ color: '#ccc' }}>empty</span>}
                        </td>
                        <td style={{ textAlign: 'center', color: '#ccc' }}>→</td>
                        <td>
                          <select
                            value={m.targetField ?? ''}
                            onChange={e => setMappings(prev => prev.map((x, j) => j === i ? { ...x, targetField: e.target.value || null } : x))}
                            style={{ ...inputStyle, width: '100%', fontSize: 11, padding: '4px 6px',
                              border: m.targetField ? '0.5px solid #a8d8c0' : '0.5px solid #d0d0c8',
                              background: m.targetField ? '#f5fff9' : '#fff',
                            }}
                          >
                            <option value="">— Ignore —</option>
                            {fields.map(f => (
                              <option key={f.key} value={f.key}>
                                {f.label}{f.required ? ' *' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ fontSize: 10, color: '#aaa' }}>
                          {targetField?.transform && (
                            <span style={{ background: '#eeedfe', color: '#3c3489', padding: '1px 5px', borderRadius: 99, fontSize: 9, fontWeight: 500 }}>
                              Auto
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Required fields not yet mapped */}
              {unmappedRequired.length > 0 && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: '#fde8e8', borderRadius: 6, fontSize: 11, color: '#7a1a1a' }}>
                  Required fields not yet mapped: {unmappedRequired.map(f => f.label).join(', ')}
                </div>
              )}
            </div>

            {/* Sidebar summary */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div className="card" style={{ flex: 1, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rows detected</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{parsedFile.rows.length}</div>
              </div>
              <div className="card" style={{ flex: 1, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Columns mapped</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#1d9e75' }}>
                  {mappings.filter(m => m.targetField).length} / {mappings.length}
                </div>
              </div>
              <div className="card" style={{ flex: 1, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Auto-transforms</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#534ab7' }}>
                  {mappings.filter(m => m.targetField && FIELD_DEFS[dataType].find(f => f.key === m.targetField)?.transform).length}
                </div>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => { setStep(1); setParsedFile(null); setMappings([]) }}>← Back</button>
          {parsedFile && (
            <button
              className="btn btn-primary"
              disabled={unmappedRequired.length > 0}
              onClick={() => {
                setValidationResults(validateRows(parsedFile.rows, mappings, dataType))
                setStep(3)
              }}
            >
              Review & validate →
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Step 3: Review & fix ──────────────────────────────────────────────────
  if (step === 3 && dataType && parsedFile) {
    const ready    = validationResults.filter(r => r.status === 'ready')
    const warnings = validationResults.filter(r => r.status === 'warning')
    const errors   = validationResults.filter(r => r.status === 'error')
    const dupes    = validationResults.filter(r => r.duplicate)
    const problems = validationResults.filter(r => r.status !== 'ready')

    return (
      <div style={{ maxWidth: 900 }}>
        <Breadcrumb step={3} dataType={dataType} />

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: '12px 16px', borderLeft: '3px solid #1d9e75' }}>
            <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ready to import</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#0f6e56', marginTop: 4 }}>{ready.length}</div>
          </div>
          <div className="card" style={{ padding: '12px 16px', borderLeft: '3px solid #ba7517' }}>
            <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Warnings</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#ba7517', marginTop: 4 }}>{warnings.length}</div>
            <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>Will import with note</div>
          </div>
          <div className="card" style={{ padding: '12px 16px', borderLeft: '3px solid #a32d2d' }}>
            <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Errors</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#a32d2d', marginTop: 4 }}>{errors.length}</div>
            <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>Will be skipped</div>
          </div>
          <div className="card" style={{ padding: '12px 16px', borderLeft: '3px solid #534ab7' }}>
            <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Possible duplicates</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#534ab7', marginTop: 4 }}>{dupes.length}</div>
          </div>
        </div>

        {/* Behaviour note */}
        <div style={{ background: '#f0f7ff', border: '0.5px solid #c8d8f0', borderRadius: 6, padding: '10px 14px', fontSize: 11, color: '#185fa5', marginBottom: 16 }}>
          <strong>Import behaviour:</strong> Ready and warning rows will import. Error rows are skipped and can be fixed and re-uploaded. Download the error report below.
        </div>

        {/* Problem rows */}
        {problems.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Rows requiring attention ({problems.length})</span>
              <button
                onClick={() => downloadErrorReport(validationResults, dataType)}
                style={{ fontSize: 11, color: '#185fa5', background: 'none', border: '0.5px solid #c8d8f0', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
              >
                ↓ Download error report
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Row</th>
                  <th>Preview</th>
                  <th>Issues</th>
                  <th style={{ width: 80 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {problems.slice(0, 50).map(result => {
                  const fields = FIELD_DEFS[dataType]
                  const preview = fields.slice(0, 3).map(f => result.row[f.key]).filter(Boolean).join(' · ')
                  return (
                    <tr key={result.rowIndex}>
                      <td style={{ fontSize: 11, color: '#aaa' }}>#{result.rowIndex}</td>
                      <td style={{ fontSize: 11 }}>{preview || <span style={{ color: '#ccc' }}>empty row</span>}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {result.issues.map((issue, i) => (
                            <div key={i} style={{ fontSize: 10, color: issue.severity === 'error' ? '#a32d2d' : '#ba7517' }}>
                              <span style={{ fontWeight: 600 }}>{issue.field}:</span> {issue.message}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${result.status === 'error' ? 'pill-red' : 'pill-amber'}`} style={{ fontSize: 10 }}>
                          {result.status === 'error' ? 'Skip' : 'Import with note'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {problems.length > 50 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', fontSize: 11, color: '#aaa', padding: 12 }}>
                      + {problems.length - 50} more — download the error report to see all
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {ready.length === 0 && errors.length === validationResults.length && (
          <div style={{ background: '#fde8e8', border: '0.5px solid #f0b8b8', borderRadius: 6, padding: '10px 14px', fontSize: 11, color: '#7a1a1a', marginBottom: 16 }}>
            All rows have errors — nothing will import. Fix the issues and re-upload.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
          <button
            className="btn btn-primary"
            disabled={ready.length + warnings.length === 0}
            onClick={() => { setStep(4); runImport() }}
          >
            Import {ready.length + warnings.length} rows →
          </button>
        </div>
      </div>
    )
  }

  // ── Step 4: Import progress ───────────────────────────────────────────────
  if (step === 4) {
    return (
      <div style={{ maxWidth: 540 }}>
        <Breadcrumb step={4} dataType={dataType ?? undefined} />

        <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 16 }}>
            {importResult ? '✅' : '⏳'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            {importResult ? 'Import complete' : 'Importing data…'}
          </div>

          {!importResult && (
            <>
              <div style={{ marginBottom: 12, fontSize: 12, color: '#555' }}>{importStage}</div>
              {/* Progress bar */}
              <div style={{ height: 6, background: '#f0f0ec', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  height: '100%', borderRadius: 3, background: '#1d9e75',
                  width: `${importProgress}%`, transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: 11, color: '#aaa' }}>{importProgress}%</div>
              <p style={{ fontSize: 11, color: '#888', marginTop: 16 }}>
                Running in the background — you can leave this page.
              </p>
            </>
          )}

          {importResult && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <div style={{ padding: '10px', background: '#f0faf5', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase' }}>Imported</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#0f6e56' }}>{importResult.imported}</div>
                </div>
                <div style={{ padding: '10px', background: '#fffbf0', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase' }}>With warnings</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#ba7517' }}>{importResult.warnings}</div>
                </div>
                <div style={{ padding: '10px', background: '#fde8e8', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase' }}>Skipped</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#a32d2d' }}>{importResult.skipped}</div>
                </div>
              </div>
              <button onClick={() => setStep(5)} className="btn btn-primary" style={{ width: '100%' }}>
                View summary →
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Step 5: Done ──────────────────────────────────────────────────────────
  if (step === 5 && importResult && dataType) {
    const cfg = DATA_TYPE_CONFIG[dataType]
    const skipped = validationResults.filter(r => r.status === 'error').length

    const nextSuggestions: DataType[] = {
      companies: ['clients'],
      clients:   ['investments'],
      investments: ['valuations'],
      valuations: ['kpis'],
      kpis: ['documents'],
      documents: [],
    }[dataType] as DataType[]

    return (
      <div style={{ maxWidth: 560 }}>
        <Breadcrumb step={5} dataType={dataType} />

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ fontSize: 32 }}>✅</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{cfg.label} imported</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            <div style={{ textAlign: 'center', padding: '10px', background: '#f0faf5', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Imported</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#0f6e56' }}>{importResult.imported}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '10px', background: '#fffbf0', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Warnings</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#ba7517' }}>{importResult.warnings}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '10px', background: skipped > 0 ? '#fde8e8' : '#f0f0ec', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Skipped</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: skipped > 0 ? '#a32d2d' : '#aaa' }}>{skipped}</div>
            </div>
          </div>

          {skipped > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button
                onClick={() => downloadErrorReport(validationResults, dataType)}
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
              >
                ↓ Download error report ({skipped} rows to fix and re-upload)
              </button>
            </div>
          )}

          {nextSuggestions.length > 0 && (
            <div style={{ borderTop: '0.5px solid #e8e7e0', paddingTop: 16, marginBottom: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>What to import next</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {nextSuggestions.map(next => {
                  const nc = DATA_TYPE_CONFIG[next]
                  return (
                    <div
                      key={next}
                      onClick={() => { setDataType(next); setParsedFile(null); setMappings([]); setValidationResults([]); setImportResult(null); setStep(2) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f7f7f5', borderRadius: 6, cursor: 'pointer' }}
                    >
                      <span style={{ fontSize: 16 }}>{nc.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{nc.label}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{nc.description}</div>
                      </div>
                      <div style={{ marginLeft: 'auto', fontSize: 11, color: '#185fa5' }}>Import →</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/settings" className="btn btn-secondary">Back to settings</Link>
          <button
            className="btn btn-primary"
            onClick={() => { setParsedFile(null); setMappings([]); setValidationResults([]); setImportResult(null); setStep(1) }}
          >
            Import another data type
          </button>
        </div>
      </div>
    )
  }

  return null

  // ─── Import runner ─────────────────────────────────────────────────────────

  async function runImport() {
    if (!dataType || !parsedFile) return
    setImporting(true)
    setImportProgress(0)

    const toImport = validationResults.filter(r => r.status !== 'error')
    const skipped  = validationResults.filter(r => r.status === 'error').length
    let imported = 0
    let warningCount = 0
    const errors: string[] = []

    const batchSize = 20
    const batches = Math.ceil(toImport.length / batchSize)

    for (let b = 0; b < batches; b++) {
      const batch = toImport.slice(b * batchSize, (b + 1) * batchSize)
      setImportStage(`Importing ${DATA_TYPE_CONFIG[dataType].label.toLowerCase()}… (${Math.min((b + 1) * batchSize, toImport.length)} of ${toImport.length})`)
      setImportProgress(Math.round(((b + 1) / batches) * 90))

      for (const result of batch) {
        const row = result.row
        try {
          if (dataType === 'companies') {
            await supabase.from('companies').insert({
              name: row.name,
              sector: row.sector || null,
              stage: row.stage || null,
              website: row.website || null,
              country: row.country || null,
              founded_year: row.founded_year ? Number(row.founded_year) : null,
              description: row.description || null,
            })
          } else if (dataType === 'clients') {
            await supabase.from('clients').insert({
              full_name: row.full_name,
              email: row.email || null,
              phone: row.phone || null,
              address: row.address || null,
              nationality: row.nationality || null,
              tax_reference: row.tax_reference || null,
              default_fee_rate: row.default_fee_rate ? Number(row.default_fee_rate) : 5,
              poa_held: row.poa_held === 'true',
              notes: row.notes || null,
            })
          } else if (dataType === 'investments') {
            // Look up company and client IDs
            const { data: company } = await supabase.from('companies').select('id').ilike('name', row.company_name).maybeSingle()
            const { data: client }  = await supabase.from('clients').select('id').ilike('full_name', row.client_name).maybeSingle()
            if (company && client) {
              await supabase.from('investments').insert({
                client_id: client.id,
                company_id: company.id,
                shares_purchased: Number(row.shares_purchased),
                sum_subscribed: Number(row.sum_subscribed),
                investment_date: row.investment_date || null,
                share_class: row.share_class || null,
                eis_status: row.eis_status || null,
                nominee_held: row.nominee_held === 'true',
                status: 'active',
              })
            } else {
              errors.push(`Row ${result.rowIndex}: ${!company ? `Company "${row.company_name}" not found` : `Client "${row.client_name}" not found`}`)
            }
          } else if (dataType === 'valuations') {
            const { data: company } = await supabase.from('companies').select('id').ilike('name', row.company_name).maybeSingle()
            if (company) {
              await supabase.from('valuations').insert({
                company_id: company.id,
                share_price: Number(row.share_price),
                valuation_date: row.valuation_date,
                valuation_type: row.valuation_type || null,
                notes: row.notes || null,
              })
            } else {
              errors.push(`Row ${result.rowIndex}: Company "${row.company_name}" not found`)
            }
          } else if (dataType === 'kpis') {
            const { data: company } = await supabase.from('companies').select('id').ilike('name', row.company_name).maybeSingle()
            if (company) {
              await supabase.from('kpi_data').insert({
                company_id: company.id,
                kpi_name: row.kpi_name,
                period_label: row.period_label,
                value: Number(row.value),
                unit: row.unit || null,
              })
            }
          }
          if (result.status === 'warning') warningCount++
          else imported++
        } catch {
          errors.push(`Row ${result.rowIndex}: Unexpected error`)
        }
      }

      // Small delay to allow UI update
      await new Promise(r => setTimeout(r, 50))
    }

    setImportProgress(100)
    setImportStage('Done')
    setImportResult({ imported, warnings: warningCount, skipped, errors })
    setImporting(false)
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Breadcrumb({ step, dataType }: { step: number; dataType?: DataType }) {
  const steps = ['Choose type', 'Upload & map', 'Review & fix', 'Import', 'Done']
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 12 }}>
        <Link href="/settings" style={{ color: '#aaa', textDecoration: 'none' }}>Settings</Link>
        {' / '}
        <span style={{ color: '#555' }}>Bulk upload</span>
        {dataType && (
          <>
            {' / '}
            <span style={{ color: '#555' }}>{DATA_TYPE_CONFIG[dataType].label}</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
        {steps.map((s, i) => {
          const n    = i + 1
          const active = n === step
          const done   = n < step
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', fontSize: 9, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? '#1d9e75' : active ? '#0f2744' : '#e8e7e0',
                  color: done || active ? '#fff' : '#aaa',
                }}>
                  {done ? '✓' : n}
                </div>
                <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? '#0f2744' : done ? '#1d9e75' : '#aaa' }}>
                  {s}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: 20, height: 1, background: '#ddd', margin: '0 6px' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
