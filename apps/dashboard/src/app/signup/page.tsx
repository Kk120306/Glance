'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signUp } from '@/lib/auth-client'
import { Button, Input, GlanceMark } from '@glance/shared/design/components'

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signUp.email({ name, email, password })
      if (result.error) {
        setError(result.error.message ?? 'Sign up failed')
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
          <GlanceMark size={36} />
          <h1 className="font-serif text-2xl font-semibold text-ink">Create account</h1>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
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
            autoComplete="new-password"
            error={error ?? undefined}
          />
          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-ink-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-bold text-brand-deep hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
