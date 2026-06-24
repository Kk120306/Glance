'use client'

import { colors, typography } from '@glance/shared/design/tokens'
import { useInteractiveTarget } from '../hooks/useInteractiveTarget'
import { DwellRing } from './DwellRing'
import { FocusArriveRing, FocusHint, tileFocusStyle } from './FocusChrome'

/**
 * Fullscreen gaze-confirm step shown after the patient selects a phrase. It
 * enforces the PRD AI Content Gate: nothing the patient picked is sent until
 * they explicitly confirm it here. SEND (left) sends the phrase; GO BACK (right)
 * returns to the phrase board with no side effect. Both are interactive targets
 * (gaze dwell or scan blink) — mirrors {@link YesNoScreen} / {@link QuickYesNo}.
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
      {/* Phrase under review — header band */}
      <div className="relative z-[3] px-11 pb-7 pt-10 text-center">
        <span
          className="mb-4 block font-bold uppercase tracking-[.14em]"
          style={{ fontSize: 13, color: colors.inkFaint }}
        >
          Send this?
        </span>
        <div
          className="mx-auto max-w-4xl"
          style={{
            fontFamily: typography.fontFamily.serif,
            fontSize: 'clamp(28px,4vw,40px)',
            fontWeight: 500,
            color: colors.ink,
            lineHeight: 1.2,
          }}
        >
          “{phrase}”
        </div>
      </div>

      {/* SEND left / GO BACK right — registration order matches reading order */}
      <div className="relative flex flex-1">
        <ConfirmTarget
          id="confirm-send"
          icon="🔊"
          label="Send"
          gradient="linear-gradient(180deg,#E4F7F2 0%,#D2F0E8 100%)"
          gradientFocused="linear-gradient(180deg,#D2F0E8 0%,#BCE8DC 100%)"
          accent={colors.patient.affirm}
          ink={colors.patient.affirmInk}
          divider
          onSelect={onConfirm}
        />
        <ConfirmTarget
          id="confirm-back"
          icon="↩"
          label="Go back"
          gradient="linear-gradient(180deg,#FBEDED 0%,#F6DEDE 100%)"
          gradientFocused="linear-gradient(180deg,#F6DEDE 0%,#F0CECE 100%)"
          accent="#B85656"
          ink="#9A4444"
          onSelect={onCancel}
        />
      </div>

      {/* Footer */}
      <div className="relative z-[3] flex items-center justify-center gap-3.5 py-6" style={{ background: colors.canvas }}>
        <span style={{ fontSize: 18, color: colors.inkFaint }}>💡</span>
        <span className="font-bold" style={{ fontSize: 18, color: colors.inkMuted }}>
          Look to a side, then blink twice to confirm.
        </span>
      </div>
    </div>
  )
}

function ConfirmTarget({
  id,
  icon,
  label,
  gradient,
  gradientFocused,
  accent,
  ink,
  divider = false,
  onSelect,
}: {
  id: string
  icon: string
  label: string
  gradient: string
  /** Darker variant shown while gaze focus rests on the tile. */
  gradientFocused: string
  accent: string
  ink: string
  /** Vertical divider on the right edge (left tile only). */
  divider?: boolean
  onSelect: () => void
}) {
  const { ref, focused, armed, dwellProgress } = useInteractiveTarget<HTMLButtonElement>(id, onSelect)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={label}
      className="relative flex flex-1 flex-col items-center justify-center overflow-hidden transition-transform duration-200 active:scale-[0.98]"
      style={{
        background: focused ? gradientFocused : gradient,
        ...tileFocusStyle({
          focused,
          armed,
          unfocusedShadow: 'none',
          splitInnerEdge: divider ? 'right' : undefined,
        }),
      }}
    >
      <DwellRing progress={dwellProgress} color={colors.brand.primary} />
      {focused && <FocusArriveRing />}
      <div className="relative mb-7 h-[220px] w-[220px]">
        <div
          className="absolute inset-[26px] flex items-center justify-center rounded-full text-white"
          style={{ background: accent, fontSize: 72, boxShadow: `0 16px 36px ${accent}55` }}
        >
          {icon}
        </div>
      </div>
      <span
        className="relative"
        style={{ fontFamily: typography.fontFamily.serif, fontSize: 72, fontWeight: 600, color: ink, lineHeight: 1 }}
      >
        {label}
      </span>
      <FocusHint focused={focused} armed={armed} color={ink} />
    </button>
  )
}
