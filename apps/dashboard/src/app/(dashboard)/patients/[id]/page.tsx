'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from '@/lib/auth-client'
import { Button } from '@glance/shared/design/components'
import { MessageBubble } from '@glance/shared/design/components'
import type { Message } from '@glance/shared/types'
import type { ServerToClientMessage } from '@glance/shared/ws'
import { useDashboard } from '@/components/DashboardProvider'
import { patientAppUrl } from '@/lib/patient-app'

interface CameraScheduleItem {
  id?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  timezone: string
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A thread message with the joined sender + persona display names from GET /api/messages. */
type ThreadMessage = Message & { senderName?: string | null; personaName?: string | null }

interface Persona {
  id: string
  name: string
  elevenlabsVoiceId: string | null
  hasVoice: boolean
}

/** Rail selection: everyone, the account ("you"), or a specific persona id. */
type Selection = 'all' | 'you' | string

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
  // Optional media attachment. The caregiver picks a file; it uploads to
  // /api/messages/upload, which returns the URL we attach to the message.
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Messages
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)

  // Personas + which identity the rail has selected (drives thread filter + send-as).
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selected, setSelected] = useState<Selection>('all')

  // Settings drawer (camera config)
  const [showSettings, setShowSettings] = useState(false)
  const [schedules, setSchedules] = useState<CameraScheduleItem[]>([])
  const [cameraOverride, setCameraOverride] = useState(false)
  const [savingCamera, setSavingCamera] = useState(false)

  // Patient name editor
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)

  const threadEndRef = useRef<HTMLDivElement | null>(null)

  // ── Fetch messages for this patient
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages?patientId=${patientId}`)
      if (res.ok) {
        const data = (await res.json()) as ThreadMessage[]
        setMessages(data)
      }
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false)
    }
  }, [patientId])

  // ── Fetch this account's personas (the people you can message as)
  const fetchPersonas = useCallback(async () => {
    try {
      const res = await fetch('/api/personas')
      if (res.ok) setPersonas((await res.json()) as Persona[])
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
    void fetchPersonas()
    void fetchCameraConfig()
  }, [fetchMessages, fetchPersonas, fetchCameraConfig])

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

    // The patient's device confirmed it displayed a family message → flip the
    // thread's "Sent" to "Seen ✓" in real time.
    const onMessageRead = (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'MESSAGE_READ') return
      const { id } = envelope.payload
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)))
    }

    socket.on('NEW_MESSAGE', onNewMessage)
    socket.on('NEW_REPLY', onNewReply)
    socket.on('MESSAGE_READ', onMessageRead)

    return () => {
      socket.off('NEW_MESSAGE', onNewMessage)
      socket.off('NEW_REPLY', onNewReply)
      socket.off('MESSAGE_READ', onMessageRead)
    }
  }, [socket, patientId])

  // The persona currently selected (null for Everyone/You), and the id we send as.
  const selectedPersona = personas.find((p) => p.id === selected) ?? null
  const sendAsPersonaId = selectedPersona?.id

  // Resolve a persona name for socket-delivered messages that lack the join.
  const personaNameById = useCallback(
    (id: string | null | undefined) => (id ? personas.find((p) => p.id === id)?.name : undefined),
    [personas],
  )

  // ── Upload a chosen photo/video, then hold its URL for the next send.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploadingMedia(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/messages/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setUploadError(data?.error ?? 'Upload failed')
        clearAttachment()
        return
      }
      const data = (await res.json()) as { url: string; mediaType: 'image' | 'video' }
      setMediaUrl(data.url)
      setMediaType(data.mediaType)
    } catch {
      setUploadError('Upload failed — please try again')
      clearAttachment()
    } finally {
      setUploadingMedia(false)
    }
  }

  // Drop the pending attachment and reset the picker so the same file can be re-chosen.
  function clearAttachment() {
    setMediaUrl('')
    setMediaType('image')
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Send message (as the selected persona, or as the account)
  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSendError(null)
    setSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          recipientId: patientId,
          isYesNo,
          ...(sendAsPersonaId ? { personaId: sendAsPersonaId } : {}),
          ...(mediaUrl.trim() ? { mediaUrl: mediaUrl.trim(), mediaType } : {}),
        }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error: unknown }
        setSendError(typeof data.error === 'string' ? data.error : 'Failed to send')
      } else {
        setContent('')
        setIsYesNo(false)
        clearAttachment()
        await fetchMessages()
      }
    } catch {
      setSendError('Network error — please try again')
    } finally {
      setSending(false)
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
    setSchedules((prev) => [
      ...prev,
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', timezone: 'America/New_York' },
    ])
  }

  function removeSchedule(idx: number) {
    setSchedules((prev) => prev.filter((_, i) => i !== idx))
  }

  // Messages visible for the current selection. The patient's own messages appear
  // in every thread (their side of every conversation); a persona thread adds that
  // persona's messages, the "You" thread adds the account's own direct messages.
  const visibleMessages = useMemo(() => {
    const filtered = messages.filter((m) => {
      if (selected === 'all') return true
      if (m.senderPatientId) return true
      if (selected === 'you') return !m.personaId
      return m.personaId === selected
    })
    // Fetched newest-first; render oldest→newest for a chat feel.
    return [...filtered].reverse()
  }, [messages, selected])

  // Auto-scroll to the newest message when the thread changes.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [visibleMessages])

  // Label for the "Sending as" chip + thread header.
  const sendingAsLabel = selectedPersona
    ? selectedPersona.name
    : session?.user?.name ?? session?.user?.email?.split('@')[0] ?? 'You'

  const accountInitials = (session?.user?.name ?? session?.user?.email ?? 'You').slice(0, 2).toUpperCase()

  return (
    <main className="flex h-screen overflow-hidden bg-[#F4EEE6]">
      {/* ── Persona rail (who you're messaging as) ── */}
      <aside className="flex w-[270px] shrink-0 flex-col border-r border-line bg-white">
        <div className="border-b border-line px-5 py-4">
          <Link href="/dashboard" className="text-[13px] font-bold text-ink-faint hover:text-ink-muted">
            ‹ All patients
          </Link>
          <div className="mt-2 flex items-center gap-2">
            {editingName ? (
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
                onBlur={() => void handleSaveName()}
                className="w-full rounded-[12px] border border-line-warm px-3 py-1.5 text-lg font-bold focus:bg-surface-warm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            ) : (
              <>
                <h1 className="truncate font-serif text-[24px] font-semibold tracking-tight text-ink">
                  {patient?.name ?? 'Patient'}
                </h1>
                <button
                  type="button"
                  onClick={startEditName}
                  aria-label="Edit patient name"
                  className="text-ink-faint transition-transform hover:scale-110 hover:text-ink-muted"
                >
                  ✎
                </button>
              </>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            {patient?.deviceToken && (
              <a
                href={patientAppUrl(patient.deviceToken)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open this patient's screen in a new tab"
                className="inline-flex items-center gap-1 rounded-[10px] border border-line px-2.5 py-1 text-[12px] font-bold text-ink-muted transition-colors hover:bg-surface-warm hover:text-brand-deep"
              >
                ↗ View screen
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="rounded-[10px] border border-line px-2.5 py-1 text-[12px] font-bold text-ink-muted transition-colors hover:bg-surface-warm"
            >
              ⚙ Settings
            </button>
          </div>
        </div>

        <div className="px-4 pt-3 pb-1">
          <span className="section-label">Messaging as</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <RailItem
            active={selected === 'all'}
            onClick={() => setSelected('all')}
            avatar="∗"
            avatarBg="linear-gradient(135deg,#C9B6FF,#A98CF7)"
            title="Everyone"
            subtitle="All messages"
          />
          <RailItem
            active={selected === 'you'}
            onClick={() => setSelected('you')}
            avatar={accountInitials}
            avatarBg="linear-gradient(135deg,#5FC9BD,#0E9384)"
            title={session?.user?.name ?? 'You'}
            subtitle="Your account"
          />

          <div className="px-2 pt-4 pb-1.5">
            <span className="section-label">People</span>
          </div>
          {personas.length === 0 ? (
            <p className="px-2 text-[13px] text-ink-faint">
              No people yet.{' '}
              <Link href="/dashboard/voice-library" className="font-bold text-brand-deep hover:underline">
                Add Mom, Dad…
              </Link>
            </p>
          ) : (
            personas.map((p) => (
              <RailItem
                key={p.id}
                active={selected === p.id}
                onClick={() => setSelected(p.id)}
                avatar={p.name.slice(0, 2).toUpperCase()}
                avatarBg="linear-gradient(135deg,#A98CF7,#7C5CFC)"
                title={p.name}
                subtitle={p.hasVoice ? '🎙 Voice on file' : 'No voice yet'}
              />
            ))
          )}
          <Link
            href="/dashboard/voice-library"
            className="mt-2 block px-2 text-[13px] font-bold text-brand-deep hover:underline"
          >
            + Manage people & voices
          </Link>
        </nav>
      </aside>

      {/* ── Chat area ── */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Thread header */}
        <header className="flex items-center gap-3 border-b border-line bg-white px-6 py-3.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: selectedPersona ? 'linear-gradient(135deg,#A98CF7,#7C5CFC)' : 'linear-gradient(135deg,#5FC9BD,#0E9384)' }}
          >
            {selected === 'all' ? '∗' : selectedPersona ? selectedPersona.name.slice(0, 2).toUpperCase() : accountInitials}
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif text-[19px] font-semibold text-ink">
              {selected === 'all' ? 'Everyone' : sendingAsLabel}
              <span className="text-ink-faint"> · {patient?.name ?? 'Patient'}</span>
            </p>
            {selectedPersona && !selectedPersona.hasVoice && (
              <p className="text-[12px] text-ink-faint">
                No voice yet —{' '}
                <Link href="/dashboard/voice-library" className="font-bold text-brand-deep hover:underline">
                  record one
                </Link>{' '}
                so messages play in {selectedPersona.name}’s voice.
              </p>
            )}
          </div>
        </header>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loadingMessages ? (
            <p className="text-sm text-ink-faint">Loading…</p>
          ) : visibleMessages.length === 0 ? (
            <p className="text-sm text-ink-faint">
              {messages.length === 0
                ? 'No messages yet. Send the first one below.'
                : 'No messages in this thread yet.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {visibleMessages.map((msg) => {
                const fromPatient = !!msg.senderPatientId
                const senderName = fromPatient
                  ? patient?.name ?? 'Patient'
                  : msg.personaName ??
                    personaNameById(msg.personaId) ??
                    msg.senderName ??
                    session?.user?.name ??
                    'You'
                return (
                  <li key={msg.id} className={`flex ${fromPatient ? 'justify-start' : 'justify-end'}`}>
                    <div className="max-w-[80%]">
                      <MessageBubble
                        senderName={senderName}
                        content={msg.content}
                        timestamp={msg.createdAt}
                        isYesNo={msg.isYesNo}
                        reply={msg.reply}
                        repliedAt={msg.repliedAt}
                        fromPatient={fromPatient}
                        isRead={msg.isRead}
                      />
                    </div>
                  </li>
                )
              })}
              <div ref={threadEndRef} />
            </ul>
          )}
        </div>

        {/* Compose — pinned to the bottom */}
        <form onSubmit={handleSend} className="border-t border-line bg-white px-6 py-4">
          <div className="mb-2 flex items-center gap-2 text-[13px]">
            <span className="text-ink-faint">Sending as</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold"
              style={{
                background: selectedPersona ? 'rgba(124,92,252,.12)' : 'rgba(14,147,132,.12)',
                color: selectedPersona ? '#5B3FD6' : '#0B6F63',
              }}
            >
              {selectedPersona ? `🎙 ${sendingAsLabel}` : sendingAsLabel}
            </span>
            {selectedPersona && !selectedPersona.hasVoice && (
              <span className="text-[12px] text-ink-faint">(plays in the device voice until you record one)</span>
            )}
          </div>
          <div className="flex items-end gap-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder={`Message ${patient?.name ?? 'your loved one'}…`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend(e as unknown as React.FormEvent)
                }
              }}
              className="flex-1 resize-none rounded-[16px] border border-line-warm px-4 py-3 text-base transition-all focus:border-transparent focus:bg-surface-warm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
            <Button type="submit" disabled={sending || !content.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-ink-muted select-none cursor-pointer">
              <input
                type="checkbox"
                checked={isYesNo}
                onChange={(e) => setIsYesNo(e.target.checked)}
                className="rounded text-brand-primary focus:ring-brand-primary"
              />
              Ask as a Yes/No question
            </label>
            <details className="text-sm" open={!!mediaUrl || uploadingMedia || !!uploadError}>
              <summary className="cursor-pointer text-ink-muted hover:text-ink">
                Attach photo/video {mediaUrl && <span className="font-bold text-brand-deep">· 1 attached</span>}
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFile}
                  disabled={uploadingMedia}
                  className="text-sm text-ink-muted file:mr-3 file:cursor-pointer file:rounded-[10px] file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-brand-deep hover:file:bg-brand-soft/70"
                />
                {uploadingMedia && <span className="text-ink-faint">Uploading…</span>}
                {mediaUrl && !uploadingMedia && (
                  <span className="flex items-center gap-2">
                    {mediaType === 'video' ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={mediaUrl} className="h-12 w-12 rounded-[8px] object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl} alt="Attachment preview" className="h-12 w-12 rounded-[8px] object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={clearAttachment}
                      className="text-sm font-bold text-error hover:underline"
                    >
                      Remove
                    </button>
                  </span>
                )}
              </div>
              {uploadError && (
                <p role="alert" className="mt-1.5 text-sm text-error">
                  {uploadError}
                </p>
              )}
            </details>
            <span className="ml-auto text-xs text-ink-faint">{content.length}/1000</span>
          </div>
          {sendError && (
            <p role="alert" className="mt-2 text-sm text-error">
              {sendError}
            </p>
          )}
        </form>
      </section>

      {/* ── Settings drawer (camera schedule) ── */}
      {showSettings && (
        <>
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => setShowSettings(false)}
            className="fixed inset-0 z-40 bg-black/20"
          />
          <div className="fixed right-0 top-0 z-50 flex h-screen w-[440px] flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="font-serif text-xl font-semibold text-ink">Settings</h2>
              <button type="button" onClick={() => setShowSettings(false)} className="text-ink-faint hover:text-ink">
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-5 p-6">
              <div className="rounded-[16px] border border-line bg-surface-warm p-4">
                <p className="text-sm text-ink-muted">
                  Manage each person’s cloned voice in the{' '}
                  <Link href="/dashboard/voice-library" className="font-bold text-brand-deep hover:underline">
                    Voice library
                  </Link>
                  .
                </p>
              </div>

              {patient && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-ink-muted">Camera Schedule</label>
                    <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cameraOverride}
                        onChange={(e) => setCameraOverride(e.target.checked)}
                        className="rounded text-brand-primary focus:ring-brand-primary"
                      />
                      Always on
                    </label>
                  </div>
                  {schedules.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-[12px] bg-surface-warm p-3">
                      <select
                        value={s.dayOfWeek}
                        onChange={(e) => setSchedules((prev) => prev.map((sc, idx) => (idx === i ? { ...sc, dayOfWeek: Number(e.target.value) } : sc)))}
                        className="rounded-[10px] border border-line-warm px-3 py-1.5 text-sm transition-all focus:ring-2 focus:ring-brand-primary"
                      >
                        {DAY_NAMES.map((d, di) => (
                          <option key={d} value={di}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <input
                        type="time"
                        value={s.startTime}
                        onChange={(e) => setSchedules((prev) => prev.map((sc, idx) => (idx === i ? { ...sc, startTime: e.target.value } : sc)))}
                        className="rounded-[10px] border border-line-warm px-3 py-1.5 text-sm transition-all focus:ring-2 focus:ring-brand-primary"
                      />
                      <span className="text-sm text-ink-muted">–</span>
                      <input
                        type="time"
                        value={s.endTime}
                        onChange={(e) => setSchedules((prev) => prev.map((sc, idx) => (idx === i ? { ...sc, endTime: e.target.value } : sc)))}
                        className="rounded-[10px] border border-line-warm px-3 py-1.5 text-sm transition-all focus:ring-2 focus:ring-brand-primary"
                      />
                      <input
                        type="text"
                        value={s.timezone}
                        placeholder="Timezone (IANA)"
                        onChange={(e) => setSchedules((prev) => prev.map((sc, idx) => (idx === i ? { ...sc, timezone: e.target.value } : sc)))}
                        className="w-40 rounded-[10px] border border-line-warm px-3 py-1.5 text-sm transition-all focus:ring-2 focus:ring-brand-primary"
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
            </div>
          </div>
        </>
      )}
    </main>
  )
}

/** A selectable person/identity row in the messenger rail. */
function RailItem({
  active,
  onClick,
  avatar,
  avatarBg,
  title,
  subtitle,
}: {
  active: boolean
  onClick: () => void
  avatar: string
  avatarBg: string
  title: string
  subtitle: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-brand-soft' : 'hover:bg-surface-warm'
      }`}
      style={active ? { boxShadow: 'inset 3px 0 0 0 #7C5CFC' } : undefined}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: avatarBg }}
      >
        {avatar}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] font-bold ${active ? 'text-brand-deep' : 'text-ink'}`}>{title}</p>
        <p className="truncate text-[12px] text-ink-faint">{subtitle}</p>
      </div>
    </button>
  )
}
