import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { messages, patients, personas, patientCaregivers } from '@glance/shared/db/schema'
import { and, eq } from 'drizzle-orm'
import type { EmitRequest } from '@glance/shared/ws'

const patientMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(1000, 'Message too long'),
  // The persona this phrase is a reply TO, so the dashboard scopes it to that
  // person's thread instead of showing it to everyone. Omitted for general phrases.
  replyToPersonaId: z.string().uuid('Invalid persona ID').optional(),
})

/**
 * POST /api/messages/patient — a patient-initiated phrase (e.g. "Water please").
 *
 * Authenticated by the device token rather than a caregiver session: the patient
 * client is the only caller. The message is stored with `senderPatientId` set and
 * `senderId` null (the schema's `valid_sender` XOR constraint), then broadcast to
 * every linked caregiver so their dashboard chimes and shows the request.
 */
export async function POST(req: NextRequest) {
  const deviceToken = req.headers.get('x-device-token')
  if (!deviceToken) {
    return NextResponse.json({ error: 'Missing X-Device-Token' }, { status: 401 })
  }

  const [patient] = await db.select().from(patients).where(eq(patients.deviceToken, deviceToken))
  if (!patient) {
    return NextResponse.json({ error: 'Invalid device token' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = patientMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Resolve the reply target: only honor a persona that belongs to a caregiver
  // linked to this patient (the device can't be trusted to send a valid id). An
  // unknown/foreign persona is silently dropped to null rather than rejected, so
  // a stale client never blocks the patient from speaking.
  let replyPersonaId: string | null = null
  if (parsed.data.replyToPersonaId) {
    const [persona] = await db
      .select({ id: personas.id })
      .from(personas)
      .innerJoin(patientCaregivers, eq(patientCaregivers.familyMemberId, personas.familyMemberId))
      .where(and(eq(personas.id, parsed.data.replyToPersonaId), eq(patientCaregivers.patientId, patient.id)))
    if (persona) replyPersonaId = persona.id
  }

  const [message] = await db
    .insert(messages)
    .values({
      senderId: null,
      senderPatientId: patient.id,
      recipientId: patient.id,
      personaId: replyPersonaId,
      content: parsed.data.content,
      isYesNo: false,
      toneClass: 'neutral',
    })
    .returning()

  if (!message) {
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
  }

  // Notify every linked caregiver in one broadcast to the patient's alerts room.
  const wsServerUrl = process.env.WS_SERVER_URL
  if (wsServerUrl) {
    const emitBody: EmitRequest = {
      targetPatientAlerts: patient.id,
      event: { type: 'NEW_MESSAGE', payload: message },
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
      console.warn('[messages/patient] ws-server unreachable:', err)
    }
  }

  return NextResponse.json(message, { status: 201 })
}
