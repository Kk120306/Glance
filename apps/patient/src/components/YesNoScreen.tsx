'use client'

import { useEffect, useRef } from 'react'
import { useInteraction } from '@glance/shared/design/components'
import type { InteractiveTarget } from '@glance/shared/design/components'

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

  // Register YES target — gaze UP selects it
  useEffect(() => {
    const target: InteractiveTarget = {
      id: 'yes',
      ref: yesRef as React.RefObject<HTMLElement | null>,
      onSelect: () => void submitReply('yes'),
      gazeDirection: 'up',
    }
    return registerTarget(target)
  }, [registerTarget, messageId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register NO target — gaze DOWN selects it
  useEffect(() => {
    const target: InteractiveTarget = {
      id: 'no',
      ref: noRef as React.RefObject<HTMLElement | null>,
      onSelect: () => void submitReply('no'),
      gazeDirection: 'down',
    }
    return registerTarget(target)
  }, [registerTarget, messageId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { focusedTargetId, dwellProgress } = useInteraction()

  // Dwell fills the target the steered cursor is currently parked on.
  const yesDwell = focusedTargetId === 'yes' ? dwellProgress : 0
  const noDwell = focusedTargetId === 'no' ? dwellProgress : 0

  return (
    <div className="flex h-screen w-full flex-col" style={{ backgroundColor: '#0A0A0A' }}>
      {/* YES — top half */}
      <button
        ref={yesRef}
        type="button"
        onClick={() => void submitReply('yes')}
        aria-label="Yes"
        className="relative flex flex-1 items-center justify-center overflow-hidden text-8xl font-black transition-opacity"
        style={{
          backgroundColor: focusedTargetId === 'yes' ? '#16a34a' : '#15803d',
          color: '#ffffff',
          outline: focusedTargetId === 'yes' || yesDwell > 0 ? '8px solid #86efac' : 'none',
        }}
      >
        {/* Dwell fill — grows as the patient holds their gaze up */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{ height: `${Math.round(yesDwell * 100)}%`, backgroundColor: '#22c55e', opacity: 0.55 }}
        />
        <span className="relative">YES</span>
      </button>

      {/* Question — middle band */}
      <div
        className="flex items-center justify-center px-8 py-6 text-center text-2xl font-semibold"
        style={{ backgroundColor: '#1a1a1a', color: '#e5e5e5', minHeight: '100px' }}
      >
        {question}
      </div>

      {/* NO — bottom half */}
      <button
        ref={noRef}
        type="button"
        onClick={() => void submitReply('no')}
        aria-label="No"
        className="relative flex flex-1 items-center justify-center overflow-hidden text-8xl font-black transition-opacity"
        style={{
          backgroundColor: focusedTargetId === 'no' ? '#dc2626' : '#b91c1c',
          color: '#ffffff',
          outline: focusedTargetId === 'no' || noDwell > 0 ? '8px solid #fca5a5' : 'none',
        }}
      >
        {/* Dwell fill — grows as the patient holds their gaze down */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{ height: `${Math.round(noDwell * 100)}%`, backgroundColor: '#ef4444', opacity: 0.55 }}
        />
        <span className="relative">NO</span>
      </button>
    </div>
  )
}
