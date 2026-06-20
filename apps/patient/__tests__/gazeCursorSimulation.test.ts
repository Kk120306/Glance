import { describe, it, expect } from 'vitest'
import { createGazeCursorSmoother, offsetToDisplay } from '../src/utils/gazeUtils'

/**
 * In-practice verification of the live-cursor smoothing.
 *
 * This replays a *realistic* eye signal through the exact render path the
 * GazeTrackingPanel uses — the real `createGazeCursorSmoother`, the real
 * `offsetToDisplay`, and the same dt clamp — then measures the rendered cursor
 * position (the % `left`/`top` the dot is actually placed at). It checks two
 * things that together define "smooth and pleasing":
 *   1. jitter / aggressiveness is sharply reduced vs the raw signal, and
 *   2. the cursor is still responsive (a real look lands quickly, not sluggishly).
 */

// Deterministic PRNG so the trace (and thus the assertions) are stable.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FPS = 60
const DETECT_HZ = 30 // MediaPipe emits a fresh detection slower than we render
const DETECT_EVERY = FPS / DETECT_HZ
// Iris offsets are normalized by eye width; the activation threshold is ~0.06,
// so ±0.012 of per-detection noise is a realistic "still eye" jitter.
const JITTER = 0.012
const FIXATE_A = { x: 0.0, y: 0.0 }
const FIXATE_B = { x: 0.1, y: -0.05 } // a deliberate look toward up-right

// Map an offset to the rendered cursor position, mirroring the component.
function render(o: { x: number; y: number }) {
  const d = offsetToDisplay(o.x, o.y)
  return { left: 50 - d.x * 45, top: 50 + d.y * 45 }
}

interface Frame {
  raw: { left: number; top: number }
  smooth: { left: number; top: number }
  phase: 'fixA' | 'saccade' | 'fixB'
}

function runTrace(): Frame[] {
  const rng = mulberry32(1234)
  const smoother = createGazeCursorSmoother()
  const frames: Frame[] = []

  const FIX_A_FRAMES = FPS * 1 // 1s settled at A
  const SACCADE_FRAMES = Math.round(FPS * 0.12) // ~120ms move
  const FIX_B_FRAMES = FPS * 2 // 2s settled at B
  const total = FIX_A_FRAMES + SACCADE_FRAMES + FIX_B_FRAMES

  let detection = { ...FIXATE_A }

  for (let i = 0; i < total; i++) {
    let phase: Frame['phase']
    let target: { x: number; y: number }
    if (i < FIX_A_FRAMES) {
      phase = 'fixA'
      target = FIXATE_A
    } else if (i < FIX_A_FRAMES + SACCADE_FRAMES) {
      phase = 'saccade'
      const t = (i - FIX_A_FRAMES) / SACCADE_FRAMES
      target = {
        x: FIXATE_A.x + (FIXATE_B.x - FIXATE_A.x) * t,
        y: FIXATE_A.y + (FIXATE_B.y - FIXATE_A.y) * t,
      }
    } else {
      phase = 'fixB'
      target = FIXATE_B
    }

    // A fresh noisy detection only arrives every DETECT_EVERY frames; in
    // between, the ref holds its previous value (exactly like the live app).
    if (i % DETECT_EVERY === 0) {
      detection = {
        x: target.x + (rng() - 0.5) * 2 * JITTER,
        y: target.y + (rng() - 0.5) * 2 * JITTER,
      }
    }

    const dt = Math.min(0.1, Math.max(1 / FPS, 1 / 240))
    const smoothed = smoother.push(detection.x, detection.y, dt)
    frames.push({ raw: render(detection), smooth: render(smoothed), phase })
  }

  return frames
}

// Mean absolute frame-to-frame movement (in % of the box) over a phase — a
// direct proxy for visible jitter / how "twitchy" the dot looks.
function meanStep(frames: Frame[], pick: (f: Frame) => { left: number; top: number }): number {
  let sum = 0
  for (let i = 1; i < frames.length; i++) {
    const a = pick(frames[i - 1]!)
    const b = pick(frames[i]!)
    sum += Math.hypot(b.left - a.left, b.top - a.top)
  }
  return sum / (frames.length - 1)
}

describe('gaze cursor smoothing — realistic trace', () => {
  const frames = runTrace()
  const fixB = frames.filter((f) => f.phase === 'fixB')

  it('cuts visible jitter during fixation by a large margin', () => {
    const rawJitter = meanStep(fixB, (f) => f.raw)
    const smoothJitter = meanStep(fixB, (f) => f.smooth)
    // The raw dot visibly twitches every detection; the smoothed dot should be
    // dramatically calmer — at least a 3× reduction in per-frame movement.
    // (Measured ≈4.2×: raw ≈2.7%/frame → smoothed ≈0.65%/frame.)
    expect(smoothJitter).toBeLessThan(rawJitter / 3)
  })

  it('reduces total path length (less aggressive travel)', () => {
    const rawPath = meanStep(frames, (f) => f.raw) * frames.length
    const smoothPath = meanStep(frames, (f) => f.smooth) * frames.length
    expect(smoothPath).toBeLessThan(rawPath * 0.5)
  })

  it('still lands on a real look quickly (not sluggish)', () => {
    // Steady rendered position once settled at B (no jitter).
    const targetPos = render(FIXATE_B)
    const saccadeStart = frames.findIndex((f) => f.phase === 'saccade')
    let settleFrame = -1
    for (let i = saccadeStart; i < frames.length; i++) {
      const p = frames[i]!.smooth
      const dist = Math.hypot(p.left - targetPos.left, p.top - targetPos.top)
      // within ~10% of the box of the destination
      if (dist < 5) {
        settleFrame = i - saccadeStart
        break
      }
    }
    expect(settleFrame).toBeGreaterThanOrEqual(0)
    // Should arrive within ~300ms of the look — fast enough to feel responsive.
    expect(settleFrame).toBeLessThanOrEqual(Math.round(FPS * 0.3))
  })

  it('does not overshoot (smoothed output stays within the raw envelope)', () => {
    // A low-pass must not ring: the smoothed cursor should never swing past the
    // extremes the raw signal itself reached. (Comparing against the noise-free
    // target is wrong — the raw detection jitters past it, and the smoother is
    // entitled to track that.) A tiny epsilon absorbs float error.
    const EPS = 0.01
    const rawMin = Math.min(...frames.map((f) => f.raw.left))
    const rawMax = Math.max(...frames.map((f) => f.raw.left))
    const smoothMin = Math.min(...frames.map((f) => f.smooth.left))
    const smoothMax = Math.max(...frames.map((f) => f.smooth.left))
    expect(smoothMin).toBeGreaterThanOrEqual(rawMin - EPS)
    expect(smoothMax).toBeLessThanOrEqual(rawMax + EPS)
  })
})
