import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { previewCompose } from '@/lib/compose-assist'

const previewSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(1000),
})

/**
 * POST /api/compose/preview — live tone + yes/no detection while composing.
 * Caregiver session auth only; does not persist anything.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = previewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const result = await previewCompose(parsed.data.content)
  return NextResponse.json(result)
}
