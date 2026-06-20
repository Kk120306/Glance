import { db } from '@glance/shared/db'
import { familyMembers, patientCaregivers } from '@glance/shared/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * Resolve the `family_members` row for the authenticated session user.
 * Returns `null` if no matching family member is found.
 */
export async function getFamilyMemberFromSession(session: { user: { email: string; name?: string | null } }) {
  const [member] = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.email, session.user.email))

  return member ?? null
}

/**
 * Verify that a family member is associated with a patient via the
 * `patient_caregivers` table. Returns the association row if it exists,
 * or `null` if the caregiver has no access to this patient.
 */
export async function getCaregiverAccess(familyMemberId: string, patientId: string) {
  const [link] = await db
    .select()
    .from(patientCaregivers)
    .where(
      and(
        eq(patientCaregivers.familyMemberId, familyMemberId),
        eq(patientCaregivers.patientId, patientId),
      ),
    )

  return link ?? null
}
