'use client'

import { labelStyle, STEPS } from './wizardTypes'

export function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>
        {label}{required && <span style={{ color: '#a32d2d' }}> *</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

export function StepBar({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {STEPS.map((label, i) => {
        const done   = i < current
        const active = i === current
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: done ? '#1d9e75' : active ? '#0f2744' : '#e8e7e0',
                color: done || active ? '#fff' : '#aaa',
                fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? '#0f2744' : done ? '#1d9e75' : '#aaa',
              }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 32, height: 1, background: '#e8e7e0', margin: '0 8px' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
