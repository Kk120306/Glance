// ── EAR calibration persistence ─────────────────────────────────────────────
// The blink EAR threshold is hardware/lighting/distance specific, so it is tuned
// per device and persisted to localStorage (no DB). These pure helpers keep the
// math and the parse/validate logic unit-testable away from React.

export const EAR_THRESHOLD_STORAGE_KEY = 'glance_ear_threshold'

/** Plausible EAR threshold range. EAR is a ratio of eye opening to width; real
 *  values sit well inside (0, 1), so anything outside this is rejected. */
const MIN_EAR = 0.01
const MAX_EAR = 0.9

/**
 * Recommended blink threshold: the midpoint between the averaged open-eye EAR and
 * the averaged closed-eye EAR. A blink is detected when live EAR drops below it.
 */
export function computeEarThreshold(openEAR: number, closedEAR: number): number {
  return (openEAR + closedEAR) / 2
}

/** Whether a value is a usable EAR threshold (finite and within range). */
export function isValidEarThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > MIN_EAR && value < MAX_EAR
}

/**
 * Read and validate the persisted EAR threshold. Returns `null` when absent or
 * malformed so the caller falls back to the built-in default.
 */
export function loadStoredEarThreshold(storage: Pick<Storage, 'getItem'> | undefined): number | null {
  if (!storage) return null
  const raw = storage.getItem(EAR_THRESHOLD_STORAGE_KEY)
  if (raw === null) return null
  const parsed = Number(raw)
  return isValidEarThreshold(parsed) ? parsed : null
}

/** Persist a validated EAR threshold. No-ops on an invalid value or missing storage. */
export function saveEarThreshold(
  storage: Pick<Storage, 'setItem'> | undefined,
  value: number,
): boolean {
  if (!storage || !isValidEarThreshold(value)) return false
  storage.setItem(EAR_THRESHOLD_STORAGE_KEY, String(value))
  return true
}
