'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from '@/lib/auth-client'
import { Button } from '@glance/shared/design/components'
import { MessageBubble } from '@glance/shared/design/components'
import type { Message } from '@glance/shared/types'
import type { ServerToClientMessage } from '@glance/shared/ws'
import { useDashboard } from '@/components/DashboardProvider'
import { VoiceRecorder } from '@/components/VoiceRecorder'

interface CameraScheduleItem {
  id?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  timezone: string
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function PatientDashboardPage() {
  const params = useParams<{ id: string }>()
  const patientId = params.id
  const { data: session } = useSession()
  const { socket, patients, updatePatientName } = useDashboard()

  const patient = patients.find((p) => p.id === patientId) ?? null

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
  const [showSettings, setShowSettings] = useState(false)

  // Camera config
  const [schedules, setSchedules] = useState<CameraScheduleItem[]>([])
  const [cameraOverride, setCameraOverride] = useState(false)
  const [savingCamera, setSavingCamera] = useState(false)

  // Patient name editor
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)

  // ── Fetch messages for this patient
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages?patientId=${patientId}`)
      if (res.ok) {
        const data = (await res.json()) as Message[]
        setMessages(data)
      }
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false)
    }
  }, [patientId])

  // ── Fetch family member profile (voice settings)
  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/family-member/me')
      if (res.ok) {
        const data = (await res.json()) as { elevenlabsVoiceId: string | null }
        setVoiceId(data.elevenlabsVoiceId ?? '')
      }
    } catch {
      // ignore
    }
  }, [])

  // ── Fetch camera config for this patient
  const fetchCameraConfig = useCallback(async () => {
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
  }, [patientId])

  // ── Initial / per-patient data load
  useEffect(() => {
    setLoadingMessages(true)
    void fetchMessages()
    void fetchProfile()
    void fetchCameraConfig()
  }, [fetchMessages, fetchProfile, fetchCameraConfig])

  // ── Subscribe to the shared socket for THIS patient's live updates.
  useEffect(() => {
    if (!socket) return

    const onNewMessage = (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'NEW_MESSAGE') return
      const msg = envelope.payload
      if (msg.senderPatientId !== patientId && msg.recipientId !== patientId) return
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]))
    }

    const onNewReply = (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'NEW_REPLY') return
      const { messageId, reply, repliedAt } = envelope.payload
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reply, repliedAt: new Date(repliedAt) } : m)),
      )
    }

    socket.on('NEW_MESSAGE', onNewMessage)
    socket.on('NEW_REPLY', onNewReply)

    return () => {
      socket.off('NEW_MESSAGE', onNewMessage)
      socket.off('NEW_REPLY', onNewReply)
    }
  }, [socket, patientId])

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
        body: JSON.stringify({ content: content.trim(), recipientId: patientId, isYesNo }),
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
      await fetch(`/api/patients/${patientId}/camera-config`, {
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

  // ── Save patient name
  function startEditName() {
    setNameDraft(patient?.name ?? '')
    setEditingName(true)
  }

  async function handleSaveName() {
    const next = nameDraft.trim()
    if (!next || next === patient?.name) {
      setEditingName(false)
      return
    }
    setSavingName(true)
    try {
      const res = await fetch(`/api/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      })
      if (res.ok) {
        updatePatientName(patientId, next)
        setEditingName(false)
      }
    } catch {
      // ignore
    } finally {
      setSavingName(false)
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

  return (
    <main className="flex-1 bg-[#F4EEE6] p-[30px] px-[34px] min-h-screen overflow-y-auto">
      {/* Back Link Breadcrumb */}
      <div className="flex items-center gap-2 text-[15px] font-bold text-ink-faint mb-3">
        <Link href="/dashboard" className="hover:text-ink-muted transition-colors">
          Patients
        </Link>
        <span>·</span>
        <span className="text-ink-muted">{patient?.name ?? 'Detail'}</span>
      </div>

      <header className="flex items-center justify-between mb-6">
        <div className="min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={100}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveName()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                className="rounded-[14px] border border-line-warm px-3 py-2 text-xl font-bold transition-all focus:bg-surface-warm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <Button onClick={handleSaveName} disabled={savingName}>
                {savingName ? 'Saving…' : 'Save'}
              </Button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="text-sm text-ink-faint hover:text-ink-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="truncate font-serif text-[34px] font-semibold tracking-tight text-ink">
                {patient?.name ?? 'Patient'}
              </h1>
              <button
                type="button"
                onClick={startEditName}
                aria-label="Edit patient name"
                className="text-ink-faint hover:text-ink-muted text-lg transition-transform hover:scale-110"
              >
                ✎
              </button>
            </div>
          )}
        </div>
        <Button variant="ghost" onClick={() => setShowSettings(s => !s)}>
          Settings
        </Button>
      </header>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Compose & Settings */}
        <div className="flex flex-col gap-6">
          {/* Settings Panel */}
          {showSettings && (
            <section className="flex flex-col gap-5 rounded-[22px] border border-line bg-white p-6 shadow-soft">
              <h2 className="font-serif text-xl font-semibold text-ink">Profile & Settings</h2>

              {/* Your voice — in-app cloning */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-ink-muted">Your voice</label>
                <VoiceRecorder onCloned={(id) => setVoiceId(id)} />

                {/* Advanced: paste an existing ElevenLabs voice ID directly. */}
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink-muted">
                    Advanced: use an existing ElevenLabs voice ID
                  </summary>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={voiceId}
                      onChange={e => setVoiceId(e.target.value)}
                      placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                      className="flex-1 rounded-[14px] border border-line-warm px-4 py-3 text-sm transition-all focus:bg-surface-warm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    />
                    <Button onClick={handleSaveVoice} disabled={voiceSaving}>
                      {voiceSaved ? 'Saved!' : voiceSaving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </details>
              </div>

              {/* Camera Config */}
              {patient && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-ink-muted">Camera Schedule</label>
                    <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cameraOverride}
                        onChange={e => setCameraOverride(e.target.checked)}
                        className="rounded text-brand-primary focus:ring-brand-primary"
                      />
                      Manual override (always on)
                    </label>
                  </div>
                  {schedules.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-[12px] bg-surface-warm p-3">
                      <select
                        value={s.dayOfWeek}
                        onChange={e => setSchedules(prev => prev.map((sc, idx) => idx === i ? { ...sc, dayOfWeek: Number(e.target.value) } : sc))}
                        className="rounded-[10px] border border-line-warm px-3 py-1.5 text-sm transition-all focus:ring-2 focus:ring-brand-primary"
                      >
                        {DAY_NAMES.map((d, di) => <option key={d} value={di}>{d}</option>)}
                      </select>
                      <input
                        type="time"
                        value={s.startTime}
                        onChange={e => setSchedules(prev => prev.map((sc, idx) => idx === i ? { ...sc, startTime: e.target.value } : sc))}
                        className="rounded-[10px] border border-line-warm px-3 py-1.5 text-sm transition-all focus:ring-2 focus:ring-brand-primary"
                      />
                      <span className="text-sm text-ink-muted">–</span>
                      <input
                        type="time"
                        value={s.endTime}
                        onChange={e => setSchedules(prev => prev.map((sc, idx) => idx === i ? { ...sc, endTime: e.target.value } : sc))}
                        className="rounded-[10px] border border-line-warm px-3 py-1.5 text-sm transition-all focus:ring-2 focus:ring-brand-primary"
                      />
                      <input
                        type="text"
                        value={s.timezone}
                        placeholder="Timezone (IANA)"
                        onChange={e => setSchedules(prev => prev.map((sc, idx) => idx === i ? { ...sc, timezone: e.target.value } : sc))}
                        className="w-44 rounded-[10px] border border-line-warm px-3 py-1.5 text-sm transition-all focus:ring-2 focus:ring-brand-primary"
                      />
                      <button type="button" onClick={() => removeSchedule(i)} className="text-sm text-error hover:underline">
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button type="button" onClick={addSchedule} className="text-sm text-brand-deep hover:underline">
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

          {/* Compose Form */}
          <section aria-label="Compose message">
            <form onSubmit={handleSend} className="flex flex-col gap-4 rounded-[22px] border border-line bg-white p-6 shadow-soft">
              <label htmlFor="message-content" className="section-label">
                Send a message
              </label>
              <textarea
                id="message-content"
                value={content}
                onChange={e => setContent(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="Type your message…"
                className="w-full resize-none rounded-[14px] border border-line-warm px-4 py-3 text-base transition-all focus:border-transparent focus:bg-surface-warm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <label className="flex items-center gap-2 text-sm text-ink-muted select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={isYesNo}
                  onChange={e => setIsYesNo(e.target.checked)}
                  className="rounded text-brand-primary focus:ring-brand-primary"
                />
                Ask as a Yes/No question
              </label>
              {sendError && (
                <p role="alert" className="text-sm text-error">
                  {sendError}
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-faint">{content.length}/1000</span>
                <Button type="submit" disabled={sending || !content.trim()}>
                  {sending ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </form>
          </section>
        </div>

        {/* Right Column: Message History */}
        <section aria-label="Message history" className="max-h-[calc(100vh-180px)] overflow-y-auto bg-white rounded-[22px] border border-line p-6 shadow-soft flex flex-col">
          <h2 className="mb-4 font-serif text-2xl font-semibold text-ink">Message history</h2>
          {loadingMessages ? (
            <p className="text-sm text-ink-faint">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-ink-faint">No messages yet. Send one on the left.</p>
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
      </div>
    </main>
  )
}
