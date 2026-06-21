import { describe, it, expect } from 'vitest'
import { meanAmplitude, stepSosSustain, type SosSustainState } from '../src/utils/sosAmplitude'

describe('meanAmplitude', () => {
  it('returns 0 for an empty buffer', () => {
    expect(meanAmplitude(new Uint8Array([]))).toBe(0)
  })

  it('returns 0 for silence (all zero bins)', () => {
    expect(meanAmplitude(new Uint8Array(128))).toBe(0)
  })

  it('returns 1 for a fully saturated buffer (all 255)', () => {
    expect(meanAmplitude(new Uint8Array(64).fill(255))).toBe(1)
  })

  it('normalizes the mean to 0..1', () => {
    expect(meanAmplitude(new Uint8Array([0, 255]))).toBeCloseTo(0.5, 5)
    expect(meanAmplitude(new Uint8Array([255, 255, 0, 0]))).toBeCloseTo(0.5, 5)
  })
})

describe('stepSosSustain', () => {
  const opts = { threshold: 0.15, sustainMs: 1500 }

  it('does not fire on a single over-threshold sample — it only starts the clock', () => {
    const { state, fire } = stepSosSustain({ startedAt: null }, 0.9, { ...opts, now: 1000 })
    expect(fire).toBe(false)
    expect(state.startedAt).toBe(1000)
  })

  it('does not fire while still within the sustain window', () => {
    const { state, fire } = stepSosSustain({ startedAt: 1000 }, 0.9, { ...opts, now: 2000 })
    expect(fire).toBe(false)
    expect(state.startedAt).toBe(1000) // run preserved
  })

  it('fires once amplitude has stayed above threshold for the full sustain window', () => {
    const { state, fire } = stepSosSustain({ startedAt: 1000 }, 0.9, { ...opts, now: 2500 })
    expect(fire).toBe(true)
    expect(state.startedAt).toBe(null) // resets so the next alarm must rebuild
  })

  it('resets the run when amplitude dips below threshold', () => {
    const { state, fire } = stepSosSustain({ startedAt: 1000 }, 0.05, { ...opts, now: 1200 })
    expect(fire).toBe(false)
    expect(state.startedAt).toBe(null)
  })

  it('requires a continuous run — a dip restarts the clock', () => {
    let state: SosSustainState = { startedAt: null }
    // Loud at t=0 → start the clock.
    ;({ state } = stepSosSustain(state, 0.9, { ...opts, now: 0 }))
    expect(state.startedAt).toBe(0)
    // Dip at t=500 → reset before sustain elapses.
    ;({ state } = stepSosSustain(state, 0.0, { ...opts, now: 500 }))
    expect(state.startedAt).toBe(null)
    // Loud again at t=1000 → fresh clock; must NOT fire even though 1000 > sustain
    // would be true relative to the original t=0.
    let fired = false
    ;({ state, fire: fired } = stepSosSustain(state, 0.9, { ...opts, now: 1000 }))
    expect(fired).toBe(false)
    expect(state.startedAt).toBe(1000)
  })

  it('fires after a sustained run starting from idle (full lifecycle)', () => {
    let state: SosSustainState = { startedAt: null }
    let fired = false
    const samples = [0, 200, 400, 600, 800, 1000, 1200, 1400, 1500]
    for (const now of samples) {
      ;({ state, fire: fired } = stepSosSustain(state, 0.9, { ...opts, now }))
      if (fired) break
    }
    expect(fired).toBe(true)
  })

  it('is camera-independent — a pure function of buffer, state, and clock only', () => {
    // No DOM / navigator / camera is referenced; the call works in a bare node
    // context. (This guards SOS Independence: the decision never reads video.)
    expect(() =>
      stepSosSustain({ startedAt: null }, meanAmplitude(new Uint8Array(8).fill(255)), {
        ...opts,
        now: 0,
      }),
    ).not.toThrow()
  })
})
