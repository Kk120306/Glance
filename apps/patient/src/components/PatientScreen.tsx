'use client'

import { useState, useEffect, useRef, useCallback, Fragment, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { SOSButton } from '@glance/shared/design/components'
import {
  InteractionProvider,
  useInteraction,
  gazeStepDirection,
  STEP_SUSTAIN_MS,
} from '@glance/shared/design/components'
import { colors, typography } from '@glance/shared/design/tokens'
import type { ServerToClientMessage, CameraSchedule } from '@glance/shared/ws'
import { isCameraWindowActive } from '@glance/shared/utils/camera-schedule'
import { useCameraStream } from '../hooks/useCameraStream'
import { useGazeTracker } from '../hooks/useGazeTracker'
import { useInteractiveTarget } from '../hooks/useInteractiveTarget'
import { YesNoScreen } from './YesNoScreen'
import { GazeTrackingPanel } from './GazeTrackingPanel'
import { PhraseBoard, FIXED_PHRASES } from './PhraseBoard'
import { PhraseConfirmScreen } from './PhraseConfirmScreen'
import { BlobAgent, type BlobTone } from './BlobAgent'
import { DwellRing } from './DwellRing'
import { CalibrationScreen } from './CalibrationScreen'
import { loadStoredEarThreshold, saveEarThreshold } from '../utils/calibration'
import { meanAmplitude, stepSosSustain } from '../utils/sosAmplitude'
import { stopAllTracks } from '../utils/cameraTracks'

export const SOS_THRESHOLD = 0.15
const MIC_CHECK_INTERVAL_MS = 200
const SOS_SUSTAIN_MS = 1500
const SCHEDULE_CHECK_INTERVAL_MS = 30_000

interface PatientConfig {
  id: string
  cameraOverrideActive: boolean
  schedules: CameraSchedule[]
}

interface CurrentMessage {
  id: string
  content: string
  isYesNo: boolean
  toneClass: string
  mediaUrl?: string | null
  mediaType?: string | null
}

/** Map a message's stored tone class to a Blob expression (defaults to neutral). */
function toBlobTone(toneClass: string | undefined): BlobTone {
  return toneClass === 'warm' || toneClass === 'urgent' ? toneClass : 'neutral'
}

interface PatientScreenProps {
  wsServerUrl: string
  dashboardUrl: string
  deviceToken: string
}

export function PatientScreen({ wsServerUrl, dashboardUrl, deviceToken }: PatientScreenProps) {
  const [activated, setActivated] = useState(false)
  const [patientConfig, setPatientConfig] = useState<PatientConfig | null>(null)
  const [schedules, setSchedules] = useState<CameraSchedule[]>([])
  const [cameraOverride, setCameraOverride] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  // Incoming caregiver messages queue up here. The patient advances through them
  // explicitly (gaze/blink) — nothing is auto-dismissed on a timer — so a message
  // that arrives while they look away is never missed. The head of the queue is
  // whatever is currently on screen.
  const [messageQueue, setMessageQueue] = useState<CurrentMessage[]>([])
  const currentMessage = messageQueue[0] ?? null
  const [sosTriggered, setSosTriggered] = useState(false)
  const [micDenied, setMicDenied] = useState(false)
  const [showGazePanel, setShowGazePanel] = useState(false)
  const [showPhraseBoard, setShowPhraseBoard] = useState(false)
  const [showCalibration, setShowCalibration] = useState(false)
  // A phrase the patient selected and is now confirming before it sends (AI
  // Content Gate: nothing sends without an explicit confirm).
  const [phrasePending, setPhrasePending] = useState<string | null>(null)
  // LLM-ranked reply suggestions for the message currently on screen, or null.
  const [rankedSuggestions, setRankedSuggestions] = useState<string[] | null>(null)
  // True while a message (or candidate phrase) is being spoken — drives the Blob.
  const [speaking, setSpeaking] = useState(false)
  // Custom blink threshold from a prior calibration (persisted in localStorage).
  const [earThreshold, setEarThreshold] = useState<number | null>(null)
  // Wall-clock time for the status bar (client-only; refreshed each half-minute).
  const [now, setNow] = useState<Date | null>(null)

  // Load any saved calibration on mount (client-only).
  useEffect(() => {
    if (typeof window === 'undefined') return
    setEarThreshold(loadStoredEarThreshold(window.localStorage))
  }, [])

  // Tick the status-bar clock.
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Auto-run calibration once per session, as soon as the camera is available.
  // Calibration is meaningless without the camera (it measures EAR from video),
  // so it waits for the stream rather than firing in scan-only startups. The
  // wizard itself is fully autonomous and self-closes — no human input required.
  const autoCalibratedRef = useRef(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const sosAmplitudeRef = useRef(0)
  const sosStartRef = useRef<number | null>(null)
  const micCleanupRef = useRef<(() => void) | null>(null)

  // ── Camera stream (respects schedule + hard constraint: track.stop() on deactivate)
  const { stream, videoRef, permissionDenied } = useCameraStream({
    schedules,
    overrideActive: cameraOverride,
  })

  // ── Gaze tracker (only when camera is active)
  const { modelReady, gazeDirection, blinkSignal, facePresent, gazeOffsetRef, gazeDirectionRawRef, earRef, recenter } = useGazeTracker({
    videoRef,
    enabled: !!stream,
    earThreshold: earThreshold ?? undefined,
  })

  // Determine interaction mode
  const interactionMode: 'gaze' | 'scan' =
    stream && modelReady && facePresent ? 'gaze' : 'scan'

  // Fire the one-shot startup calibration once the session is live and a camera
  // stream exists. Runs every fresh startup (per page load); the wizard waits for
  // a face, samples, saves, and closes itself with no human input.
  useEffect(() => {
    if (!activated || !stream || autoCalibratedRef.current) return
    autoCalibratedRef.current = true
    setShowCalibration(true)
  }, [activated, stream])

  // ── Update cameraActive on schedule interval
  useEffect(() => {
    const check = () => setCameraActive(isCameraWindowActive(schedules, cameraOverride))
    check()
    const interval = setInterval(check, SCHEDULE_CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [schedules, cameraOverride])

  // ── Fetch patient config after activation
  const fetchPatientConfig = useCallback(async () => {
    try {
      const res = await fetch(`${dashboardUrl}/api/patient/me`, {
        headers: { 'x-device-token': deviceToken },
      })
      if (!res.ok) return
      const config = (await res.json()) as PatientConfig
      setPatientConfig(config)
      setSchedules(config.schedules)
      setCameraOverride(config.cameraOverrideActive)
    } catch (err) {
      console.warn('[patient] failed to fetch config:', err)
    }
  }, [dashboardUrl, deviceToken])

  // ── Microphone SOS listener (runs independently of camera)
  const startMicListener = useCallback(() => {
    const ctx = audioCtxRef.current
    if (!ctx || typeof navigator === 'undefined') return

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((micStream) => {
        const source = ctx.createMediaStreamSource(micStream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        const data = new Uint8Array(analyser.frequencyBinCount)
        source.connect(analyser)

        const interval = setInterval(() => {
          analyser.getByteFrequencyData(data)
          const amplitude = meanAmplitude(data)
          sosAmplitudeRef.current = amplitude
          // Pure sustained-vocalization decision — independent of the camera, so
          // SOS keeps working when the camera is off, denied, or broken.
          const { state, fire } = stepSosSustain(
            { startedAt: sosStartRef.current },
            amplitude,
            { threshold: SOS_THRESHOLD, sustainMs: SOS_SUSTAIN_MS, now: Date.now() },
          )
          sosStartRef.current = state.startedAt
          if (fire) void triggerSOS()
        }, MIC_CHECK_INTERVAL_MS)

        micCleanupRef.current = () => {
          clearInterval(interval)
          stopAllTracks(micStream)
        }
      })
      .catch((err) => {
        console.warn('[mic] permission denied or error:', err)
        setMicDenied(true)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Local speech (Web Speech API) — toggles the Blob's speaking animation.
  const speakLocal = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.onstart = () => setSpeaking(true)
    utt.onend = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utt)
  }, [])

  // ── TTS playback (caregiver's cloned voice), falling back to local speech.
  const playTTS = useCallback(
    async (messageId: string, content: string) => {
      try {
        const res = await fetch(`${dashboardUrl}/api/tts?messageId=${messageId}`, {
          headers: { 'x-device-token': deviceToken },
        })
        if (!res.ok) throw new Error(`TTS error ${res.status}`)

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        setSpeaking(true)
        audio.onended = () => {
          setSpeaking(false)
          URL.revokeObjectURL(url)
        }
        audio.onerror = () => {
          setSpeaking(false)
          URL.revokeObjectURL(url)
        }
        await audio.play()
      } catch {
        // Fallback: local Web Speech API (also drives the Blob).
        speakLocal(content)
      }
    },
    [dashboardUrl, deviceToken, speakLocal],
  )

  // ── Fetch LLM-ranked reply suggestions for an incoming message. The patient's
  // own frozen phrase list is sent and merely reordered server-side, so only
  // curated phrases can ever come back (AI Content Gate). Best-effort: on any
  // failure the board simply falls back to the full phrase grid.
  const fetchSuggestions = useCallback(
    async (content: string) => {
      try {
        const res = await fetch(`${dashboardUrl}/api/suggestions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
          body: JSON.stringify({ messageContent: content, phrases: FIXED_PHRASES }),
        })
        if (!res.ok) {
          setRankedSuggestions(null)
          return
        }
        const data = (await res.json()) as { suggestions?: string[] }
        setRankedSuggestions(
          Array.isArray(data.suggestions) && data.suggestions.length > 0 ? data.suggestions : null,
        )
      } catch {
        setRankedSuggestions(null)
      }
    },
    [dashboardUrl, deviceToken],
  )

  // ── Advance past the current message to the next queued one (or back to idle
  // when the queue empties). Called when the patient hits "Next message", answers
  // a Yes/No, or confirms a reply.
  const advanceQueue = useCallback(() => {
    setMessageQueue((q) => q.slice(1))
    setRankedSuggestions(null)
  }, [])

  // ── Whenever a new message reaches the head of the queue, read it aloud and
  // prefetch reply suggestions — exactly once per message (tracked by id), so
  // re-renders never replay the audio.
  const spokenMessageIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentMessage) {
      spokenMessageIdRef.current = null
      return
    }
    if (spokenMessageIdRef.current === currentMessage.id) return
    spokenMessageIdRef.current = currentMessage.id
    setRankedSuggestions(null)
    if (!currentMessage.isYesNo) void fetchSuggestions(currentMessage.content)
    void playTTS(currentMessage.id, currentMessage.content)
  }, [currentMessage, fetchSuggestions, playTTS])

  // ── SOS dispatch
  const triggerSOS = useCallback(async () => {
    if (!patientConfig) return
    setSosTriggered(true)

    // Local alarm beep
    const ctx = audioCtxRef.current
    if (ctx) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.value = 0.5
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 1)
    }

    try {
      await fetch(`${dashboardUrl}/api/patients/${patientConfig.id}/sos`, {
        method: 'POST',
        headers: { 'x-device-token': deviceToken },
      })
    } catch (err) {
      console.warn('[sos] failed to post SOS:', err)
    }

    setTimeout(() => setSosTriggered(false), 5000)
  }, [patientConfig, dashboardUrl, deviceToken])

  // ── Persist + broadcast a confirmed phrase. Failures are logged only: the
  // local vocalization already gave feedback, so we never block or alarm the patient.
  const postPhrase = useCallback(
    (phrase: string) => {
      void (async () => {
        try {
          const res = await fetch(`${dashboardUrl}/api/messages/patient`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
            body: JSON.stringify({ content: phrase }),
          })
          if (!res.ok) console.warn(`[phrase] server rejected phrase: ${res.status}`)
        } catch (err) {
          console.warn('[phrase] failed to post phrase:', err)
        }
      })()
    },
    [dashboardUrl, deviceToken],
  )

  // Step 1 — the patient picked a phrase: read it aloud and open the confirm
  // screen. Nothing is sent yet (AI Content Gate).
  const selectPhrase = useCallback(
    (phrase: string) => {
      setPhrasePending(phrase)
      speakLocal(phrase)
    },
    [speakLocal],
  )

  // Step 2a — confirmed: send it, close the phrase board, and advance past the
  // message just replied to (a no-op when the board was opened from idle).
  const confirmPhrase = useCallback(() => {
    if (phrasePending) postPhrase(phrasePending)
    setPhrasePending(null)
    setShowPhraseBoard(false)
    advanceQueue()
  }, [phrasePending, postPhrase, advanceQueue])

  // Step 2b — cancelled: drop the candidate and return to the board.
  const cancelPhrase = useCallback(() => setPhrasePending(null), [])

  // ── WebSocket connection with REGISTER
  const connectSocket = useCallback(
    (patientId: string) => {
      const socket = io(wsServerUrl, {
        reconnectionDelay: 500,
        reconnectionDelayMax: 8000,
      })
      socketRef.current = socket

      socket.on('connect', () => {
        socket.emit('message', JSON.stringify({ type: 'REGISTER', role: 'patient', patientId }))
      })

      socket.on('reconnect', () => {
        socket.emit('message', JSON.stringify({ type: 'REGISTER', role: 'patient', patientId }))
      })

      socket.on('NEW_MESSAGE', (envelope: ServerToClientMessage) => {
        if (envelope.type !== 'NEW_MESSAGE') return
        const { id, content, isYesNo, toneClass, mediaUrl, mediaType } = envelope.payload
        // Queue it — never overwrite a message the patient is still reading. The
        // head-of-queue effect handles TTS + suggestions once it reaches screen.
        setMessageQueue((q) =>
          q.some((m) => m.id === id) ? q : [...q, { id, content, isYesNo, toneClass, mediaUrl, mediaType }],
        )
      })

      socket.on('CAMERA_CONFIG_UPDATE', (envelope: ServerToClientMessage) => {
        if (envelope.type !== 'CAMERA_CONFIG_UPDATE') return
        setSchedules(envelope.payload.schedules)
        setCameraOverride(envelope.payload.cameraOverrideActive)
      })

      return () => {
        socket.disconnect()
        socketRef.current = null
      }
    },
    [wsServerUrl],
  )

  // ── Start everything after activation
  useEffect(() => {
    if (!activated) return

    const AudioCtx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AudioCtx) {
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      ctx.resume().catch(console.error)
    }

    void fetchPatientConfig().then(() => {
      // patientConfig state update is async; we use a local capture via re-effect below
    })

    return () => {
      micCleanupRef.current?.()
      audioCtxRef.current?.close().catch(console.error)
    }
  }, [activated, fetchPatientConfig])

  // ── Wire WebSocket + mic once patientConfig is available
  useEffect(() => {
    if (!activated || !patientConfig) return
    const cleanupSocket = connectSocket(patientConfig.id)
    startMicListener()
    return () => {
      cleanupSocket()
      micCleanupRef.current?.()
    }
  }, [activated, patientConfig, connectSocket, startMicListener])

  // ── Start Session (audio unlock)
  if (!activated) {
    return (
      <div
        className="relative flex h-screen w-full flex-col items-center justify-center gap-2 overflow-hidden"
        style={{
          background:
            'radial-gradient(1100px 760px at 50% 22%,#FBF6F0 0%,#F4EEE6 52%,#EFE7DC 100%)',
        }}
      >
        <div className="pointer-events-none absolute -left-32 -top-40 h-[460px] w-[460px] rounded-full"
          style={{ background: 'radial-gradient(circle,#E7DBFF,transparent 70%)', opacity: 0.6 }} />
        <div className="pointer-events-none absolute -bottom-44 -right-32 h-[520px] w-[520px] rounded-full"
          style={{ background: 'radial-gradient(circle,#FBDCEF,transparent 70%)', opacity: 0.5 }} />

        <BlobAgent tone="warm" size="240px" className="mb-2" />
        <div
          className="text-center"
          style={{ fontFamily: typography.fontFamily.serif, fontSize: '64px', fontWeight: 600, letterSpacing: '-0.02em', color: colors.ink }}
        >
          Glance
        </div>
        <p className="mb-6 max-w-md text-center" style={{ fontSize: '22px', color: colors.inkBody }}>
          When you're ready, we'll begin together.
        </p>
        <button
          type="button"
          onClick={() => setActivated(true)}
          aria-label="Start Session"
          className="z-10 flex items-center justify-center rounded-[20px] font-bold transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4"
          style={{
            minWidth: '300px',
            minHeight: '96px',
            backgroundColor: colors.brand.primary,
            color: '#fff',
            fontSize: '2rem',
            boxShadow: '0 8px 20px rgba(124,92,252,.28)',
          }}
        >
          Start session
        </button>
      </div>
    )
  }

  return (
    <InteractionProvider
      mode={interactionMode}
      gazeDirection={gazeDirection}
      gazeDirectionRawRef={gazeDirectionRawRef}
      blinkSignal={blinkSignal}
      paused={showCalibration}
    >
      <div
        className="relative flex h-screen w-full flex-col overflow-hidden"
        style={{
          background:
            'radial-gradient(1100px 760px at 50% 22%,#FBF6F0 0%,#F4EEE6 52%,#EFE7DC 100%)',
        }}
      >
        {/* Soft ambient blobs */}
        <div className="pointer-events-none absolute -left-32 -top-40 h-[460px] w-[460px] rounded-full"
          style={{ background: 'radial-gradient(circle,#E7DBFF,transparent 70%)', opacity: 0.55 }} />
        <div className="pointer-events-none absolute -bottom-44 -right-32 h-[520px] w-[520px] rounded-full"
          style={{ background: 'radial-gradient(circle,#FBDCEF,transparent 70%)', opacity: 0.5 }} />

        {/* Hidden video for MediaPipe gaze tracking */}
        <video
          ref={videoRef}
          className="absolute"
          style={{ width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
          autoPlay
          muted
          playsInline
        />

        {/* Status bar */}
        {!currentMessage?.isYesNo && (
          <div className="relative z-10 flex items-center justify-between px-11 pt-7">
            <div className="flex items-center gap-3.5">
              {interactionMode === 'gaze' ? (
                <StatusPill>
                  <span className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: '#0E9384', boxShadow: '0 0 0 4px rgba(14,147,132,.18)' }} />
                  <span style={{ color: colors.patient.affirmInk }}>Eye tracking on</span>
                </StatusPill>
              ) : (
                <StatusPill>
                  <span style={{ color: colors.patient.highlightInk }}>👁️ Scan mode</span>
                </StatusPill>
              )}
              <StatusPill>
                <span style={{ color: colors.brand.deep }}>
                  {interactionMode === 'gaze' ? 'Look to move · blink ×2' : 'Blink to choose'}
                </span>
              </StatusPill>
              <GazeSteerHUD />
              {micDenied && (
                <StatusPill><span style={{ color: colors.patient.sosInk }}>Vocal SOS off</span></StatusPill>
              )}
              {stream && !modelReady && (
                <StatusPill><span style={{ color: colors.inkMuted }}>Gaze loading…</span></StatusPill>
              )}
            </div>
            <div className="flex items-center gap-4 font-bold" style={{ color: colors.inkMuted, fontSize: 17 }}>
              {now && <span>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
            </div>
          </div>
        )}

        {/* SOS overlay — full takeover when an alert is active. */}
        {sosTriggered && <SosOverlay />}

        {/* Main content */}
        {currentMessage?.isYesNo ? (
          <YesNoScreen
            question={currentMessage.content}
            messageId={currentMessage.id}
            dashboardUrl={dashboardUrl}
            deviceToken={deviceToken}
            onReply={advanceQueue}
          />
        ) : currentMessage ? (
          /* ── Read-message layout ── */
          <div className="relative z-[2] flex flex-1 flex-col items-center justify-center px-11 pb-6">
            <BlobAgent tone={toBlobTone(currentMessage.toneClass)} speaking={speaking} size={currentMessage.mediaUrl ? '120px' : '184px'} float={false} className="mb-5" />
            {currentMessage.mediaUrl && (
              <div className="mb-6 flex justify-center">
                {currentMessage.mediaType === 'video' ? (
                  <video
                    src={currentMessage.mediaUrl}
                    className="max-h-[38vh] rounded-[24px]"
                    style={{ boxShadow: '0 16px 40px rgba(36,30,43,.16)' }}
                    autoPlay
                    muted
                    loop
                    playsInline
                    controls
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentMessage.mediaUrl}
                    alt=""
                    className="max-h-[38vh] rounded-[24px] object-contain"
                    style={{ boxShadow: '0 16px 40px rgba(36,30,43,.16)' }}
                  />
                )}
              </div>
            )}
            <RevealMessage key={currentMessage.id} content={currentMessage.content} />
            {speaking && (
              <div
                className="flex items-center gap-4 rounded-full bg-white px-6 py-3.5"
                style={{ boxShadow: '0 8px 22px rgba(36,30,43,.07)' }}
              >
                <span className="flex h-9 items-end gap-1">
                  {[14, 30, 38, 24, 34, 18, 30, 12].map((h, i) => (
                    <span key={i} className="w-[5px] rounded"
                      style={{ height: h, background: ['#C9B6FF', '#A98CF7', '#7C5CFC', '#A98CF7', '#EC8FDE', '#C9B6FF', '#A98CF7', '#C9B6FF'][i], animation: `wave 1s ease-in-out ${i * 0.12}s infinite`, transformOrigin: 'center' }} />
                  ))}
                </span>
                <span className="font-bold" style={{ color: colors.inkMuted, fontSize: 16 }}>Reading aloud…</span>
              </div>
            )}
            {messageQueue.length > 1 && (
              <div
                className="mt-1 flex items-center gap-2.5 rounded-full bg-white px-5 py-2.5 font-bold"
                style={{ boxShadow: '0 1px 3px rgba(36,30,43,.06)', color: colors.brand.deep, fontSize: 16 }}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colors.brand.primary }} />
                {messageQueue.length - 1} more {messageQueue.length - 1 === 1 ? 'message' : 'messages'} waiting
              </div>
            )}
            <div className="mt-8 flex flex-wrap justify-center gap-5">
              <ActionTile id="read:again" icon="🔊" label="Play again" primary
                onSelect={() => void playTTS(currentMessage.id, currentMessage.content)} />
              <ActionTile id="read:reply" icon="↩" label="Reply"
                onSelect={() => setShowPhraseBoard(true)} />
              <ActionTile id="read:next" icon="→" label={messageQueue.length > 1 ? 'Next message' : 'Done'}
                onSelect={advanceQueue} />
            </div>
          </div>
        ) : (
          /* ── Idle home ── */
          <div className="relative z-[2] flex flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center pb-3">
              <BlobAgent tone="warm" speaking={speaking} size="clamp(220px, 30vh, 300px)" className="mb-1.5" />
              <div className="text-center" style={{ fontFamily: typography.fontFamily.serif, fontSize: 'clamp(32px,4vw,46px)', fontWeight: 600, letterSpacing: '-0.015em', color: colors.ink }}>
                I'm right here.
              </div>
              <div className="mt-2" style={{ fontSize: 22, color: colors.inkMuted }}>Look left or right to move · blink twice to choose.</div>
            </div>

            {/* Tile row */}
            <div className="flex justify-center gap-5 px-11 pb-5">
              <HomeTile id="home:say" icon="💬" iconBg="#D9F6F0" title="Say something"
                subtitle="Choose a phrase" onSelect={() => setShowPhraseBoard(true)} />
              <HomeTile id="home:messages" icon="✉️" iconBg="#EFE9FF" title="Messages"
                subtitle="Replies & suggestions" onSelect={() => setShowPhraseBoard(true)} />
              <HomeTile id="home:yesno" icon="⚖️" iconBg="#FBE6F2" title="Yes / No"
                subtitle="Answer quickly" onSelect={() => setShowPhraseBoard(true)} />
              <HomeTile id="home:help" icon="🙋" iconBg="#FFF1DF" title="I need help"
                subtitle="Call a caregiver" onSelect={() => void triggerSOS()} />
            </div>

            {/* Bottom bar — settings affordance (mirrors the sample home). */}
            <div className="flex items-center px-11 pb-8">
              <button
                type="button"
                onClick={() => setShowCalibration(true)}
                className="flex items-center gap-3 font-bold"
                style={{ color: colors.inkFaint, fontSize: 16 }}
              >
                <span style={{ fontSize: 20 }}>⚙️</span> Settings &amp; calibration
              </button>
            </div>
          </div>
        )}

        {/* SOS button — always visible; reachable by the gaze cursor and scan. */}
        <SosTarget onTrigger={() => void triggerSOS()} />

        {/* Patient-initiated phrase board (fullscreen overlay). Opens into
            ranked "suggested replies" when a caregiver message is on screen. */}
        {showPhraseBoard && (
          <PhraseBoard
            onPhrase={selectPhrase}
            onClose={() => setShowPhraseBoard(false)}
            rankedSuggestions={rankedSuggestions ?? undefined}
          />
        )}

        {/* Gaze-confirm step — sits above the board; nothing sends without it. */}
        {phrasePending && (
          <PhraseConfirmScreen
            phrase={phrasePending}
            onConfirm={confirmPhrase}
            onCancel={cancelPhrase}
          />
        )}

        {/* Gaze tracking preview — live self-view + direction/blink feedback.
            Reuses the existing stream (no extra camera track). Dev aid; dismissible. */}
        {showGazePanel ? (
          <GazeTrackingPanel
            stream={stream}
            gazeDirection={gazeDirection}
            gazeOffsetRef={gazeOffsetRef}
            blinkSignal={blinkSignal}
            modelReady={modelReady}
            facePresent={facePresent}
            mode={interactionMode}
            permissionDenied={permissionDenied}
            onRecenter={recenter}
            onCalibrate={() => setShowCalibration(true)}
            onClose={() => setShowGazePanel(false)}
            minimized={currentMessage !== null}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowGazePanel(true)}
            aria-label="Show gaze tracking panel"
            className="fixed top-7 right-11 z-50 rounded-full bg-white px-5 py-2.5 text-sm font-bold transition-transform active:scale-95"
            style={{ color: colors.inkMuted, border: `1px solid ${colors.borderWarm}`, boxShadow: '0 1px 3px rgba(36,30,43,.06)' }}
          >
            👁 Show tracking
          </button>
        )}

        {/* Calibration wizard — auto-runs once at startup and self-closes; a
            caregiver can also re-launch it from the gaze panel. Fully autonomous
            (no required input) and reuses the existing camera stream. */}
        {showCalibration && (
          <CalibrationScreen
            earRef={earRef}
            gazeOffsetRef={gazeOffsetRef}
            facePresent={facePresent}
            onRecenter={recenter}
            onComplete={(threshold) => {
              saveEarThreshold(window.localStorage, threshold)
              setEarThreshold(threshold)
              setShowCalibration(false)
            }}
            onExit={() => setShowCalibration(false)}
          />
        )}
      </div>
    </InteractionProvider>
  )
}

/**
 * Registers the SOS button as an interactive target so the gaze cursor (or scan
 * highlight) can select it — the camera-active secondary SOS path. The vocal
 * Web-Audio SOS path remains independent and is unaffected.
 */
function SosTarget({ onTrigger }: { onTrigger: () => void }) {
  const { ref, focused } = useInteractiveTarget<HTMLButtonElement>('sos', onTrigger)
  return <SOSButton ref={ref} focused={focused} onClick={onTrigger} />
}

/**
 * Renders a caregiver message with a gentle word-by-word reveal. Each word fades
 * up on a staggered delay (CSS only). Because the stagger is pure CSS animation,
 * `prefers-reduced-motion` (handled globally in globals.css) collapses it to an
 * instant, fully-legible paragraph — no word is ever left hidden.
 */
function RevealMessage({ content }: { content: string }) {
  const words = content.split(/\s+/).filter(Boolean)
  return (
    <p
      className="mb-7 max-w-5xl text-center"
      style={{
        fontFamily: typography.fontFamily.serif,
        fontSize: 'clamp(34px, 5vw, 52px)',
        lineHeight: 1.28,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: colors.ink,
        textWrap: 'pretty',
      }}
    >
      “
      {words.map((word, i) => (
        <Fragment key={i}>
          <span
            style={{
              display: 'inline-block',
              animation: 'wordIn 420ms ease-out both',
              animationDelay: `${i * 75}ms`,
            }}
          >
            {word}
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
      ”
    </p>
  )
}

/** Small white status chip used in the top status bar. */
function StatusPill({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-full bg-white px-5 py-2.5 font-bold"
      style={{ boxShadow: '0 1px 3px rgba(36,30,43,.06)', fontSize: 16 }}
    >
      {children}
    </div>
  )
}

/**
 * One-shot inner ring that flares the moment gaze focus lands on a target. It is
 * rendered only while the target is focused and remounts on each new focus, so
 * the CSS animation replays every time — the patient sees the step arrive.
 */
function FocusArriveRing({ radius, light = false }: { radius: number; light?: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10"
      style={{ borderRadius: radius, animation: `${light ? 'focusArriveLight' : 'focusArrive'} 460ms ease-out` }}
    />
  )
}

/**
 * Global steering indicator: shows the live gaze direction and a bar that fills
 * over the step-sustain window, so the patient can see their eye movement is
 * about to move focus to the next tile — before it happens. Gaze mode only.
 */
function GazeSteerHUD() {
  const { mode, gazeDirection } = useInteraction()
  if (mode !== 'gaze') return null
  const step = gazeStepDirection(gazeDirection)
  const next = step === 'next' // visually rightward in reading order
  return (
    <div
      className="flex items-center gap-2.5 rounded-full bg-white px-4 py-2.5"
      style={{ boxShadow: '0 1px 3px rgba(36,30,43,.06)' }}
    >
      <span aria-hidden style={{ fontSize: 22, lineHeight: 1, color: step && !next ? colors.brand.primary : colors.inkFaint, fontWeight: 800 }}>‹</span>
      <span className="relative h-2.5 w-20 overflow-hidden rounded-full" style={{ background: 'rgba(124,92,252,.16)' }}>
        {step ? (
          <span
            key={step}
            className="absolute inset-0 rounded-full"
            style={{ background: colors.brand.primary, transformOrigin: next ? 'left' : 'right', animation: `steerFill ${STEP_SUSTAIN_MS}ms linear forwards` }}
          />
        ) : (
          <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: colors.inkFaint }} />
        )}
      </span>
      <span aria-hidden style={{ fontSize: 22, lineHeight: 1, color: step && next ? colors.brand.primary : colors.inkFaint, fontWeight: 800 }}>›</span>
    </div>
  )
}

/** A large gaze-selectable home tile (sample "Patient — Home"). */
function HomeTile({
  id, icon, iconBg, title, subtitle, onSelect,
}: {
  id: string; icon: string; iconBg: string; title: string; subtitle: string; onSelect: () => void
}) {
  const { ref, focused, armed, dwellProgress } = useInteractiveTarget<HTMLButtonElement>(id, onSelect)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={title}
      className="relative flex max-w-[300px] flex-1 flex-col overflow-hidden rounded-[28px] bg-white p-8 text-left transition-transform duration-200 active:scale-[0.98]"
      style={{
        boxShadow: focused
          ? '0 16px 36px rgba(124,92,252,.28)'
          : '0 8px 24px rgba(36,30,43,.07)',
        border: `${focused ? 4 : 3}px solid ${focused ? colors.brand.primary : 'transparent'}`,
        outline: armed ? `5px solid ${colors.brand.soft}` : 'none',
        transform: focused ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      <DwellRing progress={dwellProgress} color={colors.brand.primary} />
      {focused && <FocusArriveRing radius={28} />}
      <span className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-[20px]"
        style={{ background: iconBg, fontSize: 32 }}>{icon}</span>
      <span className="relative font-bold" style={{ fontSize: 26, color: colors.ink }}>{title}</span>
      <span
        className="relative mt-1.5 font-bold"
        style={{ fontSize: 17, color: armed ? colors.brand.deep : colors.inkMuted, animation: armed ? 'armPulse 1.2s ease-in-out infinite' : undefined }}
      >
        {armed ? 'Blink again to confirm ✓' : subtitle}
      </span>
    </button>
  )
}

/** Pill action target used on the read-message screen. */
function ActionTile({
  id, icon, label, primary = false, onSelect,
}: {
  id: string; icon: string; label: string; primary?: boolean; onSelect: () => void
}) {
  const { ref, focused, armed, dwellProgress } = useInteractiveTarget<HTMLButtonElement>(id, onSelect)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={label}
      className="relative flex items-center gap-4 overflow-hidden rounded-[24px] px-11 py-6 font-bold transition-transform duration-200 active:scale-95"
      style={{
        background: primary ? colors.brand.primary : '#fff',
        color: primary ? '#fff' : colors.ink,
        border: primary ? 'none' : `2px solid ${focused ? colors.brand.primary : colors.borderWarm}`,
        boxShadow: primary
          ? '0 10px 26px rgba(124,92,252,.28)'
          : focused ? '0 8px 20px rgba(124,92,252,.18)' : '0 4px 14px rgba(36,30,43,.05)',
        outline: armed ? `5px solid ${colors.brand.soft}` : focused ? `4px solid ${colors.brand.soft}` : 'none',
        transform: focused ? 'scale(1.04)' : 'scale(1)',
      }}
    >
      <DwellRing progress={dwellProgress} color={primary ? '#fff' : colors.brand.primary} size={38} inset={10} />
      {focused && <FocusArriveRing radius={24} light={primary} />}
      <span className="relative" style={{ fontSize: 28 }}>{icon}</span>
      <span
        className="relative"
        style={{ fontSize: 24, animation: armed ? 'armPulse 1.2s ease-in-out infinite' : undefined }}
      >
        {armed ? 'Blink to confirm' : label}
      </span>
    </button>
  )
}

/** Full-screen SOS takeover shown while an alert is active (sample "Patient — SOS"). */
function SosOverlay() {
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-12 text-white"
      style={{ background: 'radial-gradient(900px 700px at 50% 36%,#B83036 0%,#8A2127 55%,#6E171C 100%)' }}
    >
      <div className="absolute left-1/2 top-9 flex -translate-x-1/2 items-center gap-2.5 rounded-full px-6 py-3"
        style={{ background: 'rgba(255,255,255,.16)' }}>
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-white" style={{ animation: 'breathe 1s ease-in-out infinite' }} />
        <span className="font-bold" style={{ fontSize: 17, letterSpacing: '.04em' }}>EMERGENCY ACTIVE</span>
      </div>

      <div className="relative mb-9 h-60 w-60">
        <div className="absolute inset-0 rounded-full" style={{ border: '3px solid rgba(255,255,255,.5)', animation: 'ring2 2s ease-out infinite' }} />
        <div className="absolute inset-0 rounded-full" style={{ border: '3px solid rgba(255,255,255,.5)', animation: 'ring2 2s ease-out 1s infinite' }} />
        <BlobAgent tone="urgent" size="240px" float={false} />
      </div>

      <div className="text-center" style={{ fontFamily: typography.fontFamily.serif, fontSize: 60, fontWeight: 600, letterSpacing: '-.015em', marginBottom: 12 }}>
        Help is on the way.
      </div>
      <div className="max-w-xl text-center" style={{ fontSize: 22, color: 'rgba(255,255,255,.85)' }}>
        Stay with me. I've alerted your care team and I'm keeping the line open.
      </div>
    </div>
  )
}
