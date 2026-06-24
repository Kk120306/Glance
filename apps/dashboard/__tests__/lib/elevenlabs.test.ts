import { describe, it, expect } from 'vitest'
import { parseVoiceCloneResponse, ttsErrorMessage } from '@/lib/elevenlabs'

describe('parseVoiceCloneResponse', () => {
  it('parses voice_id and requires_verification', () => {
    expect(parseVoiceCloneResponse({ voice_id: 'abc', requires_verification: true })).toEqual({
      voiceId: 'abc',
      requiresVerification: true,
    })
  })

  it('defaults requiresVerification to false', () => {
    expect(parseVoiceCloneResponse({ voice_id: 'abc' })).toEqual({
      voiceId: 'abc',
      requiresVerification: false,
    })
  })
})

describe('ttsErrorMessage', () => {
  it('maps quota errors to credits message', () => {
    expect(ttsErrorMessage(401, '{"code":"quota_exceeded","message":"0 credits remaining"}')).toContain(
      'credits exhausted',
    )
  })

  it('maps generic 401 to API key message', () => {
    expect(ttsErrorMessage(401, 'unauthorized')).toContain('ElevenLabs rejected TTS')
  })
})
