import { createClient } from '@/lib/supabase/server'
import BulkStatementRunPage from './BulkStatementRunPage'
import { getOutlookConnectionStatus } from '@/app/(app)/settings/outlookActions'

interface Props {
  searchParams: Promise<{ client?: string }>
}

export default async function PortfolioStatementPage({ searchParams }: Props) {
  const { client: preselectedClientId } = await searchParams
  const supabase = await createClient()

  // 1. Lead clients only (no sub-entities)
  const { data: clients } = await supabase
    .from('clients')
    .select('id, full_name, email, is_favourite')
    .is('lead_investor_id', null)
    .order('full_name')

  const clientIds = (clients ?? []).map(c => c.id)

  // 2. Investments — two-query pattern, fund-type + active-investment logic
  const { data: investments } = clientIds.length > 0
    ? await supabase
        .from('investments')
        .select('client_id, fund_type, shares_purchased, id, status')
        .in('client_id', clientIds)
    : { data: [] as { client_id: string; fund_type: string | null; shares_purchased: number; id: string; status: string }[] }

  // 3. Deferred payments — contingent position detection
  const investmentIds = (investments ?? []).map(inv => inv.id)
  const { data: deferredPayments } = investmentIds.length > 0
    ? await supabase
        .from('deferred_payments')
        .select('investment_id, status')
        .in('investment_id', investmentIds)
    : { data: [] as { investment_id: string; status: string }[] }

  // 4. Non-superseded portfolio statements (last-statement + hasCurrent columns)
  const { data: statements } = clientIds.length > 0
    ? await supabase
        .from('documents')
        .select('client_id, period, created_at')
        .eq('type', 'portfolio_statement')
        .eq('superseded', false)
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
    : { data: [] as { client_id: string; period: string | null; created_at: string }[] }

  // 4. In-progress run (generation type only — send runs start from UI)
  const { data: activeRuns } = await supabase
    .from('bulk_runs')
    .select('*')
    .eq('type', 'portfolio_statement')
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)

  const activeRun = activeRuns?.[0] ?? null

  // 5. Items for the active run
  const { data: activeRunItems } = activeRun
    ? await supabase
        .from('bulk_run_items')
        .select('*')
        .eq('bulk_run_id', activeRun.id)
    : { data: [] as Record<string, unknown>[] }

  // 6. Past runs — both generation and send runs, newest first
  const { data: pastRuns } = await supabase
    .from('bulk_runs')
    .select('*')
    .in('type', ['portfolio_statement', 'portfolio_statement_send'])
    .in('status', ['completed', 'cancelled', 'failed'])
    .order('started_at', { ascending: false })
    .limit(20)

  // 7. Presets + Outlook connection status (parallel — independent)
  const [{ data: presets }, outlookStatus] = await Promise.all([
    supabase
      .from('bulk_run_presets')
      .select('*')
      .eq('type', 'portfolio_statement')
      .order('created_at', { ascending: false }),
    getOutlookConnectionStatus(),
  ])

  return (
    <BulkStatementRunPage
      clients={(clients ?? []) as { id: string; full_name: string; email: string | null; is_favourite: boolean }[]}
      investments={(investments ?? []) as { client_id: string; fund_type: string | null; shares_purchased: number; id: string; status: string }[]}
      deferredPayments={(deferredPayments ?? []) as Record<string, unknown>[]}
      statements={(statements ?? []) as { client_id: string; period: string | null; created_at: string }[]}
      activeRun={activeRun ?? null}
      activeRunItems={(activeRunItems ?? []) as Record<string, unknown>[]}
      pastRuns={(pastRuns ?? []) as Record<string, unknown>[]}
      initialPresets={(presets ?? []) as Record<string, unknown>[]}
      preselectedClientId={preselectedClientId ?? null}
      outlookEmail={outlookStatus.connected ? outlookStatus.email : undefined}
    />
  )
}
