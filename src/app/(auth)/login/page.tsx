'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f7f7f5' }}>
      <div style={{ width: 380 }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center rounded-lg mb-4"
            style={{ width: 48, height: 48, background: '#0f2744' }}
          >
            <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>J</span>
          </div>
          <h1 style={{ fontSize: 17, fontWeight: 600, color: '#0f2744' }}>Juno Capital Partners</h1>
          <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Internal platform</p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '28px 32px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>Sign in</h2>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 5 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '0.5px solid #d0d0c8',
                  borderRadius: 5,
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 5 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '0.5px solid #d0d0c8',
                  borderRadius: 5,
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 14 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '9px 12px', fontSize: 13 }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
