type GazeDirection = 'up' | 'down' | 'left' | 'right' | 'center'

/**
 * Update the step latch as gaze direction changes. Clears on center or when the
 * patient switches to a different non-center direction so they can step again
 * without a perfect neutral gaze between tiles.
 */
export function resolveStepLatch(
  latchedDir: GazeDirection | null,
  gazeDir: GazeDirection,
): GazeDirection | null {
  if (gazeDir === 'center') return null
  if (latchedDir !== null && latchedDir !== gazeDir) return null
  return latchedDir
}

/** True when a sustained look in `gazeDir` must not start a new step timer. */
export function isStepHoldBlocked(
  latchedDir: GazeDirection | null,
  gazeDir: GazeDirection,
): boolean {
  if (gazeDir === 'center') return true
  return latchedDir === gazeDir
}
