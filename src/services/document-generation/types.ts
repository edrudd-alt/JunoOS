// ── Template identifiers ───────────────────────────────────────────────────────

export type TemplateId = 'helloWorld'
// Extended in later stages: | 'applicationForm' | 'transactionStatement' | ...

export type ContextDomain = 'deal' | 'client' | 'portfolio'

// ── Domain context shapes ──────────────────────────────────────────────────────

export interface DealDocumentContext {
  deal: {
    id: string
    title: string | null
    company_name: string
    share_price: number | null
    share_class: string | null
    eis_qualifying: string | null
    completion_date: string | null
  }
  investor: {
    client_id: string
    full_name: string
    investing_vehicle_id: string | null
    investing_vehicle_name: string | null
    nominee_id: string | null
    nominee_name: string | null
  }
  investment: {
    deal_investor_id: string
    confirmed_amount: number | null
    fee_pct: number | null
    shares: number | null
    lifecycle_status: string
  }
}

// ── Per-template input shapes ──────────────────────────────────────────────────

export interface ContextMap {
  helloWorld: { dealInvestorId: string }
  // Stage 6b: applicationForm: { dealInvestorId: string; customTerms?: string }
  // Stage 6c: transactionStatement: { dealInvestorId: string }
}

export type ContextFor<T extends TemplateId> = ContextMap[T]

// ── Generation options & result ────────────────────────────────────────────────

export interface GenerationOptions {
  saveAsDraft?: boolean
}

export interface GenerationResult {
  documentId: string
  storageUrl: string
  templateVersion: string
  pdfBuffer: Buffer
}
