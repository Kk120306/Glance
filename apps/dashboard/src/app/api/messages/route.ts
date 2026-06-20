import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { messages, patients, familyMembers } from '@glance/shared/db/schema'
import { desc, eq, or } from 'drizzle-orm'
import type { EmitRequest } from '@glance/shared/ws'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { classifyTone } from '@/lib/tone-classifier'
import { getFamilyMemberFromSession, getCaregiverAccess } from '@/lib/caregiver-auth'

const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(1000, 'Message too long'),
  recipientId: z.string().uuid('Invalid recipient ID'),
  isYesNo: z.boolean().optional().default(false),
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

  const toneClass = await classifyTone(parsed.data.content)

  const [message] = await db
    .insert(messages)
    .values({
      senderId: familyMember.id,
      recipientId: patient.id,
      content: parsed.data.content,
      isYesNo: parsed.data.isYesNo,
      toneClass,
    })
    .returning()

  if (!message) {
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
  }

  const wsServerUrl = process.env.WS_SERVER_URL
  if (wsServerUrl) {
    const emitBody: EmitRequest = {
      targetPatientId: patient.id,
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

  const rows = await db
    .select()
    .from(messages)
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
