import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { messages, patients, familyMembers, personas } from '@glance/shared/db/schema'
import { and, desc, eq, or } from 'drizzle-orm'
import type { EmitRequest } from '@glance/shared/ws'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { classifyTone } from '@/lib/tone-classifier'
import { getFamilyMemberFromSession, getCaregiverAccess } from '@/lib/caregiver-auth'

const sendMessageSchema = z
  .object({
    content: z.string().min(1, 'Message cannot be empty').max(1000, 'Message too long'),
    recipientId: z.string().uuid('Invalid recipient ID'),
    // Optional persona to send AS — sets the display name + cloned voice. Must be
    // owned by the sender; omitted means "send as my own account".
    personaId: z.string().uuid('Invalid persona ID').optional(),
    isYesNo: z.boolean().optional().default(false),
    // Optional media attachment (externally hosted). Both fields travel together.
    mediaUrl: z.string().url('Invalid media URL').max(2048).optional(),
    mediaType: z.enum(['image', 'video']).optional(),
  })
  .refine((d) => (d.mediaUrl ? !!d.mediaType : true), {
    message: 'mediaType is required when mediaUrl is set',
    path: ['mediaType'],
  })

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = sendMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const familyMember = await getFamilyMemberFromSession(session)
  if (!familyMember) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }

  // Verify caregiver is associated with the target patient
  const access = await getCaregiverAccess(familyMember.id, parsed.data.recipientId)
  if (!access) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [patient] = await db.select().from(patients).where(eq(patients.id, parsed.data.recipientId))
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  // If sending AS a persona, it must belong to the signed-in account (prevents
  // borrowing another account's voice). Capture its name so the patient device
  // can attribute the message to the persona, not the underlying account.
  let personaName: string | null = null
  if (parsed.data.personaId) {
    const [persona] = await db
      .select({ id: personas.id, name: personas.name })
      .from(personas)
      .where(and(eq(personas.id, parsed.data.personaId), eq(personas.familyMemberId, familyMember.id)))
    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 403 })
    }
    personaName = persona.name
  }

  const toneClass = await classifyTone(parsed.data.content)

  const [message] = await db
    .insert(messages)
    .values({
      senderId: familyMember.id,
      personaId: parsed.data.personaId ?? null,
      recipientId: patient.id,
      content: parsed.data.content,
      isYesNo: parsed.data.isYesNo,
      toneClass,
      mediaUrl: parsed.data.mediaUrl ?? null,
      mediaType: parsed.data.mediaType ?? null,
    })
    .returning()

  if (!message) {
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
  }

  const senderName = personaName ?? familyMember.name

  const wsServerUrl = process.env.WS_SERVER_URL
  if (wsServerUrl) {
    const emitBody: EmitRequest = {
      // Deliver to the patient device room AND the caregiver alerts room, so a
      // second caregiver viewing the same thread sees the message arrive live
      // (not only the patient and the sender's own optimistic refresh).
      targetPatientId: patient.id,
      targetPatientAlerts: patient.id,
      event: { type: 'NEW_MESSAGE', payload: { ...message, senderName } },
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
      console.warn('[messages] ws-server unreachable:', err)
    }
  }

  return NextResponse.json(message, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const patientId = url.searchParams.get('patientId')
  if (!patientId) {
    return NextResponse.json({ error: 'patientId query parameter is required' }, { status: 400 })
  }

  const familyMember = await getFamilyMemberFromSession(session)
  if (!familyMember) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }

  // Verify caregiver is associated with the requested patient
  const access = await getCaregiverAccess(familyMember.id, patientId)
  if (!access) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  // Join the sender's display name so the thread can attribute each caregiver
  // message to the actual person who sent it (mom vs. dad), not just "you".
  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      senderPatientId: messages.senderPatientId,
      recipientId: messages.recipientId,
      content: messages.content,
      isYesNo: messages.isYesNo,
      isRead: messages.isRead,
      toneClass: messages.toneClass,
      reply: messages.reply,
      repliedAt: messages.repliedAt,
      createdAt: messages.createdAt,
      senderName: familyMembers.name,
      personaId: messages.personaId,
      // When a persona was used, the thread attributes the message to it (its
      // name + voice) rather than to the underlying account.
      personaName: personas.name,
    })
    .from(messages)
    .leftJoin(familyMembers, eq(messages.senderId, familyMembers.id))
    .leftJoin(personas, eq(messages.personaId, personas.id))
    .where(
      or(
        eq(messages.recipientId, patientId),
        eq(messages.senderPatientId, patientId),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json(rows)
}
