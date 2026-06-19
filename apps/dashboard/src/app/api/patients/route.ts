import { NextResponse } from 'next/server'
import { db } from '@glance/shared/db'
import { patients } from '@glance/shared/db/schema'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.select({ id: patients.id, cameraOverrideActive: patients.cameraOverrideActive }).from(patients)
  return NextResponse.json(rows)
}
