// Pure functions computing status pill states for the client status strip.
// Computed on read — no scheduled jobs, no stored status columns.

export type PillTone = 'green' | 'amber' | 'red'

export interface PillState {
  tone: PillTone
  label: string
}

export interface LeadForStatus {
  kyc_status: string
  kyc_expiry: string | null
}

export interface NoteForStatus {
  flag_for_followup: boolean
}

export interface DocumentForStatus {
  type: string
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

export function kycPill(lead: LeadForStatus, today: Date = new Date()): PillState {
  if (lead.kyc_status !== 'verified') {
    const label = lead.kyc_status === 'renewal_due' ? 'KYC renewal due' : 'KYC outstanding'
    return { tone: 'red', label }
  }
  if (!lead.kyc_expiry) {
    return { tone: 'green', label: 'KYC verified' }
  }
  const expiryMs = new Date(lead.kyc_expiry).getTime()
  const todayMs = today.getTime()
  if (expiryMs < todayMs) {
    return { tone: 'red', label: 'KYC expired' }
  }
  const expiryDate = new Date(lead.kyc_expiry).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  if (expiryMs - todayMs < NINETY_DAYS_MS) {
    return { tone: 'amber', label: `KYC expiring soon · ${expiryDate}` }
  }
  return { tone: 'green', label: `KYC verified · expires ${expiryDate}` }
}

// TODO: real logic in 1.4 — requires investment signing_status data
export function signaturesPill(): PillState {
  return { tone: 'green', label: 'Signatures complete' }
}

// TODO: real logic in 1.4 — requires investment docs data per deal
export function documentsPill(): PillState {
  return { tone: 'green', label: 'Documents on file' }
}

export function notesPill(notes: NoteForStatus[]): PillState {
  const flagged = notes.filter(n => n.flag_for_followup).length
  if (flagged === 0) return { tone: 'green', label: 'No notes flagged' }
  const noun = flagged === 1 ? 'note' : 'notes'
  return { tone: 'amber', label: `${flagged} ${noun} flagged for follow-up` }
}

export function poaPill(documents: DocumentForStatus[]): PillState {
  const hasPoa = documents.some(d => d.type === 'poa')
  return hasPoa
    ? { tone: 'green', label: 'POA on file' }
    : { tone: 'red', label: 'POA not on file' }
}
