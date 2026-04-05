'use client'

import React from 'react'
import { BUY_STEPS } from './buyWizardTypes'

interface Props {
  /** 0-based index of the currently active step (0 = Setup … 6 = Post-deal) */
  activeStep: number
}

export function StepBar({ activeStep }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 24, overflowX: 'auto' }}>
      {BUY_STEPS.map((step, i) => {
        const done   = i < activeStep
        const active = i === activeStep
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div style={{
                flex: 1, height: 1.5, minWidth: 10,
                background: done ? '#1d9e75' : '#e8e7e0',
                marginTop: 12, alignSelf: 'flex-start',
              }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600,
                background: done ? '#1d9e75' : active ? '#0f2744' : '#f5f5f2',
                color:      done || active ? '#fff' : '#bbb',
                border:     `1.5px solid ${done ? '#1d9e75' : active ? '#0f2744' : '#e0e0d8'}`,
                transition: 'background 0.2s, border-color 0.2s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{
                fontSize: 9.5,
                fontWeight: active ? 600 : 400,
                color: active ? '#0f2744' : done ? '#555' : '#bbb',
                whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
              }}>
                {step.label}
              </div>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
