import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { patients, cameraSchedules } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const deviceToken = req.headers.get('x-device-token')
  if (!deviceToken) {
    return NextResponse.json({ error: 'Missing X-Device-Token' }, { status: 401 })
  }

  const [patient] = await db.select().from(patients).where(eq(patients.deviceToken, deviceToken))
  if (!patient) {
    return NextResponse.json({ error: 'Invalid device token' }, { status: 401 })
  }

  const schedules = await db
    .select()
    .from(cameraSchedules)
    .where(eq(cameraSchedules.patientId, patient.id))

  return NextResponse.json({
    id: patient.id,
    cameraOverrideActive: patient.cameraOverrideActive,
    schedules: schedules.map(s => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      timezone: s.timezone,
    })),
  })
}
