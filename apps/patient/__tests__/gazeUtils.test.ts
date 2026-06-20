import { describe, it, expect } from 'vitest'
import {
  computeEAR,
  adjustEarThreshold,
  classifyGazeDirection,
  smoothGazeDirection,
  computeEyeGaze,
  classifyOffset,
  updateBaseline,
  createGazeSmoother,
  offsetToDisplay,
  createOneEuroFilter,
  createGazeCursorSmoother,
  steerCursor,
  centerOf,
  pointInRect,
  GAZE_CURSOR_SPEED,
  EAR_THRESHOLD,
  GAZE_H_THRESHOLD,
  GAZE_V_THRESHOLD,
  GAZE_ENTER_FRAMES,
  GAZE_CENTER_EXIT_FRAMES,
} from '../src/utils/gazeUtils'
import type { GazeDirection } from '../src/utils/gazeUtils'

describe('computeEAR', () => {
  it('returns ~0.5 for a normally-open eye', () => {
    // Eye open: vertical extent = 10px, horizontal = 20px → EAR = 0.5
    const ear = computeEAR(
      { x: 0.5, y: 0.4 }, // upper lid
      { x: 0.5, y: 0.6 }, // lower lid (0.2 apart vertically)
      { x: 0.3, y: 0.5 }, // left corner
      { x: 0.7, y: 0.5 }, // right corner (0.4 apart horizontally)
    )
    expect(ear).toBeCloseTo(0.5, 2)
  })

  it('returns close to 0 for a closed eye (blink)', () => {
    const ear = computeEAR(
      { x: 0.5, y: 0.499 },
      { x: 0.5, y: 0.501 }, // nearly touching
      { x: 0.3, y: 0.5 },
      { x: 0.7, y: 0.5 },
    )
    expect(ear).toBeLessThan(EAR_THRESHOLD)
  })

  it('returns 0 when horizontal extent is zero', () => {
    const ear = computeEAR(
      { x: 0.5, y: 0.4 },
      { x: 0.5, y: 0.6 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    )
    expect(ear).toBe(0)
  })
})

describe('adjustEarThreshold', () => {
  it('returns baseThreshold when vertical gaze offset dy is zero or negative', () => {
    expect(adjustEarThreshold(0.20, 0)).toBe(0.20)
    expect(adjustEarThreshold(0.20, -0.05)).toBe(0.20)
  })

  it('scales threshold down linearly with positive vertical offset dy', () => {
    // dy = 0.04 -> scale = 1 - 0.04 * 3.5 = 0.86
    // 0.20 * 0.86 = 0.172
    expect(adjustEarThreshold(0.20, 0.04)).toBeCloseTo(0.172, 4)
  })

  it('caps the reduction at 35% (scale = 0.65) for large vertical offset dy', () => {
    // dy = 0.2 -> 1 - 0.2 * 3.5 = 0.3 (clamped to 0.65)
    // 0.20 * 0.65 = 0.13
    expect(adjustEarThreshold(0.20, 0.20)).toBeCloseTo(0.13, 4)
  })
})

describe('classifyGazeDirection', () => {
  const center = { x: 0.5, y: 0.5 }
  const leftCorner = { x: 0.3, y: 0.5 }
  const rightCorner = { x: 0.7, y: 0.5 }

  it('returns center when iris is at center', () => {
    expect(classifyGazeDirection(center, leftCorner, rightCorner)).toBe('center')
  })

  it('returns up when iris is above center', () => {
    // Iris shifted up (smaller y in browser coords)
    expect(classifyGazeDirection({ x: 0.5, y: 0.35 }, leftCorner, rightCorner)).toBe('up')
  })

  it('returns down when iris is below center', () => {
    expect(classifyGazeDirection({ x: 0.5, y: 0.65 }, leftCorner, rightCorner)).toBe('down')
  })

  it('returns left when iris is to the left', () => {
    expect(classifyGazeDirection({ x: 0.32, y: 0.5 }, leftCorner, rightCorner)).toBe('left')
  })

  it('returns right when iris is to the right', () => {
    expect(classifyGazeDirection({ x: 0.68, y: 0.5 }, leftCorner, rightCorner)).toBe('right')
  })

  it('returns center when eye width is zero', () => {
    expect(classifyGazeDirection(center, center, center)).toBe('center')
  })
})

describe('smoothGazeDirection', () => {
  it('returns center for empty history', () => {
    expect(smoothGazeDirection([])).toBe('center')
  })

  it('returns the majority direction', () => {
    const history: GazeDirection[] = ['up', 'up', 'up', 'down', 'center']
    expect(smoothGazeDirection(history)).toBe('up')
  })

  it('returns center when center is majority', () => {
    const history: GazeDirection[] = ['center', 'center', 'up', 'down']
    expect(smoothGazeDirection(history)).toBe('center')
  })

  it('handles single element', () => {
    expect(smoothGazeDirection(['left'])).toBe('left')
  })
})

describe('computeEyeGaze', () => {
  const outer = { x: 0.30, y: 0.50 }
  const inner = { x: 0.40, y: 0.50 } // eye width = 0.10

  it('returns {0,0} when the iris sits at the corner midpoint', () => {
    const o = computeEyeGaze({ x: 0.35, y: 0.50 }, outer, inner)
    expect(o.x).toBeCloseTo(0, 5)
    expect(o.y).toBeCloseTo(0, 5)
  })

  it('normalizes the offset by eye width (scale-invariant)', () => {
    // iris 0.02 right of midpoint, width 0.10 → +0.2
    const o = computeEyeGaze({ x: 0.37, y: 0.50 }, outer, inner)
    expect(o.x).toBeCloseTo(0.2, 5)
  })

  it('reports a downward (positive y) offset below the corner line', () => {
    const o = computeEyeGaze({ x: 0.35, y: 0.52 }, outer, inner)
    expect(o.y).toBeGreaterThan(0)
  })

  it('returns {0,0} for a degenerate eye', () => {
    const o = computeEyeGaze({ x: 0.5, y: 0.5 }, outer, outer)
    expect(o).toEqual({ x: 0, y: 0 })
  })
})

describe('classifyOffset (baseline-relative)', () => {
  const zero = { x: 0, y: 0 }

  it('returns center within threshold of the baseline', () => {
    expect(classifyOffset({ x: 0.0, y: 0.0 }, zero)).toBe('center')
    expect(classifyOffset({ x: GAZE_H_THRESHOLD * 0.5, y: 0 }, zero)).toBe('center')
  })

  it('classifies horizontal beyond threshold', () => {
    expect(classifyOffset({ x: -(GAZE_H_THRESHOLD + 0.02), y: 0 }, zero)).toBe('left')
    expect(classifyOffset({ x: GAZE_H_THRESHOLD + 0.02, y: 0 }, zero)).toBe('right')
  })

  it('classifies vertical beyond threshold (y grows downward)', () => {
    expect(classifyOffset({ x: 0, y: -(GAZE_V_THRESHOLD + 0.02) }, zero)).toBe('up')
    expect(classifyOffset({ x: 0, y: GAZE_V_THRESHOLD + 0.02 }, zero)).toBe('down')
  })

  it('subtracts the baseline so a biased neutral reads as center', () => {
    // A user whose neutral iris sits below the corner line would always read
    // "down" with a fixed threshold; baseline subtraction fixes that.
    const baseline = { x: 0, y: GAZE_V_THRESHOLD + 0.03 }
    expect(classifyOffset({ x: 0, y: GAZE_V_THRESHOLD + 0.03 }, baseline)).toBe('center')
    // And a genuine downward look from that baseline still registers.
    expect(classifyOffset({ x: 0, y: GAZE_V_THRESHOLD * 2 + 0.06 }, baseline)).toBe('down')
  })

  it('resolves a diagonal glance to its dominant axis', () => {
    // Strong horizontal, weak vertical → horizontal wins.
    const dir = classifyOffset({ x: GAZE_H_THRESHOLD * 3, y: GAZE_V_THRESHOLD * 1.2 }, zero)
    expect(dir).toBe('right')
  })
})

describe('updateBaseline', () => {
  it('adapts toward the offset when near neutral', () => {
    const b = updateBaseline({ x: 0, y: 0 }, { x: 0.01, y: 0 })
    expect(b.x).toBeGreaterThan(0)
    expect(b.x).toBeLessThan(0.01)
  })

  it('does NOT adapt while a direction is held (offset far from baseline)', () => {
    const start = { x: 0, y: 0 }
    const b = updateBaseline(start, { x: 0.5, y: 0.5 })
    expect(b).toEqual(start)
  })
})

describe('createGazeSmoother (hysteresis)', () => {
  it('requires consecutive frames before committing a direction', () => {
    const s = createGazeSmoother()
    for (let i = 0; i < GAZE_ENTER_FRAMES - 1; i++) {
      expect(s.push('up')).toBe('center')
    }
    expect(s.push('up')).toBe('up')
  })

  it('holds a committed direction through brief center flicker', () => {
    const s = createGazeSmoother()
    for (let i = 0; i < GAZE_ENTER_FRAMES; i++) s.push('up')
    expect(s.current()).toBe('up')
    // A few stray center frames (fewer than the exit window) keep it as 'up'.
    for (let i = 0; i < GAZE_CENTER_EXIT_FRAMES - 1; i++) {
      expect(s.push('center')).toBe('up')
    }
    expect(s.push('center')).toBe('center')
  })

  it('resets to center', () => {
    const s = createGazeSmoother()
    for (let i = 0; i < GAZE_ENTER_FRAMES; i++) s.push('up')
    s.reset()
    expect(s.current()).toBe('center')
  })
})

describe('offsetToDisplay', () => {
  it('maps the origin to the center', () => {
    expect(offsetToDisplay(0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('clamps to [-1, 1]', () => {
    const d = offsetToDisplay(10, -10)
    expect(d.x).toBe(1)
    expect(d.y).toBe(-1)
  })
})

describe('createOneEuroFilter', () => {
  const DT = 1 / 60

  it('passes the first sample through unchanged', () => {
    const f = createOneEuroFilter()
    expect(f.filter(0.42, DT)).toBe(0.42)
  })

  it('holds a constant signal exactly (no drift, no jitter)', () => {
    const f = createOneEuroFilter()
    f.filter(0.1, DT)
    for (let i = 0; i < 30; i++) {
      expect(f.filter(0.1, DT)).toBeCloseTo(0.1, 10)
    }
  })

  it('eases toward a step without overshooting it', () => {
    const f = createOneEuroFilter()
    f.filter(0, DT) // settle at 0
    let prev = 0
    for (let i = 0; i < 60; i++) {
      const out = f.filter(1, DT)
      // monotonically approaches the target and never passes it
      expect(out).toBeGreaterThanOrEqual(prev)
      expect(out).toBeLessThanOrEqual(1)
      prev = out
    }
    // after a second of input it should be most of the way there
    expect(prev).toBeGreaterThan(0.9)
  })

  it('attenuates high-frequency jitter (lower variance than the raw signal)', () => {
    const f = createOneEuroFilter()
    const mean = 0.05
    const raw: number[] = []
    const filtered: number[] = []
    for (let i = 0; i < 120; i++) {
      const sample = mean + (i % 2 === 0 ? 0.1 : -0.1) // ±0.1 jitter each frame
      raw.push(sample)
      filtered.push(f.filter(sample, DT))
    }
    const variance = (xs: number[]) => {
      const half = xs.slice(60) // ignore warm-up
      const m = half.reduce((a, b) => a + b, 0) / half.length
      return half.reduce((a, b) => a + (b - m) ** 2, 0) / half.length
    }
    expect(variance(filtered)).toBeLessThan(variance(raw))
  })

  it('reset() clears state so the next sample passes through', () => {
    const f = createOneEuroFilter()
    f.filter(0.3, DT)
    f.filter(0.9, DT)
    f.reset()
    expect(f.filter(0.123, DT)).toBe(0.123)
  })

  it('treats a degenerate (<= 0) dt as a pass-through', () => {
    const f = createOneEuroFilter()
    f.filter(0.2, DT)
    expect(f.filter(0.7, 0)).toBe(0.7)
  })
})

describe('createGazeCursorSmoother', () => {
  const DT = 1 / 60

  it('smooths both axes independently', () => {
    const s = createGazeCursorSmoother()
    // First push passes through.
    expect(s.push(0.1, -0.2, DT)).toEqual({ x: 0.1, y: -0.2 })
    // A constant signal is held exactly on both axes.
    for (let i = 0; i < 20; i++) {
      const out = s.push(0.1, -0.2, DT)
      expect(out.x).toBeCloseTo(0.1, 10)
      expect(out.y).toBeCloseTo(-0.2, 10)
    }
  })

  it('eases toward a moved target on both axes without overshoot', () => {
    const s = createGazeCursorSmoother()
    s.push(0, 0, DT)
    let out = { x: 0, y: 0 }
    for (let i = 0; i < 60; i++) out = s.push(1, -1, DT)
    expect(out.x).toBeGreaterThan(0.9)
    expect(out.x).toBeLessThanOrEqual(1)
    expect(out.y).toBeLessThan(-0.9)
    expect(out.y).toBeGreaterThanOrEqual(-1)
  })

  it('reset() clears both axes', () => {
    const s = createGazeCursorSmoother()
    s.push(0.5, 0.5, DT)
    s.push(0.9, 0.9, DT)
    s.reset()
    expect(s.push(0.2, -0.3, DT)).toEqual({ x: 0.2, y: -0.3 })
  })
})

describe('centerOf', () => {
  it('returns the exact center of the viewport', () => {
    expect(centerOf({ width: 1920, height: 1080 })).toEqual({ x: 960, y: 540 })
  })
})

describe('steerCursor', () => {
  const bounds = { width: 1000, height: 800 }
  const mid = { x: 500, y: 400 }

  it('holds position when looking center', () => {
    expect(steerCursor(mid, 'center', 1, bounds)).toEqual(mid)
  })

  it('moves the configured speed over one second per axis', () => {
    // Use a viewport big enough that a full second of travel does not clamp.
    const big = { width: 4000, height: 4000 }
    const c = { x: 2000, y: 2000 }
    // up decrements y, down increments y, left decrements x, right increments x
    expect(steerCursor(c, 'up', 1, big).y).toBeCloseTo(2000 - GAZE_CURSOR_SPEED, 5)
    expect(steerCursor(c, 'down', 1, big).y).toBeCloseTo(2000 + GAZE_CURSOR_SPEED, 5)
    expect(steerCursor(c, 'left', 1, big).x).toBeCloseTo(2000 - GAZE_CURSOR_SPEED, 5)
    expect(steerCursor(c, 'right', 1, big).x).toBeCloseTo(2000 + GAZE_CURSOR_SPEED, 5)
  })

  it('scales travel by elapsed time (dt)', () => {
    const half = steerCursor(mid, 'right', 0.5, bounds)
    expect(half.x).toBeCloseTo(500 + GAZE_CURSOR_SPEED * 0.5, 5)
  })

  it('accepts a custom speed', () => {
    const slow = steerCursor(mid, 'right', 1, bounds, 100)
    expect(slow.x).toBeCloseTo(600, 5)
  })

  it('clamps to the viewport edges (cannot leave the screen)', () => {
    // A huge dt would overshoot; the result must clamp to the bounds.
    expect(steerCursor(mid, 'left', 100, bounds).x).toBe(0)
    expect(steerCursor(mid, 'up', 100, bounds).y).toBe(0)
    expect(steerCursor(mid, 'right', 100, bounds).x).toBe(bounds.width)
    expect(steerCursor(mid, 'down', 100, bounds).y).toBe(bounds.height)
  })

  it('treats a negative dt as no movement', () => {
    expect(steerCursor(mid, 'right', -1, bounds)).toEqual(mid)
  })
})

describe('pointInRect', () => {
  const rect = { left: 100, top: 200, right: 300, bottom: 400 }

  it('is true for a point inside the box', () => {
    expect(pointInRect({ x: 200, y: 300 }, rect)).toBe(true)
  })

  it('counts the edges as inside', () => {
    expect(pointInRect({ x: 100, y: 200 }, rect)).toBe(true)
    expect(pointInRect({ x: 300, y: 400 }, rect)).toBe(true)
  })

  it('is false outside the box on any side', () => {
    expect(pointInRect({ x: 99, y: 300 }, rect)).toBe(false)
    expect(pointInRect({ x: 301, y: 300 }, rect)).toBe(false)
    expect(pointInRect({ x: 200, y: 199 }, rect)).toBe(false)
    expect(pointInRect({ x: 200, y: 401 }, rect)).toBe(false)
  })
})
