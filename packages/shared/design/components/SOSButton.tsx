import React from 'react'
import { colors } from '../tokens'

interface SOSButtonProps {
  onClick?: () => void
  className?: string
}

export function SOSButton({ onClick, className = '' }: SOSButtonProps) {
  return (
    <button
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
      }}
    >
      SOS
    </button>
  )
}
