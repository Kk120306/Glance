'use client'

import { colors } from '@glance/shared/design/tokens'
import { useInteractiveTarget } from '../hooks/useInteractiveTarget'

interface SpeakButtonProps {
  onActivate: () => void
}

/**
 * Permanent "Speak" button in the bottom-left corner (mirrors the SOS button in
 * the bottom-right). Opens the fixed-phrase board. Registered as an interactive
 * target so the patient can reach it with the gaze cursor or in scan mode.
 */
export function SpeakButton({ onActivate }: SpeakButtonProps) {
  const { ref, focused } = useInteractiveTarget<HTMLButtonElement>('speak', onActivate)

  return (
    <button
      ref={ref}
      type="button"
      onClick={onActivate}
      aria-label="Speak — open phrase board"
      className="fixed bottom-6 left-6 z-50 flex flex-col items-center justify-center rounded-full font-bold transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2"
      style={{
        minWidth: '80px',
        minHeight: '80px',
        backgroundColor: colors.patient.accent,
        color: '#000',
        fontSize: '1.1rem',
        outline: focused ? '6px solid #86efac' : 'none',
        boxShadow: focused ? '0 0 28px 6px rgba(34,197,94,0.7)' : 'none',
      }}
    >
      <span aria-hidden style={{ fontSize: '1.6rem', lineHeight: 1 }}>
        💬
      </span>
      Speak
    </button>
  )
}
