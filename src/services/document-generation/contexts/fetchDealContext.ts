import { SupabaseClient } from '@supabase/supabase-js'
import type { DealDocumentContext } from '../types'

export async function fetchDealContext(
  supabase: SupabaseClient,
  input: { dealInvestorId: string },
): Promise<DealDocumentContext> {
  // Query 1: deal_investor row
  const { data: di, error: diError } = await supabase
    .from('deal_investors')
    .select('id, deal_id, client_id, investing_vehicle_id, nominee_id, confirmed_amount, fee_pct, shares, lifecycle_status')
    .eq('id', input.dealInvestorId)
    .single()

  if (diError || !di) {
    throw new Error(`deal_investor not found: ${input.dealInvestorId}${diError ? ` — ${diError.message}` : ''}`)
  }

  // Query 2 (parallel): all clients involved + the deal row
  const clientIds = [di.client_id, di.investing_vehicle_id, di.nominee_id].filter((id): id is string => !!id)

  const [
    { data: clients,  error: clientsError },
    { data: dealRow,  error: dealError    },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, address_line1, address_line2, postcode, email, kyc_status')
      .in('id', clientIds),
    supabase
      .from('deals')
      .select('id, title, company_id, share_price, share_class, share_class_id, eis_qualifying, investment_date')
      .eq('id', di.deal_id)
      .single(),
  ])

  if (dealError || !dealRow) {
    throw new Error(`deal not found for deal_investor ${input.dealInvestorId}${dealError ? ` — ${dealError.message}` : ''}`)
  }
  if (clientsError) {
    throw new Error(`failed to fetch clients: ${clientsError.message}`)
  }

  // Query 3 (parallel): company with bank fields, share class name, nominee bank fields
  const [companyResult, shareClassResult, nomineeResult] = await Promise.all([
    dealRow.company_id
      ? supabase
          .from('companies')
          .select('name, bank_account_name, bank_sort_code, bank_account_number, bank_iban, bank_swift_bic')
          .eq('id', dealRow.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    dealRow.share_class_id
      ? supabase
          .from('company_share_classes')
          .select('name')
          .eq('id', dealRow.share_class_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    di.nominee_id
      ? supabase
          .from('nominees')
          .select('bank_account_name, bank_sort_code, bank_account_number, bank_iban, bank_swift_bic')
          .eq('id', di.nominee_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  // Merge clients by ID
  const clientMap = new Map((clients ?? []).map(c => [c.id, c]))
  const humanClient = clientMap.get(di.client_id)

  // Bank details source: nominee when nominee_id is set, otherwise company
  const bankSource = di.nominee_id ? nomineeResult.data : companyResult.data

  return {
    deal: {
      id: dealRow.id,
      title: dealRow.title ?? null,
      company_name: companyResult.data?.name ?? '',
      share_price: dealRow.share_price ?? null,
      share_class: dealRow.share_class ?? null,
      share_class_name: shareClassResult.data?.name ?? null,
      eis_qualifying: dealRow.eis_qualifying ?? null,
      completion_date: dealRow.investment_date ?? null,
    },
    investor: {
      client_id: di.client_id,
      full_name: humanClient?.full_name ?? 'Unknown investor',
      investing_vehicle_id: di.investing_vehicle_id ?? null,
      investing_vehicle_name: di.investing_vehicle_id
        ? (clientMap.get(di.investing_vehicle_id)?.full_name ?? null)
        : null,
      nominee_id: di.nominee_id ?? null,
      nominee_name: di.nominee_id
        ? (clientMap.get(di.nominee_id)?.full_name ?? null)
        : null,
      address_line1: humanClient?.address_line1 ?? null,
      address_line2: humanClient?.address_line2 ?? null,
      postcode: humanClient?.postcode ?? null,
      email: humanClient?.email ?? null,
      kyc_status: humanClient?.kyc_status ?? null,
    },
    investment: {
      deal_investor_id: di.id,
      confirmed_amount: di.confirmed_amount ?? null,
      fee_pct: di.fee_pct ?? null,
      shares: di.shares ?? null,
      lifecycle_status: di.lifecycle_status,
    },
    bankDetails: {
      account_name: bankSource?.bank_account_name ?? null,
      sort_code: bankSource?.bank_sort_code ?? null,
      account_number: bankSource?.bank_account_number ?? null,
      iban: bankSource?.bank_iban ?? null,
      swift_bic: bankSource?.bank_swift_bic ?? null,
    },
  }
}
