import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { patients, cameraSchedules } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'
import type { EmitRequest } from '@glance/shared/ws'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getFamilyMemberFromSession, getCaregiverAccess } from '@/lib/caregiver-auth'

const scheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  timezone: z.string().min(1),
})

const cameraConfigSchema = z.object({
  cameraOverrideActive: z.boolean().optional(),
  schedules: z.array(scheduleSchema).optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const familyMember = await getFamilyMemberFromSession(session)
  if (!familyMember) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }
  const access = await getCaregiverAccess(familyMember.id, id)
  if (!access) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [patient] = await db.select().from(patients).where(eq(patients.id, id))
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  const schedules = await db
    .select()
    .from(cameraSchedules)
    .where(eq(cameraSchedules.patientId, id))

  return NextResponse.json({
    cameraOverrideActive: patient.cameraOverrideActive,
    schedules: schedules.map(s => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      timezone: s.timezone,
    })),
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const familyMember = await getFamilyMemberFromSession(session)
  if (!familyMember) {
    return NextResponse.json({ error: 'Family member not found' }, { status: 404 })
  }
  const access = await getCaregiverAccess(familyMember.id, id)
  if (!access) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [patient] = await db.select().from(patients).where(eq(patients.id, id))
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = cameraConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { cameraOverrideActive, schedules } = parsed.data

  if (cameraOverrideActive !== undefined) {
    await db.update(patients).set({ cameraOverrideActive }).where(eq(patients.id, id))
  }

  if (schedules !== undefined) {
    await db.delete(cameraSchedules).where(eq(cameraSchedules.patientId, id))
    if (schedules.length > 0) {
      await db.insert(cameraSchedules).values(
        schedules.map(s => ({ patientId: id, ...s })),
      )
    }
  }

  const updatedSchedules = await db
    .select()
    .from(cameraSchedules)
    .where(eq(cameraSchedules.patientId, id))

  const [updatedPatient] = await db.select().from(patients).where(eq(patients.id, id))

  const wsServerUrl = process.env.WS_SERVER_URL
  if (wsServerUrl) {
    const emitBody: EmitRequest = {
      targetPatientId: id,
      event: {
        type: 'CAMERA_CONFIG_UPDATE',
        payload: {
          cameraOverrideActive: updatedPatient!.cameraOverrideActive,
          schedules: updatedSchedules.map(s => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            timezone: s.timezone,
          })),
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
      console.warn('[camera-config] ws-server unreachable:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
