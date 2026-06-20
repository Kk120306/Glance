import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { patients, patientCaregivers } from '@glance/shared/db/schema'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'

const linkSchema = z.object({
  deviceToken: z.string().uuid('Invalid device token format'),
})

/**
 * POST /api/patients/link — link the calling caregiver to an existing patient
 * using the patient's device token.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const familyMember = await getFamilyMemberFromSession(session)
  if (!familyMember) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = linkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Find patient by device token
  const [patient] = await db
    .select()
    .from(patients)
    .where(eq(patients.deviceToken, parsed.data.deviceToken))

  if (!patient) {
    return NextResponse.json({ error: 'No patient found with that device token' }, { status: 404 })
  }

  // Check if already linked
  const [existing] = await db
    .select()
    .from(patientCaregivers)
    .where(
      and(
        eq(patientCaregivers.patientId, patient.id),
        eq(patientCaregivers.familyMemberId, familyMember.id),
      ),
    )

  if (existing) {
    return NextResponse.json({ error: 'Already linked to this patient' }, { status: 409 })
  }

  // Create association
  await db.insert(patientCaregivers).values({
    patientId: patient.id,
    familyMemberId: familyMember.id,
    role: 'caregiver',
  })

  return NextResponse.json({
    id: patient.id,
    name: patient.name,
    deviceToken: patient.deviceToken,
  })
}
