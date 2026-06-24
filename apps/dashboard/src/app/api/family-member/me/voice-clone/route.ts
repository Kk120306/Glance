import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { familyMembers } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import {
  elevenLabsFetch,
  elevenLabsVoicesAddUrl,
  getElevenLabsApiKey,
  parseVoiceCloneResponse,
} from '@/lib/elevenlabs'

/**
 * POST /api/family-member/me/voice-clone — clone the caregiver's voice from an
 * in-app recording.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  elevenForm.append('name', `Glance-${session.user.email}`)
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
    .update(familyMembers)
    .set({ elevenlabsVoiceId: data.voiceId })
    .where(eq(familyMembers.email, session.user.email))

  return NextResponse.json({
    voiceId: data.voiceId,
    requiresVerification: data.requiresVerification,
  })
}
