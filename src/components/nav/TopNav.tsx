'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV_LINKS = [
  { href: '/dashboard',   label: 'Dashboard'    },
  { href: '/clients',     label: 'Clients'      },
  { href: '/investments', label: 'Investments'  },
  { href: '/portfolio',   label: 'Portfolio'    },
  { href: '/deals',       label: 'Deals'        },
  { href: '/documents', label: 'Documents' },
  { href: '/reports', label: 'Reports' },
  { href: '/settings', label: 'Settings' },
]

export default function TopNav({ initials }: { initials: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav
      style={{
        background: '#0f2744',
        height: 48,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 0,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        style={{
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
          marginRight: 32,
          whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}
      >
        Juno Capital Partners
      </Link>

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
        {NAV_LINKS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                color: active ? '#fff' : 'rgba(255,255,255,0.6)',
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                textDecoration: 'none',
                padding: '4px 10px',
                borderRadius: 5,
                background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                transition: 'background 0.1s, color 0.1s',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* User initials */}
      <button
        onClick={handleSignOut}
        title="Sign out"
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: '#1d9e75',
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {initials}
      </button>
    </nav>
  )
}
