import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { messages, patients, familyMembers, personas } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import { resolveMessageVoiceId } from '@/lib/resolve-message-voice'
import {
  elevenLabsFetch,
  elevenLabsTtsUrl,
  getElevenLabsApiKey,
  getElevenLabsDefaultVoiceId,
  ttsErrorMessage,
} from '@/lib/elevenlabs'

const TONE_STYLE: Record<string, { stability: number; similarity_boost: number; style: number }> = {
  neutral: { stability: 0.5, similarity_boost: 0.75, style: 0.0 },
  warm:    { stability: 0.4, similarity_boost: 0.80, style: 0.4 },
  urgent:  { stability: 0.3, similarity_boost: 0.85, style: 0.7 },
}

export async function GET(req: NextRequest) {
  const deviceToken = req.headers.get('x-device-token')
  if (!deviceToken) {
    return NextResponse.json({ error: 'Missing X-Device-Token' }, { status: 401 })
  }

  const [patient] = await db.select().from(patients).where(eq(patients.deviceToken, deviceToken))
  if (!patient) {
    return NextResponse.json({ error: 'Invalid device token' }, { status: 401 })
  }

  const messageId = req.nextUrl.searchParams.get('messageId')
  if (!messageId) {
    return NextResponse.json({ error: 'Missing messageId' }, { status: 400 })
  }

  const [message] = await db.select().from(messages).where(eq(messages.id, messageId))
  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  if (message.recipientId !== patient.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!message.senderId) {
    return NextResponse.json({ error: 'No voice sender for this message' }, { status: 503 })
  }

  let personaVoiceId: string | null | undefined
  if (message.personaId) {
    const [persona] = await db.select().from(personas).where(eq(personas.id, message.personaId))
    personaVoiceId = persona?.elevenlabsVoiceId
  }

  const [sender] = await db.select().from(familyMembers).where(eq(familyMembers.id, message.senderId))
  const defaultVoiceId = getElevenLabsDefaultVoiceId()

  const { voiceId, source } = resolveMessageVoiceId({
    personaId: message.personaId,
    personaVoiceId,
    senderVoiceId: sender?.elevenlabsVoiceId,
    defaultVoiceId,
  })

  if (!voiceId || !getElevenLabsApiKey()) {
    const reason = message.personaId && !personaVoiceId
      ? 'Persona voice not configured'
      : 'TTS not configured'
    console.warn('[tts] unavailable:', { messageId, personaId: message.personaId, reason })
    return NextResponse.json({ error: reason }, { status: 503 })
  }

  const toneStyle = TONE_STYLE[message.toneClass] ?? TONE_STYLE.neutral!

  console.info('[tts] synthesizing:', { messageId, personaId: message.personaId, voiceId, source })

  const result = await elevenLabsFetch(elevenLabsTtsUrl(voiceId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: message.content,
      model_id: 'eleven_multilingual_v2',
      voice_settings: toneStyle,
    }),
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: ttsErrorMessage(result.status, result.detail) },
      { status: 502 },
    )
  }

  return new NextResponse(result.response.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
      'X-Glance-Voice-Source': source ?? 'unknown',
    },
  })
}
