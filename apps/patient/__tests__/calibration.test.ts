import { describe, it, expect } from 'vitest'
import {
  computeEarThreshold,
  isValidEarThreshold,
  loadStoredEarThreshold,
  saveEarThreshold,
  EAR_THRESHOLD_STORAGE_KEY,
} from '../src/utils/calibration'

// Minimal in-memory Storage stand-in for the localStorage helpers.
function makeStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    _map: map,
  }
}

describe('computeEarThreshold', () => {
  it('returns the midpoint between open and closed EAR', () => {
    expect(computeEarThreshold(0.3, 0.1)).toBeCloseTo(0.2, 6)
    expect(computeEarThreshold(0.28, 0.12)).toBeCloseTo(0.2, 6)
  })
})

describe('isValidEarThreshold', () => {
  it('accepts plausible EAR values', () => {
    expect(isValidEarThreshold(0.2)).toBe(true)
    expect(isValidEarThreshold(0.05)).toBe(true)
  })
  it('rejects out-of-range, NaN, and non-numbers', () => {
    expect(isValidEarThreshold(0)).toBe(false)
    expect(isValidEarThreshold(1)).toBe(false)
    expect(isValidEarThreshold(Number.NaN)).toBe(false)
    expect(isValidEarThreshold('0.2')).toBe(false)
    expect(isValidEarThreshold(null)).toBe(false)
  })
})

describe('loadStoredEarThreshold', () => {
  it('returns null when nothing is stored', () => {
    expect(loadStoredEarThreshold(makeStorage())).toBeNull()
  })
  it('parses a valid stored numeric string', () => {
    const s = makeStorage({ [EAR_THRESHOLD_STORAGE_KEY]: '0.18' })
    expect(loadStoredEarThreshold(s)).toBeCloseTo(0.18, 6)
  })
  it('returns null for a malformed or out-of-range value', () => {
    expect(loadStoredEarThreshold(makeStorage({ [EAR_THRESHOLD_STORAGE_KEY]: 'abc' }))).toBeNull()
    expect(loadStoredEarThreshold(makeStorage({ [EAR_THRESHOLD_STORAGE_KEY]: '5' }))).toBeNull()
  })
  it('returns null when storage is undefined (SSR)', () => {
    expect(loadStoredEarThreshold(undefined)).toBeNull()
  })
})

describe('saveEarThreshold', () => {
  it('persists a valid threshold and is read back', () => {
    const s = makeStorage()
    expect(saveEarThreshold(s, 0.21)).toBe(true)
    expect(loadStoredEarThreshold(s)).toBeCloseTo(0.21, 6)
  })
  it('refuses to persist an invalid threshold', () => {
    const s = makeStorage()
    expect(saveEarThreshold(s, 0)).toBe(false)
    expect(s._map.has(EAR_THRESHOLD_STORAGE_KEY)).toBe(false)
  })
})
