import { NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { messages, patientCaregivers } from '@glance/shared/db/schema'
import { and, eq, gte, isNotNull, count } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'

/**
 * GET /api/stats — headline counts for the dashboard overview, scoped to the
 * authenticated caregiver's linked patients via `patient_caregivers`.
 *
 * Returns today's family→patient message volume and patient-initiated help
 * requests (fixed-phrase sends). Gaze accuracy / response-time metrics are not
 * yet instrumented (no client telemetry is persisted), so the overview renders
 * those as placeholders rather than this endpoint inventing numbers.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const familyMember = await getFamilyMemberFromSession(session)
  if (!familyMember) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  // Family→patient messages sent today, across this caregiver's linked patients.
  const [sent] = await db
    .select({ value: count() })
    .from(messages)
    .innerJoin(patientCaregivers, eq(patientCaregivers.patientId, messages.recipientId))
    .where(
      and(
        eq(patientCaregivers.familyMemberId, familyMember.id),
        isNotNull(messages.senderId),
        gte(messages.createdAt, startOfToday),
      ),
    )

  // Patient-initiated help requests today (fixed-phrase sends), same scope.
  const [help] = await db
    .select({ value: count() })
    .from(messages)
    .innerJoin(patientCaregivers, eq(patientCaregivers.patientId, messages.senderPatientId))
    .where(
      and(
        eq(patientCaregivers.familyMemberId, familyMember.id),
        isNotNull(messages.senderPatientId),
        gte(messages.createdAt, startOfToday),
      ),
    )

  return NextResponse.json({
    messagesToday: sent?.value ?? 0,
    helpRequestsToday: help?.value ?? 0,
  })
}
