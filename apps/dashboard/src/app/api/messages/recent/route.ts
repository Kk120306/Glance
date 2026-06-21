import { NextRequest, NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { messages, patients, familyMembers, patientCaregivers } from '@glance/shared/db/schema'
import { desc, eq, inArray } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession } from '@/lib/caregiver-auth'

/**
 * Cross-patient recent activity for the signed-in caregiver: the latest messages
 * across every patient they are linked to, newest first, each annotated with the
 * patient name and the sender's display name. Powers the Messages inbox.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const me = await getFamilyMemberFromSession(session)
  if (!me) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }

  const myLinks = await db
    .select({ patientId: patientCaregivers.patientId })
    .from(patientCaregivers)
    .where(eq(patientCaregivers.familyMemberId, me.id))
  const patientIds = myLinks.map((l) => l.patientId)
  if (patientIds.length === 0) return NextResponse.json([])

  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') ?? 30), 100)

  const rows = await db
    .select({
      id: messages.id,
      content: messages.content,
      createdAt: messages.createdAt,
      isYesNo: messages.isYesNo,
      reply: messages.reply,
      recipientId: messages.recipientId,
      senderPatientId: messages.senderPatientId,
      patientName: patients.name,
      senderName: familyMembers.name,
    })
    .from(messages)
    .innerJoin(patients, eq(messages.recipientId, patients.id))
    .leftJoin(familyMembers, eq(messages.senderId, familyMembers.id))
    .where(inArray(messages.recipientId, patientIds))
    .orderBy(desc(messages.createdAt))
    .limit(limit)

  const feed = rows.map((r) => ({
    id: r.id,
    content: r.content,
    createdAt: r.createdAt,
    isYesNo: r.isYesNo,
    reply: r.reply,
    patientId: r.recipientId,
    patientName: r.patientName,
    fromPatient: !!r.senderPatientId,
    senderName: r.senderPatientId ? r.patientName : (r.senderName ?? 'A caregiver'),
  }))

  return NextResponse.json(feed)
}
