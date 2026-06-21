import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { familyMembers } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

/**
 * POST /api/family-member/me/voice-clone — clone the caregiver's voice from an
 * in-app recording.
 *
 * Receives a `multipart/form-data` body with an `audio` file, forwards it to the
 * ElevenLabs Instant Voice Cloning API, and stores the returned `voice_id` on the
 * caregiver's profile automatically — so messages are read in their own voice
 * with zero manual ID copying (PRD Voice Cloning). Caregiver session required.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Voice cloning is not configured' }, { status: 503 })
  }

  const form = await req.formData().catch(() => null)
  const audio = form?.get('audio')
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: 'Missing audio recording' }, { status: 400 })
  }

  const elevenForm = new FormData()
  elevenForm.append('name', `Glance-${session.user.email}`)
  elevenForm.append('files', audio, 'voice.webm')

  let cloneRes: Response
  try {
    cloneRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: elevenForm,
    })
  } catch (err) {
    console.error('[voice-clone] ElevenLabs unreachable:', err)
    return NextResponse.json({ error: 'Voice cloning upstream error' }, { status: 502 })
  }

  if (!cloneRes.ok) {
    console.error('[voice-clone] ElevenLabs error:', cloneRes.status, await cloneRes.text())
    return NextResponse.json({ error: 'Voice cloning upstream error' }, { status: 502 })
  }

  const data = (await cloneRes.json()) as { voice_id?: string }
  const voiceId = data.voice_id
  if (!voiceId) {
    return NextResponse.json({ error: 'No voice id returned' }, { status: 502 })
  }

  await db
    .update(familyMembers)
    .set({ elevenlabsVoiceId: voiceId })
    .where(eq(familyMembers.email, session.user.email))

  return NextResponse.json({ voiceId })
}
