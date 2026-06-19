'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import { SOSButton } from '@glance/shared/design/components'
import { colors } from '@glance/shared/design/tokens'
import type { ServerToClientMessage } from '@glance/shared/ws'

const ACTIVATED_KEY = 'glance-activated'
const SOS_THRESHOLD = 0.15

interface PatientScreenProps {
  wsServerUrl: string
  displaySeconds: number
  deviceToken: string
}

export function PatientScreen({ wsServerUrl, displaySeconds, deviceToken }: PatientScreenProps) {
  const [activated, setActivated] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // On mount, check if already activated
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(ACTIVATED_KEY) === '1') {
      setActivated(true)
    }
  }, [])

  const startAudioListener = useCallback(() => {
    if (typeof window === 'undefined') return

    const AudioCtx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    audioCtxRef.current = ctx
    ctx.resume().catch(console.error)

    // Amplitude threshold listener via Web Audio (no camera, no getUserMedia)
    const oscillator = ctx.createOscillator()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    // Create a silent media stream source to drive the analyser —
    // Per Phase 1 invariant: no getUserMedia. We wire an AnalyserNode to
    // a silent oscillator to have a live signal path ready; the real
    // microphone integration arrives in a later phase when camera/audio
    // permissions are collected via the CameraWindow flow.
    oscillator.connect(analyser)
    oscillator.start()

    const check = () => {
      analyser.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255
      if (avg > SOS_THRESHOLD) {
        console.warn('[SOS] amplitude threshold exceeded')
      }
    }

    const interval = setInterval(check, 200)
    return () => {
      clearInterval(interval)
      oscillator.stop()
      ctx.close().catch(console.error)
    }
  }, [])

  const connectSocket = useCallback((patientId?: string) => {
    const socket = io(wsServerUrl, {
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
      query: patientId ? { patientId } : {},
    })
    socketRef.current = socket

    socket.on('NEW_MESSAGE', (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'NEW_MESSAGE') return
      setMessage(envelope.payload.content)

      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      clearTimerRef.current = setTimeout(() => setMessage(null), displaySeconds * 1000)
    })

    return () => {
      socket.disconnect()
    }
  }, [wsServerUrl, displaySeconds])

  // When activated, wire up audio + socket
  useEffect(() => {
    if (!activated) return
    const cleanupAudio = startAudioListener()
    const cleanupSocket = connectSocket(deviceToken)
    return () => {
      cleanupAudio?.()
      cleanupSocket?.()
    }
  }, [activated, startAudioListener, connectSocket])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    }
  }, [])

  function handleActivate() {
    localStorage.setItem(ACTIVATED_KEY, '1')
    setActivated(true)
  }

  if (!activated) {
    return (
      <div
        className="flex h-screen w-full flex-col items-center justify-center gap-8"
        style={{ backgroundColor: colors.patient.bg }}
      >
        <h1
          className="text-center font-bold"
          style={{ color: colors.patient.text, fontSize: colors.patient.bg === '#0A0A0A' ? '3rem' : '3rem' }}
        >
          Welcome to Glance
        </h1>
        <p className="text-center text-xl" style={{ color: colors.patient.text, opacity: 0.7 }}>
          Tap the button below to start
        </p>
        <button
          type="button"
          onClick={handleActivate}
          aria-label="Start Glance"
          className="flex items-center justify-center rounded-2xl font-bold transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4"
          style={{
            minWidth: '240px',
            minHeight: '120px',
            backgroundColor: colors.patient.accent,
            color: '#000',
            fontSize: '2rem',
          }}
        >
          Start Glance
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative flex h-screen w-full flex-col items-center justify-center"
      style={{ backgroundColor: colors.patient.bg }}
    >
      {message ? (
        <p
          className="max-w-4xl px-8 text-center font-bold leading-tight"
          style={{
            color: colors.patient.text,
            fontSize: '3rem',
            fontFamily: '"Atkinson Hyperlegible", "Inter", sans-serif',
          }}
        >
          {message}
        </p>
      ) : (
        <p
          className="text-center"
          style={{
            color: colors.patient.text,
            opacity: 0.3,
            fontSize: '1.5rem',
          }}
        >
          Waiting for a message…
        </p>
      )}

      <SOSButton />
    </div>
  )
}
