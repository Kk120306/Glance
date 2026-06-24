'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import { hasSkippedVoiceOnboarding } from '@/lib/voice-onboarding'

/**
 * Redirects caregivers without a cloned voice to the onboarding flow.
 * Respects "Skip for now" for the current browser session.
 */
export function VoiceOnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { data: session, isPending: sessionPending } = useSession()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (sessionPending) return
    if (!session?.user) {
      setReady(true)
      return
    }
    if (hasSkippedVoiceOnboarding()) {
      setReady(true)
      return
    }

    void (async () => {
      try {
        const res = await fetch('/api/family-member/me')
        if (res.ok) {
          const data = (await res.json()) as { elevenlabsVoiceId: string | null }
          if (!data.elevenlabsVoiceId) {
            router.replace('/onboarding/voice')
            return
          }
        }
      } catch {
        // best-effort — don't block dashboard
      }
      setReady(true)
    })()
  }, [session, sessionPending, router])

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4EEE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
      </main>
    )
  }

  return children
}
