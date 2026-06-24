import { describe, it, expect } from 'vitest'
import { resolveMessageVoiceId } from '@/lib/resolve-message-voice'

describe('resolveMessageVoiceId', () => {
  it('uses persona clone when message was sent as a persona', () => {
    expect(
      resolveMessageVoiceId({
        personaId: 'persona-1',
        personaVoiceId: 'voice-kid',
        senderVoiceId: 'voice-caregiver',
        defaultVoiceId: 'voice-default',
      }),
    ).toEqual({ voiceId: 'voice-kid', source: 'persona' })
  })

  it('does not fall back to sender voice when personaId is set', () => {
    expect(
      resolveMessageVoiceId({
        personaId: 'persona-1',
        personaVoiceId: null,
        senderVoiceId: 'voice-caregiver',
        defaultVoiceId: 'voice-default',
      }),
    ).toEqual({ voiceId: 'voice-default', source: 'default' })
  })

  it('uses sender clone for messages sent as the account', () => {
    expect(
      resolveMessageVoiceId({
        personaId: null,
        personaVoiceId: null,
        senderVoiceId: 'voice-caregiver',
        defaultVoiceId: 'voice-default',
      }),
    ).toEqual({ voiceId: 'voice-caregiver', source: 'sender' })
  })

  it('falls back to default when sender has no clone', () => {
    expect(
      resolveMessageVoiceId({
        personaId: null,
        personaVoiceId: null,
        senderVoiceId: null,
        defaultVoiceId: 'voice-default',
      }),
    ).toEqual({ voiceId: 'voice-default', source: 'default' })
  })
})
