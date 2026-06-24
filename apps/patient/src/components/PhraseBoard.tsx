'use client'

import { useState } from 'react'
import { colors, typography } from '@glance/shared/design/tokens'
import { useInteractiveTarget } from '../hooks/useInteractiveTarget'
import { DwellRing } from './DwellRing'

/**
 * The fixed phrases a patient can say proactively. This is a frozen, literal
 * list used for patient-initiated "Speak" requests and as a fallback when AI
 * generation fails. Order is the grid order.
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

export type ReplySuggestion = { text: string; tone?: string }

/** How many AI suggestions to show at once. */
const SUGGESTION_WINDOW = 4

const MESSAGE_SNIPPET_MAX = 60

interface PhraseBoardProps {
  /** Fire a phrase: opens the confirm step upstream (no immediate send). */
  onPhrase: (phrase: string) => void
  /** Close the board and return to the main screen without sending. */
  onClose: () => void
  /**
   * Optional AI-generated or ranked reply suggestions for the caregiver message
   * on screen. When present, the board opens in "suggested replies" mode.
   */
  rankedSuggestions?: ReplySuggestion[]
  /** Who the reply is to — shown in suggestion mode header. */
  senderName?: string | null
  /** The caregiver message being replied to — shown as a snippet in the header. */
  messageContent?: string | null
  /** Re-fetch a fresh batch of suggestions from the server. */
  onRegenerate?: () => void
}

/**
 * Fullscreen overlay for patient phrases. In suggestion mode it shows
 * contextual AI reply options with tone labels; otherwise the full phrase grid.
 * Every tile is an interactive target selectable by gaze dwell or scan blink.
 */
export function PhraseBoard({
  onPhrase,
  onClose,
  rankedSuggestions,
  senderName,
  messageContent,
  onRegenerate,
}: PhraseBoardProps) {
  const hasRanked = !!rankedSuggestions && rankedSuggestions.length > 0
  const [showAll, setShowAll] = useState(false)

  const suggestionMode = hasRanked && !showAll

  const windowed = hasRanked ? rankedSuggestions!.slice(0, SUGGESTION_WINDOW) : []

  const messageSnippet = messageContent
    ? messageContent.length > MESSAGE_SNIPPET_MAX
      ? `${messageContent.slice(0, MESSAGE_SNIPPET_MAX)}…`
      : messageContent
    : null

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col gap-5 overflow-hidden p-9"
      style={{ background: 'radial-gradient(1100px 720px at 50% 14%,#FBF6F0 0%,#F4EEE6 55%,#EFE7DC 100%)' }}
      role="dialog"
      aria-label="Phrase board"
    >
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <h2
            className="text-center"
            style={{
              fontFamily: typography.fontFamily.serif,
              color: colors.ink,
              fontSize: '34px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {suggestionMode ? 'Choose how to reply' : 'What would you like to say?'}
          </h2>
          {suggestionMode && (
            <span
              className="flex items-center gap-2 rounded-full px-5 py-2.5 font-bold"
              style={{ background: colors.brand.soft, color: colors.brand.deep, fontSize: 16 }}
            >
              ✨ Suggested · in your words
            </span>
          )}
        </div>
        {suggestionMode && (senderName || messageSnippet) && (
          <p style={{ fontSize: 17, color: colors.inkMuted }}>
            {senderName ? `To ${senderName}` : 'Replying'}
            {messageSnippet ? ` · “${messageSnippet}”` : ''}
          </p>
        )}
      </div>

      {suggestionMode ? (
        <>
          <div className="grid flex-1 content-center grid-cols-1 gap-5 sm:grid-cols-2">
            {windowed.map((suggestion, i) => (
              <SuggestionTile
                key={`${suggestion.text}-${i}`}
                suggestion={suggestion}
                onSelect={() => onPhrase(suggestion.text)}
              />
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-5">
            {onRegenerate && (
              <ControlTile
                id="suggestions:more"
                label="🔄 More suggestions"
                accent={colors.brand.primary}
                onSelect={onRegenerate}
              />
            )}
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

function toneColor(tone?: string): string {
  if (!tone) return colors.inkMuted
  const lower = tone.toLowerCase()
  if (lower.includes('reassur') || lower.includes('comfort')) return colors.brand.primary
  if (lower.includes('warm') || lower.includes('love') || lower.includes('grateful')) return '#EC6FB8'
  if (lower.includes('ask') || lower.includes('request') || lower.includes('need')) return '#0E9384'
  if (lower.includes('honest') || lower.includes('help')) return colors.patient.affirm
  return colors.inkMuted
}

function SuggestionTile({
  suggestion,
  onSelect,
}: {
  suggestion: ReplySuggestion
  onSelect: () => void
}) {
  const { ref, focused, dwellProgress } = useInteractiveTarget<HTMLButtonElement>(
    `suggestion:${suggestion.text.slice(0, 40)}`,
    onSelect,
  )
  const accent = toneColor(suggestion.tone)

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={suggestion.text}
      className="relative flex flex-col items-start overflow-hidden rounded-[26px] bg-white px-8 py-7 text-left transition-transform active:scale-[0.98]"
      style={{
        minHeight: '140px',
        border: `${focused ? 3 : 2}px solid ${focused ? colors.brand.primary : '#ECE2D6'}`,
        boxShadow: focused ? '0 12px 30px rgba(124,92,252,.16)' : '0 6px 18px rgba(36,30,43,.05)',
      }}
    >
      <DwellRing progress={dwellProgress} color={colors.brand.primary} />
      {suggestion.tone && (
        <span
          className="relative mb-3 font-bold uppercase tracking-[.12em]"
          style={{ fontSize: 14, color: accent }}
        >
          {suggestion.tone}
        </span>
      )}
      <span
        className="relative text-balance"
        style={{
          fontFamily: typography.fontFamily.serif,
          color: colors.ink,
          fontSize: 'clamp(20px, 2.2vw, 32px)',
          fontWeight: 500,
          lineHeight: 1.3,
        }}
      >
        {suggestion.text}
      </span>
    </button>
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
