'use client'

import { useEffect, useRef, useState } from 'react'
import { colors } from '@glance/shared/design/tokens'
import { useInteraction } from '@glance/shared/design/components'
import { offsetToDisplay, createGazeCursorSmoother, type GazeDirection, type GazeOffset } from '../utils/gazeUtils'

interface GazeTrackingPanelProps {
  stream: MediaStream | null
  gazeDirection: GazeDirection
  /** Live baseline-relative gaze cursor, updated every frame by the tracker. */
  gazeOffsetRef: React.RefObject<GazeOffset>
  blinkSignal: number
  modelReady: boolean
  facePresent: boolean
  mode: 'gaze' | 'scan'
  permissionDenied: boolean
  /** Recalibrate "looking straight ahead" to the current gaze. */
  onRecenter: () => void
  /** Open the caregiver calibration wizard (touch action). */
  onCalibrate: () => void
  onClose: () => void
  minimized: boolean
}

const ARROW: Record<GazeDirection, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  center: '•',
}

export function GazeTrackingPanel({
  stream,
  gazeDirection,
  gazeOffsetRef,
  blinkSignal,
  modelReady,
  facePresent,
  mode,
  permissionDenied,
  onRecenter,
  onCalibrate,
  onClose,
  minimized,
}: GazeTrackingPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const dotRef = useRef<HTMLDivElement | null>(null)
  // One Euro smoother for the live cursor, plus the timestamp of the previous
  // frame so the filter can be frame-rate independent.
  const cursorSmootherRef = useRef(createGazeCursorSmoother())
  const lastFrameTsRef = useRef<number | null>(null)
  const [blinkCount, setBlinkCount] = useState(0)
  const [blinkFlash, setBlinkFlash] = useState(false)
  const prevBlinkRef = useRef(blinkSignal)

  // Real dwell state from the interaction layer — this reflects actual
  // selection progress on whatever target the steered cursor is parked on.
  const { focusedTargetId, dwellProgress } = useInteraction()

  // Attach the EXISTING stream to a second <video> for self-view. No new
  // getUserMedia → no extra MediaStream track to stop (camera-lifecycle safe).
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (stream) {
      v.srcObject = stream
      v.play().catch(() => {})
    } else {
      v.srcObject = null
    }
    return () => {
      if (v) v.srcObject = null
    }
  }, [stream])

  // Blink → flash + counter
  useEffect(() => {
    if (blinkSignal > prevBlinkRef.current) {
      prevBlinkRef.current = blinkSignal
      setBlinkCount((c) => c + 1)
      setBlinkFlash(true)
      const t = setTimeout(() => setBlinkFlash(false), 220)
      return () => clearTimeout(t)
    }
  }, [blinkSignal])

  // Drive the live cursor from the tracker's per-frame offset ref via rAF. The
  // raw offset is noisy and updates only at the model's detection rate, so we
  // run it through a One Euro filter (frame-rate independent via the measured
  // dt) for a smooth, calm follow instead of a jittery snap. Position is owned
  // by this loop, not React, so re-renders never reset it. The x axis is
  // mirrored to match the mirrored self-view.
  useEffect(() => {
    const smoother = cursorSmootherRef.current
    smoother.reset()
    lastFrameTsRef.current = null
    let raf = 0
    const tick = (now: number) => {
      const dot = dotRef.current
      if (dot) {
        const last = lastFrameTsRef.current
        // Clamp dt to a sane range: avoids a huge jump after the tab was
        // backgrounded and guards against a zero/negative interval.
        const dt = last === null ? 1 / 60 : Math.min(0.1, Math.max((now - last) / 1000, 1 / 240))
        lastFrameTsRef.current = now

        const smoothed = smoother.push(gazeOffsetRef.current?.x ?? 0, gazeOffsetRef.current?.y ?? 0, dt)
        const { x, y } = offsetToDisplay(smoothed.x, smoothed.y)
        const leftPct = 50 - x * 45 // mirror horizontally
        const topPct = 50 + y * 45
        dot.style.left = `${leftPct}%`
        dot.style.top = `${topPct}%`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [gazeOffsetRef])

  const statusText = permissionDenied
    ? 'Camera blocked'
    : !stream
      ? 'Camera off'
      : !modelReady
        ? 'Loading model…'
        : facePresent
          ? 'Face detected'
          : 'No face in frame'

  if (minimized) {
    return (
      <div
        className="fixed top-3 right-3 z-50 flex w-[320px] flex-col gap-3 rounded-2xl p-4 shadow-2xl"
        style={{
          backgroundColor: 'rgba(17,17,17,0.92)',
          border: `1px solid ${colors.patient.accent}55`,
          backdropFilter: 'blur(6px)',
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold tracking-wide" style={{ color: colors.patient.text }}>
            👁 Gaze Tracking
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onRecenter}
              aria-label="Recenter gaze calibration"
              title="Look straight ahead, then click to recalibrate neutral gaze"
              className="rounded px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: `${colors.patient.accent}22`, color: colors.patient.accent }}
            >
              Recenter
            </button>
            <button
              type="button"
              onClick={onCalibrate}
              aria-label="Open calibration wizard"
              title="Caregiver: measure the patient's blink threshold and gaze baseline"
              className="rounded px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: '#3a2f12', color: colors.patient.highlight }}
            >
              Calibrate
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Hide tracking panel"
              className="rounded px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: '#333', color: colors.patient.text }}
            >
              Hide
            </button>
          </div>
        </div>

        {/* Self-view (mirrored). Black box with overlaid status if no stream. */}
        <div
          className="relative overflow-hidden rounded-lg"
          style={{ aspectRatio: '4 / 3', backgroundColor: '#000' }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          {(!stream || !facePresent) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="rounded px-2 py-1 text-xs"
                style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: colors.patient.highlight }}
              >
                {statusText}
              </span>
            </div>
          )}
          {/* Blink flash overlay */}
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-150"
            style={{
              backgroundColor: colors.patient.accent,
              opacity: blinkFlash ? 0.45 : 0,
            }}
          />
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Chip label={`Model: ${modelReady ? 'ready' : 'loading'}`} ok={modelReady} />
          <Chip label={`Face: ${facePresent ? 'yes' : 'no'}`} ok={facePresent} />
          <Chip label={`Mode: ${mode}`} ok={mode === 'gaze'} />
        </div>

        {/* Live continuous gaze cursor — the dot follows the eyes every frame. */}
        <div className="flex items-center gap-3">
          <div
            className="relative flex-shrink-0 rounded-lg"
            style={{
              width: 96,
              height: 96,
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
            }}
          >
            {/* crosshair lines */}
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2" style={{ backgroundColor: '#2a2a2a' }} />
            <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2" style={{ backgroundColor: '#2a2a2a' }} />
            {/* live gaze dot — position (left/top) is owned by the rAF loop, not
                React, so re-renders never snap it back to center. */}
            <div
              ref={dotRef}
              className="absolute rounded-full"
              style={{
                width: 22,
                height: 22,
                transform: 'translate(-50%, -50%)',
                backgroundColor:
                  gazeDirection === 'center' ? colors.patient.text : colors.patient.accent,
                boxShadow:
                  gazeDirection === 'center' ? 'none' : `0 0 14px ${colors.patient.accent}`,
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-3xl font-black leading-none" style={{ color: colors.patient.accent }}>
              {ARROW[gazeDirection]} <span className="text-base font-semibold">{gazeDirection}</span>
            </span>
            {/* real dwell progress bar */}
            <div className="h-2 w-36 overflow-hidden rounded-full" style={{ backgroundColor: '#2a2a2a' }}>
              <div
                className="h-full rounded-full transition-[width] duration-75"
                style={{
                  width: `${Math.round(dwellProgress * 100)}%`,
                  backgroundColor: colors.patient.accent,
                }}
              />
            </div>
            <span className="text-[11px]" style={{ color: colors.patient.text, opacity: 0.7 }}>
              {focusedTargetId
                ? `holding ${focusedTargetId}… ${Math.round(dwellProgress * 100)}%`
                : mode !== 'gaze'
                  ? 'scan mode — blink to select'
                  : gazeDirection === 'center'
                    ? 'steer: look up / down / left / right'
                    : `steering ${gazeDirection}`}
            </span>
          </div>
        </div>

        {/* Counters */}
        <div className="flex justify-between text-[11px]" style={{ color: colors.patient.text, opacity: 0.8 }}>
          <span>Blinks: {blinkCount}</span>
          <span>{facePresent ? 'tracking eyes ✓' : '—'}</span>
        </div>
      </div>
    )
  }

  // Maximized Full-Screen Training & Practice Layout
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-between p-8"
      style={{
        backgroundColor: '#0A0A0A',
        backgroundImage: 'radial-gradient(circle at center, #111827 0%, #0A0A0A 100%)',
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      {/* Background Crosshairs Grid */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="absolute left-1/2 top-0 h-full w-px border-l border-dashed border-neutral-800/40 -translate-x-1/2" />
        <div className="absolute top-1/2 left-0 h-px w-full border-t border-dashed border-neutral-800/40 -translate-y-1/2" />
      </div>

      {/* Top Header */}
      <div className="w-full flex justify-between items-center z-10 border-b border-white/5 pb-4">
        <span className="text-xl font-bold tracking-wide flex items-center gap-2" style={{ color: colors.patient.text }}>
          👁 Glance Calibration & Practice
        </span>
        <span className="text-sm font-medium px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400">
          {statusText}
        </span>
      </div>

      {/* Centered Column with UP, Camera, Info, DOWN */}
      <div className="flex flex-col items-center justify-center gap-4 my-auto z-10">
        {/* UP Target */}
        <div
          className="flex flex-col items-center justify-center rounded-2xl px-10 py-3 transition-all duration-200 border"
          style={{
            width: 200,
            backgroundColor: gazeDirection === 'up' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(20, 20, 20, 0.7)',
            borderColor: gazeDirection === 'up' ? colors.patient.accent : 'rgba(255, 255, 255, 0.08)',
            transform: `scale(${gazeDirection === 'up' ? 1.05 : 1})`,
            boxShadow: gazeDirection === 'up' ? `0 0 25px ${colors.patient.accent}22` : 'none',
          }}
        >
          <span className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">UP</span>
          <span className="text-2xl font-black mt-0.5" style={{ color: colors.patient.accent }}>YES</span>
          {gazeDirection === 'up' && (
            <div className="h-1 w-24 bg-neutral-800 rounded-full mt-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-75" style={{ width: `${Math.round(dwellProgress * 100)}%`, backgroundColor: colors.patient.accent }} />
            </div>
          )}
        </div>

        {/* Camera Container */}
        <div
          className="relative overflow-hidden rounded-2xl p-2 transition-all duration-300"
          style={{
            backgroundColor: 'rgba(20, 20, 20, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            boxShadow: facePresent && modelReady
              ? `0 0 30px ${colors.patient.accent}15`
              : `0 0 30px rgba(239, 68, 68, 0.08)`,
          }}
        >
          <div className="relative w-[360px] aspect-[4/3] overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {(!stream || !facePresent) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <span
                  className="rounded px-4 py-2 text-xs font-semibold tracking-wide text-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: colors.patient.highlight }}
                >
                  {statusText}
                </span>
              </div>
            )}
            {/* Blink flash overlay */}
            <div
              className="pointer-events-none absolute inset-0 transition-opacity duration-150"
              style={{
                backgroundColor: colors.patient.accent,
                opacity: blinkFlash ? 0.45 : 0,
              }}
            />
          </div>
        </div>

        {/* Helper Instructions */}
        <div className="text-center max-w-sm px-4">
          <h2 className="text-lg font-bold tracking-tight text-white">
            {facePresent ? 'Face Detected' : 'Center Your Face'}
          </h2>
          <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
            {facePresent
              ? 'Look UP, DOWN, LEFT, or RIGHT to practice. Click Recenter to calibrate.'
              : 'Ensure your face is centered and lit for eye tracking.'}
          </p>
        </div>

        {/* DOWN Target */}
        <div
          className="flex flex-col items-center justify-center rounded-2xl px-10 py-3 transition-all duration-200 border"
          style={{
            width: 200,
            backgroundColor: gazeDirection === 'down' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(20, 20, 20, 0.7)',
            borderColor: gazeDirection === 'down' ? colors.patient.sos : 'rgba(255, 255, 255, 0.08)',
            transform: `scale(${gazeDirection === 'down' ? 1.05 : 1})`,
            boxShadow: gazeDirection === 'down' ? `0 0 25px ${colors.patient.sos}22` : 'none',
          }}
        >
          <span className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">DOWN</span>
          <span className="text-2xl font-black mt-0.5" style={{ color: colors.patient.sos }}>NO</span>
          {gazeDirection === 'down' && (
            <div className="h-1 w-24 bg-neutral-800 rounded-full mt-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-75" style={{ width: `${Math.round(dwellProgress * 100)}%`, backgroundColor: colors.patient.sos }} />
            </div>
          )}
        </div>
      </div>

      {/* LEFT Target */}
      <div
        className="absolute left-10 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center rounded-2xl px-6 py-6 transition-all duration-200 border"
        style={{
          backgroundColor: gazeDirection === 'left' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(20, 20, 20, 0.7)',
          borderColor: gazeDirection === 'left' ? colors.patient.accent : 'rgba(255, 255, 255, 0.08)',
          transform: `translateY(-50%) scale(${gazeDirection === 'left' ? 1.05 : 1})`,
          boxShadow: gazeDirection === 'left' ? `0 0 25px ${colors.patient.accent}22` : 'none',
        }}
      >
        <span className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">LEFT</span>
        <span className="text-3xl font-black mt-0.5" style={{ color: colors.patient.accent }}>←</span>
        {gazeDirection === 'left' && (
          <div className="h-1.5 w-16 bg-neutral-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-75" style={{ width: `${Math.round(dwellProgress * 100)}%`, backgroundColor: colors.patient.accent }} />
          </div>
        )}
      </div>

      {/* RIGHT Target */}
      <div
        className="absolute right-10 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center rounded-2xl px-6 py-6 transition-all duration-200 border"
        style={{
          backgroundColor: gazeDirection === 'right' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(20, 20, 20, 0.7)',
          borderColor: gazeDirection === 'right' ? colors.patient.accent : 'rgba(255, 255, 255, 0.08)',
          transform: `translateY(-50%) scale(${gazeDirection === 'right' ? 1.05 : 1})`,
          boxShadow: gazeDirection === 'right' ? `0 0 25px ${colors.patient.accent}22` : 'none',
        }}
      >
        <span className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">RIGHT</span>
        <span className="text-3xl font-black mt-0.5" style={{ color: colors.patient.accent }}>→</span>
        {gazeDirection === 'right' && (
          <div className="h-1.5 w-16 bg-neutral-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-75" style={{ width: `${Math.round(dwellProgress * 100)}%`, backgroundColor: colors.patient.accent }} />
          </div>
        )}
      </div>

      {/* No floating eye-tracking dot here: the InteractionProvider's
          joystick-steered cursor is now the single on-screen cursor. The small
          crosshair indicator in the minimized panel stays as a tracking aid. */}

      {/* Bottom Status & Controls Bar */}
      <div className="w-full flex items-center justify-between z-10 border-t border-white/5 pt-4 pr-[120px]">
        <div className="flex gap-2">
          <Chip label={`Model: ${modelReady ? 'ready' : 'loading'}`} ok={modelReady} />
          <Chip label={`Face: ${facePresent ? 'yes' : 'no'}`} ok={facePresent} />
          <Chip label={`Mode: ${mode}`} ok={mode === 'gaze'} />
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={onRecenter}
            className="rounded-xl px-5 py-2 text-sm font-semibold transition-all hover:scale-105 active:scale-95 bg-green-500/10 text-green-400 border border-green-500/30"
          >
            Recenter
          </button>
          <button
            type="button"
            onClick={onCalibrate}
            className="rounded-xl px-5 py-2 text-sm font-semibold transition-all hover:scale-105 active:scale-95 bg-amber-500/10 text-amber-300 border border-amber-500/30"
          >
            Calibrate
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-5 py-2 text-sm font-semibold transition-all hover:scale-105 active:scale-95 bg-neutral-800 text-neutral-300 border border-neutral-700/50"
          >
            Hide
          </button>
        </div>
      </div>
    </div>
  )
}

function Chip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className="rounded px-2 py-0.5 font-medium"
      style={{
        backgroundColor: ok ? `${colors.patient.accent}22` : '#3a2a2a',
        color: ok ? colors.patient.accent : colors.patient.highlight,
        border: `1px solid ${ok ? `${colors.patient.accent}55` : '#5a4a2a'}`,
      }}
    >
      {label}
    </span>
  )
}
