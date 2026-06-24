import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeRequest, UUID_A, UUID_B, UUID_C } from '../helpers'
import * as mocks from '../mocks'
import { ELEVENLABS_TTS_OUTPUT_FORMAT } from '@/lib/elevenlabs'

vi.mock('@glance/shared/db', async () => ({ db: (await import('../mocks')).db }))

import { GET } from '@/app/api/tts/route'

const TOKEN = '44444444-4444-4444-8444-444444444444'
const PERSONA_VOICE = 'persona-voice-id'
const SENDER_VOICE = 'sender-voice-id'

function ttsUrl(voiceId: string) {
  return `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${ELEVENLABS_TTS_OUTPUT_FORMAT}`
}

beforeEach(() => {
  mocks.resetMocks()
  process.env.ELEVENLABS_API_KEY = 'test-key'
  process.env.ELEVENLABS_DEFAULT_VOICE_ID = 'default-voice-id'
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('audio-bytes', { status: 200 })),
  )
})

describe('GET /api/tts — persona voice resolution', () => {
  it('401 without device token', async () => {
    const res = await GET(makeRequest({ url: `http://x/api/tts?messageId=${UUID_C}` }))
    expect(res.status).toBe(401)
  })

  it('uses persona voice when message was sent as a persona', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    mocks.queueResult([{
      id: UUID_C,
      recipientId: UUID_A,
      senderId: 'fm-1',
      personaId: UUID_B,
      content: 'Hi kid',
      toneClass: 'neutral',
    }])
    mocks.queueResult([{ id: UUID_B, elevenlabsVoiceId: PERSONA_VOICE }])
    mocks.queueResult([{ id: 'fm-1', elevenlabsVoiceId: SENDER_VOICE }])

    const res = await GET(
      makeRequest({
        url: `http://x/api/tts?messageId=${UUID_C}`,
        headers: { 'x-device-token': TOKEN },
      }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Glance-Voice-Source')).toBe('persona')
    expect(fetch).toHaveBeenCalledWith(
      ttsUrl(PERSONA_VOICE),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('503 when persona has no clone and no default voice', async () => {
    delete process.env.ELEVENLABS_DEFAULT_VOICE_ID
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    mocks.queueResult([{
      id: UUID_C,
      recipientId: UUID_A,
      senderId: 'fm-1',
      personaId: UUID_B,
      content: 'Hi kid',
      toneClass: 'neutral',
    }])
    mocks.queueResult([{ id: UUID_B, elevenlabsVoiceId: null }])
    mocks.queueResult([{ id: 'fm-1', elevenlabsVoiceId: SENDER_VOICE }])

    const res = await GET(
      makeRequest({
        url: `http://x/api/tts?messageId=${UUID_C}`,
        headers: { 'x-device-token': TOKEN },
      }),
    )

    expect(res.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses sender voice when message has no persona', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    mocks.queueResult([{
      id: UUID_C,
      recipientId: UUID_A,
      senderId: 'fm-1',
      personaId: null,
      content: 'Hi',
      toneClass: 'neutral',
    }])
    mocks.queueResult([{ id: 'fm-1', elevenlabsVoiceId: SENDER_VOICE }])

    const res = await GET(
      makeRequest({
        url: `http://x/api/tts?messageId=${UUID_C}`,
        headers: { 'x-device-token': TOKEN },
      }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Glance-Voice-Source')).toBe('sender')
    expect(fetch).toHaveBeenCalledWith(ttsUrl(SENDER_VOICE), expect.anything())
  })

  it('surfaces actionable error when ElevenLabs returns 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"detail":"unauthorized"}', { status: 401 })),
    )
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    mocks.queueResult([{
      id: UUID_C,
      recipientId: UUID_A,
      senderId: 'fm-1',
      personaId: null,
      content: 'Hi',
      toneClass: 'neutral',
    }])
    mocks.queueResult([{ id: 'fm-1', elevenlabsVoiceId: SENDER_VOICE }])

    const res = await GET(
      makeRequest({
        url: `http://x/api/tts?messageId=${UUID_C}`,
        headers: { 'x-device-token': TOKEN },
      }),
    )

    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('ElevenLabs rejected TTS')
  })

  it('surfaces quota error when ElevenLabs credits are exhausted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          '{"detail":{"code":"quota_exceeded","message":"0 credits remaining"}}',
          { status: 401 },
        ),
      ),
    )
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    mocks.queueResult([{
      id: UUID_C,
      recipientId: UUID_A,
      senderId: 'fm-1',
      personaId: null,
      content: 'Hi',
      toneClass: 'neutral',
    }])
    mocks.queueResult([{ id: 'fm-1', elevenlabsVoiceId: SENDER_VOICE }])

    const res = await GET(
      makeRequest({
        url: `http://x/api/tts?messageId=${UUID_C}`,
        headers: { 'x-device-token': TOKEN },
      }),
    )

    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('credits exhausted')
  })
})
