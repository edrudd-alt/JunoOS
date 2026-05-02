'use client'

import { useEffect, useRef } from 'react'
import type { DisplayedStatus } from './dealUtils'

// Actions emitted by the menu — parent handles the logic
export type MenuAction =
  | { type: 'view_investor' }
  | { type: 'edit_deal_investor' }
  | { type: 'mark_confirmed' }
  | { type: 'send_app_form' }
  | { type: 'reissue_app_form' }
  | { type: 'mark_signed' }
  | { type: 'move_back_to_soft_circled' }
  | { type: 'move_back_to_confirmed' }
  | { type: 'move_back_to_app_form_sent' }
  | { type: 'move_back_to_signed' }
  | { type: 'move_back_to_paid' }
  | { type: 'decline' }
  | { type: 'undecline' }
  | { type: 'remove_from_deal' }
  | { type: 'go_to_closing' }

interface Props {
  status: DisplayedStatus
  clientId: string
  hasConfirmedAmount: boolean
  isPast: boolean
  x: number
  y: number
  onAction: (action: MenuAction) => void
  onClose: () => void
}

interface MenuItem {
  label: string
  action: MenuAction
  danger?: boolean
  disabled?: boolean
  disabledTip?: string
  dividerBefore?: boolean
}

export default function RowMenuDropdown({
  status, clientId, hasConfirmedAmount, isPast,
  x, y, onAction, onClose,
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

  // View investor record — always present
  items.push({ label: 'View investor record', action: { type: 'view_investor' } })

  if (isPast) {
    items.push({ label: 'Go to Closing tab', action: { type: 'go_to_closing' }, dividerBefore: true })

    const moveBackLabel =
      status === 'signed'    ? 'Move back to App form sent' :
      status === 'paid'      ? 'Move back to Signed' :
      status === 'complete'  ? 'Move back to Paid' : null

    const moveBackAction: MenuAction | null =
      status === 'signed'   ? { type: 'move_back_to_app_form_sent' } :
      status === 'paid'     ? { type: 'move_back_to_signed' } :
      status === 'complete' ? { type: 'move_back_to_paid' } : null

    if (moveBackLabel && moveBackAction) {
      items.push({ label: moveBackLabel, action: moveBackAction, dividerBefore: true })
    }

    items.push({
      label: 'Remove from deal',
      action: { type: 'remove_from_deal' },
      disabled: true,
      disabledTip: 'Cannot remove past-stage investors',
      danger: true,
      dividerBefore: true,
    })
  } else if (status === 'declined') {
    items.push(
      { label: 'Move back to soft-circled', action: { type: 'undecline' }, dividerBefore: true },
      { label: 'Remove from deal', action: { type: 'remove_from_deal' }, danger: true, dividerBefore: true },
    )
  } else {
    items.push({ label: 'Edit deal details for this investor', action: { type: 'edit_deal_investor' } })

    if (status === 'soft_circled') {
      items.push(
        { label: 'Mark as confirmed', action: { type: 'mark_confirmed' }, dividerBefore: true },
        { label: 'Move to declined', action: { type: 'decline' } },
        {
          label: 'Remove from deal',
          action: { type: 'remove_from_deal' },
          danger: true,
          dividerBefore: true,
        },
      )
    }

    if (status === 'confirmed' || status === 'chase') {
      items.push(
        { label: 'Send application form', action: { type: 'send_app_form' }, dividerBefore: true },
        { label: 'Mark application form as signed (manual upload)', action: { type: 'mark_signed' } },
        { label: 'Move back to soft-circled', action: { type: 'move_back_to_soft_circled' } },
        { label: 'Move to declined', action: { type: 'decline' }, dividerBefore: true },
        {
          label: 'Remove from deal',
          action: { type: 'remove_from_deal' },
          danger: true,
          disabled: hasConfirmedAmount,
          disabledTip: 'Cannot remove — investor has a confirmed amount. Move backwards first.',
        },
      )
    }

    if (status === 'app_form_sent') {
      items.push(
        { label: 'Mark application form as signed (manual upload)', action: { type: 'mark_signed' }, dividerBefore: true },
        { label: 'Re-issue application form', action: { type: 'reissue_app_form' } },
        { label: 'Move back to confirmed (un-send)', action: { type: 'move_back_to_confirmed' } },
        { label: 'Move to declined', action: { type: 'decline' }, dividerBefore: true },
      )
    }
  }

  // Position — clamp to viewport
  const menuWidth  = 260
  const estHeight  = items.length * 32 + 16
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
