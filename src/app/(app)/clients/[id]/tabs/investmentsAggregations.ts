// Pure functions for the Investments tab — no side effects, no DB calls.
import type { InvestmentRecord, CompanyRecord, ValuationRecord, NomineeRecord } from '../ClientRecord'

// ── Types ────────────────────────────────────────────────────────────────────

export interface EntityMeta {
  id: string
  full_name: string
  default_nominee_id: string | null
}

export interface RichInvestment {
  id: string
  client_id: string
  entity_name: string
  company_id: string
  company_name: string
  company_logo_url: string | null
  company_sector: string | null
  share_class: string
  investment_date: string
  original_share_price: number
  shares_purchased: number
  sum_subscribed: number
  eis_status: string
  holding_location: string
  nominee_name: string | null
  current_share_price: number | null
  current_value: number | null
  change: number | null
  change_pct: number | null
  status: string
}

export interface InvFilters {
  eisFilter: 'all' | 'eis' | 'non_eis'
  locationFilter: 'all' | 'direct' | 'nominee'
  shareClass: string | null
  dateFrom: string | null
  dateTo: string | null
  search: string
}

export const DEFAULT_FILTERS: InvFilters = {
  eisFilter: 'all',
  locationFilter: 'all',
  shareClass: null,
  dateFrom: null,
  dateTo: null,
  search: '',
}

export function isDefaultFilters(f: InvFilters): boolean {
  return (
    f.eisFilter === 'all' &&
    f.locationFilter === 'all' &&
    f.shareClass === null &&
    !f.dateFrom &&
    !f.dateTo &&
    !f.search
  )
}

export interface Totals {
  totalInvested: number
  totalCurrentValue: number | null
  totalChange: number | null
  totalChangePct: number | null
  count: number
  companyCount: number
}

export interface CompanyGroup {
  companyId: string
  companyName: string
  companyLogoUrl: string | null
  companySector: string | null
  investments: RichInvestment[]
  shareClasses: string[]
  totalShares: number
  totalInvested: number
  totalCurrentValue: number | null
  totalChange: number | null
  totalChangePct: number | null
  weightedAvgCost: number
  currentSharePrice: number | null
}

export interface ShareClassGroup {
  key: string
  companyId: string
  companyName: string
  companyLogoUrl: string | null
  shareClass: string
  investments: RichInvestment[]
  totalShares: number
  totalInvested: number
  totalCurrentValue: number | null
  totalChange: number | null
  totalChangePct: number | null
  weightedAvgCost: number
  currentSharePrice: number | null
  hasEis: boolean
}

export interface CompanyShareClassGroup {
  companyId: string
  companyName: string
  companyLogoUrl: string | null
  companySector: string | null
  shareClassGroups: ShareClassGroup[]
  subtotalShares: number
  subtotalInvested: number
  subtotalCurrentValue: number | null
  subtotalChange: number | null
  subtotalChangePct: number | null
  subtotalWeightedAvg: number
}

// ── Builders ────────────────────────────────────────────────────────────────

export function buildRichInvestments(
  investments: InvestmentRecord[],
  companyMap: Map<string, CompanyRecord>,
  valuationMap: Map<string, number>,
  entityNameMap: Map<string, string>,
  entityNomineeIdMap: Map<string, string | null>,
  nomineeNameMap: Map<string, string>,
): RichInvestment[] {
  return investments.map(inv => {
    const company = companyMap.get(inv.company_id)
    const currentPrice = valuationMap.get(inv.company_id) ?? null
    const shares = Number(inv.shares_purchased)
    const invested = Number(inv.sum_subscribed)
    const currentValue = currentPrice !== null ? shares * currentPrice : null
    const change = currentValue !== null ? currentValue - invested : null
    const changePct =
      change !== null && invested > 0 ? (change / invested) * 100 : null

    // Nominee name: investment-level nominee_id first, then entity default
    let nomineeName: string | null = null
    if (inv.nominee_id) {
      nomineeName = nomineeNameMap.get(inv.nominee_id) ?? null
    }
    if (!nomineeName && inv.holding_location === 'nominee') {
      const defaultNomineeId = entityNomineeIdMap.get(inv.client_id) ?? null
      if (defaultNomineeId) nomineeName = nomineeNameMap.get(defaultNomineeId) ?? null
    }

    return {
      id: inv.id,
      client_id: inv.client_id,
      entity_name: entityNameMap.get(inv.client_id) ?? 'Unknown',
      company_id: inv.company_id,
      company_name: company?.name ?? 'Unknown',
      company_logo_url: company?.logo_url ?? null,
      company_sector: company?.sector ?? null,
      share_class: inv.share_class,
      investment_date: inv.investment_date,
      original_share_price: Number(inv.original_share_price),
      shares_purchased: shares,
      sum_subscribed: invested,
      eis_status: inv.eis_status,
      holding_location: inv.holding_location,
      nominee_name: nomineeName,
      current_share_price: currentPrice,
      current_value: currentValue,
      change,
      change_pct: changePct,
      status: inv.status,
    }
  })
}

// ── Filters ─────────────────────────────────────────────────────────────────

export function filterInvestments(
  rich: RichInvestment[],
  entityScope: string,
  filters: InvFilters,
): RichInvestment[] {
  return rich.filter(inv => {
    if (entityScope !== 'all' && inv.client_id !== entityScope) return false
    if (filters.eisFilter === 'eis' && inv.eis_status !== 'yes') return false
    if (filters.eisFilter === 'non_eis' && inv.eis_status === 'yes') return false
    if (filters.locationFilter === 'direct' && inv.holding_location !== 'direct') return false
    if (filters.locationFilter === 'nominee' && inv.holding_location !== 'nominee') return false
    if (filters.shareClass && inv.share_class !== filters.shareClass) return false
    if (filters.dateFrom && inv.investment_date < filters.dateFrom) return false
    if (filters.dateTo && inv.investment_date > filters.dateTo) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (
        !inv.company_name.toLowerCase().includes(q) &&
        !inv.share_class.toLowerCase().includes(q)
      ) return false
    }
    return true
  })
}

// ── Grouping ────────────────────────────────────────────────────────────────

export function groupByCompany(rich: RichInvestment[]): CompanyGroup[] {
  const map = new Map<string, CompanyGroup>()

  for (const inv of rich) {
    if (!map.has(inv.company_id)) {
      map.set(inv.company_id, {
        companyId: inv.company_id,
        companyName: inv.company_name,
        companyLogoUrl: inv.company_logo_url,
        companySector: inv.company_sector,
        investments: [],
        shareClasses: [],
        totalShares: 0,
        totalInvested: 0,
        totalCurrentValue: null,
        totalChange: null,
        totalChangePct: null,
        weightedAvgCost: 0,
        currentSharePrice: inv.current_share_price,
      })
    }
    const g = map.get(inv.company_id)!
    g.investments.push(inv)
    g.totalShares += inv.shares_purchased
    g.totalInvested += inv.sum_subscribed
    if (!g.shareClasses.includes(inv.share_class)) g.shareClasses.push(inv.share_class)
  }

  for (const g of map.values()) {
    g.weightedAvgCost = g.totalShares > 0 ? g.totalInvested / g.totalShares : 0
    let totalCV = 0, hasAnyPrice = false
    for (const inv of g.investments) {
      if (inv.current_value !== null) { totalCV += inv.current_value; hasAnyPrice = true }
    }
    g.totalCurrentValue = hasAnyPrice ? totalCV : null
    g.totalChange = g.totalCurrentValue !== null ? g.totalCurrentValue - g.totalInvested : null
    g.totalChangePct =
      g.totalChange !== null && g.totalInvested > 0
        ? (g.totalChange / g.totalInvested) * 100
        : null
    g.investments.sort((a, b) => b.investment_date.localeCompare(a.investment_date))
  }

  return Array.from(map.values()).sort((a, b) => a.companyName.localeCompare(b.companyName))
}

export function groupByShareClass(rich: RichInvestment[]): CompanyShareClassGroup[] {
  const coMap = new Map<string, {
    companyId: string; companyName: string; companyLogoUrl: string | null; companySector: string | null
    scMap: Map<string, ShareClassGroup>
  }>()

  for (const inv of rich) {
    if (!coMap.has(inv.company_id)) {
      coMap.set(inv.company_id, {
        companyId: inv.company_id,
        companyName: inv.company_name,
        companyLogoUrl: inv.company_logo_url,
        companySector: inv.company_sector,
        scMap: new Map(),
      })
    }
    const co = coMap.get(inv.company_id)!
    const key = `${inv.company_id}::${inv.share_class}`
    if (!co.scMap.has(key)) {
      co.scMap.set(key, {
        key,
        companyId: inv.company_id,
        companyName: inv.company_name,
        companyLogoUrl: inv.company_logo_url,
        shareClass: inv.share_class,
        investments: [],
        totalShares: 0,
        totalInvested: 0,
        totalCurrentValue: null,
        totalChange: null,
        totalChangePct: null,
        weightedAvgCost: 0,
        currentSharePrice: inv.current_share_price,
        hasEis: false,
      })
    }
    const sc = co.scMap.get(key)!
    sc.investments.push(inv)
    sc.totalShares += inv.shares_purchased
    sc.totalInvested += inv.sum_subscribed
    if (inv.eis_status === 'yes') sc.hasEis = true
  }

  const result: CompanyShareClassGroup[] = []
  for (const [, co] of coMap) {
    const shareClassGroups: ShareClassGroup[] = []
    for (const [, sc] of co.scMap) {
      sc.weightedAvgCost = sc.totalShares > 0 ? sc.totalInvested / sc.totalShares : 0
      let totalCV = 0, hasAnyPrice = false
      for (const inv of sc.investments) {
        if (inv.current_value !== null) { totalCV += inv.current_value; hasAnyPrice = true }
      }
      sc.totalCurrentValue = hasAnyPrice ? totalCV : null
      sc.totalChange = sc.totalCurrentValue !== null ? sc.totalCurrentValue - sc.totalInvested : null
      sc.totalChangePct =
        sc.totalChange !== null && sc.totalInvested > 0
          ? (sc.totalChange / sc.totalInvested) * 100
          : null
      sc.investments.sort((a, b) => b.investment_date.localeCompare(a.investment_date))
      shareClassGroups.push(sc)
    }

    let subShares = 0, subInvested = 0, subCV = 0, hasAnyCV = false
    for (const sc of shareClassGroups) {
      subShares += sc.totalShares
      subInvested += sc.totalInvested
      if (sc.totalCurrentValue !== null) { subCV += sc.totalCurrentValue; hasAnyCV = true }
    }
    const subtotalCV = hasAnyCV ? subCV : null
    const subtotalChange = subtotalCV !== null ? subtotalCV - subInvested : null

    result.push({
      companyId: co.companyId,
      companyName: co.companyName,
      companyLogoUrl: co.companyLogoUrl,
      companySector: co.companySector,
      shareClassGroups,
      subtotalShares: subShares,
      subtotalInvested: subInvested,
      subtotalCurrentValue: subtotalCV,
      subtotalChange,
      subtotalChangePct:
        subtotalChange !== null && subInvested > 0
          ? (subtotalChange / subInvested) * 100
          : null,
      subtotalWeightedAvg: subShares > 0 ? subInvested / subShares : 0,
    })
  }

  return result.sort((a, b) => a.companyName.localeCompare(b.companyName))
}

export function computeTotals(rich: RichInvestment[]): Totals {
  let totalInvested = 0, totalCV = 0, hasAnyCV = false
  const companyIds = new Set<string>()
  for (const inv of rich) {
    totalInvested += inv.sum_subscribed
    if (inv.current_value !== null) { totalCV += inv.current_value; hasAnyCV = true }
    companyIds.add(inv.company_id)
  }
  const totalCurrentValue = hasAnyCV ? totalCV : null
  const totalChange = totalCurrentValue !== null ? totalCurrentValue - totalInvested : null
  const totalChangePct =
    totalChange !== null && totalInvested > 0 ? (totalChange / totalInvested) * 100 : null
  return {
    totalInvested,
    totalCurrentValue,
    totalChange,
    totalChangePct,
    count: rich.length,
    companyCount: companyIds.size,
  }
}
