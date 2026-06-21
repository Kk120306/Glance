import React from 'react'
import { colors } from '../tokens'

interface SOSButtonProps {
  onClick?: () => void
  className?: string
  /** Highlight when the gaze cursor is parked on it (focused target). */
  focused?: boolean
}

/**
 * Always-present emergency control, pinned bottom-right. Styled as the soft
 * "Emergency SOS" pill from the Glance design system; reachable by gaze dwell
 * or scan, in addition to the camera-independent vocal SOS path.
 */
export const SOSButton = React.forwardRef<HTMLButtonElement, SOSButtonProps>(
  function SOSButton({ onClick, className = '', focused = false }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label="Emergency SOS"
        onClick={onClick}
        className={`fixed bottom-8 right-11 z-50 flex items-center gap-4 rounded-full font-bold focus-visible:outline-none ${className}`}
        style={{
          padding: '16px 32px',
          backgroundColor: colors.patient.sosSoft,
          border: `2px solid ${focused ? colors.patient.sos : '#F3B7B7'}`,
          boxShadow: focused ? '0 0 28px 6px rgba(229,72,77,0.45)' : '0 4px 14px rgba(229,72,77,0.12)',
        }}
      >
        <span aria-hidden style={{ fontSize: 26 }}>🆘</span>
        <span style={{ fontSize: 24, fontWeight: 700, color: colors.patient.sosInk }}>Emergency SOS</span>
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#C97A7A',
            borderLeft: '1px solid #F0C4C4',
            paddingLeft: 16,
          }}
        >
          Hold gaze
        </span>
      </button>
    )
  },
)
