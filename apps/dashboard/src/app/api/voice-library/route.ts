import { NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { familyMembers, patientCaregivers } from '@glance/shared/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'

/**
 * Voice library: every family member who can message any of the signed-in
 * caregiver's patients, with whether they have a cloned voice on file. Each
 * person speaks to the patient in their own voice, so this is the roster of
 * distinct voices the patient may hear.
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

  // Patients this caregiver is linked to.
  const myLinks = await db
    .select({ patientId: patientCaregivers.patientId })
    .from(patientCaregivers)
    .where(eq(patientCaregivers.familyMemberId, me.id))
  const patientIds = myLinks.map((l) => l.patientId)

  // Every family member linked to those patients (de-duplicated), with voice status.
  const members =
    patientIds.length === 0
      ? []
      : await db
          .selectDistinctOn([familyMembers.id], {
            id: familyMembers.id,
            name: familyMembers.name,
            email: familyMembers.email,
            elevenlabsVoiceId: familyMembers.elevenlabsVoiceId,
          })
          .from(patientCaregivers)
          .innerJoin(familyMembers, eq(patientCaregivers.familyMemberId, familyMembers.id))
          .where(inArray(patientCaregivers.patientId, patientIds))

  const roster = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    hasVoice: !!m.elevenlabsVoiceId,
    isSelf: m.id === me.id,
  }))
  // Always surface the signed-in caregiver, even before they are linked to anyone.
  if (!roster.some((r) => r.isSelf)) {
    roster.unshift({
      id: me.id,
      name: me.name,
      email: me.email,
      hasVoice: !!me.elevenlabsVoiceId,
      isSelf: true,
    })
  }

  // Self first, then alphabetical.
  roster.sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.name.localeCompare(b.name)))

  return NextResponse.json(roster)
}
