import { createClient } from '@/lib/supabase/server'
import Reports from './Reports'

export default async function ReportsPage() {
  const supabase = await createClient()

  // Query 1: investor_updates — no embedded joins; company_id added for merge
  const { data: rawUpdates } = await supabase
    .from('investor_updates')
    .select('id, update_type, title, status, sent_at, created_at, company_id')
    .order('created_at', { ascending: false })
    .limit(30)

  // Collect IDs for secondary lookups
  const companyIds = [...new Set((rawUpdates ?? []).map(u => u.company_id).filter((c): c is string => Boolean(c)))]
  const updateIds  = (rawUpdates ?? []).map(u => u.id)

  // Query 2 + Query 3 in parallel
  const [{ data: companiesData }, { data: recipientsData }] = await Promise.all([
    companyIds.length > 0
      ? supabase.from('companies').select('id, name').in('id', companyIds)
      : { data: [] as { id: string; name: string }[] },
    updateIds.length > 0
      ? supabase.from('investor_update_recipients').select('investor_update_id').in('investor_update_id', updateIds)
      : { data: [] as { investor_update_id: string }[] },
  ])

  // Merge
  const companyMap = new Map((companiesData ?? []).map(c => [c.id, c]))

  const recipientCountByUpdate: Record<string, number> = {}
  for (const r of recipientsData ?? []) {
    const uid = (r as Record<string, unknown>).investor_update_id as string
    recipientCountByUpdate[uid] = (recipientCountByUpdate[uid] ?? 0) + 1
  }

  const updates = (rawUpdates ?? []).map(u => ({
    ...u,
    companies: u.company_id ? (companyMap.get(u.company_id) ?? null) : null,
    // synthetic array — Reports.tsx reads .length only; if individual IDs are needed later this must be revisited
    investor_update_recipients: Array.from(
      { length: recipientCountByUpdate[u.id] ?? 0 },
      () => ({ id: '' }),
    ),
  }))

  return <Reports updates={updates as Record<string, unknown>[]} />
}
