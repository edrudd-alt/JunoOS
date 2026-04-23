import { createClient } from '@/lib/supabase/client'
import type { Client } from './BookbuildSection'
import type { DealInfo } from './DealDetail'

type Supabase = ReturnType<typeof createClient>

// ─── Warning check ────────────────────────────────────────────────────────────

export interface WarningCheckParams {
  previousStatus:      string
  status:              string
  confirmedStatus:     string
  clientId:            string
  amount:              number | null
  entryAmount:         number | null
  shares:              number | null
  entryShares:         number | null
  completionChecklist: Record<string, unknown> | null
  pendingSave:         boolean
}

export function checkNeedsWarning(p: WarningCheckParams): boolean {
  if (p.pendingSave) return false
  const perInvestor = (p.completionChecklist?.per_investor ?? {}) as Record<string, Record<string, boolean>>
  const appSigned   = perInvestor[p.clientId]?.app_signed === true
  if (!appSigned) return false

  const isUnconfirming   = p.previousStatus === p.confirmedStatus && p.status !== p.confirmedStatus
  const isAmountChanging = p.previousStatus === p.confirmedStatus && p.status === p.confirmedStatus
    && (p.amount !== p.entryAmount || p.shares !== p.entryShares)

  return isUnconfirming || isAmountChanging
}

// ─── Side effects ─────────────────────────────────────────────────────────────

export interface SideEffectsParams {
  status:              string
  previousStatus:      string
  confirmedStatus:     string
  isSellDeal:          boolean
  clientId:            string
  vehicleId:           string | null
  vehicleClient:       Client | null
  amount:              number | null
  shares:              number | null
  entryAmount:         number | null
  entryShares:         number | null
  clients:             Client[]
  dealInfo:            DealInfo
  bookbuildId:         string
  completionChecklist: Record<string, unknown> | null
  supabase:            Supabase
}

export async function runBookbuildSideEffects(p: SideEffectsParams): Promise<void> {
  const sharePrice        = p.dealInfo.sharePrice ?? 0
  const effectiveClientId = p.vehicleId ?? p.clientId
  const isConfirming      = p.status === p.confirmedStatus && p.previousStatus !== p.confirmedStatus
  const isUnconfirming    = p.previousStatus === p.confirmedStatus && p.status !== p.confirmedStatus
  const isAmountChanging  = p.previousStatus === p.confirmedStatus && p.status === p.confirmedStatus
    && (p.amount !== p.entryAmount || p.shares !== p.entryShares)

  if (isConfirming) {
    const client      = p.clients.find(c => c.id === p.clientId)
    const vehicleType = p.vehicleClient?.vehicle_type ?? null
    const eisStatus       = vehicleType
      ? 'no'
      : (p.dealInfo.eisQualifying || 'tbc')
    const effectiveFundType = p.vehicleClient?.fund_type ?? client?.fund_type ?? 'syndicate'

    await p.supabase
      .from('deal_investors')
      .upsert(
        { deal_id: p.dealInfo.id, client_id: effectiveClientId, poa_held: false, signing_status: 'pending' },
        { onConflict: 'deal_id,client_id', ignoreDuplicates: true },
      )

    if (p.isSellDeal) {
      await p.supabase.from('investments').insert({
        client_id:            effectiveClientId,
        company_id:           p.dealInfo.companyId,
        deal_id:              p.dealInfo.id,
        bookbuild_id:         p.bookbuildId,
        share_class:          p.dealInfo.shareClass     || null,
        original_share_price: sharePrice,
        investment_date:      p.dealInfo.investmentDate || null,
        sum_subscribed:       p.amount ?? 0,
        shares_purchased:     p.shares ?? 0,
        eis_status:           eisStatus,
        transaction_type:     'sell',
        status:               'pending',
        fund_type:            effectiveFundType,
        holding_location:     'direct',
      })
    } else {
      const feeRate         = p.vehicleClient?.default_fee_rate ?? client?.default_fee_rate ?? 0
      const sumSubscribed   = p.amount ?? 0
      const feeAmount       = sumSubscribed * feeRate / 100
      const sharesPurchased = p.shares ?? (sharePrice > 0 ? sumSubscribed / sharePrice : 0)

      const { data: dealRow } = await p.supabase
        .from('deals')
        .select('completion_checklist')
        .eq('id', p.dealInfo.id)
        .single()
      if (dealRow) {
        const existing            = (dealRow.completion_checklist ?? {}) as Record<string, unknown>
        const existingPerInvestor = (existing.per_investor ?? {}) as Record<string, unknown>
        await p.supabase.from('deals').update({
          completion_checklist: {
            ...existing,
            per_investor: { ...existingPerInvestor, [effectiveClientId]: {} },
          },
        }).eq('id', p.dealInfo.id)
      }

      await p.supabase.from('investments').insert({
        client_id:            effectiveClientId,
        company_id:           p.dealInfo.companyId,
        deal_id:              p.dealInfo.id,
        bookbuild_id:         p.bookbuildId,
        share_class_id:       p.dealInfo.shareClassId  || null,
        share_class:          p.dealInfo.shareClass     || null,
        original_share_price: sharePrice,
        investment_date:      p.dealInfo.investmentDate || null,
        sum_subscribed:       sumSubscribed,
        shares_purchased:     sharesPurchased,
        eis_status:           eisStatus,
        transaction_type:     'buy',
        transaction_category: 'equity',
        status:               'pending',
        fund_type:            effectiveFundType,
        fee_rate:             feeRate,
        fee_amount:           feeAmount,
        holding_location:     'direct',
      })
    }
  }

  if (isUnconfirming) {
    await p.supabase.from('deal_investors').delete()
      .eq('deal_id', p.dealInfo.id).eq('client_id', effectiveClientId)
    await p.supabase.from('investments').delete()
      .eq('deal_id', p.dealInfo.id).eq('client_id', effectiveClientId).eq('status', 'pending')
  }

  if (isAmountChanging) {
    await p.supabase.from('investments')
      .update({
        sum_subscribed:   p.amount ?? 0,
        shares_purchased: p.shares ?? (sharePrice > 0 ? (p.amount ?? 0) / sharePrice : 0),
      })
      .eq('deal_id', p.dealInfo.id)
      .eq('client_id', effectiveClientId)
      .eq('status', 'pending')
  }
}
