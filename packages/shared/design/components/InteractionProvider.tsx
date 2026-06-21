'use client'

import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  useState,
} from 'react'

export type GazeDirection = 'up' | 'down' | 'left' | 'right' | 'center'

export interface InteractiveTarget {
  id: string
  ref: React.RefObject<HTMLElement | null>
  onSelect: () => void
  /** Reserved hint for direction-mapped layouts; the default gaze navigation
   *  steps through targets in reading order regardless of this value. */
  gazeDirection?: GazeDirection
}

interface InteractionContextValue {
  registerTarget: (target: InteractiveTarget) => () => void
  mode: 'gaze' | 'scan'
  /** Id of the target currently focused (gaze step-focus or scan highlight). */
  focusedTargetId: string | null
  /** Id of the target armed by a first blink, awaiting a confirming second blink. */
  armedTargetId: string | null
  /** Back-compat ring signal: 1 when the focused target is armed (ready to
   *  confirm), else 0. Lets existing dwell-ring visuals double as an arm cue. */
  dwellProgress: number
  /** Live gaze direction in gaze mode ('center' when paused or in scan mode).
   *  Lets targets/HUD render a steering cue so the patient can see their eye
   *  movement is about to step focus. */
  gazeDirection: GazeDirection
}

// Hold a gaze direction at least this long before focus steps once — long enough
// that a passing glance never moves focus, short enough to feel responsive.
// Exported so the patient steering cue can fill a progress bar over the same
// window (the bar completes exactly when focus steps).
export const STEP_SUSTAIN_MS = 350

/**
 * Map a raw gaze direction to the on-screen step it will trigger, or null when
 * the gaze is centered. The front camera images the patient un-mirrored, so the
 * classifier's horizontal axis is flipped vs. the screen (a look to screen-right
 * reads as 'left'); this mapping makes the cue point where focus actually moves:
 * 'next' = later in reading order (visually right/down), 'prev' = earlier (left/up).
 */
export function gazeStepDirection(dir: GazeDirection): 'prev' | 'next' | null {
  if (dir === 'center') return null
  return dir === 'left' || dir === 'down' ? 'next' : 'prev'
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

const InteractionContext = createContext<InteractionContextValue | null>(null)

export function useInteraction() {
  const ctx = useContext(InteractionContext)
  if (!ctx) throw new Error('useInteraction must be used within InteractionProvider')
  return ctx
}

interface InteractionProviderProps {
  mode: 'gaze' | 'scan'
  gazeDirection?: GazeDirection
  /** @deprecated retained for call-site compatibility; no longer read. */
  gazeDirectionRawRef?: React.RefObject<GazeDirection>
  /** Increments by 1 each time a blink is detected; drives selection/confirm. */
  blinkSignal?: number
  /** @deprecated dwell selection was replaced by blink-to-confirm. */
  gazeDwellMs?: number
  scanCycleMs?: number
  /** Temporarily suspend all input handling (gaze + scan). Used while a modal
   *  caregiver flow is open (e.g. calibration) so the patient cannot
   *  accidentally fire a target hidden behind the overlay. */
  paused?: boolean
  children: React.ReactNode
}

/**
 * Hands-free interaction engine.
 *
 * Gaze mode is "sticky": the patient never steers a free cursor. Instead, one
 * sustained look left/right/up/down steps a highlight between on-screen targets
 * (reading order), and the highlight stays put until they look again. A first
 * blink arms the focused target; a confirming second blink fires it. Looking
 * away to another target before the second blink cancels the arm. This removes
 * the edge-drift and pointing-accuracy problems of a free dwell cursor.
 *
 * Scan mode (the fallback when no camera/face is available) is unchanged: a
 * highlight auto-cycles on a timer and a single blink (or Space) selects.
 */
export function InteractionProvider({
  mode,
  gazeDirection,
  blinkSignal = 0,
  scanCycleMs = 1500,
  paused = false,
  children,
}: InteractionProviderProps) {
  const targetsRef = useRef<InteractiveTarget[]>([])
  const [focusedTargetId, setFocusedTargetId] = useState<string | null>(null)
  const [armedTargetId, setArmedTargetId] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0) // scan-mode cursor
  // Bumped whenever the registered target set changes (a screen transition).
  const [targetsVersion, setTargetsVersion] = useState(0)

  // Mirror focus/arm into refs so the event-driven step + blink effects read the
  // latest value synchronously without re-subscribing on every render.
  const focusedIdRef = useRef<string | null>(null)
  const armedIdRef = useRef<string | null>(null)
  const prevBlinkSignalRef = useRef(0)
  const stepLatchedRef = useRef(false)
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setFocus = useCallback((id: string | null) => {
    focusedIdRef.current = id
    setFocusedTargetId(id)
  }, [])
  const setArmed = useCallback((id: string | null) => {
    armedIdRef.current = id
    setArmedTargetId(id)
  }, [])

  const registerTarget = useCallback((target: InteractiveTarget) => {
    targetsRef.current = [...targetsRef.current, target]
    setTargetsVersion(v => v + 1)
    return () => {
      targetsRef.current = targetsRef.current.filter(t => t.id !== target.id)
      setTargetsVersion(v => v + 1)
    }
  }, [])

  // Targets in reading order (top-to-bottom, then left-to-right) by live rect —
  // the order gaze steps through.
  const orderedTargets = useCallback((): InteractiveTarget[] => {
    return [...targetsRef.current].sort((a, b) => {
      const ra = a.ref.current?.getBoundingClientRect()
      const rb = b.ref.current?.getBoundingClientRect()
      if (!ra || !rb) return 0
      const rowA = Math.round(ra.top / 56)
      const rowB = Math.round(rb.top / 56)
      if (rowA !== rowB) return rowA - rowB
      return ra.left - rb.left
    })
  }, [])

  // ── Screen change (or entering gaze mode) → focus the first target and drop
  // any pending arm, so every new screen starts from a predictable neutral.
  useEffect(() => {
    if (mode !== 'gaze' || paused) return
    setFocus(orderedTargets()[0]?.id ?? null)
    setArmed(null)
    stepLatchedRef.current = false
  }, [mode, paused, targetsVersion, orderedTargets, setFocus, setArmed])

  // ── Scan mode: auto-cycle the highlight on an interval.
  useEffect(() => {
    if (mode !== 'scan' || paused) {
      setFocusedIndex(0)
      return
    }
    const interval = setInterval(() => {
      setFocusedIndex(prev => {
        const count = targetsRef.current.length
        return count === 0 ? 0 : (prev + 1) % count
      })
    }, scanCycleMs)
    return () => clearInterval(interval)
  }, [mode, scanCycleMs, paused])

  // Scan mode: reflect the cycling index into the focused target id.
  useEffect(() => {
    if (mode === 'scan' && !paused) {
      setFocus(targetsRef.current[focusedIndex]?.id ?? null)
    }
  }, [mode, focusedIndex, paused, setFocus])

  // Paused → clear all focus/arm so nothing is highlighted behind an overlay.
  useEffect(() => {
    if (paused) {
      setFocus(null)
      setArmed(null)
    }
  }, [paused, setFocus, setArmed])

  // Step the focus one target earlier ('prev') or later ('next') in reading
  // order. Clamped at the ends (no wrap) so looking past the edge is a no-op
  // rather than a surprising jump — directly fixing the old edge-drift problem.
  const stepFocus = useCallback((screenDir: 'prev' | 'next') => {
    const ordered = orderedTargets()
    if (ordered.length === 0) return
    const curIdx = ordered.findIndex(t => t.id === focusedIdRef.current)
    const base = curIdx < 0 ? 0 : curIdx
    const nextIdx = clamp(base + (screenDir === 'next' ? 1 : -1), 0, ordered.length - 1)
    const nextId = ordered[nextIdx]?.id ?? null
    if (nextId !== focusedIdRef.current) {
      setFocus(nextId)
      setArmed(null) // moving focus cancels a pending confirm
    }
  }, [orderedTargets, setFocus, setArmed])

  // ── Gaze mode: a sustained look steps focus once, then latches until the eyes
  // return to center (so holding a look never runs focus away).
  useEffect(() => {
    if (mode !== 'gaze' || paused) return
    const dir = gazeDirection ?? 'center'
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current)
      stepTimerRef.current = null
    }
    if (dir === 'center') {
      stepLatchedRef.current = false // re-arm the stepper for the next look
      return
    }
    if (stepLatchedRef.current) return // already stepped this hold
    // Direction is non-center here, so this is always 'prev' | 'next'.
    const screenDir = gazeStepDirection(dir) ?? 'next'
    stepTimerRef.current = setTimeout(() => {
      stepLatchedRef.current = true
      stepFocus(screenDir)
    }, STEP_SUSTAIN_MS)
    return () => {
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current)
        stepTimerRef.current = null
      }
    }
  }, [gazeDirection, mode, paused, stepFocus])

  // ── Blink handling for both modes.
  // Scan: a blink fires the highlighted target. Gaze: the first blink arms the
  // focused target; a second blink on the same target confirms and fires it.
  useEffect(() => {
    if (paused) return
    if (blinkSignal <= prevBlinkSignalRef.current) {
      prevBlinkSignalRef.current = blinkSignal
      return
    }
    prevBlinkSignalRef.current = blinkSignal

    if (mode === 'scan') {
      targetsRef.current[focusedIndex]?.onSelect()
      return
    }

    const fid = focusedIdRef.current
    if (!fid) return
    if (armedIdRef.current === fid) {
      setArmed(null)
      targetsRef.current.find(t => t.id === fid)?.onSelect()
    } else {
      setArmed(fid)
    }
  }, [blinkSignal, mode, paused, focusedIndex, setArmed])

  // Scan mode: spacebar selection helper for testing and accessibility.
  useEffect(() => {
    if (mode !== 'scan' || paused) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        targetsRef.current[focusedIndex]?.onSelect()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [mode, focusedIndex, paused])

  const dwellProgress = armedTargetId ? 1 : 0
  // Only surface a live direction while gaze input is actually driving focus.
  const liveGazeDirection: GazeDirection =
    mode === 'gaze' && !paused ? gazeDirection ?? 'center' : 'center'

  return (
    <InteractionContext.Provider
      value={{
        registerTarget,
        mode,
        focusedTargetId,
        armedTargetId,
        dwellProgress,
        gazeDirection: liveGazeDirection,
      }}
    >
      {children}
    </InteractionContext.Provider>
  )
}
