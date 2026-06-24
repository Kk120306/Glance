'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import { hasSkippedVoiceOnboarding } from '@/lib/voice-onboarding'

export default function DashboardGateway() {
  const router = useRouter()
  const { data: session, isPending: sessionPending } = useSession()

  useEffect(() => {
    if (sessionPending) return
    if (!session?.user) {
      router.replace('/login')
      return
    }

    if (hasSkippedVoiceOnboarding()) {
      router.replace('/dashboard')
      return
    }

    void (async () => {
      try {
        const res = await fetch('/api/family-member/me')
        if (res.ok) {
          const data = (await res.json()) as { elevenlabsVoiceId: string | null }
          router.replace(data.elevenlabsVoiceId ? '/dashboard' : '/onboarding/voice')
          return
        }
      } catch {
        // best-effort
      }
      router.replace('/dashboard')
    })()
  }, [session, sessionPending, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4EEE6]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
        <p className="text-ink-faint text-sm font-medium">Redirecting to your workspace...</p>
      </div>
    </main>
  )
}
