export type ReplySuggestion = { text: string; tone?: string }

export type SuggestionsResult = {
  suggestions: ReplySuggestion[]
  ranked: boolean
  source: 'generated' | 'ranked' | 'fallback'
}

export type RankResult = { suggestions: string[]; ranked: boolean }

const MIN_GENERATED = 3
const MAX_GENERATED = 6
const MAX_REPLY_CHARS = 200

/** Primary: generate contextual replies. Fallback: rank curated phrases. */
export async function getSuggestions(
  message: string,
  phrases: string[],
  opts: { senderName?: string; regenerate: boolean },
): Promise<SuggestionsResult> {
  const generated = await generateReplySuggestions(message, phrases, opts)
  if (generated) return generated

  if (phrases.length === 0) {
    return { suggestions: [], ranked: false, source: 'fallback' }
  }

  const ranked = await rankPhrases(message, phrases)
  const suggestions = ranked.suggestions.map((text) => ({ text }))
  return {
    suggestions,
    ranked: ranked.ranked,
    source: ranked.ranked ? 'ranked' : 'fallback',
  }
}

/**
 * Ask OpenAI for contextual first-person reply options. Returns null on failure
 * so the caller can fall back to phrase ranking.
 */
export async function generateReplySuggestions(
  message: string,
  fallbackPhrases: string[],
  opts: { senderName?: string; regenerate: boolean },
): Promise<SuggestionsResult | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('[suggestions] generation skipped: missing OPENAI_API_KEY')
    return null
  }

  try {
    const fromLabel = opts.senderName ? ` from ${opts.senderName}` : ''
    const regenerateNote = opts.regenerate
      ? '\nProvide a different set of replies than you would normally suggest.'
      : ''

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: opts.regenerate ? 0.9 : 0.7,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You help a non-speaking patient reply to a family member\'s message. ' +
              'Return 5–6 first-person, warm, natural reply options that directly address the message. ' +
              'Each reply should be 1–2 sentences, 20–180 characters, conversational (not clinical or robotic). ' +
              'Vary intent across options: reassuring, grateful, honest about needs, warm/affectionate, practical request. ' +
              'Never invent specific facts the patient did not imply; stay plausible and general. ' +
              'Include a short tone label per option (e.g. "Reassuring", "Warm", "Asking for something"). ' +
              'Return JSON: {"replies":[{"text":"...","tone":"Reassuring"}, ...]}',
          },
          {
            role: 'user',
            content:
              `Incoming message${fromLabel}: "${message}"` +
              regenerateNote +
              '\n\nGenerate reply options the patient can pick from.',
          },
        ],
      }),
    })

    if (!res.ok) {
      console.warn(`[suggestions] generation failed: OpenAI HTTP ${res.status}`)
      return null
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const replies = parseGeneratedReplies(data.choices?.[0]?.message?.content ?? '')
    if (replies.length < MIN_GENERATED) {
      console.warn('[suggestions] generation failed: too few valid replies')
      return null
    }

    const suggestions = await padSuggestions(replies, fallbackPhrases, message)
    return { suggestions, ranked: true, source: 'generated' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    console.warn(`[suggestions] generation failed: ${reason}`)
    return null
  }
}

/** Parse and validate model output into reply suggestions. */
export function parseGeneratedReplies(raw: string): ReplySuggestion[] {
  const candidates = [raw.trim()]
  const brace = raw.match(/\{[\s\S]*\}/)
  if (brace) candidates.push(brace[0])

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      const replies = (parsed as { replies?: unknown }).replies
      if (!Array.isArray(replies)) continue

      const valid: ReplySuggestion[] = []
      const seen = new Set<string>()
      for (const item of replies) {
        if (!item || typeof item !== 'object') continue
        const text = String((item as { text?: unknown }).text ?? '').trim()
        if (text.length < 1 || text.length > MAX_REPLY_CHARS) continue
        const key = text.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)

        const toneRaw = (item as { tone?: unknown }).tone
        const tone =
          typeof toneRaw === 'string' && toneRaw.trim().length > 0
            ? toneRaw.trim().slice(0, 40)
            : undefined
        valid.push(tone ? { text, tone } : { text })
        if (valid.length >= MAX_GENERATED) break
      }
      if (valid.length > 0) return valid
    } catch {
      // try next candidate
    }
  }
  return []
}

/** Pad with ranked fallback phrases when the model returns too few options. */
async function padSuggestions(
  replies: ReplySuggestion[],
  fallbackPhrases: string[],
  message: string,
): Promise<ReplySuggestion[]> {
  if (replies.length >= MIN_GENERATED || fallbackPhrases.length === 0) {
    return replies.slice(0, MAX_GENERATED)
  }

  const ranked = await rankPhrases(message, fallbackPhrases)
  const seen = new Set(replies.map((r) => r.text.toLowerCase()))
  const padded = [...replies]
  for (const text of ranked.suggestions) {
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    padded.push({ text })
    if (padded.length >= MIN_GENERATED) break
  }
  return padded.slice(0, MAX_GENERATED)
}

/**
 * Ask the LLM for the most relevant reply phrases, returned as a full ranked
 * permutation of the supplied curated list.
 */
export async function rankPhrases(message: string, phrases: string[]): Promise<RankResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fallback(phrases, 'missing OPENAI_API_KEY')

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
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'A non-speaking patient must pick a reply to an incoming message. ' +
              'You are given the message and a numbered list of fixed reply phrases. ' +
              'Return a JSON object with key "order" whose value is an array of phrase ' +
              'indices (integers), ordered from most to least appropriate as a reply. ' +
              'Include every index exactly once. Do not invent phrases. ' +
              'Example: {"order":[3,0,5,1,2,4]}',
          },
          {
            role: 'user',
            content: `Incoming message: "${message}"\n\nPhrases:\n${numbered}`,
          },
        ],
      }),
    })

    if (!res.ok) return fallback(phrases, `OpenAI HTTP ${res.status}`)

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const order = parseIndexOrder(data.choices?.[0]?.message?.content ?? '', phrases.length)
    if (order.length === 0) return fallback(phrases, 'unparseable model output')

    const suggestions = applyIndexOrder(phrases, order)
    const ranked = !sameOrder(suggestions, phrases)
    return { suggestions, ranked }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    return fallback(phrases, reason)
  }
}

function fallback(phrases: string[], reason: string): RankResult {
  console.warn(`[suggestions] fallback: ${reason}`)
  return { suggestions: phrases, ranked: false }
}

function applyIndexOrder(phrases: string[], order: number[]): string[] {
  const seen = new Set<number>()
  const ranked: string[] = []
  for (const i of order) {
    if (!seen.has(i)) {
      seen.add(i)
      ranked.push(phrases[i]!)
    }
  }
  for (let i = 0; i < phrases.length; i++) {
    if (!seen.has(i)) ranked.push(phrases[i]!)
  }
  return ranked
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** Parse a model reply into a list of valid, in-range phrase indices. */
export function parseIndexOrder(raw: string, count: number): number[] {
  const candidates = [raw.trim()]
  const brace = raw.match(/\{[\s\S]*\}/)
  if (brace) candidates.push(brace[0])
  const bracket = raw.match(/\[[\s\S]*\]/)
  if (bracket) candidates.push(bracket[0])

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const order = (parsed as { order?: unknown }).order
        if (Array.isArray(order)) {
          const indices = order.filter(
            (x): x is number => Number.isInteger(x) && x >= 0 && x < count,
          )
          if (indices.length > 0) return indices
        }
      }
      if (Array.isArray(parsed)) {
        const indices = parsed.filter(
          (x): x is number => Number.isInteger(x) && x >= 0 && x < count,
        )
        if (indices.length > 0) return indices
      }
    } catch {
      // try next candidate
    }
  }
  return []
}
