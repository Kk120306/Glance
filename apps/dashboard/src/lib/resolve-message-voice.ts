export type VoiceSource = 'persona' | 'sender' | 'default'

/**
 * Pick which ElevenLabs voice_id to use for TTS.
 *
 * When a message was sent AS a persona, only that persona's clone is used —
 * never the sender account's voice (which would sound like the wrong person).
 */
export function resolveMessageVoiceId(input: {
  personaId: string | null
  personaVoiceId: string | null | undefined
  senderVoiceId: string | null | undefined
  defaultVoiceId: string | null | undefined
}): { voiceId: string | null; source: VoiceSource | null } {
  if (input.personaId) {
    if (input.personaVoiceId) {
      return { voiceId: input.personaVoiceId, source: 'persona' }
    }
    if (input.defaultVoiceId) {
      return { voiceId: input.defaultVoiceId, source: 'default' }
    }
    return { voiceId: null, source: null }
  }

  if (input.senderVoiceId) {
    return { voiceId: input.senderVoiceId, source: 'sender' }
  }

  if (input.defaultVoiceId) {
    return { voiceId: input.defaultVoiceId, source: 'default' }
  }

  return { voiceId: null, source: null }
}
