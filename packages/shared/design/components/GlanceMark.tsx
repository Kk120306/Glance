import React from 'react'

interface GlanceMarkProps {
  size?: number
  className?: string
}

/**
 * The Glance blob mark — a small static version of the Blob Agent used as the
 * brand logo across the caregiver dashboard (sidebar, auth screens). Decorative.
 */
export function GlanceMark({ size = 40, className = '' }: GlanceMarkProps) {
  const id = React.useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id={`gm-${id}`} cx="38%" cy="30%">
          <stop offset="0%" stopColor="#D9C9FF" />
          <stop offset="52%" stopColor="#A98CF7" />
          <stop offset="100%" stopColor="#EC8FDE" />
        </radialGradient>
      </defs>
      <path
        d="M100 18C140 18 174 46 178 90C181 124 166 156 130 172C102 184 62 180 39 156C18 134 16 96 28 68C42 36 68 18 100 18Z"
        fill={`url(#gm-${id})`}
      />
      <ellipse cx="82" cy="96" rx="8" ry="11" fill="#3A2566" />
      <ellipse cx="120" cy="96" rx="8" ry="11" fill="#3A2566" />
    </svg>
  )
}
