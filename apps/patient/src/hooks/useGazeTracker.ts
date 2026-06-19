'use client'

import { useEffect, useRef, useState } from 'react'
import {
  computeEAR,
  classifyGazeDirection,
  smoothGazeDirection,
  EAR_THRESHOLD,
  GAZE_SMOOTH_FRAMES,
  type GazeDirection,
} from '../utils/gazeUtils'

// Face Landmarker landmark indices (MediaPipe Face Mesh topology)
const LM = {
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_OUTER: 263,
  LEFT_IRIS: 468,
  RIGHT_IRIS: 473,
  LEFT_UPPER_LID: 159,
  LEFT_LOWER_LID: 145,
  RIGHT_UPPER_LID: 386,
  RIGHT_LOWER_LID: 374,
} as const

const FACE_LOSS_TIMEOUT_MS = 5000

interface UseGazeTrackerResult {
  modelReady: boolean
  gazeDirection: GazeDirection
  blinkSignal: number
  facePresent: boolean
}

interface UseGazeTrackerOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>
  enabled: boolean
}

export function useGazeTracker({ videoRef, enabled }: UseGazeTrackerOptions): UseGazeTrackerResult {
  const [modelReady, setModelReady] = useState(false)
  const [gazeDirection, setGazeDirection] = useState<GazeDirection>('center')
  const [blinkSignal, setBlinkSignal] = useState(0)
  const [facePresent, setFacePresent] = useState(false)

  const landmarkerRef = useRef<{
    detectForVideo: (video: HTMLVideoElement, ts: number) => { faceLandmarks: Array<Array<{ x: number; y: number; z: number }>> }
    close: () => void
  } | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const gazeHistoryRef = useRef<GazeDirection[]>([])
  const blinkConsecutiveRef = useRef(0)
  const lastFaceSeenRef = useRef(0)

  // Load MediaPipe model asynchronously
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    void (async () => {
      try {
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
        )
        const lm = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        })

        if (cancelled) { lm.close(); return }
        landmarkerRef.current = lm
        setModelReady(true)
      } catch (err) {
        console.error('[gaze] MediaPipe model failed to load; staying in ScanMode:', err)
      }
    })()

    return () => { cancelled = true }
  }, [enabled])

  // Per-frame processing loop
  useEffect(() => {
    if (!modelReady || !enabled) return

    const lm = landmarkerRef.current
    if (!lm) return

    const processFrame = () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(processFrame)
        return
      }

      let results: { faceLandmarks: Array<Array<{ x: number; y: number; z: number }>> }
      try {
        results = lm.detectForVideo(video, performance.now())
      } catch {
        animFrameRef.current = requestAnimationFrame(processFrame)
        return
      }
      const landmarks = results.faceLandmarks[0]

      if (!landmarks || landmarks.length < 474) {
        const now = Date.now()
        if (lastFaceSeenRef.current > 0 && now - lastFaceSeenRef.current > FACE_LOSS_TIMEOUT_MS) {
          setFacePresent(false)
        }
      } else {
        lastFaceSeenRef.current = Date.now()
        setFacePresent(true)

        const get = (idx: number) => landmarks[idx]!

        // Gaze: classify per eye, prefer non-center
        const leftGaze = classifyGazeDirection(get(LM.LEFT_IRIS), get(LM.LEFT_EYE_OUTER), get(LM.LEFT_EYE_INNER))
        const rightGaze = classifyGazeDirection(get(LM.RIGHT_IRIS), get(LM.RIGHT_EYE_INNER), get(LM.RIGHT_EYE_OUTER))
        const rawGaze: GazeDirection = leftGaze !== 'center' ? leftGaze : rightGaze

        gazeHistoryRef.current.push(rawGaze)
        if (gazeHistoryRef.current.length > GAZE_SMOOTH_FRAMES) gazeHistoryRef.current.shift()
        setGazeDirection(smoothGazeDirection(gazeHistoryRef.current))

        // Blink: EAR on both eyes, blink = both below threshold ≥ 2 frames
        const leftEAR = computeEAR(get(LM.LEFT_UPPER_LID), get(LM.LEFT_LOWER_LID), get(LM.LEFT_EYE_OUTER), get(LM.LEFT_EYE_INNER))
        const rightEAR = computeEAR(get(LM.RIGHT_UPPER_LID), get(LM.RIGHT_LOWER_LID), get(LM.RIGHT_EYE_INNER), get(LM.RIGHT_EYE_OUTER))
        const avgEAR = (leftEAR + rightEAR) / 2

        if (avgEAR < EAR_THRESHOLD) {
          blinkConsecutiveRef.current++
          if (blinkConsecutiveRef.current >= 2) {
            setBlinkSignal(prev => prev + 1)
            blinkConsecutiveRef.current = 0
          }
        } else {
          blinkConsecutiveRef.current = 0
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame)
    }

    animFrameRef.current = requestAnimationFrame(processFrame)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
  }, [modelReady, enabled, videoRef])

  // Close landmarker on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      landmarkerRef.current?.close()
    }
  }, [])

  return { modelReady, gazeDirection, blinkSignal, facePresent }
}
