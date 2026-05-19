// Pure display-logic functions for the share-prices page.
// No Supabase calls here — all inputs are pre-fetched by the server component.

import type { CompanyShareClass, LatestValuation } from './queries'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RowDisplay {
  classId:        string
  className:      string
  instrumentType: 'equity' | 'cln' | 'loan_note'
  priceDisplay:   string   // e.g. "£2.9900" | "£1.0000 (principal)" | "Never valued"
  dateDisplay:    string   // e.g. "12 May 2026" | "Acquired 3 Apr 2024" | "—"
  methodology:    string | null
  source:         string | null
  hasValuation:   boolean  // true if a real valuation row exists (for modal pre-fill logic)
  currentPrice:   number | null  // raw price for modal pre-fill
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  // Append T00:00:00 to parse as local time and avoid timezone-driven off-by-one day.
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Main function ────────────────────────────────────────────────────────────

export function buildRowDisplay(
  shareClass:             CompanyShareClass,
  latestValuation:        LatestValuation | null,
  earliestInvestmentDate: string | null,
): RowDisplay {
  const isCln = shareClass.instrument_type === 'cln' || shareClass.instrument_type === 'loan_note'

  let priceDisplay: string
  let dateDisplay:  string
  let hasValuation = false
  let currentPrice: number | null = null

  if (isCln) {
    if (latestValuation) {
      priceDisplay = `£${latestValuation.share_price.toFixed(4)} (overridden)`
      dateDisplay  = fmtDate(latestValuation.valuation_date)
      hasValuation = true
      currentPrice = latestValuation.share_price
    } else {
      priceDisplay = '£1.0000 (principal)'
      dateDisplay  = earliestInvestmentDate ? `Acquired ${fmtDate(earliestInvestmentDate)}` : '—'
      currentPrice = 1.0
    }
  } else {
    if (latestValuation) {
      priceDisplay = `£${latestValuation.share_price.toFixed(4)}`
      dateDisplay  = fmtDate(latestValuation.valuation_date)
      hasValuation = true
      currentPrice = latestValuation.share_price
    } else {
      priceDisplay = 'Never valued'
      dateDisplay  = '—'
    }
  }

  return {
    classId:        shareClass.id,
    className:      shareClass.name,
    instrumentType: shareClass.instrument_type,
    priceDisplay,
    dateDisplay,
    methodology:    latestValuation?.methodology ?? null,
    source:         latestValuation?.source      ?? null,
    hasValuation,
    currentPrice,
  }
}
