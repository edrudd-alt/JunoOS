export const SENDABLE_DOCUMENT_TYPES = [
  'portfolio_statement',
  'transaction_statement',
  'application_form',
  'eis_certificate',
  'investment_agreement',
  'side_letter',
  'membership_agreement',
  'ceo_update',
  'press_release',
  'company_update',
  'exit_statement',
  'board_minutes',
  'management_accounts',
  'kpi_spreadsheet',
  'invoice',
  'other',
] as const

export type SendableDocumentType = typeof SENDABLE_DOCUMENT_TYPES[number]

export const SENSITIVE_DOCUMENT_TYPES = [
  'kyc',
  'poa',
  'suitability_assessment',
  'source_of_funds',
  'call_notes',
] as const

export function isSendableType(type: string): type is SendableDocumentType {
  return (SENDABLE_DOCUMENT_TYPES as readonly string[]).includes(type)
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  portfolio_statement:    'Portfolio statement',
  transaction_statement:  'Transaction statement',
  application_form:       'Application form',
  eis_certificate:        'EIS certificate',
  investment_agreement:   'Investment agreement',
  side_letter:            'Side letter',
  membership_agreement:   'Membership agreement',
  ceo_update:             'CEO update',
  press_release:          'Press release',
  company_update:         'Company update',
  exit_statement:         'Exit statement',
  board_minutes:          'Board minutes',
  management_accounts:    'Management accounts',
  kpi_spreadsheet:        'KPI spreadsheet',
  invoice:                'Invoice',
  other:                  'Other',
  kyc:                    'KYC',
  poa:                    'Power of attorney',
  suitability_assessment: 'Suitability assessment',
  source_of_funds:        'Source of funds',
  call_notes:             'Call notes',
}
