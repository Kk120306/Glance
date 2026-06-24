'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@glance/shared/design/components'

interface CameraCaptureProps {
  /** Called with a JPEG file once the caregiver captures a frame. */
  onCapture: (file: File) => void
  /** Close the capture UI without saving. */
  onCancel: () => void
}

/**
 * Caregiver-facing camera capture for message photo attachments. Video tracks
 * are always stopped on unmount, cancel, and after capture.
 */
export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setReady(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setError(null)
      try {
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
          setReady(true)
        }
      } catch {
        if (!cancelled) {
          setError('Camera permission denied or unavailable')
        }
      }
    })()

    return () => {
      cancelled = true
      stopTracks()
    }
  }, [stopTracks])

  function handleCapture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !ready) return

    const w = video.videoWidth
    const h = video.videoHeight
    if (w === 0 || h === 0) return

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)

    canvas.toBlob(
      (blob) => {
        stopTracks()
        if (!blob) {
          setError('Failed to capture photo')
          return
        }
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
        onCapture(file)
      },
      'image/jpeg',
      0.92,
    )
  }

  function handleCancel() {
    stopTracks()
    onCancel()
  }

  return (
    <div className="mt-3 rounded-[16px] border border-line bg-surface-warm p-4">
      <canvas ref={canvasRef} className="hidden" aria-hidden />
      {error ? (
        <p role="alert" className="text-sm font-bold text-error">
          {error}
        </p>
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          className="mb-3 w-full max-h-64 rounded-[12px] bg-black object-cover"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleCapture} disabled={!ready || !!error}>
          Capture photo
        </Button>
        <Button type="button" variant="ghost" onClick={handleCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
