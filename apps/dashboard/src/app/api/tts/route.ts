import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { messages, patients, familyMembers, personas } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'

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

  // Patient-initiated phrases have no family sender / cloned voice — those are
  // vocalized locally on the patient client, never via this endpoint.
  if (!message.senderId) {
    return NextResponse.json({ error: 'No voice sender for this message' }, { status: 503 })
  }

  // Voice resolution: a message sent AS a persona speaks in that persona's cloned
  // voice; otherwise it falls back to the sender account's own voice.
  let voiceId: string | null | undefined
  if (message.personaId) {
    const [persona] = await db.select().from(personas).where(eq(personas.id, message.personaId))
    voiceId = persona?.elevenlabsVoiceId
  }
  if (!voiceId) {
    const [sender] = await db.select().from(familyMembers).where(eq(familyMembers.id, message.senderId))
    voiceId = sender?.elevenlabsVoiceId
  }
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!voiceId || !apiKey) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
  }

  const toneStyle = TONE_STYLE[message.toneClass] ?? TONE_STYLE.neutral!

  const elevenRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: message.content,
        model_id: 'eleven_multilingual_v2',
        voice_settings: toneStyle,
      }),
    },
  )

  if (!elevenRes.ok) {
    console.error('[tts] ElevenLabs error:', elevenRes.status, await elevenRes.text())
    return NextResponse.json({ error: 'TTS upstream error' }, { status: 502 })
  }

  return new NextResponse(elevenRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
