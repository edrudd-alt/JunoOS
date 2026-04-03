// ─── Shared types, constants, and styles for the New Deal Wizard ──────────────

export interface Company {
  id: string
  name: string
  share_classes: { name: string; type: string }[] | null
}

export interface Client {
  id: string
  full_name: string
  email: string | null
  default_fee_rate: number
  lead_investor_id: string | null
}

export interface DealInvestor {
  clientId: string
  name: string
  email: string
  feeRate: number
  poaHeld: boolean
}

export interface WizardDocument {
  id: string
  name: string
  type: string
  signingRequired: boolean
  bespoke?: boolean
}

export const DEAL_TYPES = [
  { value: 'new_investment', label: 'New investment' },
  { value: 'follow_on',      label: 'Follow-on investment' },
  { value: 'exit',           label: 'Exit / sale of shares' },
  { value: 'kyc',            label: 'KYC / Onboarding' },
  { value: 'side_letter',    label: 'Side letter' },
  { value: 'membership',     label: 'Membership joining' },
]

export const DOC_TEMPLATES = [
  { type: 'application_form',        name: 'Application form',            signingRequired: true  },
  { type: 'investment_agreement',    name: 'Investment agreement',         signingRequired: true  },
  { type: 'transaction_statement',   name: 'Transaction statement',        signingRequired: false },
  { type: 'eis_certificate',         name: 'EIS certificate',              signingRequired: false },
  { type: 'side_letter',             name: 'Side letter',                  signingRequired: true  },
  { type: 'kyc',                     name: 'KYC form',                     signingRequired: true  },
  { type: 'share_subscription',      name: 'Share subscription agreement', signingRequired: true  },
]

export const inputStyle = {
  width: '100%', padding: '7px 10px',
  border: '0.5px solid #d0d0c8', borderRadius: 5,
  fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, background: '#fff',
}

export const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4,
}

export const STEPS = ['Deal setup', 'Documents', 'Send', 'Track', 'Complete']
