import { describe, it, expect } from 'vitest'
import { gazeStepDirection } from '../design/components/InteractionProvider'
import { isStepHoldBlocked, resolveStepLatch } from '../design/components/gazeStepLatch'

describe('gazeStepDirection', () => {
  it('maps classifier left/down to on-screen next', () => {
    expect(gazeStepDirection('left')).toBe('next')
    expect(gazeStepDirection('down')).toBe('next')
  })

  it('maps classifier right/up to on-screen prev', () => {
    expect(gazeStepDirection('right')).toBe('prev')
    expect(gazeStepDirection('up')).toBe('prev')
  })

  it('returns null for center', () => {
    expect(gazeStepDirection('center')).toBeNull()
  })
})

describe('resolveStepLatch', () => {
  it('clears latch on center', () => {
    expect(resolveStepLatch('left', 'center')).toBeNull()
  })

  it('clears latch when direction changes', () => {
    expect(resolveStepLatch('left', 'right')).toBeNull()
    expect(resolveStepLatch('up', 'down')).toBeNull()
  })

  it('keeps latch while holding the same direction', () => {
    expect(resolveStepLatch('left', 'left')).toBe('left')
  })

  it('stays open when no latch is set', () => {
    expect(resolveStepLatch(null, 'left')).toBeNull()
  })
})

describe('isStepHoldBlocked', () => {
  it('blocks a second step while holding the latched direction', () => {
    expect(isStepHoldBlocked('left', 'left')).toBe(true)
  })

  it('allows a step after direction change clears the latch', () => {
    const cleared = resolveStepLatch('left', 'right')
    expect(cleared).toBeNull()
    expect(isStepHoldBlocked(cleared, 'right')).toBe(false)
  })

  it('allows a step after center clears the latch', () => {
    const cleared = resolveStepLatch('left', 'center')
    expect(cleared).toBeNull()
    expect(isStepHoldBlocked(cleared, 'left')).toBe(false)
  })

  it('does not block when edge step was a no-op (no latch set)', () => {
    expect(isStepHoldBlocked(null, 'right')).toBe(false)
  })
})

describe('gaze step sequences (latch state machine)', () => {
  function simulateSequence(directions: Array<'left' | 'right' | 'center'>) {
    let latch: ReturnType<typeof resolveStepLatch> = null
    const steps: Array<'prev' | 'next'> = []

    for (const dir of directions) {
      latch = resolveStepLatch(latch, dir)
      if (dir === 'center' || isStepHoldBlocked(latch, dir)) continue
      const screenDir = gazeStepDirection(dir)
      if (screenDir) {
        steps.push(screenDir)
        latch = dir // successful step
      }
    }
    return { steps, latch }
  }

  it('chains next steps when alternating left and right without center', () => {
    const { steps } = simulateSequence(['left', 'left', 'right', 'right', 'left', 'left'])
    expect(steps).toEqual(['next', 'prev', 'next'])
  })

  it('steps once per sustained hold in the same direction', () => {
    const { steps } = simulateSequence(['left', 'left', 'left'])
    expect(steps).toEqual(['next'])
  })

  it('re-arms after center and allows another step in the same direction', () => {
    const { steps } = simulateSequence(['left', 'left', 'center', 'left', 'left'])
    expect(steps).toEqual(['next', 'next'])
  })

  it('does not latch on edge no-op — prev at first tile leaves latch open', () => {
    let latch: ReturnType<typeof resolveStepLatch> = null
    latch = resolveStepLatch(latch, 'right')
    const blocked = isStepHoldBlocked(latch, 'right')
    expect(blocked).toBe(false)
    // no successful step → latch stays null
    expect(latch).toBeNull()
    latch = resolveStepLatch(latch, 'left')
    expect(isStepHoldBlocked(latch, 'left')).toBe(false)
  })
})
