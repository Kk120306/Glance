import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { personas } from '@glance/shared/db/schema'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'
import {
  elevenLabsFetch,
  elevenLabsVoicesAddUrl,
  getElevenLabsApiKey,
  parseVoiceCloneResponse,
} from '@/lib/elevenlabs'

/**
 * POST /api/personas/:id/voice-clone — clone a voice for one persona from an
 * in-app recording.
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

  const [persona] = await db
    .select()
    .from(personas)
    .where(and(eq(personas.id, id), eq(personas.familyMemberId, me.id)))
  if (!persona) {
    return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  }

  if (!getElevenLabsApiKey()) {
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

  const cloneResult = await elevenLabsFetch(elevenLabsVoicesAddUrl(), {
    method: 'POST',
    body: elevenForm,
  })

  if (!cloneResult.ok) {
    return NextResponse.json({ error: 'Voice cloning upstream error' }, { status: 502 })
  }

  const data = parseVoiceCloneResponse(
    (await cloneResult.response.json()) as Parameters<typeof parseVoiceCloneResponse>[0],
  )
  if (!data.voiceId) {
    return NextResponse.json({ error: 'No voice id returned' }, { status: 502 })
  }

  await db
    .update(personas)
    .set({ elevenlabsVoiceId: data.voiceId })
    .where(and(eq(personas.id, id), eq(personas.familyMemberId, me.id)))

  return NextResponse.json({
    voiceId: data.voiceId,
    requiresVerification: data.requiresVerification,
  })
}
