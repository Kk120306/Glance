'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  computeEAR,
  computeEyeGaze,
  classifyOffset,
  updateBaseline,
  createGazeSmoother,
  EAR_THRESHOLD,
  GAZE_SEED_FRAMES,
  adjustEarThreshold,
  type GazeDirection,
  type GazeOffset,
} from '../utils/gazeUtils'

// Temporarily override console.error globally at the module level to filter out MediaPipe/TFLite info logs.
// WebAssembly compiles its standard output bound to the global console object when loaded/instantiated,
// so overriding console.error here ensures that WebAssembly prints do not trigger Next.js development error overlays.
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    const msg = args[0]
    if (
      typeof msg === 'string' &&
      (msg.includes('Created TensorFlow Lite XNNPACK delegate') ||
        msg.includes('TensorFlow Lite') ||
        msg.includes('delegate') ||
        msg.includes('XNNPACK') ||
        msg.includes('INFO: Created'))
    ) {
      return
    }
    originalConsoleError.apply(console, args)
  }
}

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
  /** Live baseline-relative gaze cursor in [-1, 1] per axis, updated every
   *  frame WITHOUT triggering re-renders. Read it from an animation loop. */
  gazeOffsetRef: React.RefObject<GazeOffset>
  /** Live RAW (un-smoothed) gaze direction, updated every frame WITHOUT
   *  re-rendering. Lets a consumer react with zero hysteresis lag — e.g. halt a
   *  steered cursor the instant the eyes return to center. */
  gazeDirectionRawRef: React.RefObject<GazeDirection>
  /** Live average Eye Aspect Ratio (both eyes), updated every frame WITHOUT
   *  re-rendering. Read it from the calibration loop to sample open/closed EAR. */
  earRef: React.RefObject<number>
  /** Force the neutral baseline to recalibrate to the current gaze. */
  recenter: () => void
}

interface UseGazeTrackerOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>
  enabled: boolean
  /** Override the blink EAR threshold (from calibration). Falls back to the
   *  built-in EAR_THRESHOLD when undefined. */
  earThreshold?: number
}

export function useGazeTracker({ videoRef, enabled, earThreshold }: UseGazeTrackerOptions): UseGazeTrackerResult {
  const [modelReady, setModelReady] = useState(false)
  const [gazeDirection, setGazeDirection] = useState<GazeDirection>('center')
  const [blinkSignal, setBlinkSignal] = useState(0)
  const [facePresent, setFacePresent] = useState(false)

  const landmarkerRef = useRef<{
    detectForVideo: (video: HTMLVideoElement, ts: number) => { faceLandmarks: Array<Array<{ x: number; y: number; z: number }>> }
    close: () => void
  } | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const blinkConsecutiveRef = useRef(0)
  const lastFaceSeenRef = useRef(0)

  // Adaptive-baseline gaze state (persists across frames, never re-renders)
  const smootherRef = useRef(createGazeSmoother())
  const baselineRef = useRef<GazeOffset>({ x: 0, y: 0 })
  const seedCountRef = useRef(0)
  const seedAccumRef = useRef<GazeOffset>({ x: 0, y: 0 })
  const recenterRef = useRef(false)
  const gazeOffsetRef = useRef<GazeOffset>({ x: 0, y: 0 })
  const gazeDirectionRawRef = useRef<GazeDirection>('center')
  const earRef = useRef<number>(EAR_THRESHOLD)

  // Live blink threshold. Defaults to the built-in constant; calibration can
  // override it via the `earThreshold` option. Held in a ref so the per-frame
  // blink check reads the latest value without restarting the detection loop.
  const earThresholdRef = useRef<number>(earThreshold ?? EAR_THRESHOLD)
  useEffect(() => {
    earThresholdRef.current = earThreshold ?? EAR_THRESHOLD
  }, [earThreshold])

  // Recalibrate neutral gaze: clears the baseline seed and the smoother so the
  // next frames re-establish "looking straight ahead" wherever the eyes are now.
  const recenter = useCallback(() => {
    recenterRef.current = true
  }, [])

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

        // Pre-calculate iris offsets to dynamically adjust blink threshold for downward gaze.
        const leftOffset = computeEyeGaze(get(LM.LEFT_IRIS), get(LM.LEFT_EYE_OUTER), get(LM.LEFT_EYE_INNER))
        const rightOffset = computeEyeGaze(get(LM.RIGHT_IRIS), get(LM.RIGHT_EYE_INNER), get(LM.RIGHT_EYE_OUTER))
        const offset: GazeOffset = {
          x: (leftOffset.x + rightOffset.x) / 2,
          y: (leftOffset.y + rightOffset.y) / 2,
        }

        // Blink detection: EAR on both eyes, blink = both below threshold ≥ 2 frames.
        const leftEAR = computeEAR(get(LM.LEFT_UPPER_LID), get(LM.LEFT_LOWER_LID), get(LM.LEFT_EYE_OUTER), get(LM.LEFT_EYE_INNER))
        const rightEAR = computeEAR(get(LM.RIGHT_UPPER_LID), get(LM.RIGHT_LOWER_LID), get(LM.RIGHT_EYE_INNER), get(LM.RIGHT_EYE_OUTER))
        const avgEAR = (leftEAR + rightEAR) / 2
        // Expose the live EAR for the calibration wizard (no re-render).
        earRef.current = avgEAR

        const dy = offset.y - baselineRef.current.y
        const adjustedThreshold = adjustEarThreshold(earThresholdRef.current, dy)
        const blinking = avgEAR < adjustedThreshold

        if (blinking) {
          blinkConsecutiveRef.current++
          if (blinkConsecutiveRef.current >= 2) {
            setBlinkSignal(prev => prev + 1)
            blinkConsecutiveRef.current = 0
          }
        } else {
          blinkConsecutiveRef.current = 0
        }

        // Gaze only when the eyes are open: closed-eye iris landmarks are
        // garbage and would emit false directions, poison the neutral baseline,
        // and cancel an in-progress dwell on every natural blink. While blinking
        // we hold the last stable direction instead.
        if (!blinking) {

          // Recenter request: restart calibration from scratch.
          if (recenterRef.current) {
            recenterRef.current = false
            seedCountRef.current = 0
            seedAccumRef.current = { x: 0, y: 0 }
            smootherRef.current.reset()
          }

          // Calibrate the neutral baseline: fast seed at startup, then a slow
          // EMA that only adapts near neutral (see updateBaseline).
          if (seedCountRef.current < GAZE_SEED_FRAMES) {
            seedAccumRef.current = {
              x: seedAccumRef.current.x + offset.x,
              y: seedAccumRef.current.y + offset.y,
            }
            seedCountRef.current++
            const n = seedCountRef.current
            baselineRef.current = { x: seedAccumRef.current.x / n, y: seedAccumRef.current.y / n }
          } else {
            baselineRef.current = updateBaseline(baselineRef.current, offset)
          }

          // Expose the live cursor (for the debug panel) without re-rendering.
          gazeOffsetRef.current = {
            x: offset.x - baselineRef.current.x,
            y: offset.y - baselineRef.current.y,
          }

          const rawGaze = classifyOffset(offset, baselineRef.current)
          // Expose the raw direction every frame (no re-render) so a consumer
          // can halt with zero hysteresis lag the moment the eyes recenter.
          gazeDirectionRawRef.current = rawGaze
          const smoothed = smootherRef.current.push(rawGaze)
          // setState bails out when the value is unchanged, so this is cheap.
          setGazeDirection(smoothed)
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

  return { modelReady, gazeDirection, blinkSignal, facePresent, gazeOffsetRef, gazeDirectionRawRef, earRef, recenter }
}
