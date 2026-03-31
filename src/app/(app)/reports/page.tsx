import { createClient } from '@/lib/supabase/server'
import Reports from './Reports'

export default async function ReportsPage() {
  const supabase = await createClient()

  const { data: updates } = await supabase
    .from('investor_updates')
    .select(`
      id, update_type, title, status, sent_at, created_at,
      companies (id, name),
      investor_update_recipients (id)
    `)
    .order('created_at', { ascending: false })
    .limit(30)

  return <Reports updates={(updates ?? []) as Record<string, unknown>[]} />
}
