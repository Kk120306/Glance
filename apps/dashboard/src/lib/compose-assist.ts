type ToneClass = 'neutral' | 'warm' | 'urgent'

export type ComposePreview = { tone: ToneClass; isYesNo: boolean }

const DEFAULT_TEMPLATES = [
  'Thinking of you today — how are you feeling?',
  'Just wanted to say I love you.',
  'Is there anything you need right now?',
] as const

function getApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim()
  return key || null
}

async function chatJson(
  system: string,
  user: string,
  maxTokens: number,
): Promise<string | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return data.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  const candidates = [raw.trim()]
  const brace = raw.match(/\{[\s\S]*\}/)
  if (brace) candidates.push(brace[0])
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // try next
    }
  }
  return null
}

function parseTone(value: unknown): ToneClass {
  if (value === 'warm' || value === 'urgent') return value
  return 'neutral'
}

/**
 * Classify compose preview: emotional tone + whether the message is a binary
 * yes/no question the patient should answer with gaze targets.
 */
export async function previewCompose(content: string): Promise<ComposePreview> {
  const fallback: ComposePreview = { tone: 'neutral', isYesNo: false }
  const raw = await chatJson(
    'You help a caregiver compose messages to a motor-impaired family member. ' +
      'Given draft message text, return JSON with exactly two keys: ' +
      '"tone" (one of: neutral, warm, urgent) and "isYesNo" (boolean). ' +
      'Set isYesNo true only when the message is a direct binary question ' +
      'that expects a yes or no answer (e.g. "Can you hear me?", "Are you comfortable?"). ' +
      'Statements, open questions, and greetings are isYesNo false. ' +
      'Example: {"tone":"warm","isYesNo":false}',
    `Draft message: "${content}"`,
    60,
  )
  const obj = parseJsonObject(raw)
  if (!obj) {
    console.warn('[compose-assist] preview fallback: unparseable model output')
    return fallback
  }
  return {
    tone: parseTone(obj.tone),
    isYesNo: obj.isYesNo === true,
  }
}

/**
 * Generate three short check-in message templates for a caregiver to adopt.
 */
export async function generateTemplates(patientName: string, hint?: string): Promise<string[]> {
  const hintLine = hint?.trim() ? `\nContext hint: ${hint.trim()}` : ''
  const raw = await chatJson(
    'You help a family caregiver write short, caring check-in messages to a loved one ' +
      'who cannot speak. Return JSON with key "templates" — an array of exactly 3 strings. ' +
      'Each message must be under 120 characters, warm and personal, and must NOT give ' +
      'medical advice or diagnoses. Vary tone: one gentle question, one affectionate note, ' +
      'one practical check-in. Example: {"templates":["Hi — how are you today?","Thinking of you.","Need anything?"]}',
    `Patient name: ${patientName}${hintLine}`,
    200,
  )
  const obj = parseJsonObject(raw)
  const templates = obj?.templates
  if (!Array.isArray(templates)) {
    console.warn('[compose-assist] templates fallback: unparseable model output')
    return [...DEFAULT_TEMPLATES]
  }
  const cleaned = templates
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim().slice(0, 120))
    .slice(0, 3)
  if (cleaned.length < 3) {
    console.warn('[compose-assist] templates fallback: insufficient results')
    return [...DEFAULT_TEMPLATES]
  }
  return cleaned
}
