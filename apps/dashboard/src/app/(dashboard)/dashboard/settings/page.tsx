'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@glance/shared/design/components'
import { signOut, useSession } from '@/lib/auth-client'

export default function SettingsPage() {
  const { data: session } = useSession()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <main className="flex-1 bg-[#F4EEE6] p-[30px] px-[34px] min-h-screen overflow-y-auto">
      <header className="mb-6">
        <h1 className="font-serif text-[34px] font-semibold tracking-tight text-ink">Settings</h1>
        <p className="text-[16px] text-ink-muted mt-0.5">Your account and workspace preferences.</p>
      </header>

      <section className="mb-6 flex flex-col gap-4 rounded-[22px] border border-line bg-white p-6 shadow-soft max-w-2xl">
        <h2 className="font-serif text-xl font-semibold text-ink">Account</h2>
        <div className="flex flex-col gap-1">
          <span className="section-label">Name</span>
          <span className="text-[16px] font-bold text-ink">{session?.user?.name ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="section-label">Email</span>
          <span className="text-[16px] text-ink-muted">{session?.user?.email ?? '—'}</span>
        </div>
        <div>
          <Button variant="ghost" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-[22px] border border-line bg-white p-6 shadow-soft max-w-2xl">
        <h2 className="font-serif text-xl font-semibold text-ink">Voice &amp; gaze</h2>
        <p className="text-[15px] text-ink-muted">
          Record and manage the voices your loved one hears in the{' '}
          <Link href="/dashboard/voice-library" className="font-bold text-brand-deep hover:underline">
            Voice library
          </Link>
          . Gaze tracking is tuned on the patient device — see{' '}
          <Link href="/dashboard/calibration" className="font-bold text-brand-deep hover:underline">
            Calibration
          </Link>
          .
        </p>
      </section>
    </main>
  )
}
