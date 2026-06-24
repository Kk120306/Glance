'use client'

import type { CSSProperties } from 'react'
import { colors } from '@glance/shared/design/tokens'

const FOCUSED_SHADOW = '0 16px 36px rgba(124,92,252,.28)'
const DEFAULT_UNFOCUSED_SHADOW = '0 8px 24px rgba(36,30,43,.07)'

/**
 * Home-tile gaze focus chrome: purple border, scale-up, purple glow, and armed
 * outline. Shared across split-screen yes/no and confirm flows so focus feedback
 * matches the home dashboard.
 */
export function tileFocusStyle({
  focused,
  armed,
  unfocusedShadow = DEFAULT_UNFOCUSED_SHADOW,
  /** Preserve a neutral divider on the inner edge when unfocused (left split half). */
  splitInnerEdge,
}: {
  focused: boolean
  armed: boolean
  /** Shadow when unfocused; pass `'none'` for full-bleed split halves. */
  unfocusedShadow?: string
  splitInnerEdge?: 'left' | 'right'
}): Pick<CSSProperties, 'boxShadow' | 'border' | 'borderTop' | 'borderBottom' | 'borderLeft' | 'borderRight' | 'outline' | 'transform'> {
  const borderWidth = focused ? 4 : 3
  const borderColor = focused ? colors.brand.primary : 'transparent'
  const borderVal = `${borderWidth}px solid ${borderColor}`
  const divider = '2px solid #F4EEE6'

  const base = {
    boxShadow: focused ? FOCUSED_SHADOW : unfocusedShadow,
    outline: armed ? `5px solid ${colors.brand.soft}` : 'none',
    transform: focused ? 'scale(1.03)' : 'scale(1)',
  }

  if (!splitInnerEdge) {
    return { ...base, border: borderVal }
  }

  const inner = splitInnerEdge === 'left' ? 'borderLeft' : 'borderRight'
  const outer = splitInnerEdge === 'left' ? 'borderRight' : 'borderLeft'

  return {
    ...base,
    borderTop: borderVal,
    borderBottom: borderVal,
    [outer]: borderVal,
    [inner]: focused ? borderVal : divider,
  }
}

/**
 * One-shot inner ring that flares the moment gaze focus lands on a target. It is
 * rendered only while the target is focused and remounts on each new focus, so
 * the CSS animation replays every time — the patient sees the step arrive.
 */
export function FocusArriveRing({ radius, light = false }: { radius?: number; light?: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10"
      style={{
        ...(radius != null ? { borderRadius: radius } : {}),
        animation: `${light ? 'focusArriveLight' : 'focusArrive'} 460ms ease-out`,
      }}
    />
  )
}

/** Blink-to-confirm hint shown when a target is focused or armed. */
export function FocusHint({
  focused,
  armed,
  color,
}: {
  focused: boolean
  armed: boolean
  color: string
}) {
  return (
    <span
      className="relative mt-3.5 font-bold"
      style={{
        fontSize: 19,
        color: armed ? colors.brand.deep : color,
        opacity: focused ? 1 : 0,
        animation: armed ? 'armPulse 1.2s ease-in-out infinite' : undefined,
      }}
    >
      {armed ? 'Blink again to confirm ✓' : 'Blink twice to choose'}
    </span>
  )
}
