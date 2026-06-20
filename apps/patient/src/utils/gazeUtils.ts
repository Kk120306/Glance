export type GazeDirection = 'up' | 'down' | 'left' | 'right' | 'center'

export interface Point2D {
  x: number
  y: number
}

export const EAR_THRESHOLD = 0.20
export const GAZE_SMOOTH_FRAMES = 20

// ── Baseline-relative classifier tuning ────────────────────────────────────
// All offsets are normalized by eye width (corner-to-corner distance), so they
// are scale-invariant to how close the face is to the camera.
//
// Horizontal iris travel is larger than vertical, so the vertical threshold is
// smaller. Both are compared against a *per-user adaptive baseline* (neutral
// gaze), which removes the built-in vertical bias and head-pose offset that
// made fixed thresholds unreliable.
export const GAZE_H_THRESHOLD = 0.06
export const GAZE_V_THRESHOLD = 0.045
// Baseline only adapts while the eyes are near neutral (deviation below this
// radius), so a sustained look in one direction never poisons the baseline.
export const GAZE_BASELINE_RADIUS = 0.025
export const GAZE_BASELINE_ALPHA = 0.02
// Number of frames used to seed the baseline at startup / after a recenter.
export const GAZE_SEED_FRAMES = 20
// Hysteresis for the joystick cursor: a candidate direction must persist
// `ENTER` frames before the cursor starts steering that way (rejects
// single-frame noise), but returning to center commits in just `CENTER_EXIT`
// frames so the cursor halts almost immediately when the patient looks back to
// center to park it on a target. The asymmetry is deliberately *small on exit*
// — unlike the old absolute model, dwell here is decided by cursor position,
// not by holding a direction, so there's no need to ride through center flicker.
export const GAZE_ENTER_FRAMES = 3
export const GAZE_CENTER_EXIT_FRAMES = 2

// ── Cursor smoothing (One Euro filter) ──────────────────────────────────────
// The live cursor follows a noisy per-frame iris signal; rendered raw it
// jitters when still and snaps aggressively when moving. A One Euro low-pass
// filter fixes both: it smooths heavily while the eyes are near-still (killing
// jitter) and eases off during fast moves (so the dot does not lag), for a calm,
// fluid follow. These are tuning knobs:
//   minCutoff (Hz) — lower is smoother/calmer at rest, but adds lag.
//   beta           — higher tracks fast motion more eagerly (less lag on a flick).
//   dCutoff (Hz)   — smoothing of the speed estimate that drives beta.
export const GAZE_CURSOR_MIN_CUTOFF = 1.0
export const GAZE_CURSOR_BETA = 2.0
export const GAZE_CURSOR_D_CUTOFF = 1.0

export interface GazeOffset {
  x: number
  y: number
}

// ── Joystick-steered relative cursor ────────────────────────────────────────
// Instead of mapping a gaze direction straight onto a target, the patient
// *steers* an on-screen cursor: looking up/down/left/right nudges the cursor at
// a constant speed, and looking back to center halts it. This lets the cursor
// be parked on a target while the eyes rest at the (comfortable) center.
export const GAZE_CURSOR_SPEED = 480 // pixels per second

export interface CursorPoint {
  x: number
  y: number
}

export interface ViewportBounds {
  width: number
  height: number
}

/** Center of a viewport — the cursor's start and post-selection rest position. */
export function centerOf(bounds: ViewportBounds): CursorPoint {
  return { x: bounds.width / 2, y: bounds.height / 2 }
}

/**
 * Advance the steered cursor by one frame. A non-center direction moves the
 * cursor `speed * dt` pixels along that axis; `center` holds position. The
 * result is clamped to the viewport so the cursor can never leave the screen.
 * MediaPipe/browser y grows downward, so `up` decrements y and `down`
 * increments it.
 */
export function steerCursor(
  pos: CursorPoint,
  direction: GazeDirection,
  dt: number,
  bounds: ViewportBounds,
  speed = GAZE_CURSOR_SPEED,
): CursorPoint {
  const step = speed * Math.max(0, dt)
  let { x, y } = pos
  switch (direction) {
    case 'up':
      y -= step
      break
    case 'down':
      y += step
      break
    case 'left':
      x -= step
      break
    case 'right':
      x += step
      break
    case 'center':
      break
  }
  return {
    x: clamp(x, 0, bounds.width),
    y: clamp(y, 0, bounds.height),
  }
}

/** Axis-aligned rectangle in viewport coordinates (DOMRect-compatible). */
export interface ViewportRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Whether a cursor point falls inside a target's bounding box (edges count). */
export function pointInRect(p: CursorPoint, r: ViewportRect): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
}

function euclidean(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Eye Aspect Ratio — ratio of vertical opening to horizontal span.
 * Below EAR_THRESHOLD for ≥2 frames indicates a blink.
 */
export function computeEAR(
  upperLid: Point2D,
  lowerLid: Point2D,
  leftCorner: Point2D,
  rightCorner: Point2D,
): number {
  const vertical = euclidean(upperLid, lowerLid)
  const horizontal = euclidean(leftCorner, rightCorner)
  if (horizontal === 0) return 0
  return vertical / horizontal
}

/**
 * Dynamically adjust the EAR threshold based on vertical gaze offset (dy).
 * Looking down naturally narrows the eye opening (lower EAR), so we reduce
 * the threshold to prevent false blinks while maintaining blink detection.
 */
export function adjustEarThreshold(baseThreshold: number, dy: number): number {
  if (dy <= 0) return baseThreshold
  // Scale threshold down linearly with dy, capping the maximum reduction at 35%
  return baseThreshold * Math.max(0.65, 1 - dy * 3.5)
}

/**
 * Classify gaze direction from iris center relative to eye corners.
 * MediaPipe y coords: 0 = top, 1 = bottom (browser coordinate space).
 * normY < 0 means iris is above center → patient is looking UP.
 */
export function classifyGazeDirection(
  irisCenter: Point2D,
  leftCorner: Point2D,
  rightCorner: Point2D,
  thresholdH = 0.12,
  thresholdV = 0.08,
): GazeDirection {
  const eyeCenterX = (leftCorner.x + rightCorner.x) / 2
  const eyeCenterY = (leftCorner.y + rightCorner.y) / 2
  const eyeWidth = euclidean(leftCorner, rightCorner)

  if (eyeWidth === 0) return 'center'

  const normX = (irisCenter.x - eyeCenterX) / eyeWidth
  const normY = (irisCenter.y - eyeCenterY) / eyeWidth

  if (normY < -thresholdV) return 'up'
  if (normY > thresholdV) return 'down'
  if (normX < -thresholdH) return 'left'
  if (normX > thresholdH) return 'right'
  return 'center'
}

/**
 * Rolling window majority vote for smoothing gaze direction.
 */
export function smoothGazeDirection(history: GazeDirection[]): GazeDirection {
  if (history.length === 0) return 'center'

  const counts: Record<GazeDirection, number> = { up: 0, down: 0, left: 0, right: 0, center: 0 }
  for (const d of history) counts[d]++

  let best: GazeDirection = 'center'
  let bestCount = 0
  for (const [dir, count] of Object.entries(counts) as [GazeDirection, number][]) {
    if (count > bestCount) {
      bestCount = count
      best = dir
    }
  }
  return best
}

// ── Adaptive-baseline gaze pipeline ─────────────────────────────────────────

/**
 * Continuous iris offset from the eye's corner-midpoint, normalized by eye
 * width. Corner order is irrelevant (midpoint + distance are symmetric).
 * Returns {0,0} for a degenerate eye. This is the raw, un-baselined signal.
 */
export function computeEyeGaze(iris: Point2D, cornerA: Point2D, cornerB: Point2D): GazeOffset {
  const w = euclidean(cornerA, cornerB)
  if (w === 0) return { x: 0, y: 0 }
  const cx = (cornerA.x + cornerB.x) / 2
  const cy = (cornerA.y + cornerB.y) / 2
  return { x: (iris.x - cx) / w, y: (iris.y - cy) / w }
}

/**
 * Classify a gaze offset relative to an adaptive neutral `baseline`.
 * When both axes exceed threshold, the axis exceeding by the larger ratio wins,
 * so a diagonal glance resolves to its dominant component instead of center.
 * MediaPipe y grows downward: dy < 0 ⇒ looking up.
 */
export function classifyOffset(
  offset: GazeOffset,
  baseline: GazeOffset,
  hT = GAZE_H_THRESHOLD,
  vT = GAZE_V_THRESHOLD,
): GazeDirection {
  const dx = offset.x - baseline.x
  const dy = offset.y - baseline.y
  const overH = Math.abs(dx) > hT
  const overV = Math.abs(dy) > vT
  if (overH && overV) {
    return Math.abs(dx) / hT >= Math.abs(dy) / vT
      ? dx < 0 ? 'left' : 'right'
      : dy < 0 ? 'up' : 'down'
  }
  if (overH) return dx < 0 ? 'left' : 'right'
  if (overV) return dy < 0 ? 'up' : 'down'
  return 'center'
}

/**
 * EMA-update a neutral baseline toward the current offset, but ONLY while the
 * eyes are near neutral (deviation below `radius`). Returns the updated
 * baseline. Holding a direction leaves the baseline untouched, so the classifier
 * keeps firing for as long as the look is held.
 */
export function updateBaseline(
  baseline: GazeOffset,
  offset: GazeOffset,
  radius = GAZE_BASELINE_RADIUS,
  alpha = GAZE_BASELINE_ALPHA,
): GazeOffset {
  const dev = Math.hypot(offset.x - baseline.x, offset.y - baseline.y)
  if (dev >= radius) return baseline
  return {
    x: baseline.x + (offset.x - baseline.x) * alpha,
    y: baseline.y + (offset.y - baseline.y) * alpha,
  }
}

export interface GazeSmoother {
  /** Feed one raw classification; returns the current stable direction. */
  push(raw: GazeDirection): GazeDirection
  reset(): void
  current(): GazeDirection
}

/**
 * Hysteresis state machine that replaces the majority-vote window. A direction
 * commits after `enterFrames` consistent frames; dropping back to center
 * requires `centerExitFrames` consistent frames, so transient center flicker
 * cannot break a held direction mid-dwell.
 */
export function createGazeSmoother(
  enterFrames = GAZE_ENTER_FRAMES,
  centerExitFrames = GAZE_CENTER_EXIT_FRAMES,
): GazeSmoother {
  let stable: GazeDirection = 'center'
  let candidate: GazeDirection = 'center'
  let count = 0
  return {
    push(raw) {
      if (raw === stable) {
        candidate = stable
        count = 0
        return stable
      }
      if (raw === candidate) count++
      else {
        candidate = raw
        count = 1
      }
      const needed = raw === 'center' ? centerExitFrames : enterFrames
      if (count >= needed) {
        stable = candidate
        count = 0
      }
      return stable
    },
    reset() {
      stable = 'center'
      candidate = 'center'
      count = 0
    },
    current() {
      return stable
    },
  }
}

/**
 * Map a baseline-relative offset to a display position in [-1, 1] per axis,
 * where ±1 means "≈twice the activation threshold". Used by the debug panel to
 * show a live cursor that visibly follows the eyes.
 */
export function offsetToDisplay(dx: number, dy: number): GazeOffset {
  return {
    x: clamp(dx / (GAZE_H_THRESHOLD * 2), -1, 1),
    y: clamp(dy / (GAZE_V_THRESHOLD * 2), -1, 1),
  }
}

// ── One Euro filter ──────────────────────────────────────────────────────────
// Adaptive low-pass filter for noisy interactive signals (Casiez et al., 2012).
// The cutoff frequency rises with the signal's speed, so a slow/still signal is
// smoothed hard (no jitter) while a fast one is barely smoothed (no lag).

/** Smoothing factor for a first-order low-pass at `cutoff` Hz over interval `dt` (s). */
function lowpassAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

export interface OneEuroFilter {
  /** Feed one sample with the elapsed time since the previous one (seconds). */
  filter(value: number, dt: number): number
  reset(): void
}

export function createOneEuroFilter(
  minCutoff = GAZE_CURSOR_MIN_CUTOFF,
  beta = GAZE_CURSOR_BETA,
  dCutoff = GAZE_CURSOR_D_CUTOFF,
): OneEuroFilter {
  let xPrev = 0
  let dxPrev = 0
  let initialized = false
  return {
    filter(value, dt) {
      // First sample (or a degenerate dt) passes through untouched so the
      // cursor starts exactly where the eyes are instead of easing in from 0.
      if (!initialized || dt <= 0) {
        xPrev = value
        dxPrev = 0
        initialized = true
        return value
      }
      // Low-pass the derivative, then let its magnitude raise the cutoff.
      const dx = (value - xPrev) / dt
      const edx = dxPrev + lowpassAlpha(dCutoff, dt) * (dx - dxPrev)
      const cutoff = minCutoff + beta * Math.abs(edx)
      const x = xPrev + lowpassAlpha(cutoff, dt) * (value - xPrev)
      xPrev = x
      dxPrev = edx
      return x
    },
    reset() {
      xPrev = 0
      dxPrev = 0
      initialized = false
    },
  }
}

export interface GazeCursorSmoother {
  /** Smooth one raw {x,y} offset given the frame interval `dt` (seconds). */
  push(x: number, y: number, dt: number): GazeOffset
  reset(): void
}

/**
 * Pairs two One Euro filters to smooth the live 2-D cursor offset. Each axis is
 * filtered independently so a horizontal flick does not drag the vertical
 * position and vice versa.
 */
export function createGazeCursorSmoother(): GazeCursorSmoother {
  const fx = createOneEuroFilter()
  const fy = createOneEuroFilter()
  return {
    push(x, y, dt) {
      return { x: fx.filter(x, dt), y: fy.filter(y, dt) }
    },
    reset() {
      fx.reset()
      fy.reset()
    },
  }
}
