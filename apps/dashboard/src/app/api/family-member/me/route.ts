import { NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { familyMembers } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [member] = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.email, session.user.email))

  if (!member) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: member.id,
    name: member.name,
    email: member.email,
    elevenlabsVoiceId: member.elevenlabsVoiceId,
  })
}
