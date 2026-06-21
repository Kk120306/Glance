'use client'

import { useEffect, useRef, useState } from 'react'
import { isCameraWindowActive } from '@glance/shared/utils/camera-schedule'
import type { CameraSchedule } from '@glance/shared/ws'
import { stopAllTracks } from '../utils/cameraTracks'

interface CameraStreamState {
  stream: MediaStream | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  permissionDenied: boolean
}

interface UseCameraStreamOptions {
  schedules: CameraSchedule[]
  overrideActive: boolean
}

export function useCameraStream({ schedules, overrideActive }: UseCameraStreamOptions): CameraStreamState {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    const cameraActive = isCameraWindowActive(schedules, overrideActive)

    if (!cameraActive) {
      if (streamRef.current) {
        stopAllTracks(streamRef.current)
        streamRef.current = null
        setStream(null)
        if (videoRef.current) videoRef.current.srcObject = null
      }
      return
    }

    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
      .then((s) => {
        if (cancelled) {
          stopAllTracks(s)
          return
        }
        streamRef.current = s
        setStream(s)
        setPermissionDenied(false)
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(console.error)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[camera] getUserMedia failed:', err)
        setPermissionDenied(true)
      })

    return () => {
      cancelled = true
      if (streamRef.current) {
        stopAllTracks(streamRef.current)
        streamRef.current = null
        setStream(null)
        if (videoRef.current) videoRef.current.srcObject = null
      }
    }
    // Re-evaluate whenever schedule or override changes
  }, [schedules, overrideActive])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        stopAllTracks(streamRef.current)
        streamRef.current = null
      }
    }
  }, [])

  return { stream, videoRef, permissionDenied }
}
