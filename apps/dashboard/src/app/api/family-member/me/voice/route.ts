import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { familyMembers } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

const voiceSchema = z.object({
  elevenlabsVoiceId: z.string().min(1).nullable(),
})

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = voiceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  await db
    .update(familyMembers)
    .set({ elevenlabsVoiceId: parsed.data.elevenlabsVoiceId })
    .where(eq(familyMembers.email, session.user.email))

  return NextResponse.json({ ok: true })
}
