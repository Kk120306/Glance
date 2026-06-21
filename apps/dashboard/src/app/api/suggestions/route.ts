import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@glance/shared/db'
import { patients } from '@glance/shared/db/schema'
import { eq } from 'drizzle-orm'

/**
 * POST /api/suggestions — rank a patient's curated reply phrases against an
 * incoming caregiver message.
 *
 * Authenticated by the device token (the patient client is the only caller).
 * The patient sends its own frozen phrase library; the LLM only *reorders* it —
 * suggestions are always built by indexing back into the caller-supplied list,
 * so no generated or off-library content can ever reach the patient (PRD AI
 * Content Gate). With no API key the endpoint returns the library unchanged.
 */

const suggestionsSchema = z.object({
  messageContent: z.string().min(1, 'Message cannot be empty').max(1000),
  phrases: z.array(z.string().min(1).max(100)).min(1).max(60),
})

export async function POST(req: NextRequest) {
  const deviceToken = req.headers.get('x-device-token')
  if (!deviceToken) {
    return NextResponse.json({ error: 'Missing X-Device-Token' }, { status: 401 })
  }

  const [patient] = await db.select().from(patients).where(eq(patients.deviceToken, deviceToken))
  if (!patient) {
    return NextResponse.json({ error: 'Invalid device token' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = suggestionsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const suggestions = await rankPhrases(parsed.data.messageContent, parsed.data.phrases)
  return NextResponse.json({ suggestions })
}

/**
 * Ask the LLM for the most relevant reply phrases, returned as a full ranked
 * permutation of the supplied curated list. The model only emits indices; we map
 * them back to the caller's phrases (dropping anything out of range and
 * appending any it omitted), guaranteeing the result is exactly the input set,
 * reordered. Any failure falls back to the original order.
 */
async function rankPhrases(message: string, phrases: string[]): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return phrases

  try {
    const numbered = phrases.map((p, i) => `${i}: ${p}`).join('\n')
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content:
              'A non-speaking patient must pick a reply to an incoming message. ' +
              'You are given the message and a numbered list of fixed reply phrases. ' +
              'Return ONLY a JSON array of the phrase indices, ordered from most to ' +
              'least appropriate as a reply. Include every index exactly once. ' +
              'Do not invent phrases. Example: [3,0,5,1,2,4]',
          },
          {
            role: 'user',
            content: `Incoming message: "${message}"\n\nPhrases:\n${numbered}`,
          },
        ],
      }),
    })

    if (!res.ok) return phrases

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const order = parseIndexOrder(data.choices?.[0]?.message?.content ?? '', phrases.length)
    if (order.length === 0) return phrases

    const seen = new Set<number>()
    const ranked: string[] = []
    for (const i of order) {
      if (!seen.has(i)) {
        seen.add(i)
        ranked.push(phrases[i]!)
      }
    }
    // Preserve the full curated set: append any indices the model left out.
    for (let i = 0; i < phrases.length; i++) {
      if (!seen.has(i)) ranked.push(phrases[i]!)
    }
    return ranked
  } catch {
    return phrases
  }
}

/** Parse a model reply into a list of valid, in-range phrase indices. */
function parseIndexOrder(raw: string, count: number): number[] {
  const match = raw.match(/\[[\s\S]*\]/)
  const candidate = match ? match[0] : raw
  try {
    const arr: unknown = JSON.parse(candidate)
    if (Array.isArray(arr)) {
      return arr.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < count)
    }
  } catch {
    // fall through to a permissive integer scan
  }
  return (raw.match(/\d+/g) ?? [])
    .map(Number)
    .filter((x) => Number.isInteger(x) && x >= 0 && x < count)
}
