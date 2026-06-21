'use client'

import { useEffect, useRef, useState } from 'react'
import { colors, typography } from '@glance/shared/design/tokens'
import { offsetToDisplay, type GazeOffset } from '../utils/gazeUtils'
import { computeEarThreshold } from '../utils/calibration'

type Step = 'waiting' | 'open' | 'closed' | 'result' | 'drift'

const SAMPLE_MS = 3000 // open / closed measurement window
const RESULT_MS = 2200 // auto-display of the computed threshold
const DRIFT_MS = 2800 // auto-display of the gaze drift check
const WAIT_TIMEOUT_MS = 12000 // give up waiting for a face, then skip (no lockup)
const TICK_MS = 50

interface CalibrationScreenProps {
  /** Live average EAR from the gaze tracker. */
  earRef: React.RefObject<number>
  /** Live baseline-relative gaze offset for the drift visualizer. */
  gazeOffsetRef: React.RefObject<GazeOffset>
  facePresent: boolean
  /** Recalibrate the neutral gaze baseline. */
  onRecenter: () => void
  /** Save + apply the computed threshold and close. */
  onComplete: (threshold: number) => void
  /** Close without saving (skip / abort). */
  onExit: () => void
}

/**
 * Fully autonomous startup calibration. The flow runs end-to-end with NO human
 * input: it waits for a face, samples eyes-open then eyes-closed EAR on visible
 * timers, shows the computed threshold, auto-recenters the gaze baseline, and
 * saves — then closes itself. An optional "Skip" button is the only control, kept
 * purely as a no-lockup safety valve (the flow never depends on it). Reuses the
 * existing camera stream — opens no new MediaStream tracks.
 */
export function CalibrationScreen({
  earRef,
  gazeOffsetRef,
  facePresent,
  onRecenter,
  onComplete,
  onExit,
}: CalibrationScreenProps) {
  const [step, setStep] = useState<Step>('waiting')
  const [progress, setProgress] = useState(0)
  const [openEAR, setOpenEAR] = useState<number | null>(null)
  const [closedEAR, setClosedEAR] = useState<number | null>(null)

  // Latest face state + callbacks held in refs so the timed effects below depend
  // only on `step` and never restart when the parent re-renders (inline callbacks
  // would otherwise reset the auto-advance timers and stall the flow).
  const facePresentRef = useRef(facePresent)
  facePresentRef.current = facePresent
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const onRecenterRef = useRef(onRecenter)
  onRecenterRef.current = onRecenter

  const threshold =
    openEAR !== null && closedEAR !== null ? computeEarThreshold(openEAR, closedEAR) : null

  // Step 'waiting': hold until a face is detected, then begin. If none appears
  // within the timeout, skip so startup is never blocked.
  useEffect(() => {
    if (step !== 'waiting') return
    if (facePresentRef.current) {
      setStep('open')
      return
    }
    const start = performance.now()
    const id = setInterval(() => {
      if (facePresentRef.current) {
        clearInterval(id)
        setStep('open')
      } else if (performance.now() - start >= WAIT_TIMEOUT_MS) {
        clearInterval(id)
        onExitRef.current()
      }
    }, 100)
    return () => clearInterval(id)
  }, [step])

  // Steps 'open' / 'closed': average live EAR over the window, then auto-advance.
  useEffect(() => {
    if (step !== 'open' && step !== 'closed') return
    setProgress(0)
    let sum = 0
    let count = 0
    const start = performance.now()
    const id = setInterval(() => {
      const ear = earRef.current ?? 0
      if (ear > 0) {
        sum += ear
        count++
      }
      const elapsed = performance.now() - start
      setProgress(Math.min(1, elapsed / SAMPLE_MS))
      if (elapsed >= SAMPLE_MS) {
        clearInterval(id)
        const avg = count > 0 ? sum / count : 0
        if (step === 'open') {
          setOpenEAR(avg)
          setStep('closed')
        } else {
          setClosedEAR(avg)
          setStep('result')
        }
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [step, earRef])

  // Step 'result': show the computed threshold briefly, then auto-advance.
  useEffect(() => {
    if (step !== 'result') return
    const id = setTimeout(() => setStep('drift'), RESULT_MS)
    return () => clearTimeout(id)
  }, [step])

  // Step 'drift': auto-recenter the neutral baseline, show the live gaze dot
  // briefly, then save (if the reading is sane) and close — all without input.
  useEffect(() => {
    if (step !== 'drift') return
    onRecenterRef.current()
    const id = setTimeout(() => {
      if (openEAR !== null && closedEAR !== null && openEAR > closedEAR) {
        onCompleteRef.current(computeEarThreshold(openEAR, closedEAR))
      } else {
        // Nonsensical reading (e.g. no face / patient never closed eyes): don't
        // persist a garbage threshold — just close and keep the previous value.
        onExitRef.current()
      }
    }, DRIFT_MS)
    return () => clearTimeout(id)
  }, [step, openEAR, closedEAR])

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 p-10"
      style={{ backgroundColor: colors.patient.bg, color: colors.patient.text }}
      role="dialog"
      aria-label="Calibration"
    >
      {/* Optional safety valve — the flow completes on its own without it. */}
      <button
        type="button"
        onClick={onExit}
        aria-label="Skip calibration"
        className="fixed top-4 right-4 rounded-full bg-white px-4 py-2 text-sm font-bold"
        style={{ color: colors.inkMuted, border: '1px solid #E4DAD0' }}
      >
        Skip ✕
      </button>

      <h1 className="text-center text-3xl font-semibold" style={{ fontFamily: typography.fontFamily.serif }}>Gaze &amp; Blink Calibration</h1>
      <p className="text-center text-sm opacity-60">
        Runs automatically — no buttons needed. Just follow the on-screen prompts.
      </p>

      {step === 'waiting' && (
        <div className="flex w-full max-w-xl flex-col items-center gap-6">
          <h2 className="text-2xl font-bold" style={{ color: colors.patient.accent }}>
            Preparing…
          </h2>
          <p className="text-center text-xl">
            {facePresent ? 'Starting calibration…' : 'Looking for the face — center it in the camera.'}
          </p>
          <div className="text-5xl">👁</div>
        </div>
      )}

      {(step === 'open' || step === 'closed') && (
        <MeasureStep
          title={step === 'open' ? 'Step 1 — Eyes Open' : 'Step 2 — Eyes Closed'}
          instruction={
            step === 'open'
              ? 'Look at the screen normally, eyes open.'
              : 'Gently close your eyes until the bar fills.'
          }
          progress={progress}
        />
      )}

      {step === 'result' && threshold !== null && (
        <ResultStep openEAR={openEAR ?? 0} closedEAR={closedEAR ?? 0} threshold={threshold} />
      )}

      {step === 'drift' && <DriftStep gazeOffsetRef={gazeOffsetRef} />}
    </div>
  )
}

function MeasureStep({
  title,
  instruction,
  progress,
}: {
  title: string
  instruction: string
  progress: number
}) {
  const remaining = Math.ceil((1 - progress) * (SAMPLE_MS / 1000))
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-6">
      <h2 className="text-2xl font-bold" style={{ color: colors.patient.accent }}>
        {title}
      </h2>
      <p className="text-center text-xl">{instruction}</p>
      <div className="text-6xl font-black">{remaining}</div>
      <div className="h-4 w-full overflow-hidden rounded-full" style={{ backgroundColor: '#EFE7DC' }}>
        <div
          className="h-full rounded-full transition-[width] duration-75"
          style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: colors.patient.accent }}
        />
      </div>
    </div>
  )
}

function ResultStep({
  openEAR,
  closedEAR,
  threshold,
}: {
  openEAR: number
  closedEAR: number
  threshold: number
}) {
  const max = Math.max(openEAR, closedEAR, threshold, 0.001)
  const bar = (label: string, value: number, color: string) => (
    <div className="flex items-center gap-3">
      <span className="w-28 text-right text-sm">{label}</span>
      <div className="h-6 flex-1 overflow-hidden rounded" style={{ backgroundColor: '#EFE7DC' }}>
        <div
          className="h-full rounded"
          style={{ width: `${Math.round((value / max) * 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-16 text-sm tabular-nums">{value.toFixed(3)}</span>
    </div>
  )
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-6">
      <h2 className="text-2xl font-bold" style={{ color: colors.patient.accent }}>
        Recommended Threshold
      </h2>
      <div className="flex w-full flex-col gap-3">
        {bar('Open EAR', openEAR, '#1F9D63')}
        {bar('Closed EAR', closedEAR, '#E5484D')}
        {bar('Threshold', threshold, colors.patient.accent)}
      </div>
      <p className="text-center text-sm opacity-70">
        A blink fires when the live EAR drops below the threshold.
      </p>
    </div>
  )
}

function DriftStep({ gazeOffsetRef }: { gazeOffsetRef: React.RefObject<GazeOffset> }) {
  const dotRef = useRef<HTMLDivElement | null>(null)

  // Live dot driven imperatively (no re-renders). Mirror x to match the
  // patient's-eye-view convention used elsewhere.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const dot = dotRef.current
      if (dot) {
        const o = gazeOffsetRef.current ?? { x: 0, y: 0 }
        const d = offsetToDisplay(o.x, o.y)
        dot.style.left = `${50 - d.x * 45}%`
        dot.style.top = `${50 + d.y * 45}%`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [gazeOffsetRef])

  // offsetToDisplay maps ±(2·threshold) → ±1, and the box maps display ±1 →
  // 50%∓45%. So a single activation threshold sits at 0.5·45% = 22.5% from
  // center, i.e. 27.5% / 72.5% of the box on each axis.
  const lo = '27.5%'
  const hi = '72.5%'

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-6">
      <h2 className="text-2xl font-bold" style={{ color: colors.patient.accent }}>
        Step 3 — Gaze Drift Check
      </h2>
      <p className="text-center text-sm opacity-70">
        Re-centering the neutral gaze baseline… look straight ahead.
      </p>
      <div
        className="relative rounded-xl"
        style={{ width: 280, height: 280, backgroundColor: '#FBF6F0', border: '1px solid #E4DAD0' }}
      >
        {/* center crosshair */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2" style={{ backgroundColor: '#EFE7DC' }} />
        <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2" style={{ backgroundColor: '#EFE7DC' }} />
        {/* activation threshold lines */}
        <div className="absolute top-0 h-full w-px" style={{ left: lo, backgroundColor: `${colors.patient.accent}55` }} />
        <div className="absolute top-0 h-full w-px" style={{ left: hi, backgroundColor: `${colors.patient.accent}55` }} />
        <div className="absolute left-0 w-full h-px" style={{ top: lo, backgroundColor: `${colors.patient.accent}55` }} />
        <div className="absolute left-0 w-full h-px" style={{ top: hi, backgroundColor: `${colors.patient.accent}55` }} />
        {/* live dot */}
        <div
          ref={dotRef}
          className="absolute rounded-full"
          style={{
            width: 20,
            height: 20,
            transform: 'translate(-50%, -50%)',
            backgroundColor: colors.patient.accent,
            boxShadow: `0 0 14px ${colors.patient.accent}`,
          }}
        />
      </div>
    </div>
  )
}
