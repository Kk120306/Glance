'use client'

interface DwellRingProps {
  /** Dwell completion, 0 → 1. The ring is hidden at zero so resting tiles stay clean. */
  progress: number
  /** Colour of the filling progress arc. */
  color: string
  /** Outer diameter in px. */
  size?: number
  /** Inset from the target's top-right corner, in px. */
  inset?: number
}

/**
 * Circular dwell-progress ring (PRD Phase 3 "filling ring"). Sits in the
 * top-right corner of an interactive target and fills clockwise as the gaze
 * cursor dwells, giving the patient continuous feedback that a selection is
 * accumulating. Purely presentational: selection is driven by
 * `useInteractiveTarget`; this only visualises its `dwellProgress`. Hidden at
 * zero progress so unfocused targets are uncluttered.
 */
export function DwellRing({ progress, color, size = 44, inset = 12 }: DwellRingProps) {
  const clamped = progress <= 0 ? 0 : progress >= 1 ? 1 : progress
  if (clamped <= 0) return null

  const stroke = Math.max(3, Math.round(size * 0.11))
  const r = (size - stroke) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute"
      style={{ top: inset, right: inset, width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={c} cy={c} r={r} fill="rgba(255,255,255,.72)" stroke="rgba(36,30,43,.12)" strokeWidth={stroke} />
        {/* Progress arc */}
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset 90ms linear' }}
        />
      </svg>
    </span>
  )
}
