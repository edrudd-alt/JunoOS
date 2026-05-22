import { createClient } from '@/lib/supabase/server'
import Reports from './Reports'

export default async function ReportsPage() {
  const supabase = await createClient()

  const [{ data: updates }, { data: recentBulkRuns }] = await Promise.all([
    supabase
      .from('investor_updates')
      .select(`
        id, update_type, title, status, sent_at, created_at,
        companies (id, name),
        investor_update_recipients (id)
      `)
      .order('created_at', { ascending: false })
      .limit(30),

    supabase
      .from('bulk_runs')
      .select('id, type, period_date, status, started_at, total_items, succeeded_count, failed_count')
      .eq('type', 'portfolio_statement')
      .order('started_at', { ascending: false })
      .limit(5),
  ])

  return (
    <Reports
      updates={(updates ?? []) as Record<string, unknown>[]}
      recentBulkRuns={(recentBulkRuns ?? []) as Record<string, unknown>[]}
    />
  )
}
