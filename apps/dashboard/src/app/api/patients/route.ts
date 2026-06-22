import { NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { patients, patientCaregivers, messages } from '@glance/shared/db/schema'
import { and, eq, isNotNull, count } from 'drizzle-orm'
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
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
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

  // Per-patient count of family→patient messages the patient hasn't seen yet
  // (read receipts not yet returned). Powers the unseen badges across the UI.
  const unseenRows = await db
    .select({ patientId: messages.recipientId, value: count() })
    .from(messages)
    .innerJoin(patientCaregivers, eq(patientCaregivers.patientId, messages.recipientId))
    .where(
      and(
        eq(patientCaregivers.familyMemberId, familyMember.id),
        isNotNull(messages.senderId),
        eq(messages.isRead, false),
      ),
    )
    .groupBy(messages.recipientId)

  const unseenByPatient = new Map(unseenRows.map((r) => [r.patientId, r.value]))

  return NextResponse.json(
    rows.map((p) => ({ ...p, unseenCount: unseenByPatient.get(p.id) ?? 0 })),
  )
}
