'use client'

import { useRef, useState } from 'react'
import { Button } from '@glance/shared/design/components'

type RecorderStatus = 'idle' | 'recording' | 'uploading' | 'done' | 'error'

/** Auto-stop a recording after this long so caregivers can't run forever. */
const MAX_RECORD_MS = 60_000

interface VoiceRecorderProps {
  /** Called with the new ElevenLabs voice id once cloning succeeds. */
  onCloned?: (voiceId: string) => void
  /** Endpoint the recording is POSTed to. Defaults to the signed-in caregiver's
   *  own voice; pass a persona clone URL to attach the voice to a persona. */
  uploadUrl?: string
}

/**
 * In-app voice cloning recorder (caregiver-facing, dashboard only). Records a
 * short sample with the browser's MediaRecorder, uploads it to the voice-clone
 * endpoint, and reports the resulting voice id. The microphone tracks are always
 * stopped once recording ends.
 */
export function VoiceRecorder({ onCloned, uploadUrl = '/api/family-member/me/voice-clone' }: VoiceRecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  function clearTimers() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoStopRef.current) clearTimeout(autoStopRef.current)
    timerRef.current = null
    autoStopRef.current = null
  }

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => void uploadRecording()
      recorderRef.current = recorder
      recorder.start()
      setStatus('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
      autoStopRef.current = setTimeout(stopRecording, MAX_RECORD_MS)
    } catch {
      setError('Microphone permission denied')
      setStatus('error')
    }
  }

  function stopRecording() {
    clearTimers()
    setStatus('uploading')
    recorderRef.current?.stop() // fires onstop → uploadRecording
  }

  async function uploadRecording() {
    stopTracks()
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (blob.size === 0) {
      setError('No audio was captured')
      setStatus('error')
      return
    }
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'voice.webm')
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Voice cloning failed')
        setStatus('error')
        return
      }
      const data = (await res.json()) as { voiceId: string }
      setStatus('done')
      onCloned?.(data.voiceId)
    } catch {
      setError('Network error — please try again')
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface-warm p-5">
      {status === 'recording' && (
        <div className="flex items-end justify-center gap-1" style={{ height: 56 }}>
          {[24, 48, 36, 60, 30, 52, 40, 58, 28, 44, 34].map((h, i) => (
            <span
              key={i}
              className="w-[5px] rounded"
              style={{
                height: h,
                background: ['#A98CF7', '#7C5CFC', '#EC8FDE'][i % 3],
                transformOrigin: 'center',
                animation: `recWave 1s ease-in-out ${i * 0.1}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        {status === 'recording' ? (
          <Button onClick={stopRecording}>■ Stop ({seconds}s)</Button>
        ) : (
          <Button onClick={startRecording} disabled={status === 'uploading'}>
            {status === 'uploading'
              ? 'Cloning…'
              : status === 'done'
                ? 'Record again'
                : '● Record your voice'}
          </Button>
        )}

        {status === 'recording' && (
          <span className="flex items-center gap-2 text-sm font-bold" style={{ color: '#C62A2F' }}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#E5484D', animation: 'recDot 1s ease-in-out infinite' }} />
            Recording — speak 2–3 sentences
          </span>
        )}
        {status === 'done' && <span className="text-sm font-bold" style={{ color: '#0B6F63' }}>Voice cloned ✓</span>}
      </div>

      {error && (
        <p role="alert" className="text-sm font-bold text-error">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-faint">
        Record a short sample and Glance clones your voice automatically — your
        patient will hear messages read in your voice.
      </p>
    </div>
  )
}
