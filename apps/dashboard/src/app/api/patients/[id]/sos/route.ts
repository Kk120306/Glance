import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { patients, patientCaregivers } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import type { EmitRequest } from '@glance/shared/ws'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceToken = req.headers.get('x-device-token')
  if (!deviceToken) {
    return NextResponse.json({ error: 'Missing X-Device-Token' }, { status: 401 })
  }

  const [patient] = await db.select().from(patients).where(eq(patients.deviceToken, deviceToken))
  if (!patient) {
    return NextResponse.json({ error: 'Invalid device token' }, { status: 401 })
  }

  const { id } = await params
  if (patient.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const timestamp = new Date().toISOString()
  console.warn(`[SOS] patient ${id} triggered SOS at ${timestamp}`)

  // Find all caregivers linked to this patient via patient_caregivers
  const links = await db
    .select({ familyMemberId: patientCaregivers.familyMemberId })
    .from(patientCaregivers)
    .where(eq(patientCaregivers.patientId, id))

  const caregiverIds = links.map((l) => l.familyMemberId)

  const wsServerUrl = process.env.WS_SERVER_URL
  if (wsServerUrl && caregiverIds.length > 0) {
    await Promise.allSettled(
      caregiverIds.map(async (familyMemberId) => {
        const emitBody: EmitRequest = {
          targetFamilyMemberId: familyMemberId,
          event: {
            type: 'SOS_TRIGGERED',
            payload: { patientId: id, timestamp },
          },
        }
        await fetch(`${wsServerUrl}/emit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.WS_INTERNAL_SECRET ?? '',
          },
          body: JSON.stringify(emitBody),
        })
      }),
    )
  }

  return NextResponse.json({ ok: true, timestamp })
}
