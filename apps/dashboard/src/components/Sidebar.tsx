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
  const { patients } = useDashboard()

  // Determine active states
  const isPatientsActive = pathname === '/dashboard' || pathname.startsWith('/patients')
  const isVoiceLibraryActive = pathname === '/dashboard/voice-library'
  const isCalibrationActive = pathname === '/dashboard/calibration'
  const isSettingsActive = pathname === '/dashboard/settings'

  const navItemClass = (active: boolean) =>
    `flex items-center gap-3 rounded-[14px] px-3.5 py-3 text-[16px] font-bold transition-colors ${
      active ? 'bg-brand-soft text-brand-deep' : 'text-ink-muted hover:bg-surface-warm'
    }`

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
    <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col self-start overflow-y-auto border-r border-line bg-white px-[18px] py-[26px]">
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

        {/* Voice Library Nav Item */}
        <Link href="/dashboard/voice-library" className={navItemClass(isVoiceLibraryActive)}>
          <span className="text-xl">🎙️</span>
          <span>Voice library</span>
        </Link>

        {/* Navigation Group: System */}
        <div className="px-3 pt-6 pb-2.5">
          <span className="section-label">System</span>
        </div>

        {/* Calibration Nav Item */}
        <Link href="/dashboard/calibration" className={navItemClass(isCalibrationActive)}>
          <span className="text-xl">🎯</span>
          <span>Calibration</span>
        </Link>

        {/* Settings Nav Item */}
        <Link href="/dashboard/settings" className={navItemClass(isSettingsActive)}>
          <span className="text-xl">⚙️</span>
          <span>Settings</span>
        </Link>
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
