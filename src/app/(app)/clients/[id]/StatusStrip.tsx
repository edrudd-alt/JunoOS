import { kycPill, signaturesPill, documentsPill, notesPill, poaPill } from './status'
import type { PillTone, PillState, LeadForStatus, NoteForStatus, DocumentForStatus } from './status'

interface Props {
  lead: LeadForStatus
  notes: NoteForStatus[]
  documents: DocumentForStatus[]
}

const DOT_COLOR: Record<PillTone, string> = {
  green: '#1d9e75',
  amber: '#ba7517',
  red:   '#a32d2d',
}

const PILL_STYLE: Record<PillTone, React.CSSProperties> = {
  green: { background: '#f3faf7', borderColor: '#c8e8db', color: '#085041' },
  amber: { background: '#fef7eb', borderColor: '#f1d9a8', color: '#92571b' },
  red:   { background: '#fef0f0', borderColor: '#f5c6c6', color: '#a32d2d' },
}

function Pill({ state }: { state: PillState }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 6, fontSize: 11,
        border: '0.5px solid',
        ...PILL_STYLE[state.tone],
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: DOT_COLOR[state.tone], flexShrink: 0,
        }}
      />
      {state.label}
    </div>
  )
}

export default function StatusStrip({ lead, notes, documents }: Props) {
  const pills: PillState[] = [
    kycPill(lead),
    signaturesPill(),
    documentsPill(),
    notesPill(notes),
    poaPill(documents),
  ]

  return (
    <div
      style={{
        display: 'flex', gap: 8,
        marginTop: 14, paddingTop: 14,
        borderTop: '0.5px solid #f0f0ec',
        flexWrap: 'wrap',
      }}
    >
      {pills.map((p, i) => <Pill key={i} state={p} />)}
    </div>
  )
}
