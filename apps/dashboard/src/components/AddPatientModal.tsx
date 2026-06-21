'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@glance/shared/design/components'

const PATIENT_APP_URL = process.env.NEXT_PUBLIC_PATIENT_APP_URL ?? 'http://localhost:3000'

interface RegisteredPatient {
  id: string
  name: string
  deviceToken: string
}

type Tab = 'register' | 'link'

interface AddPatientModalProps {
  open: boolean
  onClose: () => void
  /** Which tab to show when the modal opens. Defaults to 'register'. */
  initialTab?: Tab
  /** Called after a patient is registered or linked so callers can refresh state. */
  onAdded?: (patientId: string) => void | Promise<void>
}

export function AddPatientModal({ open, onClose, initialTab = 'register', onAdded }: AddPatientModalProps) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)

  // Apply the requested tab each time the modal is (re)opened.
  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  const [name, setName] = useState('')
  const [deviceToken, setDeviceToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // After a successful registration we show the device token + setup link.
  const [registered, setRegistered] = useState<RegisteredPatient | null>(null)

  if (!open) return null

  function reset() {
    setName('')
    setDeviceToken('')
    setError(null)
    setRegistered(null)
    setSubmitting(false)
    setTab('register')
  }

  function close() {
    reset()
    onClose()
  }

  async function goToPatient(id: string) {
    await onAdded?.(id)
    reset()
    onClose()
    router.push(`/patients/${id}`)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/patients/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = (await res.json().catch(() => null)) as RegisteredPatient | { error: unknown } | null
      if (!res.ok || !data || !('id' in data)) {
        setError('Could not register patient. Please try again.')
        return
      }
      setRegistered(data)
      await onAdded?.(data.id)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault()
    if (!deviceToken.trim()) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/patients/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceToken: deviceToken.trim() }),
      })
      const data = (await res.json().catch(() => null)) as RegisteredPatient | { error: unknown } | null
      if (!res.ok || !data || !('id' in data)) {
        const msg =
          res.status === 404
            ? 'No patient found with that device token.'
            : res.status === 409
              ? 'You are already linked to this patient.'
              : 'Could not link device. Check the token and try again.'
        setError(msg)
        return
      }
      await goToPatient(data.id)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const setupLink = registered ? `${PATIENT_APP_URL}/?token=${registered.deviceToken}` : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add a patient"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-[22px] bg-white p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {registered ? (
          // ── Post-registration: show device token + setup link
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold text-ink">{registered.name} is ready</h2>
            <p className="text-sm text-ink-muted">
              Open this link on the patient&apos;s device to pair it, or enter the device token
              manually. Keep the token safe — it authenticates the device.
            </p>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Device token
              </span>
              <code className="break-all rounded-md bg-surface-warm px-3 py-2 text-sm text-ink">
                {registered.deviceToken}
              </code>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Setup link
              </span>
              <a
                href={setupLink}
                target="_blank"
                rel="noreferrer"
                className="break-all rounded-md bg-brand-soft px-3 py-2 text-sm text-brand-deep hover:underline"
              >
                {setupLink}
              </a>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(registered.deviceToken).catch(() => {})}
                className="rounded-lg border border-line-warm px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-warm"
              >
                Copy token
              </button>
              <Button onClick={() => goToPatient(registered.id)}>Go to dashboard</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-ink">Add a patient</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="text-ink-faint hover:text-ink-muted"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex rounded-[14px] bg-surface-warm p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => {
                  setTab('register')
                  setError(null)
                }}
                className={`flex-1 rounded-[10px] px-3 py-2 transition-all ${
                  tab === 'register' ? 'bg-white text-ink shadow-soft' : 'text-ink-muted'
                }`}
              >
                Register new
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('link')
                  setError(null)
                }}
                className={`flex-1 rounded-[10px] px-3 py-2 transition-all ${
                  tab === 'link' ? 'bg-white text-ink shadow-soft' : 'text-ink-muted'
                }`}
              >
                Link existing
              </button>
            </div>

            {tab === 'register' ? (
              <form onSubmit={handleRegister} className="flex flex-col gap-3">
                <label className="text-sm font-medium text-ink-muted" htmlFor="patient-name">
                  Patient name
                </label>
                <input
                  id="patient-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder="e.g. Grandpa"
                  className="rounded-[14px] border border-line-warm px-4 py-3 text-sm transition-all focus:bg-surface-warm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
                {error && <p role="alert" className="text-sm text-error">{error}</p>}
                <div className="flex justify-end">
                  <Button type="submit" disabled={submitting || !name.trim()}>
                    {submitting ? 'Creating…' : 'Create patient'}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleLink} className="flex flex-col gap-3">
                <label className="text-sm font-medium text-ink-muted" htmlFor="device-token">
                  Device token
                </label>
                <input
                  id="device-token"
                  type="text"
                  value={deviceToken}
                  onChange={(e) => setDeviceToken(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="rounded-[14px] border border-line-warm px-4 py-3 text-sm transition-all focus:bg-surface-warm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
                {error && <p role="alert" className="text-sm text-error">{error}</p>}
                <div className="flex justify-end">
                  <Button type="submit" disabled={submitting || !deviceToken.trim()}>
                    {submitting ? 'Linking…' : 'Link device'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
