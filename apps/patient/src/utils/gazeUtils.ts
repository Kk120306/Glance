export type GazeDirection = 'up' | 'down' | 'left' | 'right' | 'center'

export interface Point2D {
  x: number
  y: number
}

export const EAR_THRESHOLD = 0.20
export const GAZE_SMOOTH_FRAMES = 20

function euclidean(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/**
 * Eye Aspect Ratio — ratio of vertical opening to horizontal span.
 * Below EAR_THRESHOLD for ≥2 frames indicates a blink.
 */
export function computeEAR(
  upperLid: Point2D,
  lowerLid: Point2D,
  leftCorner: Point2D,
  rightCorner: Point2D,
): number {
  const vertical = euclidean(upperLid, lowerLid)
  const horizontal = euclidean(leftCorner, rightCorner)
  if (horizontal === 0) return 0
  return vertical / horizontal
}

/**
 * Classify gaze direction from iris center relative to eye corners.
 * MediaPipe y coords: 0 = top, 1 = bottom (browser coordinate space).
 * normY < 0 means iris is above center → patient is looking UP.
 */
export function classifyGazeDirection(
  irisCenter: Point2D,
  leftCorner: Point2D,
  rightCorner: Point2D,
  thresholdH = 0.12,
  thresholdV = 0.08,
): GazeDirection {
  const eyeCenterX = (leftCorner.x + rightCorner.x) / 2
  const eyeCenterY = (leftCorner.y + rightCorner.y) / 2
  const eyeWidth = euclidean(leftCorner, rightCorner)

  if (eyeWidth === 0) return 'center'

  const normX = (irisCenter.x - eyeCenterX) / eyeWidth
  const normY = (irisCenter.y - eyeCenterY) / eyeWidth

  if (normY < -thresholdV) return 'up'
  if (normY > thresholdV) return 'down'
  if (normX < -thresholdH) return 'left'
  if (normX > thresholdH) return 'right'
  return 'center'
}

/**
 * Rolling window majority vote for smoothing gaze direction.
 */
export function smoothGazeDirection(history: GazeDirection[]): GazeDirection {
  if (history.length === 0) return 'center'

  const counts: Record<GazeDirection, number> = { up: 0, down: 0, left: 0, right: 0, center: 0 }
  for (const d of history) counts[d]++

  let best: GazeDirection = 'center'
  let bestCount = 0
  for (const [dir, count] of Object.entries(counts) as [GazeDirection, number][]) {
    if (count > bestCount) {
      bestCount = count
      best = dir
    }
  }
  return best
}
