import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { messages, patients } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import type { EmitRequest } from '@glance/shared/ws'

const replySchema = z.object({
  reply: z.enum(['yes', 'no']),
})

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
  const [message] = await db.select().from(messages).where(eq(messages.id, id))
  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  if (message.recipientId !== patient.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = replySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const repliedAt = new Date()
  await db
    .update(messages)
    .set({ reply: parsed.data.reply, repliedAt })
    .where(eq(messages.id, id))

  const wsServerUrl = process.env.WS_SERVER_URL
  // Only family-sent messages have a caregiver to notify of a reply.
  if (wsServerUrl && message.senderId) {
    const emitBody: EmitRequest = {
      targetFamilyMemberId: message.senderId,
      event: {
        type: 'NEW_REPLY',
        payload: {
          messageId: id,
          reply: parsed.data.reply,
          repliedAt: repliedAt.toISOString(),
        },
      },
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
      console.warn('[reply] ws-server unreachable:', err)
    }
  }

  return NextResponse.json({ ok: true, repliedAt: repliedAt.toISOString() })
}
