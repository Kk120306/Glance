import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { personas } from '@glance/shared/db/schema'
import { asc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'

/**
 * Personas the signed-in family account owns — named identities ("Mom", "Dad",
 * "Kid"), each with an optional cloned voice. They let one operator message as
 * different people, each in their own voice, without separate logins.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const me = await getFamilyMemberFromSession(session)
  if (!me) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }

  const rows = await db
    .select()
    .from(personas)
    .where(eq(personas.familyMemberId, me.id))
    .orderBy(asc(personas.createdAt))

  return NextResponse.json(
    rows.map((p) => ({
      id: p.id,
      name: p.name,
      elevenlabsVoiceId: p.elevenlabsVoiceId,
      hasVoice: !!p.elevenlabsVoiceId,
    })),
  )
}

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(60, 'Name too long'),
})

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const me = await getFamilyMemberFromSession(session)
  if (!me) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const [created] = await db
    .insert(personas)
    .values({ familyMemberId: me.id, name: parsed.data.name.trim() })
    .returning()

  if (!created) {
    return NextResponse.json({ error: 'Failed to create persona' }, { status: 500 })
  }

  return NextResponse.json(
    { id: created.id, name: created.name, elevenlabsVoiceId: created.elevenlabsVoiceId, hasVoice: !!created.elevenlabsVoiceId },
    { status: 201 },
  )
}
