'use client'

import { colors, typography } from '@glance/shared/design/tokens'
import { useInteractiveTarget } from '../hooks/useInteractiveTarget'
import { BlobAgent } from './BlobAgent'
import { DwellRing } from './DwellRing'
import { FocusArriveRing, FocusHint, tileFocusStyle } from './FocusChrome'

interface YesNoScreenProps {
  question: string
  /** Who asked (persona name, else family member's name); shown above the question. */
  senderName?: string | null
  messageId: string
  dashboardUrl: string
  deviceToken: string
  onReply: (reply: 'yes' | 'no') => void
}

export function YesNoScreen({ question, senderName, messageId, dashboardUrl, deviceToken, onReply }: YesNoScreenProps) {
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

  return (
    <div className="absolute inset-0 z-[3] flex flex-col" style={{ background: colors.canvas }}>
      {/* Question */}
      <div className="relative z-[3] px-11 pb-7 pt-10 text-center">
        <div
          className="mb-5 inline-flex items-center gap-2.5 rounded-full bg-white px-5 py-2.5"
          style={{ boxShadow: '0 1px 3px rgba(36,30,43,.06)' }}
        >
          <span style={{ fontSize: 16 }}>🙋</span>
          <span className="font-bold" style={{ fontSize: 15, color: colors.inkMuted }}>
            {senderName ? `${senderName} asks` : 'A question for you'}
          </span>
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
        <YesNoTarget
          id="yesno:yes"
          label="Yes"
          icon="✓"
          accent={colors.patient.affirm}
          accentInk={colors.patient.affirmInk}
          gradient="linear-gradient(180deg,#E4F7F2 0%,#D2F0E8 100%)"
          gradientFocused="linear-gradient(180deg,#D2F0E8 0%,#BCE8DC 100%)"
          iconSize={96}
          divider
          onSelect={() => void submitReply('yes')}
        />
        <YesNoTarget
          id="yesno:no"
          label="No"
          icon="✕"
          accent="#B85656"
          accentInk="#9A4444"
          gradient="linear-gradient(180deg,#FBEDED 0%,#F6DEDE 100%)"
          gradientFocused="linear-gradient(180deg,#F6DEDE 0%,#F0CECE 100%)"
          iconSize={90}
          onSelect={() => void submitReply('no')}
        />

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

function YesNoTarget({
  id,
  label,
  icon,
  accent,
  accentInk,
  gradient,
  gradientFocused,
  iconSize,
  divider = false,
  onSelect,
}: {
  id: string
  label: string
  icon: string
  accent: string
  accentInk: string
  gradient: string
  gradientFocused: string
  iconSize: number
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
          style={{ background: accent, fontSize: iconSize, boxShadow: `0 16px 36px ${accent}55` }}
        >
          {icon}
        </div>
      </div>
      <div
        className="relative"
        style={{ fontFamily: typography.fontFamily.serif, fontSize: 72, fontWeight: 600, color: accentInk, lineHeight: 1 }}
      >
        {label}
      </div>
      <FocusHint focused={focused} armed={armed} color={accentInk} />
    </button>
  )
}
