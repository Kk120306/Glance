'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, useSession } from '@/lib/auth-client'
import { GlanceMark } from '@glance/shared/design/components'
import { useDashboard } from './DashboardProvider'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { patients, onlineStatus, refreshPatients } = useDashboard()

  // Determine active states
  const isPatientsActive = pathname === '/dashboard' || pathname.startsWith('/patients')
  const isVoiceLibraryActive = pathname === '/dashboard/voice-library'
  const isSettingsActive = pathname === '/dashboard/settings'

  // Check if any patient has active SOS to show alerts dot
  // Note: we can also detect if there is any active alarm/SOS in DashboardProvider
  // For the sake of the design, we can show the dot if onlineStatus has an alert or similar,
  // or simply check if any patient is in an SOS state. (We'll wire it up dynamically)
  const hasActiveSOS = false // will check if DashboardProvider surfaces active SOS IDs

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  /** Get a two-letter initial from the user's name or email. */
  const userInitials = (() => {
    const name = session?.user?.name ?? session?.user?.email ?? ''
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  })()

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-line bg-white px-[18px] py-[26px]">
      {/* Brand Logo */}
      <div className="flex items-center gap-3 px-2 pb-7">
        <GlanceMark size={40} />
        <span className="font-serif text-[26px] font-semibold text-ink">Glance</span>
      </div>

      {/* Navigation Group: Care */}
      <div className="px-3 pb-2.5">
        <span className="section-label">Care</span>
      </div>

      <nav className="flex flex-col gap-1">
        {/* Patients Nav Item */}
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 rounded-[14px] px-3.5 py-3 text-[16px] font-bold transition-colors ${
            isPatientsActive
              ? 'bg-brand-soft text-brand-deep'
              : 'text-ink-muted hover:bg-surface-warm'
          }`}
        >
          <span className="text-xl">👥</span>
          <span>Patients</span>
          {patients.length > 0 && (
            <span className="ml-auto rounded-full bg-brand-primary px-2.5 py-0.5 text-[13px] font-bold text-white">
              {patients.length}
            </span>
          )}
        </Link>

        {/* Alerts Nav Item (Non-functional, coming soon, but dynamically shows SOS dot) */}
        <button
          type="button"
          onClick={() => alert('Alerts history coming soon.')}
          className="flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left text-[16px] font-bold text-ink-muted transition-colors hover:bg-surface-warm"
        >
          <span className="text-xl">🔔</span>
          <span>Alerts</span>
          {hasActiveSOS && (
            <span className="ml-auto h-2.5 w-2.5 animate-[pulseDot_1.2s_ease-in-out_infinite] rounded-full bg-error" />
          )}
        </button>

        {/* Messages Nav Item */}
        <button
          type="button"
          onClick={() => alert('Message center coming soon.')}
          className="flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left text-[16px] font-bold text-ink-muted transition-colors hover:bg-surface-warm"
        >
          <span className="text-xl">💬</span>
          <span>Messages</span>
        </button>

        {/* Voice Library Nav Item */}
        <button
          type="button"
          onClick={() => alert('Voice library dashboard coming soon. Edit patient voice inside Patient Settings.')}
          className="flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left text-[16px] font-bold text-ink-muted transition-colors hover:bg-surface-warm"
        >
          <span className="text-xl">🎙️</span>
          <span>Voice library</span>
        </button>

        {/* Navigation Group: System */}
        <div className="px-3 pt-6 pb-2.5">
          <span className="section-label">System</span>
        </div>

        {/* Calibration Nav Item */}
        <button
          type="button"
          onClick={() => alert('Calibration tools coming soon.')}
          className="flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left text-[16px] font-bold text-ink-muted transition-colors hover:bg-surface-warm"
        >
          <span className="text-xl">🎯</span>
          <span>Calibration</span>
        </button>

        {/* Settings Nav Item */}
        <button
          type="button"
          onClick={() => alert('Global settings coming soon.')}
          className="flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left text-[16px] font-bold text-ink-muted transition-colors hover:bg-surface-warm"
        >
          <span className="text-xl">⚙️</span>
          <span>Settings</span>
        </button>
      </nav>

      {/* User profile card at bottom */}
      <div className="mt-auto flex items-center gap-3 rounded-[16px] bg-surface-warm p-3">
        <div
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #5FC9BD, #0E9384)' }}
        >
          {userInitials}
        </div>
        <div className="min-w-0 flex-1">
          {session?.user && (
            <p className="truncate text-[15px] font-bold text-ink" title={session.user.email}>
              {session.user.name ?? session.user.email}
            </p>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[13px] font-bold text-ink-faint hover:text-ink-muted"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}
