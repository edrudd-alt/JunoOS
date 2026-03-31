import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TopNav from '@/components/nav/TopNav'
import { getInitials } from '@/lib/utils'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Try to get stored name from team_members, fall back to email
  const { data: member } = await supabase
    .from('team_members')
    .select('full_name, initials')
    .eq('id', user.id)
    .single()

  const displayName = member?.full_name ?? user.email ?? 'User'
  const initials = member?.initials ?? getInitials(displayName)

  return (
    <div className="h-full flex flex-col" style={{ minHeight: '100vh' }}>
      <TopNav initials={initials} />
      <main style={{ flex: 1, padding: '24px 24px', background: '#f7f7f5' }}>
        {children}
      </main>
    </div>
  )
}
