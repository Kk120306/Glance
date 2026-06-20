import { NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { patients, patientCaregivers } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const familyMember = await getFamilyMemberFromSession(session)
  if (!familyMember) {
    return NextResponse.json([])
  }

  // Return only patients associated with the logged-in caregiver
  const rows = await db
    .select({
      id: patients.id,
      name: patients.name,
      deviceToken: patients.deviceToken,
      cameraOverrideActive: patients.cameraOverrideActive,
      createdAt: patients.createdAt,
    })
    .from(patientCaregivers)
    .innerJoin(patients, eq(patientCaregivers.patientId, patients.id))
    .where(eq(patientCaregivers.familyMemberId, familyMember.id))

  return NextResponse.json(rows)
}
