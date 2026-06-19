'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import { SOSButton } from '@glance/shared/design/components'
import { InteractionProvider } from '@glance/shared/design/components'
import { colors } from '@glance/shared/design/tokens'
import type { ServerToClientMessage, CameraSchedule } from '@glance/shared/ws'
import { isCameraWindowActive } from '@glance/shared/utils/camera-schedule'
import { useCameraStream } from '../hooks/useCameraStream'
import { useGazeTracker } from '../hooks/useGazeTracker'
import { YesNoScreen } from './YesNoScreen'
import { GazeTrackingPanel } from './GazeTrackingPanel'

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
}

interface PatientScreenProps {
  wsServerUrl: string
  dashboardUrl: string
  displaySeconds: number
  deviceToken: string
}

export function PatientScreen({ wsServerUrl, dashboardUrl, displaySeconds, deviceToken }: PatientScreenProps) {
  const [activated, setActivated] = useState(false)
  const [patientConfig, setPatientConfig] = useState<PatientConfig | null>(null)
  const [schedules, setSchedules] = useState<CameraSchedule[]>([])
  const [cameraOverride, setCameraOverride] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [currentMessage, setCurrentMessage] = useState<CurrentMessage | null>(null)
  const [sosTriggered, setSosTriggered] = useState(false)
  const [micDenied, setMicDenied] = useState(false)
  const [showGazePanel, setShowGazePanel] = useState(true)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sosAmplitudeRef = useRef(0)
  const sosStartRef = useRef<number | null>(null)
  const micCleanupRef = useRef<(() => void) | null>(null)

  // ── Camera stream (respects schedule + hard constraint: track.stop() on deactivate)
  const { stream, videoRef, permissionDenied } = useCameraStream({
    schedules,
    overrideActive: cameraOverride,
  })

  // ── Gaze tracker (only when camera is active)
  const { modelReady, gazeDirection, blinkSignal, facePresent, gazeOffsetRef, recenter } = useGazeTracker({
    videoRef,
    enabled: !!stream,
  })

  // Determine interaction mode
  const interactionMode: 'gaze' | 'scan' =
    stream && modelReady && facePresent ? 'gaze' : 'scan'

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
          const avg = data.reduce((a, b) => a + b, 0) / data.length / 255
          if (avg > SOS_THRESHOLD) {
            if (sosStartRef.current === null) sosStartRef.current = Date.now()
            else if (Date.now() - sosStartRef.current >= SOS_SUSTAIN_MS) {
              sosStartRef.current = null
              void triggerSOS()
            }
          } else {
            sosStartRef.current = null
          }
        }, MIC_CHECK_INTERVAL_MS)

        micCleanupRef.current = () => {
          clearInterval(interval)
          for (const track of micStream.getTracks()) track.stop()
        }
      })
      .catch((err) => {
        console.warn('[mic] permission denied or error:', err)
        setMicDenied(true)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── TTS playback
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
        audio.onended = () => URL.revokeObjectURL(url)
        await audio.play()
      } catch {
        // Fallback: Web Speech API
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const utt = new SpeechSynthesisUtterance(content)
          window.speechSynthesis.speak(utt)
        }
      }
    },
    [dashboardUrl, deviceToken],
  )

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
        const { id, content, isYesNo, toneClass } = envelope.payload
        setCurrentMessage({ id, content, isYesNo, toneClass })

        if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
        if (!isYesNo) {
          clearTimerRef.current = setTimeout(() => setCurrentMessage(null), displaySeconds * 1000)
        }

        void playTTS(id, content)
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
    [wsServerUrl, displaySeconds, playTTS],
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
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
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

  // ── Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    }
  }, [])

  // ── Start Session (audio unlock)
  if (!activated) {
    return (
      <div
        className="flex h-screen w-full flex-col items-center justify-center gap-8"
        style={{ backgroundColor: colors.patient.bg }}
      >
        <h1 className="text-center text-5xl font-bold" style={{ color: colors.patient.text }}>
          Welcome to Glance
        </h1>
        <p className="text-center text-xl" style={{ color: colors.patient.text, opacity: 0.7 }}>
          Tap the button below to start the session
        </p>
        <button
          type="button"
          onClick={() => setActivated(true)}
          aria-label="Start Session"
          className="flex items-center justify-center rounded-2xl font-bold transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4"
          style={{
            minWidth: '300px',
            minHeight: '150px',
            backgroundColor: colors.patient.accent,
            color: '#000',
            fontSize: '2.5rem',
          }}
        >
          Start Session
        </button>
      </div>
    )
  }

  return (
    <InteractionProvider
      mode={interactionMode}
      gazeDirection={gazeDirection}
      blinkSignal={blinkSignal}
    >
      <div
        className="relative flex h-screen w-full flex-col"
        style={{ backgroundColor: colors.patient.bg }}
      >
        {/* Hidden video for MediaPipe gaze tracking */}
        <video
          ref={videoRef}
          className="absolute"
          style={{ width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
          autoPlay
          muted
          playsInline
        />

        {/* Status indicators */}
        <div className="absolute top-3 left-3 flex gap-2 z-10">
          {micDenied && (
            <span className="rounded bg-yellow-800 px-2 py-1 text-xs text-yellow-200">
              Vocal SOS inactive
            </span>
          )}
          {permissionDenied && (
            <span className="rounded bg-orange-900 px-2 py-1 text-xs text-orange-200">
              Camera denied — scan mode
            </span>
          )}
          {stream && !modelReady && (
            <span className="rounded bg-blue-900 px-2 py-1 text-xs text-blue-200">
              Gaze loading…
            </span>
          )}
          {stream && modelReady && !facePresent && (
            <span className="rounded bg-purple-900 px-2 py-1 text-xs text-purple-200">
              No face detected — scan mode
            </span>
          )}
        </div>

        {/* SOS overlay */}
        {sosTriggered && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-red-700 bg-opacity-90">
            <p className="text-center text-5xl font-black text-white">SOS SENT</p>
          </div>
        )}

        {/* Main content */}
        {currentMessage?.isYesNo ? (
          <YesNoScreen
            question={currentMessage.content}
            messageId={currentMessage.id}
            dashboardUrl={dashboardUrl}
            deviceToken={deviceToken}
            onReply={() => setCurrentMessage(null)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            {currentMessage ? (
              <p
                className="max-w-4xl px-8 text-center font-bold leading-tight"
                style={{
                  color: colors.patient.text,
                  fontSize: '3rem',
                  fontFamily: '"Atkinson Hyperlegible", "Inter", sans-serif',
                }}
              >
                {currentMessage.content}
              </p>
            ) : (
              <p
                className="text-center"
                style={{ color: colors.patient.text, opacity: 0.3, fontSize: '1.5rem' }}
              >
                Waiting for a message…
              </p>
            )}
          </div>
        )}

        {/* SOS button — always visible, registered as interaction target */}
        <SOSButton onClick={() => void triggerSOS()} />

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
            onClose={() => setShowGazePanel(false)}
            minimized={currentMessage !== null}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowGazePanel(true)}
            aria-label="Show gaze tracking panel"
            className="fixed top-3 right-3 z-50 rounded-full px-3 py-2 text-sm font-medium shadow-lg transition-transform active:scale-95"
            style={{ backgroundColor: 'rgba(17,17,17,0.92)', color: colors.patient.text, border: `1px solid ${colors.patient.accent}55` }}
          >
            👁 Show tracking
          </button>
        )}
      </div>
    </InteractionProvider>
  )
}
