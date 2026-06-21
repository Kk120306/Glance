// ── SOS amplitude / sustain decision ────────────────────────────────────────
// Hard Constraint (SOS Independence): SOS must be triggerable hands-free and
// webcam-free. The detection is a pure function of the microphone's FFT byte
// buffer and a clock — it touches no webcam, eye-tracking, or DOM API — so it
// keeps working when the webcam is off, denied, or broken. Extracted out of the
// React component so the safety-critical decision is directly unit-testable.

/**
 * Mean normalized amplitude (0..1) of an FFT byte-frequency buffer. Each bin is
 * a 0..255 byte; we average then scale to 0..1. Returns 0 for an empty buffer.
 */
export function meanAmplitude(data: Uint8Array): number {
  if (data.length === 0) return 0
  let sum = 0
  for (const v of data) sum += v
  return sum / data.length / 255
}

export interface SosSustainState {
  /** Timestamp (ms) when the current over-threshold run began, or null. */
  startedAt: number | null
}

export interface SosSustainOptions {
  /** Normalized amplitude (0..1) above which vocalization is considered active. */
  threshold: number
  /** How long amplitude must stay above threshold before SOS fires (ms). */
  sustainMs: number
  /** Current time in ms (injected for deterministic testing). */
  now: number
}

/**
 * Advance the sustained-vocalization state machine by one sample. SOS fires only
 * once amplitude has stayed above `threshold` continuously for `sustainMs`. Any
 * dip below threshold resets the run. Pure: returns the next state and whether to
 * fire, mutating nothing.
 */
export function stepSosSustain(
  state: SosSustainState,
  amplitude: number,
  opts: SosSustainOptions,
): { state: SosSustainState; fire: boolean } {
  if (amplitude > opts.threshold) {
    if (state.startedAt === null) {
      // First sample of a new run — start the clock, don't fire yet.
      return { state: { startedAt: opts.now }, fire: false }
    }
    if (opts.now - state.startedAt >= opts.sustainMs) {
      // Sustained long enough — fire and reset so the next run must build again.
      return { state: { startedAt: null }, fire: true }
    }
    // Still accumulating within the same run.
    return { state, fire: false }
  }
  // Below threshold — reset the run.
  return { state: { startedAt: null }, fire: false }
}
