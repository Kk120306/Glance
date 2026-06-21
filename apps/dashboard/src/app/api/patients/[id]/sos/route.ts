import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { patients } from '@glance/shared/db/schema'
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

  // Fan out to every linked caregiver in a single broadcast to the patient's
  // alerts room — the ws-server delivers it to all caregivers currently online.
  const wsServerUrl = process.env.WS_SERVER_URL
  if (wsServerUrl) {
    const emitBody: EmitRequest = {
      targetPatientAlerts: id,
      event: { type: 'SOS_TRIGGERED', payload: { patientId: id, timestamp } },
    }
    try {
      await fetch(`${wsServerUrl}/emit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.WS_INTERNAL_SECRET ?? '',
        },
        body: JSON.stringify(emitBody),
      })
    } catch (err) {
      console.warn('[sos] ws-server unreachable:', err)
    }
  }

  return NextResponse.json({ ok: true, timestamp })
}
