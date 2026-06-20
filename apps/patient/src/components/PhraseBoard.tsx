'use client'

import { colors } from '@glance/shared/design/tokens'
import { useInteractiveTarget } from '../hooks/useInteractiveTarget'

/** The fixed phrases a patient can send proactively. Order is the grid order. */
export const FIXED_PHRASES = [
  'Need assistance',
  'Water please',
  'In pain',
  'Too cold',
  'Too warm',
  'Thank you',
] as const

interface PhraseBoardProps {
  /** Fire a phrase: local TTS + persist + notify caregivers (handled upstream). */
  onPhrase: (phrase: string) => void
  /** Close the board and return to the main screen without sending. */
  onClose: () => void
}

/**
 * Fullscreen overlay grid of fixed phrase requests plus a Close button. Every
 * tile is an interactive target, so the patient selects one with the gaze cursor
 * (dwell) or via scan-mode blink. Opening/closing the board changes the target
 * set, which the InteractionProvider uses as its recenter trigger.
 */
export function PhraseBoard({ onPhrase, onClose }: PhraseBoardProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col gap-6 p-8"
      style={{ backgroundColor: colors.patient.bg }}
      role="dialog"
      aria-label="Phrase board"
    >
      <h2
        className="text-center font-bold"
        style={{ color: colors.patient.text, fontSize: '2rem' }}
      >
        What would you like to say?
      </h2>

      <div className="grid flex-1 grid-cols-2 gap-5 sm:grid-cols-3">
        {FIXED_PHRASES.map((phrase) => (
          <PhraseTile key={phrase} phrase={phrase} onSelect={() => onPhrase(phrase)} />
        ))}
      </div>

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
      className="relative flex items-center justify-center overflow-hidden rounded-2xl px-6 text-center font-bold transition-transform active:scale-95"
      style={{
        minHeight: '120px',
        backgroundColor: focused ? '#1f3d2a' : '#161616',
        color: colors.patient.text,
        fontSize: '1.75rem',
        border: `2px solid ${focused ? colors.patient.accent : 'rgba(255,255,255,0.08)'}`,
        outline: focused ? `4px solid ${colors.patient.accent}55` : 'none',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: `${Math.round(dwellProgress * 100)}%`,
          backgroundColor: colors.patient.accent,
          opacity: 0.35,
        }}
      />
      <span className="relative">{phrase}</span>
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
      className="relative mx-auto flex items-center justify-center overflow-hidden rounded-2xl px-12 font-bold transition-transform active:scale-95"
      style={{
        minHeight: '90px',
        minWidth: '260px',
        backgroundColor: focused ? '#3a2a2a' : '#1a1a1a',
        color: colors.patient.text,
        fontSize: '1.5rem',
        border: `2px solid ${focused ? colors.patient.highlight : 'rgba(255,255,255,0.12)'}`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: `${Math.round(dwellProgress * 100)}%`,
          backgroundColor: colors.patient.highlight,
          opacity: 0.3,
        }}
      />
      <span className="relative">✕ Close</span>
    </button>
  )
}
