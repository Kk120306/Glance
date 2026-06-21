'use client'

import { useId } from 'react'
import { colors } from '@glance/shared/design/tokens'

/**
 * The Blob Agent — the patient's animated visual focal point.
 *
 * A glowing companion rendered as an organic gradient shape with soft eyes. It
 * "breathes" and gently floats while idle, blinks on a slow cadence, opens its
 * mouth while a message is read aloud (`speaking`), and shifts colour + eye
 * shape with its emotional `tone`. Purely decorative: `aria-hidden` and never an
 * interactive target, so it never captures the gaze cursor.
 *
 * Motion is CSS-only (see globals.css) to stay dependency-free and off the React
 * render path. Parent controls placement and size.
 */

export type BlobTone = 'neutral' | 'warm' | 'urgent'

/** Internal visual states, including the ones derived from props. */
type BlobState = 'neutral' | 'warm' | 'listening' | 'speaking' | 'urgent'

interface BlobAgentProps {
  /** Drives the blob's colour and expression. */
  tone?: BlobTone
  /** When true, the mouth animates as if talking (synced to TTS playback). */
  speaking?: boolean
  /** Render size (any CSS length). Defaults to a responsive viewport size. */
  size?: string
  /** Show the soft ambient glow halo behind the blob. */
  glow?: boolean
  /** Add the gentle floating drift (home/idle). */
  float?: boolean
  className?: string
}

export function BlobAgent({
  tone = 'neutral',
  speaking = false,
  size = '300px',
  glow = true,
  float = true,
  className = '',
}: BlobAgentProps) {
  const uid = useId().replace(/:/g, '')
  // Speaking always takes the warm pink "voice" palette; otherwise the tone maps
  // to its resting state.
  const state: BlobState = speaking
    ? 'speaking'
    : tone === 'warm'
      ? 'warm'
      : tone === 'urgent'
        ? 'urgent'
        : 'neutral'

  const g = colors.blob[state]
  const isUrgent = state === 'urgent'
  const isWarm = state === 'warm' || state === 'neutral'

  const glowBg =
    state === 'speaking'
      ? 'radial-gradient(circle at 42% 36%,#FBD9F1,#EC8FDE 50%,#A98CF7)'
      : isUrgent
        ? '#E5484D'
        : 'radial-gradient(circle at 40% 35%,#CDBAFF,#9C7BF5 55%,#EC8FDE)'

  return (
    <div
      aria-hidden
      className={`blob-agent relative ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Soft ambient glow */}
      {glow && (
        <div
          style={{
            position: 'absolute',
            inset: isUrgent ? '-14px' : '20px',
            borderRadius: '50%',
            background: glowBg,
            filter: isUrgent ? undefined : 'blur(38px)',
            opacity: 0.6,
            animation: isUrgent
              ? 'urgentPulse 1.1s ease-in-out infinite'
              : 'glowPulse 5s ease-in-out infinite',
          }}
        />
      )}

      {/* Float wrapper */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          animation: float && !isUrgent ? 'float 6.5s ease-in-out infinite' : undefined,
        }}
      >
        {/* Breathe wrapper */}
        <div
          style={{
            width: '100%',
            height: '100%',
            transformOrigin: 'center',
            animation: isUrgent
              ? 'breatheLg 1.2s ease-in-out infinite'
              : state === 'speaking'
                ? 'breatheLg 2.8s ease-in-out infinite'
                : 'breathe 4.6s ease-in-out infinite',
          }}
        >
          <svg
            viewBox="0 0 200 200"
            width="100%"
            height="100%"
            style={{
              display: 'block',
              filter: isUrgent
                ? 'drop-shadow(0 14px 30px rgba(0,0,0,.3))'
                : 'drop-shadow(0 26px 46px rgba(124,92,252,.30))',
            }}
          >
            <defs>
              <radialGradient id={`blob-${uid}`} cx="38%" cy="30%" r="78%">
                <stop offset="0%" stopColor={g.from} />
                <stop offset="52%" stopColor={g.mid} />
                <stop offset="100%" stopColor={g.to} />
              </radialGradient>
            </defs>

            <path
              d="M100 18C140 18 174 46 178 90C181 124 166 156 130 172C102 184 62 180 39 156C18 134 16 96 28 68C42 36 68 18 100 18Z"
              fill={`url(#blob-${uid})`}
            />

            {/* Soft highlight */}
            {isWarm && <ellipse cx="74" cy="76" rx="22" ry="24" fill="#fff" opacity="0.22" />}

            {/* Eyes */}
            {state === 'speaking' ? (
              <>
                <ellipse cx="80" cy="90" rx="8" ry="11" fill={g.eye} />
                <ellipse cx="120" cy="90" rx="8" ry="11" fill={g.eye} />
                {/* Open mouth, animated while talking */}
                <ellipse
                  cx="100"
                  cy="126"
                  rx="13"
                  ry="16"
                  fill={g.eye}
                  style={{ transformOrigin: '100px 126px', animation: 'mouth .5s ease-in-out infinite' }}
                />
              </>
            ) : (
              <>
                <g style={{ transformOrigin: 'center', animation: 'blink 6.5s ease-in-out infinite' }}>
                  <ellipse cx="80" cy="96" rx="9" ry="12" fill={g.eye} />
                  <ellipse cx="122" cy="96" rx="9" ry="12" fill={g.eye} />
                  <circle cx="83" cy="91" r="3.2" fill="#fff" />
                  <circle cx="125" cy="91" r="3.2" fill="#fff" />
                </g>
                {/* Mouth — a smile when calm, a concerned arc when urgent. */}
                <path
                  d={
                    isUrgent
                      ? 'M86 130C94 123 106 123 114 130'
                      : 'M86 124C95 133 108 133 116 124'
                  }
                  stroke={g.eye}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  fill="none"
                  opacity={isUrgent ? 1 : 0.72}
                />
              </>
            )}
          </svg>
        </div>
      </div>
    </div>
  )
}
