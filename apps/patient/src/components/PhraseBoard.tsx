'use client'

import { useState } from 'react'
import { colors, typography } from '@glance/shared/design/tokens'
import { useInteractiveTarget } from '../hooks/useInteractiveTarget'
import { DwellRing } from './DwellRing'

/**
 * The fixed phrases a patient can say. This is a frozen, literal list — the
 * patient can only ever send one of these (or one ranked subset of them); the
 * system never fabricates content (PRD AI Content Gate). Order is the grid order.
 */
export const FIXED_PHRASES = [
  'Need assistance',
  'Water please',
  'In pain',
  'Too cold',
  'Too warm',
  'Thank you',
  'Yes',
  'No',
  'I love you',
  "I'm tired",
  "I'm okay",
  "I'm hungry",
  "I'm thirsty",
  'Please repeat',
  'I understand',
  'Call the nurse',
  'Turn me over',
  'Open the window',
  'Close the blinds',
  'I need a doctor',
  'Please stay',
  'Please be quiet',
  'I am uncomfortable',
  'All done',
] as const

/** How many ranked suggestions to show at once before "More options" cycles. */
const SUGGESTION_WINDOW = 5

interface PhraseBoardProps {
  /** Fire a phrase: opens the confirm step upstream (no immediate send). */
  onPhrase: (phrase: string) => void
  /** Close the board and return to the main screen without sending. */
  onClose: () => void
  /**
   * Optional LLM-ranked ordering of the curated phrases, relevant to the
   * caregiver message currently on screen. When present, the board opens in
   * "suggested replies" mode showing the top matches first; the patient can
   * still reveal the full board. Every entry is one of {@link FIXED_PHRASES}.
   */
  rankedSuggestions?: string[]
}

/**
 * Fullscreen overlay for patient-initiated phrases. In suggestion mode it shows
 * the top-ranked replies to the active message with "More options" (cycle) and
 * "Show all" (full board) controls; otherwise it shows the full phrase grid.
 * Every tile is an interactive target selectable by gaze dwell or scan blink.
 */
export function PhraseBoard({ onPhrase, onClose, rankedSuggestions }: PhraseBoardProps) {
  const hasRanked = !!rankedSuggestions && rankedSuggestions.length > 0
  const [showAll, setShowAll] = useState(false)
  const [offset, setOffset] = useState(0)

  const suggestionMode = hasRanked && !showAll

  const windowed = hasRanked
    ? Array.from(
        { length: Math.min(SUGGESTION_WINDOW, rankedSuggestions!.length) },
        (_, k) => rankedSuggestions![(offset + k) % rankedSuggestions!.length]!,
      )
    : []

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col gap-6 overflow-hidden p-9"
      style={{ background: 'radial-gradient(1100px 720px at 50% 14%,#FBF6F0 0%,#F4EEE6 55%,#EFE7DC 100%)' }}
      role="dialog"
      aria-label="Phrase board"
    >
      <div className="flex items-center justify-center gap-3">
        <h2
          className="text-center"
          style={{ fontFamily: typography.fontFamily.serif, color: colors.ink, fontSize: '34px', fontWeight: 600, letterSpacing: '-0.01em' }}
        >
          {suggestionMode ? 'Choose how to reply' : 'What would you like to say?'}
        </h2>
        {suggestionMode && (
          <span className="flex items-center gap-2 rounded-full px-5 py-2.5 font-bold"
            style={{ background: colors.brand.soft, color: colors.brand.deep, fontSize: 16 }}>
            ✨ Suggested · in your words
          </span>
        )}
      </div>

      {suggestionMode ? (
        <>
          <div className="grid flex-1 content-center grid-cols-1 gap-5 sm:grid-cols-2">
            {windowed.map((phrase) => (
              <PhraseTile key={phrase} phrase={phrase} onSelect={() => onPhrase(phrase)} />
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-5">
            <ControlTile
              id="suggestions:more"
              label="🔄 More suggestions"
              accent={colors.brand.primary}
              onSelect={() => setOffset((o) => o + SUGGESTION_WINDOW)}
            />
            <ControlTile
              id="suggestions:all"
              label="▦ Show all phrases"
              accent={colors.patient.highlight}
              onSelect={() => setShowAll(true)}
            />
          </div>
        </>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto sm:grid-cols-3">
          {FIXED_PHRASES.map((phrase) => (
            <PhraseTile key={phrase} phrase={phrase} onSelect={() => onPhrase(phrase)} />
          ))}
        </div>
      )}

      <CloseTile onSelect={onClose} />
    </div>
  )
}

function PhraseTile({ phrase, onSelect }: { phrase: string; onSelect: () => void }) {
  const { ref, focused, dwellProgress } = useInteractiveTarget<HTMLButtonElement>(
    `phrase:${phrase}`,
    onSelect,
  )
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={phrase}
      className="relative flex items-center justify-center overflow-hidden rounded-[26px] bg-white px-8 text-center transition-transform active:scale-[0.98]"
      style={{
        minHeight: '120px',
        fontFamily: typography.fontFamily.serif,
        color: colors.ink,
        fontSize: 'clamp(22px, 2.4vw, 32px)',
        fontWeight: 500,
        lineHeight: 1.25,
        border: `${focused ? 3 : 2}px solid ${focused ? colors.brand.primary : '#ECE2D6'}`,
        boxShadow: focused ? '0 12px 30px rgba(124,92,252,.16)' : '0 6px 18px rgba(36,30,43,.05)',
      }}
    >
      <DwellRing progress={dwellProgress} color={colors.brand.primary} />
      <span className="relative">{phrase}</span>
    </button>
  )
}

function ControlTile({
  id,
  label,
  accent,
  onSelect,
}: {
  id: string
  label: string
  accent: string
  onSelect: () => void
}) {
  const { ref, focused, dwellProgress } = useInteractiveTarget<HTMLButtonElement>(id, onSelect)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={label}
      className="relative flex items-center justify-center overflow-hidden rounded-full bg-white px-10 font-bold transition-transform active:scale-95"
      style={{
        minHeight: '64px',
        minWidth: '240px',
        color: colors.inkMuted,
        fontSize: '17px',
        border: `2px solid ${focused ? accent : colors.borderWarm}`,
        boxShadow: focused ? '0 8px 20px rgba(124,92,252,.16)' : 'none',
      }}
    >
      <DwellRing progress={dwellProgress} color={accent} size={34} inset={10} />
      <span className="relative">{label}</span>
    </button>
  )
}

function CloseTile({ onSelect }: { onSelect: () => void }) {
  const { ref, focused, dwellProgress } = useInteractiveTarget<HTMLButtonElement>(
    'phrase:close',
    onSelect,
  )
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label="Close phrase board"
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
      <span className="relative">✕ Close</span>
    </button>
  )
}
