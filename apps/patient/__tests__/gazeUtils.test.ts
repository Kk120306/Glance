import { describe, it, expect } from 'vitest'
import { computeEAR, classifyGazeDirection, smoothGazeDirection, EAR_THRESHOLD } from '../src/utils/gazeUtils'
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
