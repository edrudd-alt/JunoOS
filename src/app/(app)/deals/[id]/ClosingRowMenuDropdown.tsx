'use client'

import { useEffect, useRef } from 'react'

export type ClosingMenuAction =
  | { type: 'view_investor' }
  | { type: 'edit_deal_investor' }
  | { type: 'mark_paid' }
  | { type: 'move_to_complete' }
  | { type: 'move_back_to_app_form_sent' }
  | { type: 'move_back_to_signed' }
  | { type: 'move_back_to_paid' }

// lifecycle_status of the row (not computed display status)
type ClosingStatus = 'signed' | 'paid' | 'complete'

interface Props {
  status:   ClosingStatus
  x:        number
  y:        number
  onAction: (action: ClosingMenuAction) => void
  onClose:  () => void
}

interface MenuItem {
  label:         string
  action:        ClosingMenuAction
  danger?:       boolean
  disabled?:     boolean
  disabledTip?:  string
  dividerBefore?: boolean
}

export default function ClosingRowMenuDropdown({ status, x, y, onAction, onClose }: Props) {
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

  if (status === 'signed') {
    items.push(
      { label: 'Edit deal details for this investor', action: { type: 'edit_deal_investor' } },
      { label: 'Mark payment as received', action: { type: 'mark_paid' }, dividerBefore: true },
      { label: 'Move back to App form sent', action: { type: 'move_back_to_app_form_sent' } },
      {
        label: 'Remove from deal',
        action: { type: 'view_investor' },
        danger: true,
        disabled: true,
        disabledTip: 'Cannot remove signed investors',
        dividerBefore: true,
      },
    )
  } else if (status === 'paid') {
    items.push(
      { label: 'Edit deal details for this investor', action: { type: 'edit_deal_investor' } },
      { label: 'Move to complete', action: { type: 'move_to_complete' }, dividerBefore: true },
      { label: 'Move back to Signed', action: { type: 'move_back_to_signed' } },
      {
        label: 'Remove from deal',
        action: { type: 'view_investor' },
        danger: true,
        disabled: true,
        disabledTip: 'Cannot remove past-stage investors',
        dividerBefore: true,
      },
    )
  } else {
    // complete
    items.push(
      { label: 'Move back to Paid', action: { type: 'move_back_to_paid' }, dividerBefore: true },
      {
        label: 'Remove from deal',
        action: { type: 'view_investor' },
        danger: true,
        disabled: true,
        disabledTip: 'Cannot remove past-stage investors',
        dividerBefore: true,
      },
    )
  }

  const menuWidth = 260
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
              padding: '7px 14px', fontSize: 12,
              background: 'none', border: 'none',
              color: item.disabled ? '#bbb' : item.danger ? '#a32d2d' : '#0f2744',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => { if (!item.disabled) (e.target as HTMLElement).style.background = '#f5f5f0' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'none' }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
