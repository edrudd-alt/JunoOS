// QUERIES THAT POWER THE SHARE-PRICES PAGE
// All queries in this file return data only visible to the team.
// When the investor portal is built, this query layer is NOT reused —
// the portal will have its own read-only valuation queries scoped to
// the investor's own holdings.

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanyShareClass {
  id:             string
  name:           string
  type:           'ordinary' | 'preference'
  instrument_type: 'equity' | 'cln' | 'loan_note'
  created_at:     string
}

export interface CompanyWithClasses {
  id:       string
  name:     string
  logo_url: string | null
  classes:  CompanyShareClass[]
}

export interface LatestValuation {
  share_price:    number
  valuation_date: string
  methodology:    string | null
  source:         string | null
}

// ─── Q1: Companies with their share classes ───────────────────────────────────

export async function getCompaniesWithShareClasses(supabase: SupabaseClient): Promise<{ companies: CompanyWithClasses[] }> {
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, logo_url')
    .order('name')

  if (!companies || companies.length === 0) return { companies: [] }

  const companyIds = companies.map(c => c.id)

  const { data: shareClasses } = await supabase
    .from('company_share_classes')
    .select('id, company_id, name, type, instrument_type, created_at')
    .in('company_id', companyIds)
    .order('created_at')

  const classMap = new Map<string, CompanyShareClass[]>()
  for (const c of companies) classMap.set(c.id, [])
  for (const sc of shareClasses ?? []) {
    const arr = classMap.get(sc.company_id)
    if (arr) arr.push(sc as CompanyShareClass)
  }

  return {
    companies: companies.map(c => ({
      id:       c.id,
      name:     c.name,
      logo_url: c.logo_url,
      classes:  classMap.get(c.id) ?? [],
    })),
  }
}

// ─── Q2: Latest valuation per share class ────────────────────────────────────

export async function getLatestValuationsPerClass(
  supabase: SupabaseClient,
  classIds: string[],
): Promise<Map<string, LatestValuation>> {
  const map = new Map<string, LatestValuation>()
  if (classIds.length === 0) return map

  const { data } = await supabase
    .from('company_current_valuations')
    .select('share_class_id, share_price, valuation_date, methodology, source')
    .in('share_class_id', classIds)

  for (const v of data ?? []) {
    if (v.share_class_id) {
      map.set(v.share_class_id, {
        share_price:    v.share_price,
        valuation_date: v.valuation_date,
        methodology:    v.methodology,
        source:         v.source,
      })
    }
  }

  return map
}

// ─── Q3: Earliest investment date per share class ─────────────────────────────

export async function getEarliestInvestmentDatePerClass(
  supabase: SupabaseClient,
  classIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (classIds.length === 0) return map

  const { data } = await supabase
    .from('investments')
    .select('share_class_id, investment_date')
    .in('share_class_id', classIds)
    .order('investment_date', { ascending: true })

  for (const inv of data ?? []) {
    if (inv.share_class_id && !map.has(inv.share_class_id)) {
      map.set(inv.share_class_id, inv.investment_date)
    }
  }

  return map
}
