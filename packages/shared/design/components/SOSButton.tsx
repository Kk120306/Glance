import React from 'react'
import { colors } from '../tokens'

interface SOSButtonProps {
  onClick?: () => void
  className?: string
  /** Highlight when the gaze cursor is parked on it (focused target). */
  focused?: boolean
}

export const SOSButton = React.forwardRef<HTMLButtonElement, SOSButtonProps>(
  function SOSButton({ onClick, className = '', focused = false }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label="SOS"
        onClick={onClick}
        className={`fixed bottom-6 right-6 rounded-full font-bold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 z-50 ${className}`}
        style={{
          minWidth: '80px',
          minHeight: '80px',
          backgroundColor: colors.patient.sos,
          color: colors.patient.sosFg,
          fontSize: '1.5rem',
          outline: focused ? '6px solid #fca5a5' : 'none',
          boxShadow: focused ? '0 0 28px 6px rgba(220,38,38,0.7)' : 'none',
        }}
      >
        SOS
      </button>
    )
  },
)
