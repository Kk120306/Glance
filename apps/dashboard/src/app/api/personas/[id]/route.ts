import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { personas } from '@glance/shared/db/schema'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'

/**
 * DELETE a persona the signed-in account owns. Messages already sent as this
 * persona keep their history — `messages.persona_id` is ON DELETE SET NULL, so
 * they simply revert to the sender's own account identity.
 */
export async function DELETE(
  _req: NextRequest,
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

  const [deleted] = await db
    .delete(personas)
    .where(and(eq(personas.id, id), eq(personas.familyMemberId, me.id)))
    .returning()

  if (!deleted) {
    return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
