'use client'

import { colors } from '@glance/shared/design/tokens'
import { useInteractiveTarget } from '../hooks/useInteractiveTarget'

interface SpeakButtonProps {
  onActivate: () => void
}

/**
 * Permanent "Say something" control in the bottom-left corner (mirrors the SOS
 * button in the bottom-right). Opens the fixed-phrase board. Registered as an
 * interactive target so the patient can reach it with the gaze cursor or in
 * scan mode.
 */
export function SpeakButton({ onActivate }: SpeakButtonProps) {
  const { ref, focused } = useInteractiveTarget<HTMLButtonElement>('speak', onActivate)

  return (
    <button
      ref={ref}
      type="button"
      onClick={onActivate}
      aria-label="Say something — open phrase board"
      className="fixed bottom-8 left-11 z-50 flex items-center gap-3 rounded-full font-bold transition-transform active:scale-95 focus-visible:outline-none"
      style={{
        padding: '16px 28px',
        backgroundColor: '#fff',
        border: `2px solid ${focused ? colors.brand.primary : colors.borderWarm}`,
        boxShadow: focused ? '0 0 24px 4px rgba(124,92,252,0.4)' : '0 4px 14px rgba(36,30,43,0.05)',
        color: colors.ink,
      }}
    >
      <span aria-hidden style={{ fontSize: 24, lineHeight: 1 }}>💬</span>
      <span style={{ fontSize: 22 }}>Say something</span>
    </button>
  )
}
