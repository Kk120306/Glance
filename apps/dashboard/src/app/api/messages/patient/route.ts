import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { messages, patients } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import type { EmitRequest } from '@glance/shared/ws'

const patientMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(1000, 'Message too long'),
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

  const [message] = await db
    .insert(messages)
    .values({
      senderId: null,
      senderPatientId: patient.id,
      recipientId: patient.id,
      content: parsed.data.content,
      isYesNo: false,
      toneClass: 'neutral',
    })
    .returning()

  if (!message) {
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
  }

  // Notify linked caregivers. There is no family↔patient join table, so we treat
  // every caregiver who has ever messaged this patient as linked (mirrors the SOS
  // broadcast), and emit the new message to each of their caregiver rooms.
  const wsServerUrl = process.env.WS_SERVER_URL
  if (wsServerUrl) {
    const sentMessages = await db
      .select({ senderId: messages.senderId })
      .from(messages)
      .where(eq(messages.recipientId, patient.id))

    const caregiverIds = [
      ...new Set(sentMessages.map((m) => m.senderId).filter((id): id is string => id !== null)),
    ]

    await Promise.allSettled(
      caregiverIds.map(async (familyMemberId) => {
        const emitBody: EmitRequest = {
          targetFamilyMemberId: familyMemberId,
          event: { type: 'NEW_MESSAGE', payload: message },
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

  return NextResponse.json(message, { status: 201 })
}
