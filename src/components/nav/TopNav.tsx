'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/clients',   label: 'Clients'   },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/deals',     label: 'Deals'     },
  { href: '/documents', label: 'Documents' },
  { href: '/reports',   label: 'Reports'   },
  { href: '/settings',  label: 'Settings'  },
]

export default function TopNav({ initials }: { initials: string }) {
  const pathname  = usePathname()
  const router    = useRouter()
  const supabase  = createClient()

  const [dropdownOpen,   setDropdownOpen]   = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function doSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
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

        {/* User initials + dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            title="Account"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: dropdownOpen ? '#179060' : '#1d9e75',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {initials}
          </button>

          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 8px)',
              background: '#fff',
              border: '0.5px solid #e8e7e0',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              minWidth: 160,
              zIndex: 200,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #f0f0ec' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2744' }}>{initials}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>Signed in</div>
              </div>
              <button
                onClick={() => { setDropdownOpen(false); setConfirmSignOut(true) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 14px', fontSize: 12, color: '#a32d2d',
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Sign-out confirmation modal */}
      {confirmSignOut && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 340, padding: '28px 24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', margin: '0 0 8px' }}>
              Sign out?
            </h2>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 24px' }}>
              Are you sure you want to sign out?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmSignOut(false)}
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={doSignOut}
                className="btn btn-primary"
                style={{ fontSize: 12, background: '#a32d2d' }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
