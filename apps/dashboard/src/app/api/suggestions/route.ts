import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { patients } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import { getSuggestions } from '@/lib/suggestions'

/**
 * POST /api/suggestions — generate contextual reply options for an incoming
 * caregiver message, with ranked phrase-library fallback.
 *
 * Authenticated by the device token (the patient client is the only caller).
 * Primary path: OpenAI generates 5–6 human-like reply sentences with tone
 * labels. Fallback: reorder the patient's curated phrase library. Nothing
 * auto-sends — the patient must explicitly select and confirm (AI Content Gate).
 */

const suggestionsSchema = z.object({
  messageContent: z.string().min(1, 'Message cannot be empty').max(1000),
  senderName: z.string().min(1).max(100).optional(),
  regenerate: z.boolean().optional(),
  phrases: z.array(z.string().min(1).max(100)).min(1).max(60).optional(),
})

export async function POST(req: NextRequest) {
  const deviceToken = req.headers.get('x-device-token')
  if (!deviceToken) {
    return NextResponse.json({ error: 'Missing X-Device-Token' }, { status: 401 })
  }

  const [patient] = await db.select().from(patients).where(eq(patients.deviceToken, deviceToken))
  if (!patient) {
    return NextResponse.json({ error: 'Invalid device token' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = suggestionsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { messageContent, senderName, regenerate, phrases = [] } = parsed.data
  const result = await getSuggestions(messageContent, phrases, {
    senderName,
    regenerate: regenerate ?? false,
  })
  return NextResponse.json(result)
}
