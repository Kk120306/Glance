'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GlanceMark, Button } from '@glance/shared/design/components'
import { useSession } from '@/lib/auth-client'
import { VoiceRecorder } from '@/components/VoiceRecorder'
import { clearVoiceOnboardingSkip, skipVoiceOnboarding } from '@/lib/voice-onboarding'

export default function VoiceOnboardingPage() {
  const router = useRouter()
  const { data: session, isPending: sessionPending } = useSession()
  const [hasVoice, setHasVoice] = useState(false)
  const [checkingVoice, setCheckingVoice] = useState(true)

  useEffect(() => {
    if (sessionPending) return
    if (!session?.user) {
      router.replace('/login')
      return
    }

    void (async () => {
      try {
        const res = await fetch('/api/family-member/me')
        if (res.ok) {
          const data = (await res.json()) as { elevenlabsVoiceId: string | null }
          if (data.elevenlabsVoiceId) {
            setHasVoice(true)
          }
        }
      } catch {
        // best-effort — stay on onboarding
      } finally {
        setCheckingVoice(false)
      }
    })()
  }, [session, sessionPending, router])

  function goToDashboard() {
    router.push('/dashboard')
  }

  function handleSkip() {
    skipVoiceOnboarding()
    goToDashboard()
  }

  function handleCloned() {
    clearVoiceOnboardingSkip()
    setHasVoice(true)
  }

  if (sessionPending || checkingVoice) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4EEE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
      </main>
    )
  }

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{ background: 'radial-gradient(1100px 740px at 50% 0%,#FBF6F0,#F4EEE6 55%,#EFE7DC)' }}
    >
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

      <div className="relative z-10 w-full max-w-lg rounded-[22px] border border-line bg-white p-8 shadow-card">
        <div className="mb-2 flex items-center gap-3">
          <GlanceMark size={40} />
          <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand-deep">
            Step 1 of 1
          </span>
        </div>

        <h1 className="mb-2 font-serif text-[28px] font-semibold text-ink">
          {hasVoice ? 'Update your voice' : 'Record your voice'}
        </h1>
        <p className="mb-6 text-[15px] leading-relaxed text-ink-muted">
          {hasVoice
            ? 'Record a new sample to replace your current voice clone.'
            : 'Your loved one will hear messages in your voice — not a robot. Record a short sample and Glance creates your voice clone automatically. No ElevenLabs account needed.'}
        </p>

        <VoiceRecorder onCloned={handleCloned} />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {hasVoice ? (
            <Button onClick={goToDashboard} className="w-full sm:w-auto">
              Continue to dashboard
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleSkip} className="w-full sm:w-auto">
              Skip for now
            </Button>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-ink-faint">
          You can re-record anytime from Settings or Voice library.
        </p>
      </div>
    </main>
  )
}
