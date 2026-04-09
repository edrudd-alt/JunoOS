'use client'

import { formatCurrency } from '@/lib/utils'
import type { DealInvestor, InvestorData } from './dealDetailTypes'

const thSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 500, color: '#888',
  textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e8e7e0',
}
const tdSt: React.CSSProperties = {
  padding: '8px 10px', fontSize: 12, borderBottom: '0.5px solid #f0f0ec', verticalAlign: 'middle',
}

interface Props {
  investors:            DealInvestor[]
  isBuyDeal:            boolean
  isSaleDeal:           boolean
  isNewDealFormat:      boolean
  investorData:         Record<string, InvestorData>
  perInvestor:          Record<string, Record<string, boolean>>
  perInvestorItems:     { key: string; label: string }[]
  onSetInvestorItem:    (clientId: string, itemKey: string, value: boolean) => void
  dealStatus:           string
  saving:               boolean
  saved:                boolean
  onSave:               () => void
  // Per-investor completion (buy deals)
  showEisItems:         boolean
  eisItems:             { key: string; label: string }[]
  completedInvestors:   Record<string, string>   // clientId → completion_date string
  onCompleteInvestor:   (clientId: string) => void
  completingInvestor:   string | null
  isInvestorDone:       (clientId: string) => boolean
}

export function CompletionChecklist({
  investors, isBuyDeal, isSaleDeal, isNewDealFormat, investorData,
  perInvestor, perInvestorItems, onSetInvestorItem, dealStatus, saving, saved, onSave,
  showEisItems, eisItems, completedInvestors, onCompleteInvestor, completingInvestor, isInvestorDone,
}: Props) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Completion checklist</div>
        <div style={{ fontSize: 11, color: '#888' }}>
          {perInvestorItems.map(i => i.label).join(' · ')}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9f9f7' }}>
              <th style={thSt}>Investor</th>
              {isBuyDeal && isNewDealFormat && <>
                <th style={thSt}>Shares</th>
                <th style={thSt}>Cost</th>
                <th style={thSt}>EIS</th>
              </>}
              {isSaleDeal && isNewDealFormat && <>
                <th style={thSt}>Shares sold</th>
                <th style={thSt}>Gross proceeds</th>
                <th style={thSt}>P&amp;L</th>
                <th style={thSt}>Net proceeds</th>
              </>}
              {perInvestorItems.map(item => (
                <th key={item.key} style={{ ...thSt, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {item.label}
                </th>
              ))}
              {showEisItems && eisItems.map(item => (
                <th key={item.key} style={{ ...thSt, textAlign: 'center', whiteSpace: 'nowrap', color: '#5a7a9a' }}>
                  {item.label}
                </th>
              ))}
              {isBuyDeal && (
                <th style={{ ...thSt, textAlign: 'center', whiteSpace: 'nowrap' }}>Complete</th>
              )}
            </tr>
          </thead>
          <tbody>
            {investors.map(di => {
              const clientId    = di.clients?.id ?? ''
              const iData       = clientId ? investorData[clientId] : null
              const rowChecks   = perInvestor[clientId] ?? {}
              const isEis       = ['yes', 'tbc'].includes(iData?.eis ?? '')
              const isCompleted = !!completedInvestors[clientId]
              const isDone      = isBuyDeal ? isInvestorDone(clientId) : perInvestorItems.every(i => rowChecks[i.key])
              const isDisabled  = dealStatus === 'complete' || isCompleted

              return (
                <tr key={di.id} style={{ background: isCompleted ? '#f0faf6' : undefined }}>
                  <td style={tdSt}>
                    <div style={{ fontWeight: 500 }}>{di.clients?.full_name ?? '—'}</div>
                    {di.clients?.email && <div style={{ fontSize: 10, color: '#aaa' }}>{di.clients.email}</div>}
                    {isCompleted && (
                      <div style={{ fontSize: 10, color: '#1d9e75', marginTop: 2 }}>
                        Completed {completedInvestors[clientId]}
                      </div>
                    )}
                  </td>

                  {/* Buy deal investor data */}
                  {isBuyDeal && isNewDealFormat && <>
                    <td style={tdSt}>{iData?.shares != null ? iData.shares.toLocaleString() : '—'}</td>
                    <td style={tdSt}>{iData?.cost != null ? formatCurrency(iData.cost) : '—'}</td>
                    <td style={tdSt}>
                      {iData?.eis ? (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                          background: iData.eis === 'yes' ? '#d1fae5' : iData.eis === 'no' ? '#fee2e2' : '#f5f5f2',
                          color: iData.eis === 'yes' ? '#065f46' : iData.eis === 'no' ? '#991b1b' : '#555',
                        }}>
                          {iData.eis.toUpperCase()}
                        </span>
                      ) : '—'}
                    </td>
                  </>}

                  {/* Sale deal investor data */}
                  {isSaleDeal && isNewDealFormat && <>
                    <td style={tdSt}>{iData?.sharesSold != null ? iData.sharesSold.toLocaleString() : '—'}</td>
                    <td style={tdSt}>{iData?.grossProceeds != null ? formatCurrency(iData.grossProceeds) : '—'}</td>
                    <td style={tdSt}>
                      {iData?.pnl != null ? (
                        <span style={{ color: iData.pnl >= 0 ? '#1d9e75' : '#a32d2d', fontWeight: 500 }}>
                          {iData.pnl >= 0 ? '+' : ''}{formatCurrency(iData.pnl)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ ...tdSt, fontWeight: 500 }}>
                      {iData?.netProceeds != null ? formatCurrency(iData.netProceeds) : '—'}
                    </td>
                  </>}

                  {/* Per-investor checklist checkboxes */}
                  {perInvestorItems.map(item => (
                    <td key={item.key} style={{ ...tdSt, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={rowChecks[item.key] ?? false}
                        onChange={e => onSetInvestorItem(clientId, item.key, e.target.checked)}
                        disabled={isDisabled}
                        style={{ accentColor: '#1d9e75', width: 15, height: 15, cursor: isDisabled ? 'default' : 'pointer' }}
                      />
                    </td>
                  ))}

                  {/* EIS checklist checkboxes — only for EIS-qualifying investors */}
                  {showEisItems && eisItems.map(item => (
                    <td key={item.key} style={{ ...tdSt, textAlign: 'center' }}>
                      {isEis ? (
                        <input
                          type="checkbox"
                          checked={rowChecks[item.key] ?? false}
                          onChange={e => onSetInvestorItem(clientId, item.key, e.target.checked)}
                          disabled={isDisabled}
                          style={{ accentColor: '#1d9e75', width: 15, height: 15, cursor: isDisabled ? 'default' : 'pointer' }}
                        />
                      ) : (
                        <span style={{ color: '#ddd', fontSize: 11 }}>—</span>
                      )}
                    </td>
                  ))}

                  {/* Per-investor Complete button (buy deals only) */}
                  {isBuyDeal && (
                    <td style={{ ...tdSt, textAlign: 'center' }}>
                      {isCompleted ? (
                        <span style={{ fontSize: 11, color: '#1d9e75', fontWeight: 600 }}>✓</span>
                      ) : (
                        <button
                          onClick={() => onCompleteInvestor(clientId)}
                          disabled={!isDone || completingInvestor === clientId || dealStatus === 'complete'}
                          title={!isDone ? 'Complete all checklist items first' : undefined}
                          style={{
                            fontSize: 11, padding: '3px 10px', borderRadius: 4,
                            background: isDone ? '#0f2744' : '#f5f5f2',
                            color: isDone ? '#fff' : '#bbb',
                            border: `0.5px solid ${isDone ? '#0f2744' : '#e0e0d8'}`,
                            cursor: isDone ? 'pointer' : 'not-allowed',
                            fontFamily: 'inherit', fontWeight: 500,
                          }}
                        >
                          {completingInvestor === clientId ? '…' : 'Complete'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {dealStatus !== 'complete' && (
        <div style={{ padding: '10px 16px', borderTop: '0.5px solid #e8e7e0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn"
            onClick={onSave}
            disabled={saving}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
