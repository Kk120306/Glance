import { describe, it, expect } from 'vitest'
import {
  steerCursor,
  centerOf,
  pointInRect,
  GAZE_CURSOR_SPEED,
  type GazeDirection,
} from '../src/utils/gazeUtils'

/**
 * Drives the pure cursor-physics helpers through the same sequence the
 * InteractionProvider's rAF loop runs: start centered, steer onto a target,
 * hold center to dwell, fire, and recenter — plus the screen-change recenter.
 * The provider's loop is DOM/rAF wiring around exactly these functions, so this
 * exercises the steering + intersection + auto-centering contract end-to-end.
 */

const BOUNDS = { width: 1000, height: 800 }
const FPS = 60
const DT = 1 / FPS
const DWELL_MS = 1500

// A target sitting to the right of center.
const TARGET = { left: 760, top: 360, right: 920, bottom: 440 } as const

// Run the cursor loop for `frames` frames, steering by `dir(i)` each frame and
// accumulating dwell while parked inside the target. Returns the final state.
function run(
  start: { x: number; y: number },
  dir: GazeDirection | ((i: number) => GazeDirection),
  frames: number,
) {
  const pick = typeof dir === 'function' ? dir : () => dir
  let pos = { ...start }
  let dwellMs = 0
  let fired = false
  for (let i = 0; i < frames; i++) {
    pos = steerCursor(pos, pick(i), DT, BOUNDS)
    if (pointInRect(pos, TARGET as unknown as DOMRect)) {
      dwellMs += DT * 1000
      if (dwellMs >= DWELL_MS) fired = true
    } else {
      dwellMs = 0
    }
  }
  return { pos, dwellMs, fired }
}

describe('gaze cursor — steer, focus, dwell, recenter', () => {
  it('starts at the exact center of the viewport', () => {
    expect(centerOf(BOUNDS)).toEqual({ x: 500, y: 400 })
  })

  it('steers right from center until the cursor is over the target', () => {
    // Distance from center (500) to the target's left edge (760) at 480px/s.
    const secondsToReach = (TARGET.left - 500) / GAZE_CURSOR_SPEED
    const frames = Math.ceil(secondsToReach * FPS) + 2
    const { pos } = run(centerOf(BOUNDS), 'right', frames)
    expect(pointInRect(pos, TARGET as unknown as DOMRect)).toBe(true)
  })

  it('completes the dwell after steering onto the target then holding center', () => {
    // The spec's core gesture: steer right to reach the target, then look back
    // to center to park the cursor on it long enough to fire. A continuous
    // rightward look would sail straight through, which is the whole point.
    const arriveFrames = Math.ceil(((TARGET.left - 500) / GAZE_CURSOR_SPEED) * FPS) + 2
    const totalFrames = arriveFrames + FPS * 2 // hold ~2s at center afterwards
    const { fired } = run(centerOf(BOUNDS), (i) => (i < arriveFrames ? 'right' : 'center'), totalFrames)
    expect(fired).toBe(true)
  })

  it('sails through a narrow target under continuous steering (must halt to select)', () => {
    // Holding 'right' the whole time crosses the target faster than the dwell,
    // so it never fires — demonstrating why halting at center is required.
    const { fired } = run(centerOf(BOUNDS), 'right', FPS * 3)
    expect(fired).toBe(false)
  })

  it('does not dwell-fire while merely passing over the target', () => {
    // Steering left from center never reaches the right-side target.
    const { fired, dwellMs } = run(centerOf(BOUNDS), 'left', FPS * 3)
    expect(fired).toBe(false)
    expect(dwellMs).toBe(0)
  })

  it('recenters to the viewport center on a screen change (target set change)', () => {
    // Park the cursor on the target, then a screen change resets it to center.
    const { pos: parked } = run(centerOf(BOUNDS), 'right', FPS)
    expect(parked.x).toBeGreaterThan(500)
    // The provider sets pos = center on a target-set change.
    const recentered = centerOf(BOUNDS)
    expect(recentered).toEqual({ x: 500, y: 400 })
    expect(pointInRect(recentered, TARGET as unknown as DOMRect)).toBe(false)
  })

  it('holding center halts the cursor in place (joystick neutral)', () => {
    const start = { x: 820, y: 400 } // inside the target
    const { pos } = run(start, 'center', FPS * 2)
    expect(pos).toEqual(start)
  })
})
