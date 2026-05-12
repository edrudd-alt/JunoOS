// ── Template identifiers ───────────────────────────────────────────────────────

export type TemplateId = 'helloWorld' | 'applicationForm' | 'applicationFormV1_1'

export type ContextDomain = 'deal' | 'client' | 'portfolio'

// ── Domain context shapes ──────────────────────────────────────────────────────

export interface DealDocumentContext {
  deal: {
    id: string
    title: string | null
    company_name: string
    share_price: number | null
    share_class: string | null
    share_class_name: string | null  // from company_share_classes.name via share_class_id
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
    address_line1: string | null
    address_line2: string | null
    postcode: string | null
    email: string | null
    kyc_status: string | null
  }
  investment: {
    deal_investor_id: string
    confirmed_amount: number | null
    fee_pct: number | null
    shares: number | null
    lifecycle_status: string
  }
  /** Bank details for the account investors send funds to.
   *  Source: companies.bank_* when nominee_id IS NULL (direct investment),
   *          nominees.bank_*  when nominee_id IS NOT NULL (nominee-held). */
  bankDetails: {
    account_name: string | null
    sort_code: string | null
    account_number: string | null
    iban: string | null
    swift_bic: string | null
  }
}

// ── Per-template input shapes ──────────────────────────────────────────────────

export interface ContextMap {
  helloWorld: { dealInvestorId: string }
  applicationForm: { dealInvestorId: string }
  applicationFormV1_1: { dealInvestorId: string }
}

// ── Transaction statement context ─────────────────────────────────────────────
// Not in the generic registry pipeline — has its own generation path (superseded
// handling, investments-table source, specific storage prefix).

export interface TransactionDocumentContext {
  investor: {
    full_name: string
  }
  company: {
    name: string
  }
  investment: {
    investment_date: string     // YYYY-MM-DD from investments.investment_date
    share_class: string
    original_share_price: number
    shares_purchased: number
    sum_subscribed: number
    eis_status: string          // 'yes' | 'no' | 'tbc'
    fee_pct: number | null      // decimal (0.05 = 5%) from deal_investors
  }
}

export type ContextFor<T extends TemplateId> = ContextMap[T]

// ── Generation options & result ────────────────────────────────────────────────

export interface GenerationOptions {
  /** When true, generates the PDF buffer without uploading or creating a documents row.
   *  Used by the Review-before-send modal to render an inline preview. */
  previewOnly?: boolean
  saveAsDraft?: boolean
}

export interface GenerationResult {
  documentId: string
  storageUrl: string
  templateVersion: string
  pdfBuffer: Buffer
  context: DealDocumentContext
}
