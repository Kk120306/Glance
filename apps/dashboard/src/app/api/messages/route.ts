import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { messages, patients, familyMembers } from '@glance/shared/db/schema'
import { desc, eq } from 'drizzle-orm'
import type { EmitRequest } from '@glance/shared/ws'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { classifyTone } from '@/lib/tone-classifier'

const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(1000, 'Message too long'),
  isYesNo: z.boolean().optional().default(false),
})

async function findOrCreateFamilyMember(email: string, name: string) {
  const [existing] = await db.select().from(familyMembers).where(eq(familyMembers.email, email))
  if (existing) return existing

  const [created] = await db
    .insert(familyMembers)
    .values({ email, name, passwordHash: 'managed-by-better-auth' })
    .returning()
  return created!
}

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

  const [patient] = await db.select().from(patients).limit(1)
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 503 })
  }

  const familyMember = await findOrCreateFamilyMember(
    session.user.email,
    session.user.name ?? session.user.email,
  )

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
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  const rows = await db
    .select()
    .from(messages)
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json(rows)
}
