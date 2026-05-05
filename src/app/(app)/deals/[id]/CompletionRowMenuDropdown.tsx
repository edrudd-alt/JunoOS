'use client'

import { useEffect, useRef } from 'react'
import type { ChecklistItemKey, ChecklistState } from './completionActions'
import { isItemDisabled, CHECKLIST_LABELS } from './completionActions'

export type CompletionMenuAction =
  | { type: 'view_investor' }
  | { type: 'edit_deal_investor' }
  | { type: 'toggle_checklist'; item: ChecklistItemKey; newValue: boolean }
  | { type: 'disable_item'; item: ChecklistItemKey }
  | { type: 'enable_item'; item: ChecklistItemKey }
  | { type: 'move_back_to_signed' }
  | { type: 'mark_complete' }
  | { type: 'move_back_to_paid' }

type CompletionStatus = 'paid' | 'complete'

interface Props {
  status:         CompletionStatus
  checklistState: ChecklistState
  eisQualifying:  boolean
  canMarkComplete: boolean
  x:              number
  y:              number
  onAction:       (action: CompletionMenuAction) => void
  onClose:        () => void
}

interface MenuItem {
  label:         string
  action:        CompletionMenuAction
  danger?:       boolean
  disabled?:     boolean
  disabledTip?:  string
  dividerBefore?: boolean
  dimmed?:       boolean
}

const MANUALLY_DISABLEABLE: ChecklistItemKey[] = [
  'share_cert_filed', 'transaction_statement_sent', 'documents_archived',
]

export default function CompletionRowMenuDropdown({
  status, checklistState, eisQualifying, canMarkComplete, x, y, onAction, onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 50)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const items: MenuItem[] = []

  items.push({ label: 'View investor record', action: { type: 'view_investor' } })

  if (status === 'paid') {
    items.push({ label: 'Edit deal details for this investor', action: { type: 'edit_deal_investor' } })

    // Checklist toggles
    const checklistKeys: ChecklistItemKey[] = [
      'share_cert_filed', 'eis3_issued', 'transaction_statement_sent', 'documents_archived',
    ]
    items.push({ label: '── Checklist ──', action: { type: 'view_investor' }, disabled: true, dividerBefore: true, dimmed: true })
    for (const key of checklistKeys) {
      const disabled = isItemDisabled(checklistState, key, eisQualifying)
      if (disabled) continue
      const checked = !!checklistState[key]
      items.push({
        label: `${checked ? '✓' : '○'} ${CHECKLIST_LABELS[key]}`,
        action: { type: 'toggle_checklist', item: key, newValue: !checked },
      })
    }

    // Disable / enable manually-disableable items
    items.push({ label: '── Disable/enable items ──', action: { type: 'view_investor' }, disabled: true, dividerBefore: true, dimmed: true })
    for (const key of MANUALLY_DISABLEABLE) {
      const manuallyDisabled = (checklistState._disabled ?? []).includes(key)
      items.push({
        label: manuallyDisabled
          ? `Enable: ${CHECKLIST_LABELS[key]}`
          : `Disable: ${CHECKLIST_LABELS[key]}`,
        action: manuallyDisabled
          ? { type: 'enable_item', item: key }
          : { type: 'disable_item', item: key },
      })
    }

    items.push(
      {
        label: 'Move back to Signed',
        action: { type: 'move_back_to_signed' },
        dividerBefore: true,
      },
      {
        label: 'Mark complete',
        action: { type: 'mark_complete' },
        disabled: !canMarkComplete,
        disabledTip: 'Tick all required checklist items first',
      },
    )
  } else {
    // complete (past)
    items.push({
      label: 'Move back to Paid',
      action: { type: 'move_back_to_paid' },
      dividerBefore: true,
    })
  }

  const menuWidth = 280
  const estHeight = items.length * 32 + 16
  const left = Math.min(x, window.innerWidth  - menuWidth  - 8)
  const top  = Math.min(y, window.innerHeight - estHeight - 8)

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed', top, left, zIndex: 600,
        background: '#fff', border: '0.5px solid var(--card-border)',
        borderRadius: 8, padding: '4px 0',
        width: menuWidth, boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
      }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.dividerBefore && (
            <div style={{ height: 1, background: '#f0f0ec', margin: '4px 0' }} />
          )}
          <button
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              onClose()
              onAction(item.action)
            }}
            title={item.disabled ? item.disabledTip : undefined}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 14px', fontSize: item.dimmed ? 10 : 12,
              background: 'none', border: 'none',
              color: item.disabled && !item.dimmed ? '#bbb'
                   : item.danger ? '#a32d2d'
                   : item.dimmed ? '#aaa'
                   : '#0f2744',
              cursor: item.disabled ? 'default' : 'pointer',
              fontWeight: item.dimmed ? 500 : 400,
              letterSpacing: item.dimmed ? '0.04em' : undefined,
              textTransform: item.dimmed ? 'uppercase' as const : undefined,
            }}
            onMouseEnter={e => { if (!item.disabled && !item.dimmed) (e.target as HTMLElement).style.background = '#f5f5f0' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'none' }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
