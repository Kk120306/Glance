'use client'

import { useEffect, useRef } from 'react'
import { colors, typography } from '@glance/shared/design/tokens'
import { useInteraction } from '@glance/shared/design/components'
import type { InteractiveTarget } from '@glance/shared/design/components'
import { BlobAgent } from './BlobAgent'

interface YesNoScreenProps {
  question: string
  messageId: string
  dashboardUrl: string
  deviceToken: string
  onReply: (reply: 'yes' | 'no') => void
}

export function YesNoScreen({ question, messageId, dashboardUrl, deviceToken, onReply }: YesNoScreenProps) {
  const { registerTarget } = useInteraction()
  const yesRef = useRef<HTMLButtonElement | null>(null)
  const noRef = useRef<HTMLButtonElement | null>(null)

  async function submitReply(reply: 'yes' | 'no') {
    try {
      await fetch(`${dashboardUrl}/api/messages/${messageId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-token': deviceToken,
        },
        body: JSON.stringify({ reply }),
      })
    } catch (err) {
      console.warn('[reply] failed to post reply:', err)
    }
    onReply(reply)
  }

  // Register YES target — gaze LEFT selects it
  useEffect(() => {
    const target: InteractiveTarget = {
      id: 'yes',
      ref: yesRef as React.RefObject<HTMLElement | null>,
      onSelect: () => void submitReply('yes'),
      gazeDirection: 'left',
    }
    return registerTarget(target)
  }, [registerTarget, messageId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register NO target — gaze RIGHT selects it
  useEffect(() => {
    const target: InteractiveTarget = {
      id: 'no',
      ref: noRef as React.RefObject<HTMLElement | null>,
      onSelect: () => void submitReply('no'),
      gazeDirection: 'right',
    }
    return registerTarget(target)
  }, [registerTarget, messageId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { focusedTargetId, dwellProgress } = useInteraction()
  const yesDwell = focusedTargetId === 'yes' ? dwellProgress : 0
  const noDwell = focusedTargetId === 'no' ? dwellProgress : 0
  // Which half currently holds focus — drives a clear pre-arm highlight + a flash
  // when focus lands, so the patient can tell which answer their gaze has landed
  // on before they blink to confirm.
  const yesFocused = focusedTargetId === 'yes'
  const noFocused = focusedTargetId === 'no'

  const R = 100
  const CIRC = 2 * Math.PI * R

  return (
    <div className="absolute inset-0 z-[3] flex flex-col" style={{ background: colors.canvas }}>
      {/* Question */}
      <div className="relative z-[3] px-11 pb-7 pt-10 text-center">
        <div
          className="mb-5 inline-flex items-center gap-2.5 rounded-full bg-white px-5 py-2.5"
          style={{ boxShadow: '0 1px 3px rgba(36,30,43,.06)' }}
        >
          <span style={{ fontSize: 16 }}>🙋</span>
          <span className="font-bold" style={{ fontSize: 15, color: colors.inkMuted }}>A question for you</span>
        </div>
        <div
          className="mx-auto max-w-4xl"
          style={{ fontFamily: typography.fontFamily.serif, fontSize: 'clamp(34px,5vw,56px)', lineHeight: 1.18, fontWeight: 600, letterSpacing: '-.015em', textWrap: 'pretty', color: colors.ink }}
        >
          {question}
        </div>
      </div>

      {/* Split */}
      <div className="relative flex flex-1">
        {/* YES — left */}
        <button
          ref={yesRef}
          type="button"
          onClick={() => void submitReply('yes')}
          aria-label="Yes"
          className="relative flex flex-1 flex-col items-center justify-center transition-transform duration-200"
          style={{
            background: yesFocused ? 'linear-gradient(180deg,#D2F0E8 0%,#BCE8DC 100%)' : 'linear-gradient(180deg,#E4F7F2 0%,#D2F0E8 100%)',
            borderRight: '2px solid #F4EEE6',
            boxShadow: yesFocused ? 'inset 0 0 0 8px rgba(14,147,132,.4)' : 'none',
          }}
        >
          {yesFocused && (
            <span aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ animation: 'focusArriveLight 460ms ease-out' }} />
          )}
          <div className="relative mb-7 h-[220px] w-[220px]">
            <svg viewBox="0 0 220 220" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(14,147,132,.18)" strokeWidth="10" />
              <circle cx="110" cy="110" r={R} fill="none" stroke={colors.patient.affirm} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - yesDwell)} />
            </svg>
            <div className="absolute inset-[26px] flex items-center justify-center rounded-full text-white"
              style={{ background: colors.patient.affirm, fontSize: 96, boxShadow: '0 16px 36px rgba(14,147,132,.34)' }}>✓</div>
          </div>
          <div style={{ fontFamily: typography.fontFamily.serif, fontSize: 72, fontWeight: 600, color: colors.patient.affirmInk, lineHeight: 1 }}>Yes</div>
          <div className="mt-3.5 flex items-center gap-2.5 rounded-full bg-white px-6 py-3" style={{ boxShadow: '0 4px 14px rgba(14,147,132,.14)' }}>
            <span style={{ fontSize: 22 }}>👁️</span>
            <span className="font-bold" style={{ fontSize: 19, color: colors.patient.affirmInk }}>Look left</span>
          </div>
        </button>

        {/* NO — right */}
        <button
          ref={noRef}
          type="button"
          onClick={() => void submitReply('no')}
          aria-label="No"
          className="relative flex flex-1 flex-col items-center justify-center transition-transform duration-200"
          style={{
            background: noFocused ? 'linear-gradient(180deg,#F6DEDE 0%,#F0CECE 100%)' : 'linear-gradient(180deg,#FBEDED 0%,#F6DEDE 100%)',
            boxShadow: noFocused ? 'inset 0 0 0 8px rgba(184,86,86,.4)' : 'none',
          }}
        >
          {noFocused && (
            <span aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ animation: 'focusArriveLight 460ms ease-out' }} />
          )}
          <div className="relative mb-7 h-[220px] w-[220px]">
            <svg viewBox="0 0 220 220" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(154,68,68,.16)" strokeWidth="10" />
              <circle cx="110" cy="110" r={R} fill="none" stroke="#B85656" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - noDwell)} />
            </svg>
            <div className="absolute inset-[26px] flex items-center justify-center rounded-full text-white"
              style={{ background: '#B85656', fontSize: 90, boxShadow: '0 16px 36px rgba(154,68,68,.28)' }}>✕</div>
          </div>
          <div style={{ fontFamily: typography.fontFamily.serif, fontSize: 72, fontWeight: 600, color: '#9A4444', lineHeight: 1 }}>No</div>
          <div className="mt-3.5 flex items-center gap-2.5 rounded-full bg-white px-6 py-3" style={{ boxShadow: '0 4px 14px rgba(154,68,68,.12)' }}>
            <span style={{ fontSize: 22 }}>👁️</span>
            <span className="font-bold" style={{ fontSize: 19, color: '#9A4444' }}>Look right</span>
          </div>
        </button>

        {/* Center blob */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[4] h-[140px] w-[140px] -translate-x-1/2 -translate-y-1/2">
          <div className="h-full w-full rounded-full bg-canvas p-3.5" style={{ boxShadow: '0 10px 30px rgba(36,30,43,.14)' }}>
            <BlobAgent tone="neutral" size="100%" glow={false} float={false} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-[3] flex items-center justify-center gap-3.5 py-6" style={{ background: colors.canvas }}>
        <span style={{ fontSize: 18, color: colors.inkFaint }}>💡</span>
        <span className="font-bold" style={{ fontSize: 18, color: colors.inkMuted }}>Look to a side, then blink twice to answer.</span>
      </div>
    </div>
  )
}
