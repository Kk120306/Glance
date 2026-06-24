import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { messages, patients, familyMembers, personas } from '@glance/shared/db/schema'
import { and, asc, eq, isNotNull } from 'drizzle-orm'

/**
 * GET /api/messages/pending — every family→patient message this device has not
 * yet seen, oldest first.
 *
 * Authenticated by the device token (the patient client is the only caller).
 * Live delivery is over the WebSocket, but a message sent while the device was
 * closed, offline, or off-camera never reaches that socket. The patient app polls
 * this on session start and on every (re)connect and enqueues anything missing,
 * so no caregiver message is silently dropped — it is read aloud once the device
 * comes back. A message leaves this list the moment it is marked read (when it
 * reaches the screen via PATCH /api/messages/[id]/read).
 *
 * Patient-initiated phrases (`senderPatientId` set) are excluded — they carry no
 * read receipt and are never replayed to the patient.
 */
export async function GET(req: NextRequest) {
  const deviceToken = req.headers.get('x-device-token')
  if (!deviceToken) {
    return NextResponse.json({ error: 'Missing X-Device-Token' }, { status: 401 })
  }

  const [patient] = await db.select().from(patients).where(eq(patients.deviceToken, deviceToken))
  if (!patient) {
    return NextResponse.json({ error: 'Invalid device token' }, { status: 401 })
  }

  const rows = await db
    .select({
      id: messages.id,
      content: messages.content,
      isYesNo: messages.isYesNo,
      toneClass: messages.toneClass,
      mediaUrl: messages.mediaUrl,
      mediaType: messages.mediaType,
      personaId: messages.personaId,
      senderName: familyMembers.name,
      personaName: personas.name,
    })
    .from(messages)
    .leftJoin(familyMembers, eq(messages.senderId, familyMembers.id))
    .leftJoin(personas, eq(messages.personaId, personas.id))
    .where(
      and(
        eq(messages.recipientId, patient.id),
        isNotNull(messages.senderId),
        eq(messages.isRead, false),
      ),
    )
    .orderBy(asc(messages.createdAt))

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      content: r.content,
      isYesNo: r.isYesNo,
      toneClass: r.toneClass,
      mediaUrl: r.mediaUrl,
      mediaType: r.mediaType,
      // The persona this message was sent AS, so the patient can direct a reply
      // back to the same person (null = sent by the account directly).
      personaId: r.personaId,
      // Persona name wins (the message was sent AS that person), else the account.
      senderName: r.personaName ?? r.senderName ?? null,
    })),
  )
}
