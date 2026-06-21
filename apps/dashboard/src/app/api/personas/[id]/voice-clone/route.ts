import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { personas } from '@glance/shared/db/schema'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'

/**
 * POST /api/personas/:id/voice-clone — clone a voice for one persona from an
 * in-app recording.
 *
 * Mirrors the caregiver's own voice-clone flow: a `multipart/form-data` body with
 * an `audio` file is forwarded to ElevenLabs Instant Voice Cloning, and the
 * returned `voice_id` is stored on the persona so messages sent AS that persona
 * are read in its voice. Owner-scoped; caregiver session required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const me = await getFamilyMemberFromSession(session)
  if (!me) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }

  // Verify the persona exists and belongs to the signed-in account.
  const [persona] = await db
    .select()
    .from(personas)
    .where(and(eq(personas.id, id), eq(personas.familyMemberId, me.id)))
  if (!persona) {
    return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
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
  elevenForm.append('name', `Glance-${persona.name}-${persona.id.slice(0, 8)}`)
  elevenForm.append('files', audio, 'voice.webm')

  let cloneRes: Response
  try {
    cloneRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: elevenForm,
    })
  } catch (err) {
    console.error('[persona voice-clone] ElevenLabs unreachable:', err)
    return NextResponse.json({ error: 'Voice cloning upstream error' }, { status: 502 })
  }

  if (!cloneRes.ok) {
    console.error('[persona voice-clone] ElevenLabs error:', cloneRes.status, await cloneRes.text())
    return NextResponse.json({ error: 'Voice cloning upstream error' }, { status: 502 })
  }

  const data = (await cloneRes.json()) as { voice_id?: string }
  const voiceId = data.voice_id
  if (!voiceId) {
    return NextResponse.json({ error: 'No voice id returned' }, { status: 502 })
  }

  await db
    .update(personas)
    .set({ elevenlabsVoiceId: voiceId })
    .where(and(eq(personas.id, id), eq(personas.familyMemberId, me.id)))

  return NextResponse.json({ voiceId })
}
