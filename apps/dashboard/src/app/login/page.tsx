'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/lib/auth-client'
import { Button, Input, GlanceMark } from '@glance/shared/design/components'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signIn.email({ email, password })
      if (result.error) {
        setError(result.error.message ?? 'Sign in failed')
      } else {
        router.push('/')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{ background: 'radial-gradient(1100px 740px at 50% 0%,#FBF6F0,#F4EEE6 55%,#EFE7DC)' }}
    >
      {/* Decorative background orbs */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: '-160px',
          left: '-120px',
          width: '460px',
          height: '460px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #E7DBFF, transparent 70%)',
          opacity: 0.55,
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          top: '120px',
          right: '-140px',
          width: '520px',
          height: '520px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #FBDCEF, transparent 70%)',
          opacity: 0.45,
        }}
      />

      <div className="relative z-10 w-full max-w-sm rounded-[22px] border border-line bg-white p-8 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <GlanceMark size={40} />
          <h1 className="font-serif text-[28px] font-semibold text-ink">Glance</h1>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            error={error ?? undefined}
          />
          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-ink-muted">
          No account?{' '}
          <Link href="/signup" className="font-bold text-brand-deep hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  )
}
