'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { io, type Socket } from 'socket.io-client'
import { signOut, useSession } from '@/lib/auth-client'
import { Button } from '@glance/shared/design/components'
import { MessageBubble } from '@glance/shared/design/components'
import type { Message } from '@glance/shared/types'
import type { ServerToClientMessage } from '@glance/shared/ws'

interface Patient {
  id: string
  cameraOverrideActive: boolean
}

interface CameraScheduleItem {
  id?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  timezone: string
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WS_SERVER_URL = process.env.NEXT_PUBLIC_WS_SERVER_URL ?? 'http://localhost:4000'

// Discrete double-chime to alert the caregiver to a patient-initiated request.
function playDoubleChime() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return
  try {
    const ctx = new AudioContext()
    const beep = (startOffset: number, freq: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = ctx.currentTime + startOffset
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.2)
    }
    beep(0, 880)
    beep(0.22, 1175)
    setTimeout(() => ctx.close().catch(() => {}), 800)
  } catch {
    // ignore audio errors
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const { data: session } = useSession()

  // Compose form
  const [content, setContent] = useState('')
  const [isYesNo, setIsYesNo] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Messages
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)

  // Profile settings
  const [voiceId, setVoiceId] = useState('')
  const [voiceSaving, setVoiceSaving] = useState(false)
  const [voiceSaved, setVoiceSaved] = useState(false)
  const [familyMemberId, setFamilyMemberId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // Camera config
  const [patient, setPatient] = useState<Patient | null>(null)
  const [schedules, setSchedules] = useState<CameraScheduleItem[]>([])
  const [cameraOverride, setCameraOverride] = useState(false)
  const [savingCamera, setSavingCamera] = useState(false)

  // SOS alert
  const [sosAlert, setSosAlert] = useState(false)
  const [sosTimestamp, setSosTimestamp] = useState<string | null>(null)

  // Patient-initiated phrase alert (toast)
  const [patientAlert, setPatientAlert] = useState<string | null>(null)

  const socketRef = useRef<Socket | null>(null)

  // ── Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/messages')
      if (res.ok) {
        const data = (await res.json()) as Message[]
        setMessages(data)
      }
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  // ── Fetch family member profile
  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/family-member/me')
      if (res.ok) {
        const data = (await res.json()) as { id: string; elevenlabsVoiceId: string | null }
        setFamilyMemberId(data.id)
        setVoiceId(data.elevenlabsVoiceId ?? '')
      }
    } catch {
      // ignore
    }
  }, [])

  // ── Fetch patient + camera config
  const fetchCameraConfig = useCallback(async (patientId: string) => {
    try {
      const res = await fetch(`/api/patients/${patientId}/camera-config`)
      if (res.ok) {
        const data = (await res.json()) as { cameraOverrideActive: boolean; schedules: CameraScheduleItem[] }
        setCameraOverride(data.cameraOverrideActive)
        setSchedules(data.schedules)
      }
    } catch {
      // ignore
    }
  }, [])

  const fetchPatient = useCallback(async () => {
    try {
      const res = await fetch('/api/patients')
      if (res.ok) {
        const data = (await res.json()) as Patient[]
        if (data[0]) {
          setPatient(data[0])
          await fetchCameraConfig(data[0].id)
        }
      }
    } catch {
      // ignore
    }
  }, [fetchCameraConfig])

  // ── Initial data load
  useEffect(() => {
    void fetchMessages()
    void fetchProfile()
    void fetchPatient()
  }, [fetchMessages, fetchProfile, fetchPatient])

  // ── WebSocket as caregiver
  useEffect(() => {
    if (!familyMemberId) return

    const socket = io(WS_SERVER_URL, {
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
    })
    socketRef.current = socket

    const register = () => {
      socket.emit('message', JSON.stringify({ type: 'REGISTER', role: 'caregiver', familyMemberId }))
    }

    socket.on('connect', register)
    socket.on('reconnect', register)

    socket.on('NEW_MESSAGE', (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'NEW_MESSAGE') return
      const msg = envelope.payload
      // Only patient-initiated phrases concern the caregiver here; family-sent
      // messages already appear via the compose flow's optimistic refetch.
      if (!msg.senderPatientId) return
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]))
      setPatientAlert(msg.content)
      playDoubleChime()
    })

    socket.on('NEW_REPLY', (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'NEW_REPLY') return
      const { messageId, reply, repliedAt } = envelope.payload
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, reply, repliedAt: new Date(repliedAt) } : m)),
      )
    })

    socket.on('SOS_TRIGGERED', (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'SOS_TRIGGERED') return
      setSosTimestamp(envelope.payload.timestamp)
      setSosAlert(true)
      // Audible alarm via Web Audio
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        try {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.frequency.value = 880
          gain.gain.value = 0.6
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start()
          osc.stop(ctx.currentTime + 2)
          setTimeout(() => ctx.close().catch(() => {}), 3000)
        } catch {
          // ignore audio errors
        }
      }
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [familyMemberId])

  // ── Send message
  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSendError(null)
    setSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), isYesNo }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error: unknown }
        setSendError(typeof data.error === 'string' ? data.error : 'Failed to send')
      } else {
        setContent('')
        setIsYesNo(false)
        await fetchMessages()
      }
    } catch {
      setSendError('Network error — please try again')
    } finally {
      setSending(false)
    }
  }

  // ── Save voice ID
  async function handleSaveVoice() {
    setVoiceSaving(true)
    try {
      await fetch('/api/family-member/me/voice', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elevenlabsVoiceId: voiceId || null }),
      })
      setVoiceSaved(true)
      setTimeout(() => setVoiceSaved(false), 2000)
    } catch {
      // ignore
    } finally {
      setVoiceSaving(false)
    }
  }

  // ── Save camera config
  async function handleSaveCameraConfig() {
    if (!patient) return
    setSavingCamera(true)
    try {
      await fetch(`/api/patients/${patient.id}/camera-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraOverrideActive: cameraOverride, schedules }),
      })
    } catch {
      // ignore
    } finally {
      setSavingCamera(false)
    }
  }

  function addSchedule() {
    setSchedules(prev => [
      ...prev,
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', timezone: 'America/New_York' },
    ])
  }

  function removeSchedule(idx: number) {
    setSchedules(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col p-6 gap-6">
      {/* Patient request toast — dismissible, corner */}
      {patientAlert && (
        <div
          role="alert"
          className="fixed top-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-2xl"
        >
          <span className="text-2xl" aria-hidden>
            🔔
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wide text-amber-700">
              Patient request
            </span>
            <span className="text-base font-semibold text-neutral-900">{patientAlert}</span>
          </div>
          <button
            type="button"
            onClick={() => setPatientAlert(null)}
            aria-label="Dismiss patient request"
            className="ml-2 text-neutral-400 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* SOS Alert */}
      {sosAlert && (
        <div
          role="alert"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-600 bg-opacity-95"
        >
          <p className="text-6xl font-black text-white mb-4">⚠ SOS ALERT</p>
          {sosTimestamp && (
            <p className="text-white text-lg mb-8">
              Triggered at {new Date(sosTimestamp).toLocaleTimeString()}
            </p>
          )}
          <button
            type="button"
            onClick={() => setSosAlert(false)}
            className="rounded-xl bg-white px-8 py-4 text-xl font-bold text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Glance</h1>
        <div className="flex items-center gap-4">
          {session?.user && (
            <span className="text-sm text-neutral-500">{session.user.email}</span>
          )}
          <Button variant="ghost" onClick={() => setShowSettings(s => !s)}>
            Settings
          </Button>
          <Button variant="ghost" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="text-base font-semibold text-neutral-800">Profile & Settings</h2>

          {/* Voice ID */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700">
              ElevenLabs Voice ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={voiceId}
                onChange={e => setVoiceId(e.target.value)}
                placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button onClick={handleSaveVoice} disabled={voiceSaving}>
                {voiceSaved ? 'Saved!' : voiceSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>

          {/* Camera Config */}
          {patient && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-neutral-700">Camera Schedule</label>
                <label className="flex items-center gap-2 text-sm text-neutral-600">
                  <input
                    type="checkbox"
                    checked={cameraOverride}
                    onChange={e => setCameraOverride(e.target.checked)}
                  />
                  Manual override (always on)
                </label>
              </div>
              {schedules.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded bg-neutral-50 p-2">
                  <select
                    value={s.dayOfWeek}
                    onChange={e => setSchedules(prev => prev.map((sc, idx) => idx === i ? { ...sc, dayOfWeek: Number(e.target.value) } : sc))}
                    className="rounded border border-neutral-300 px-2 py-1 text-sm"
                  >
                    {DAY_NAMES.map((d, di) => <option key={d} value={di}>{d}</option>)}
                  </select>
                  <input
                    type="time"
                    value={s.startTime}
                    onChange={e => setSchedules(prev => prev.map((sc, idx) => idx === i ? { ...sc, startTime: e.target.value } : sc))}
                    className="rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                  <span className="text-sm text-neutral-500">–</span>
                  <input
                    type="time"
                    value={s.endTime}
                    onChange={e => setSchedules(prev => prev.map((sc, idx) => idx === i ? { ...sc, endTime: e.target.value } : sc))}
                    className="rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                  <input
                    type="text"
                    value={s.timezone}
                    placeholder="Timezone (IANA)"
                    onChange={e => setSchedules(prev => prev.map((sc, idx) => idx === i ? { ...sc, timezone: e.target.value } : sc))}
                    className="rounded border border-neutral-300 px-2 py-1 text-sm w-44"
                  />
                  <button type="button" onClick={() => removeSchedule(i)} className="text-sm text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={addSchedule} className="text-sm text-blue-600 hover:underline">
                  + Add schedule
                </button>
                <Button onClick={handleSaveCameraConfig} disabled={savingCamera}>
                  {savingCamera ? 'Saving…' : 'Save Camera Config'}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Compose */}
      <section aria-label="Compose message">
        <form onSubmit={handleSend} className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <label htmlFor="message-content" className="text-sm font-medium text-neutral-700">
            Send a message
          </label>
          <textarea
            id="message-content"
            value={content}
            onChange={e => setContent(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Type your message…"
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-600 select-none">
            <input
              type="checkbox"
              checked={isYesNo}
              onChange={e => setIsYesNo(e.target.checked)}
            />
            Ask as a Yes/No question
          </label>
          {sendError && (
            <p role="alert" className="text-sm text-error">
              {sendError}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">{content.length}/1000</span>
            <Button type="submit" disabled={sending || !content.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </form>
      </section>

      {/* Message history */}
      <section aria-label="Message history">
        <h2 className="mb-3 text-lg font-semibold text-neutral-700">Message history</h2>
        {loadingMessages ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-neutral-400">No messages yet. Send one above.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map(msg => (
              <li key={msg.id}>
                <MessageBubble
                  senderName={
                    msg.senderPatientId
                      ? 'Patient'
                      : (session?.user?.name ?? session?.user?.email ?? 'You')
                  }
                  content={msg.content}
                  timestamp={msg.createdAt}
                  isYesNo={msg.isYesNo}
                  reply={msg.reply}
                  repliedAt={msg.repliedAt}
                  fromPatient={!!msg.senderPatientId}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
