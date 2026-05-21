'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generatePortfolioStatementAction } from '../portfolioStatementActions'
import { getDownloadUrlForDocument } from '../documentActions'
import { formatDocumentTimestamp } from '@/lib/utils'
import StatementDecisionModal, { type DecisionModalStatement } from './StatementDecisionModal'
import EmailComposerModal, { type ComposerStatement } from './EmailComposerModal'

export interface StatementDoc {
  id:            string
  filename:      string
  storage_url:   string
  period:        string | null
  document_date: string | null
  created_at:    string | null
  version:       number
}

interface Props {
  clientId:        string
  clientFullName:  string
  clientEmail:     string | null
  statements:      StatementDoc[]
}

// Returns end-of-last-completed-quarter in YYYY-MM-DD format.
function defaultPeriodDate(): string {
  const now   = new Date()
  const month = now.getMonth()  // 0-11
  const year  = now.getFullYear()
  let endMonth: number
  let endYear = year
  if (month < 3)      { endMonth = 11; endYear = year - 1 }   // last Q: Oct-Dec prev year
  else if (month < 6) { endMonth = 2  }                        // last Q: Jan-Mar
  else if (month < 9) { endMonth = 5  }                        // last Q: Apr-Jun
  else                { endMonth = 8  }                         // last Q: Jul-Sep
  const lastDay = new Date(endYear, endMonth + 1, 0).getDate()
  return `${endYear}-${String(endMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function GenerateStatementSection({ clientId, clientFullName, clientEmail, statements }: Props) {
  const router = useRouter()
  const [period, setPeriod] = useState(defaultPeriodDate)
  const [error,  setError]  = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [decisionStatement, setDecisionStatement] = useState<DecisionModalStatement | null>(null)
  const [composerStatement, setComposerStatement] = useState<ComposerStatement | null>(null)

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await generatePortfolioStatementAction(clientId, period)
        router.refresh()
        setDecisionStatement({
          documentId:    result.documentId,
          filename:      result.filename,
          periodDate:    period,
          generatedAtIso: result.createdAt,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Generation failed. Please try again.')
      }
    })
  }

  async function handleView(documentId: string) {
    const url = await getDownloadUrlForDocument(documentId)
    if (url) window.open(url, '_blank')
  }

  const actionBtnSt: React.CSSProperties = {
    fontSize: 11, color: '#185fa5', background: 'none',
    border: 'none', cursor: 'pointer', padding: '2px 4px',
    fontFamily: 'inherit',
  }

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px', color: '#0f2744' }}>
        Portfolio statement
      </h3>

      {/* Period picker + generate */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>
            Period date
          </label>
          <input
            type="date"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            disabled={isPending}
            style={{
              fontSize: 12, padding: '5px 8px',
              border: '0.5px solid #e8e7e0', borderRadius: 4,
              background: '#fff', color: '#0f2744',
            }}
          />
        </div>
        <div style={{ paddingTop: 18 }}>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={handleGenerate}
            disabled={!period || isPending}
          >
            {isPending ? 'Generating…' : 'Generate statement'}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#c0392b', margin: '0 0 10px' }}>{error}</p>
      )}

      {/* Existing statements list */}
      {statements.length > 0 ? (
        <div style={{ borderTop: '0.5px solid #f0f0ea', paddingTop: 10 }}>
          <p style={{ fontSize: 11, color: '#888', margin: '0 0 6px' }}>Generated statements</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {statements.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#0f2744' }}>
                  {s.period ? fmtDate(s.period) : s.filename}
                  <span style={{ color: '#888', marginLeft: 6 }}>
                    (generated {formatDocumentTimestamp(s.created_at)})
                  </span>
                </span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => setComposerStatement({
                      documentId: s.id,
                      filename:   s.filename,
                      periodDate: s.period ?? s.document_date ?? '',
                    })}
                    style={{ ...actionBtnSt, color: '#555' }}
                  >
                    Email
                  </button>
                  <button
                    onClick={() => handleView(s.id)}
                    style={actionBtnSt}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>No statements generated yet.</p>
      )}

      {/* Decision modal — opens after fresh generation */}
      {decisionStatement && (
        <StatementDecisionModal
          open={true}
          statement={decisionStatement}
          onClose={() => setDecisionStatement(null)}
          onEmail={() => {
            setComposerStatement({
              documentId: decisionStatement.documentId,
              filename:   decisionStatement.filename,
              periodDate: decisionStatement.periodDate,
            })
            setDecisionStatement(null)
          }}
        />
      )}

      {/* Email composer modal */}
      {composerStatement && (
        <EmailComposerModal
          open={true}
          statement={composerStatement}
          client={{ fullName: clientFullName, email: clientEmail }}
          onClose={() => setComposerStatement(null)}
        />
      )}
    </div>
  )
}
