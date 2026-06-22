import { NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { messages, patientCaregivers } from '@glance/shared/db/schema'
import { and, eq, gte, isNotNull, count, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'

/**
 * GET /api/stats — headline counts for the dashboard overview, scoped to the
 * authenticated caregiver's linked patients via `patient_caregivers`.
 *
 * Returns today's family→patient message volume, patient-initiated help
 * requests (fixed-phrase sends), and the average time patients took to answer
 * yes/no questions today (the only response latency we persist, via
 * `messages.replied_at`). Returns `avgResponseSeconds: null` when no yes/no
 * question was answered today rather than inventing a number.
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

  // Average time to answer a yes/no question today, in seconds. Only yes/no
  // messages carry `replied_at` (set by the patient reply route), so this is the
  // one response-latency metric we can compute from persisted data.
  const [resp] = await db
    .select({
      avgSeconds: sql<string | null>`avg(extract(epoch from (${messages.repliedAt} - ${messages.createdAt})))`,
    })
    .from(messages)
    .innerJoin(patientCaregivers, eq(patientCaregivers.patientId, messages.recipientId))
    .where(
      and(
        eq(patientCaregivers.familyMemberId, familyMember.id),
        isNotNull(messages.repliedAt),
        gte(messages.repliedAt, startOfToday),
      ),
    )

  return NextResponse.json({
    messagesToday: sent?.value ?? 0,
    helpRequestsToday: help?.value ?? 0,
    avgResponseSeconds: resp?.avgSeconds != null ? Number(resp.avgSeconds) : null,
  })
}
