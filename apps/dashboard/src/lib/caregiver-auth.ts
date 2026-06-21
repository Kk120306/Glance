import { db } from '@glance/shared/db'
import { familyMembers, patientCaregivers } from '@glance/shared/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * Resolve the `family_members` row for the authenticated session user,
 * creating one on-the-fly if the user signed up before the provisioning
 * hook was in place.
 */
export async function getFamilyMemberFromSession(session: { user: { email: string; name?: string | null } }) {
  const [existing] = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.email, session.user.email))

  if (existing) return existing

  const [created] = await db
    .insert(familyMembers)
    .values({
      email: session.user.email,
      name: session.user.name ?? session.user.email,
      passwordHash: '',
    })
    .onConflictDoNothing()
    .returning()

  return created ?? null
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
