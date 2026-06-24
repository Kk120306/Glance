import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { generateTemplates } from '@/lib/compose-assist'

const templatesSchema = z.object({
  patientName: z.string().min(1, 'Patient name is required').max(100),
  hint: z.string().max(200).optional(),
})

/**
 * POST /api/compose/templates — suggest check-in messages for the caregiver
 * to adopt. Suggestions only; nothing is sent until the caregiver clicks Send.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = templatesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const templates = await generateTemplates(parsed.data.patientName, parsed.data.hint)
  return NextResponse.json({ templates })
}
