import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: deal } = await supabase
    .from('deals')
    .select('id, deal_type, status')
    .eq('id', id)
    .maybeSingle()

  if (!deal) return notFound()

  if (deal.status === 'complete') {
    return (
      <div style={{ padding: 32, fontSize: 13, color: '#888' }}>
        This deal is complete and cannot be edited.
      </div>
    )
  }

  // All deal types are now managed through the deal detail page
  redirect(`/deals/${id}`)
}
