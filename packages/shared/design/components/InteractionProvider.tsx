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
  /** Which gaze direction activates this target in gaze mode */
  gazeDirection?: GazeDirection
}

interface InteractionContextValue {
  registerTarget: (target: InteractiveTarget) => () => void
  mode: 'gaze' | 'scan'
  /** Id of the target the gaze cursor (or scan highlight) is currently over. */
  focusedTargetId: string | null
  /** Dwell completion fraction [0, 1] toward firing the focused target. */
  dwellProgress: number
}

// ── Joystick-steered cursor physics ─────────────────────────────────────────
// Kept local to the shared design package (no patient-app import) so the
// provider stays portable. Mirrors apps/patient/src/utils/gazeUtils.ts, which
// holds the unit-tested reference implementation.
const GAZE_CURSOR_SPEED = 480 // pixels per second
const CURSOR_RING_RADIUS = 16
const CURSOR_RING_CIRCUMFERENCE = 2 * Math.PI * CURSOR_RING_RADIUS

interface CursorPoint {
  x: number
  y: number
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function steerCursor(
  pos: CursorPoint,
  direction: GazeDirection,
  dt: number,
  width: number,
  height: number,
): CursorPoint {
  const step = GAZE_CURSOR_SPEED * Math.max(0, dt)
  let { x, y } = pos
  if (direction === 'up') y -= step
  else if (direction === 'down') y += step
  else if (direction === 'left') x -= step
  else if (direction === 'right') x += step
  return { x: clamp(x, 0, width), y: clamp(y, 0, height) }
}

function pointInRect(p: CursorPoint, r: DOMRect): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
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
  /** Live RAW (un-smoothed) gaze direction ref. When provided, the steered
   *  cursor halts the instant this reads 'center' — no hysteresis stop-lag. */
  gazeDirectionRawRef?: React.RefObject<GazeDirection>
  /** Increments by 1 each time a blink is detected; triggers scan selection */
  blinkSignal?: number
  gazeDwellMs?: number
  scanCycleMs?: number
  /** Temporarily suspend all input handling (gaze cursor + scan). Used while a
   *  modal caregiver flow is open (e.g. calibration) so the patient cannot
   *  accidentally dwell-fire a target hidden behind the overlay. */
  paused?: boolean
  children: React.ReactNode
}

export function InteractionProvider({
  mode,
  gazeDirection,
  gazeDirectionRawRef,
  blinkSignal = 0,
  gazeDwellMs = 1500,
  scanCycleMs = 1500,
  paused = false,
  children,
}: InteractionProviderProps) {
  const targetsRef = useRef<InteractiveTarget[]>([])
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [focusedTargetId, setFocusedTargetId] = useState<string | null>(null)
  const [dwellProgress, setDwellProgress] = useState(0)
  // Bumped whenever the registered target set changes (a screen transition:
  // entering/exiting YesNo, opening/closing the phrase board). The gaze loop
  // watches this to recenter the cursor so a new screen starts from neutral.
  const [targetsVersion, setTargetsVersion] = useState(0)
  const recenterPendingRef = useRef(false)
  const gazeDirectionRef = useRef<GazeDirection>('center')
  const prevBlinkSignalRef = useRef(0)
  // Cursor DOM handles — the steered cursor's position and dwell ring are driven
  // imperatively in a rAF loop, never via React state, so movement stays smooth.
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const dotRef = useRef<HTMLDivElement | null>(null)
  const ringRef = useRef<SVGCircleElement | null>(null)

  // Keep the latest gaze direction in a ref so the dwell loop below can read it
  // without re-subscribing (and tearing down its timer) on every frame.
  useEffect(() => {
    gazeDirectionRef.current = gazeDirection ?? 'center'
  }, [gazeDirection])

  const registerTarget = useCallback((target: InteractiveTarget) => {
    targetsRef.current = [...targetsRef.current, target]
    setTargetsVersion(v => v + 1)
    return () => {
      targetsRef.current = targetsRef.current.filter(t => t.id !== target.id)
      setTargetsVersion(v => v + 1)
    }
  }, [])

  // A target-set change means the active screen changed: ask the gaze loop to
  // recenter the cursor on its next frame (see the rAF tick below).
  useEffect(() => {
    recenterPendingRef.current = true
  }, [targetsVersion])

  // Scan mode: cycle focus on interval
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

  // Sync focusedTargetId with focusedIndex in scan mode
  useEffect(() => {
    if (mode === 'scan') {
      setFocusedTargetId(targetsRef.current[focusedIndex]?.id ?? null)
    } else {
      setFocusedTargetId(null)
    }
  }, [mode, focusedIndex])

  // Scan mode: blink triggers selection
  useEffect(() => {
    if (mode !== 'scan' || paused) return
    if (blinkSignal > prevBlinkSignalRef.current) {
      prevBlinkSignalRef.current = blinkSignal
      targetsRef.current[focusedIndex]?.onSelect()
    }
  }, [mode, blinkSignal, focusedIndex, paused])

  // Scan mode: spacebar / click helper for testing and accessibility
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

  // Gaze mode: joystick-steered cursor + bounding-box focus + dwell selection.
  //
  // The patient steers an on-screen cursor by looking up/down/left/right and
  // halts it by looking back to center. When the cursor sits inside a target's
  // bounding box that target is focused and a dwell timer fills; holding it
  // there for `gazeDwellMs` fires the target. The cursor recenters after a
  // selection fires and on a screen change (target-set change), so each new
  // screen starts from a neutral center.
  //
  // Position and the dwell ring are written straight to the DOM every frame so
  // 60fps movement never triggers a React re-render. Only the (rare) focus
  // changes and a throttled dwell fraction flow through React state, for the
  // CSS highlight on targets and any progress UI that reads the context.
  useEffect(() => {
    if (mode !== 'gaze' || paused) {
      setDwellProgress(0)
      setFocusedTargetId(null)
      return
    }

    let pos: CursorPoint = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }
    let lastTs: number | null = null
    let focusedId: string | null = null
    let dwellStart: number | null = null
    let needLeave = false // require leaving a target before it can re-fire
    let reportedProgress = -1
    let raf = 0

    const setRing = (progress: number) => {
      const ring = ringRef.current
      if (ring) {
        ring.style.strokeDashoffset = String(CURSOR_RING_CIRCUMFERENCE * (1 - progress))
      }
    }
    const setHover = (hovering: boolean) => {
      const dot = dotRef.current
      if (dot) {
        dot.style.backgroundColor = hovering ? '#5B3FD6' : '#7C5CFC'
        dot.style.boxShadow = hovering
          ? '0 0 0 10px rgba(124,92,252,0.12), 0 0 32px rgba(124,92,252,0.65)'
          : '0 0 0 6px rgba(124,92,252,0.18), 0 0 24px rgba(124,92,252,0.5)'
      }
    }
    const reportProgress = (progress: number) => {
      // Throttle React updates: only when the rendered percent moves enough.
      if (Math.abs(progress - reportedProgress) >= 0.02 || progress === 0 || progress === 1) {
        reportedProgress = progress
        setDwellProgress(progress)
      }
    }

    const tick = (now: number) => {
      const width = window.innerWidth
      const height = window.innerHeight

      // Screen changed since the last frame → recenter the cursor and drop any
      // in-progress focus/dwell so the new screen starts neutral.
      if (recenterPendingRef.current) {
        recenterPendingRef.current = false
        pos = { x: width / 2, y: height / 2 }
        focusedId = null
        dwellStart = null
        needLeave = false
        setFocusedTargetId(null)
        setHover(false)
        setRing(0)
        reportProgress(0)
      }

      // Steering direction: use the smoothed direction to START/continue moving
      // (rejects single-frame noise), but halt the instant the RAW signal reads
      // center, so the cursor stops with no hysteresis lag the moment the eyes
      // return to center to park it on a target.
      const smoothedDir = gazeDirectionRef.current
      const liveDir = gazeDirectionRawRef?.current ?? smoothedDir
      const steered: GazeDirection = liveDir === 'center' ? 'center' : smoothedDir

      // The front camera images the patient un-mirrored — it sees them like
      // another person, not like a mirror — so the classifier's horizontal axis
      // is flipped relative to the screen the patient is steering on: looking
      // screen-right reads as 'left' and vice-versa. Swap them so the cursor
      // follows the gaze. Vertical is not mirrored, so up/down pass through.
      const dir: GazeDirection =
        steered === 'left' ? 'right' : steered === 'right' ? 'left' : steered

      const dt = lastTs === null ? 0 : Math.min(0.1, (now - lastTs) / 1000)
      lastTs = now
      pos = steerCursor(pos, dir, dt, width, height)

      const cursor = cursorRef.current
      if (cursor) {
        cursor.style.left = `${pos.x}px`
        cursor.style.top = `${pos.y}px`
      }

      // Which target (if any) does the cursor sit inside? First match wins.
      let hit: InteractiveTarget | null = null
      for (const t of targetsRef.current) {
        const el = t.ref.current
        if (el && pointInRect(pos, el.getBoundingClientRect())) {
          hit = t
          break
        }
      }
      const hitId = hit?.id ?? null

      if (hitId !== focusedId) {
        focusedId = hitId
        setFocusedTargetId(hitId)
        setHover(hit !== null)
        // Re-entering a (possibly new) target clears the post-fire latch and
        // restarts the dwell.
        needLeave = false
        dwellStart = hit ? now : null
        setRing(0)
        reportProgress(0)
      }

      if (hit && !needLeave) {
        if (dwellStart === null) dwellStart = now
        const progress = Math.min(1, (now - dwellStart) / gazeDwellMs)
        setRing(progress)
        reportProgress(progress)

        if (progress >= 1) {
          hit.onSelect()
          // Recenter and require leaving before another fire.
          needLeave = true
          dwellStart = null
          pos = { x: width / 2, y: height / 2 }
          setHover(false)
          setRing(0)
          reportProgress(0)
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode, gazeDwellMs, paused])

  return (
    <InteractionContext.Provider
      value={{ registerTarget, mode, focusedTargetId, dwellProgress }}
    >
      {children}
      {/* Joystick-steered gaze cursor. Hidden in scan mode (scan falls back to
          auto-cycling highlights + blink) and while input is paused (e.g. a
          calibration overlay). Position/ring are driven imperatively by the rAF
          loop above. */}
      {mode === 'gaze' && !paused && (
        <div
          ref={cursorRef}
          aria-hidden
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            width: 36,
            height: 36,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          <svg
            width={36}
            height={36}
            viewBox="0 0 36 36"
            style={{ position: 'absolute', inset: 0 }}
          >
            <circle
              cx={18}
              cy={18}
              r={CURSOR_RING_RADIUS}
              fill="none"
              stroke="rgba(124,92,252,0.22)"
              strokeWidth={3}
            />
            <circle
              ref={ringRef}
              cx={18}
              cy={18}
              r={CURSOR_RING_RADIUS}
              fill="none"
              stroke="#7C5CFC"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={CURSOR_RING_CIRCUMFERENCE}
              strokeDashoffset={CURSOR_RING_CIRCUMFERENCE}
              transform="rotate(-90 18 18)"
            />
          </svg>
          <div
            ref={dotRef}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 16,
              height: 16,
              transform: 'translate(-50%, -50%)',
              borderRadius: '9999px',
              backgroundColor: '#7C5CFC',
              boxShadow: '0 0 0 6px rgba(124,92,252,0.18), 0 0 24px rgba(124,92,252,0.5)',
            }}
          />
        </div>
      )}
    </InteractionContext.Provider>
  )
}
