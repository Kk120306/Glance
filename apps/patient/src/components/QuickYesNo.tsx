'use client'

import { colors, typography } from '@glance/shared/design/tokens'
import { useInteractiveTarget } from '../hooks/useInteractiveTarget'
import { DwellRing } from './DwellRing'
import { FocusArriveRing, FocusHint, tileFocusStyle } from './FocusChrome'

interface QuickYesNoProps {
  /**
   * Fire the chosen literal ("Yes" / "No"). Upstream this opens the confirm step
   * (PhraseConfirmScreen) before anything sends — this panel never sends directly,
   * preserving the AI Content Gate: the patient blink-confirms once before send.
   */
  onPhrase: (phrase: string) => void
  /** Close the panel and return to the home screen without sending. */
  onClose: () => void
}

/**
 * A focused two-target overlay for the home "Yes / No" tile: two large gaze/scan
 * targets that answer at a glance, distinct from the full phrase board. Each tile
 * fires its own literal phrase via {@link onPhrase}; both are interactive targets
 * selectable by gaze dwell or scan blink (Hard Constraint #1 — zero hands).
 */
export function QuickYesNo({ onPhrase, onClose }: QuickYesNoProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col gap-6 overflow-hidden p-9"
      style={{ background: 'radial-gradient(1100px 720px at 50% 14%,#FBF6F0 0%,#F4EEE6 55%,#EFE7DC 100%)' }}
      role="dialog"
      aria-label="Quick yes or no"
    >
      <h2
        className="text-center"
        style={{ fontFamily: typography.fontFamily.serif, color: colors.ink, fontSize: '34px', fontWeight: 600, letterSpacing: '-0.01em' }}
      >
        Say yes or no
      </h2>

      {/* Always a left/right split — never stacked — mirroring the incoming
          Yes/No question screen so "yes is on the left, no is on the right" holds
          everywhere a patient answers. */}
      <div className="grid flex-1 content-center grid-cols-2 gap-6">
        <AnswerTile
          id="quickyesno:yes"
          phrase="Yes"
          icon="✓"
          accent={colors.patient.affirm}
          accentInk={colors.patient.affirmInk}
          bg="linear-gradient(180deg,#E4F7F2 0%,#D2F0E8 100%)"
          bgFocused="linear-gradient(180deg,#D2F0E8 0%,#BCE8DC 100%)"
          onSelect={() => onPhrase('Yes')}
        />
        <AnswerTile
          id="quickyesno:no"
          phrase="No"
          icon="✕"
          accent="#B85656"
          accentInk="#9A4444"
          bg="linear-gradient(180deg,#FBEDED 0%,#F6DEDE 100%)"
          bgFocused="linear-gradient(180deg,#F6DEDE 0%,#F0CECE 100%)"
          onSelect={() => onPhrase('No')}
        />
      </div>

      <CloseTile onSelect={onClose} />
    </div>
  )
}

function AnswerTile({
  id,
  phrase,
  icon,
  accent,
  accentInk,
  bg,
  bgFocused,
  onSelect,
}: {
  id: string
  phrase: string
  icon: string
  accent: string
  accentInk: string
  bg: string
  /** Darker variant shown while gaze focus rests on the tile. */
  bgFocused: string
  onSelect: () => void
}) {
  const { ref, focused, armed, dwellProgress } = useInteractiveTarget<HTMLButtonElement>(id, onSelect)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={phrase}
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-[32px] transition-transform duration-200 active:scale-[0.98]"
      style={{
        minHeight: '300px',
        background: focused ? bgFocused : bg,
        ...tileFocusStyle({ focused, armed }),
      }}
    >
      <DwellRing progress={dwellProgress} color={colors.brand.primary} />
      {focused && <FocusArriveRing radius={32} />}
      <div
        className="mb-5 flex h-[120px] w-[120px] items-center justify-center rounded-full text-white"
        style={{ background: accent, fontSize: 64, boxShadow: `0 16px 36px ${accent}55` }}
      >
        {icon}
      </div>
      <span
        className="relative"
        style={{ fontFamily: typography.fontFamily.serif, fontSize: 56, fontWeight: 600, color: accentInk, lineHeight: 1 }}
      >
        {phrase}
      </span>
      <FocusHint focused={focused} armed={armed} color={accentInk} />
    </button>
  )
}

function CloseTile({ onSelect }: { onSelect: () => void }) {
  const { ref, focused, dwellProgress } = useInteractiveTarget<HTMLButtonElement>(
    'quickyesno:close',
    onSelect,
  )
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label="Close"
      className="relative mx-auto flex items-center justify-center overflow-hidden rounded-full bg-white px-12 font-bold transition-transform active:scale-95"
      style={{
        minHeight: '64px',
        minWidth: '220px',
        color: colors.inkMuted,
        fontSize: '17px',
        border: `2px solid ${focused ? colors.patient.highlight : colors.borderWarm}`,
        boxShadow: focused ? '0 8px 20px rgba(245,158,11,.16)' : 'none',
      }}
    >
      <DwellRing progress={dwellProgress} color={colors.patient.highlight} size={34} inset={10} />
      <span className="relative">← Back</span>
    </button>
  )
}
