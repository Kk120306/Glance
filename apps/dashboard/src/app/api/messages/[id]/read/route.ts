import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { messages, patients } from '@glance/shared/db/schema'
import { and, eq } from 'drizzle-orm'
import type { EmitRequest } from '@glance/shared/ws'

/**
 * PATCH /api/messages/[id]/read — mark a family→patient message as seen.
 *
 * Authenticated by the device token: the patient client calls this when a
 * caregiver message reaches the screen and is read aloud, so the dashboard can
 * show a live "Seen ✓" receipt. Only family-sent messages addressed to this
 * patient are markable — patient-initiated phrases have no read receipt and are
 * rejected. The transition is broadcast to every linked caregiver via the
 * patient's alerts room.
 */
export async function PATCH(
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
  const [message] = await db.select().from(messages).where(eq(messages.id, id))
  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  // Only the recipient patient may mark their own incoming message, and only a
  // family-sent message carries a read receipt (patient phrases never do).
  if (message.recipientId !== patient.id || !message.senderId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Idempotent: a message already seen is a no-op, no second broadcast.
  if (message.isRead) {
    return NextResponse.json({ ok: true, alreadyRead: true })
  }

  await db
    .update(messages)
    .set({ isRead: true })
    .where(and(eq(messages.id, id), eq(messages.isRead, false)))

  // Notify every linked caregiver in one broadcast to the patient's alerts room
  // so any dashboard viewing the thread flips the receipt in real time.
  const wsServerUrl = process.env.WS_SERVER_URL
  if (wsServerUrl) {
    const emitBody: EmitRequest = {
      targetPatientAlerts: patient.id,
      event: { type: 'MESSAGE_READ', payload: { id, patientId: patient.id } },
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
      console.warn('[read] ws-server unreachable:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
