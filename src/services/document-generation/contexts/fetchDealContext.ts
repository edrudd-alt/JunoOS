import { SupabaseClient } from '@supabase/supabase-js'
import type { DealDocumentContext } from '../types'

export async function fetchDealContext(
  supabase: SupabaseClient,
  input: { dealInvestorId: string },
): Promise<DealDocumentContext> {
  // Query 1: fetch deal_investor row
  const { data: di, error: diError } = await supabase
    .from('deal_investors')
    .select('id, deal_id, client_id, investing_vehicle_id, nominee_id, confirmed_amount, fee_pct, shares, lifecycle_status')
    .eq('id', input.dealInvestorId)
    .single()

  if (diError || !di) {
    throw new Error(`deal_investor not found: ${input.dealInvestorId}${diError ? ` — ${diError.message}` : ''}`)
  }

  // Query 2: fetch all related rows in parallel — never use embedded join syntax
  const clientIds = [di.client_id, di.investing_vehicle_id, di.nominee_id].filter((id): id is string => !!id)

  const [
    { data: clients,   error: clientsError  },
    { data: dealRow,   error: dealError      },
  ] = await Promise.all([
    supabase.from('clients').select('id, full_name').in('id', clientIds),
    supabase.from('deals').select('id, title, company_id, share_price, share_class, eis_qualifying, investment_date').eq('id', di.deal_id).single(),
  ])

  if (dealError || !dealRow) {
    throw new Error(`deal not found for deal_investor ${input.dealInvestorId}${dealError ? ` — ${dealError.message}` : ''}`)
  }
  if (clientsError) {
    throw new Error(`failed to fetch clients: ${clientsError.message}`)
  }

  // Fetch company name separately (two-query pattern — no embedded joins)
  let companyName = ''
  if (dealRow.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', dealRow.company_id)
      .maybeSingle()
    companyName = company?.name ?? ''
  }

  // Merge in JS
  const clientMap = new Map((clients ?? []).map(c => [c.id, c]))

  return {
    deal: {
      id: dealRow.id,
      title: dealRow.title ?? null,
      company_name: companyName,
      share_price: dealRow.share_price ?? null,
      share_class: dealRow.share_class ?? null,
      eis_qualifying: dealRow.eis_qualifying ?? null,
      completion_date: dealRow.investment_date ?? null,
    },
    investor: {
      client_id: di.client_id,
      full_name: clientMap.get(di.client_id)?.full_name ?? 'Unknown investor',
      investing_vehicle_id: di.investing_vehicle_id ?? null,
      investing_vehicle_name: di.investing_vehicle_id
        ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? null)
        : null,
      nominee_id: di.nominee_id ?? null,
      nominee_name: di.nominee_id
        ? (clientMap.get(di.nominee_id)?.full_name ?? null)
        : null,
    },
    investment: {
      deal_investor_id: di.id,
      confirmed_amount: di.confirmed_amount ?? null,
      fee_pct: di.fee_pct ?? null,
      shares: di.shares ?? null,
      lifecycle_status: di.lifecycle_status,
    },
  }
}
