import { createClient } from '@/lib/supabase/server'
import NomineesClient from './NomineesClient'

export default async function NomineesPage() {
  const supabase = await createClient()

  const { data: nominees } = await supabase
    .from('nominees')
    .select('id, name, description, active, created_at')
    .order('name')

  return <NomineesClient nominees={(nominees ?? []) as Record<string, unknown>[]} />
}
