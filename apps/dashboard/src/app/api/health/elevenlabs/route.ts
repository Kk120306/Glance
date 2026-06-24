import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import {
  ELEVENLABS_PREMADE_VOICE_ID,
  elevenLabsFetch,
  elevenLabsTtsUrl,
  getElevenLabsApiKey,
  ttsErrorMessage,
} from '@/lib/elevenlabs'

/**
 * GET /api/health/elevenlabs — smoke-test TTS with a premade voice.
 * Caregiver session required; confirms API key and credits work.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!getElevenLabsApiKey()) {
    return NextResponse.json({ ok: false, status: 503, detail: 'ELEVENLABS_API_KEY is not configured' })
  }

  const result = await elevenLabsFetch(elevenLabsTtsUrl(ELEVENLABS_PREMADE_VOICE_ID), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Glance voice check.',
      model_id: 'eleven_multilingual_v2',
    }),
  })

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      status: result.status,
      detail: ttsErrorMessage(result.status, result.detail),
    })
  }

  return NextResponse.json({ ok: true })
}
