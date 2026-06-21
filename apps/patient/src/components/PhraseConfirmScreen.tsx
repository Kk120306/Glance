'use client'

import { colors, typography } from '@glance/shared/design/tokens'
import { useInteractiveTarget } from '../hooks/useInteractiveTarget'

/**
 * Fullscreen gaze-confirm step shown after the patient selects a phrase. It
 * enforces the PRD AI Content Gate: nothing the patient picked is sent until
 * they explicitly confirm it here. SEND (top) sends the phrase; BACK (bottom)
 * returns to the phrase board with no side effect. Both are interactive targets
 * (gaze dwell or scan blink) — mirrors {@link YesNoScreen}'s binary layout.
 */
interface PhraseConfirmScreenProps {
  phrase: string
  onConfirm: () => void
  onCancel: () => void
}

export function PhraseConfirmScreen({ phrase, onConfirm, onCancel }: PhraseConfirmScreenProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: colors.canvas }}
      role="dialog"
      aria-label="Confirm sending phrase"
    >
      {/* SEND — top half */}
      <ConfirmTarget
        id="confirm-send"
        icon="🔊"
        label="Send"
        gradient="linear-gradient(180deg,#E4F7F2 0%,#D2F0E8 100%)"
        accent={colors.patient.affirm}
        ink={colors.patient.affirmInk}
        fillFrom="bottom"
        onSelect={onConfirm}
      />

      {/* The phrase under review — middle band. */}
      <div
        className="flex flex-col items-center justify-center gap-2 px-8 py-7 text-center"
        style={{ background: '#fff', minHeight: '140px', boxShadow: '0 1px 3px rgba(36,30,43,.06)' }}
      >
        <span className="font-bold uppercase tracking-[.14em]" style={{ fontSize: 13, color: colors.inkFaint }}>
          Send this?
        </span>
        <span style={{ fontFamily: typography.fontFamily.serif, fontSize: 'clamp(28px,4vw,40px)', fontWeight: 500, color: colors.ink }}>
          “{phrase}”
        </span>
      </div>

      {/* BACK — bottom half */}
      <ConfirmTarget
        id="confirm-back"
        icon="↩"
        label="Go back"
        gradient="linear-gradient(180deg,#FBEDED 0%,#F6DEDE 100%)"
        accent="#B85656"
        ink="#9A4444"
        fillFrom="top"
        onSelect={onCancel}
      />
    </div>
  )
}

function ConfirmTarget({
  id, icon, label, gradient, accent, ink, fillFrom, onSelect,
}: {
  id: string
  icon: string
  label: string
  gradient: string
  accent: string
  ink: string
  fillFrom: 'top' | 'bottom'
  onSelect: () => void
}) {
  const { ref, focused, dwellProgress } = useInteractiveTarget<HTMLButtonElement>(id, onSelect)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={label}
      className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden"
      style={{ background: gradient }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0"
        style={{
          top: fillFrom === 'top' ? 0 : undefined,
          bottom: fillFrom === 'bottom' ? 0 : undefined,
          height: `${Math.round(dwellProgress * 100)}%`,
          background: accent,
          opacity: 0.16,
        }}
      />
      <div
        className="relative flex h-24 w-24 items-center justify-center rounded-full text-white"
        style={{ background: accent, fontSize: 44, boxShadow: focused ? `0 0 0 10px ${accent}33` : 'none' }}
      >
        {icon}
      </div>
      <span className="relative" style={{ fontFamily: typography.fontFamily.serif, fontSize: 48, fontWeight: 600, color: ink }}>
        {label}
      </span>
    </button>
  )
}
