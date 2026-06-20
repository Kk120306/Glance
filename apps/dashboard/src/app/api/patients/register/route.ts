import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { patients, patientCaregivers, familyMembers } from '@glance/shared/db/schema'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
})

/**
 * POST /api/patients/register — register a new patient device.
 *
 * Creates a new patient row with a random device token and links the
 * calling caregiver as `primary_caregiver` via patient_caregivers.
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
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Create the patient
  const [patient] = await db
    .insert(patients)
    .values({ name: parsed.data.name })
    .returning()

  if (!patient) {
    return NextResponse.json({ error: 'Failed to create patient' }, { status: 500 })
  }

  // Link caregiver as primary
  await db.insert(patientCaregivers).values({
    patientId: patient.id,
    familyMemberId: familyMember.id,
    role: 'primary_caregiver',
  })

  return NextResponse.json(
    {
      id: patient.id,
      name: patient.name,
      deviceToken: patient.deviceToken,
    },
    { status: 201 },
  )
}
