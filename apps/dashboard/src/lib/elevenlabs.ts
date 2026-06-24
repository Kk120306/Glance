const ELEVENLABS_BASE = 'https://api.elevenlabs.io'

/** Rachel — premade voice used for health checks and default fallback. */
export const ELEVENLABS_PREMADE_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

export const ELEVENLABS_TTS_OUTPUT_FORMAT = 'mp3_44100_128'

export type ElevenLabsFetchResult =
  | { ok: true; response: Response }
  | { ok: false; status: number; detail: string }

export function getElevenLabsApiKey(): string | null {
  const key = process.env.ELEVENLABS_API_KEY?.trim()
  return key || null
}

export function getElevenLabsDefaultVoiceId(): string | null {
  const id = process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim()
  return id || null
}

export function elevenLabsTtsUrl(voiceId: string): string {
  const params = new URLSearchParams({ output_format: ELEVENLABS_TTS_OUTPUT_FORMAT })
  return `${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}/stream?${params}`
}

export function elevenLabsVoicesAddUrl(): string {
  return `${ELEVENLABS_BASE}/v1/voices/add`
}

export function ttsErrorMessage(status: number, detail: string): string {
  if (detail.includes('quota_exceeded') || detail.includes('credits remaining')) {
    return 'ElevenLabs credits exhausted — add credits to your account to enable cloned-voice playback'
  }
  if (status === 401) {
    return 'ElevenLabs rejected TTS — check your API key or verify the cloned voice in your ElevenLabs account'
  }
  if (detail) return `ElevenLabs TTS error (${status}): ${detail}`
  return `ElevenLabs TTS error (${status})`
}

/**
 * Call ElevenLabs with the server API key. Never logs the key.
 */
export async function elevenLabsFetch(
  url: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<ElevenLabsFetchResult> {
  const apiKey = getElevenLabsApiKey()
  if (!apiKey) {
    return { ok: false, status: 503, detail: 'ELEVENLABS_API_KEY is not configured' }
  }

  const { headers: extraHeaders = {}, ...rest } = init
  let response: Response
  try {
    response = await fetch(url, {
      ...rest,
      headers: {
        'xi-api-key': apiKey,
        ...extraHeaders,
      },
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'network error'
    console.error('[elevenlabs] unreachable:', detail)
    return { ok: false, status: 502, detail }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('[elevenlabs] error:', response.status, detail)
    return { ok: false, status: response.status, detail }
  }

  return { ok: true, response }
}

export type VoiceCloneApiResponse = {
  voice_id?: string
  requires_verification?: boolean
}

export function parseVoiceCloneResponse(data: VoiceCloneApiResponse): {
  voiceId: string | null
  requiresVerification: boolean
} {
  return {
    voiceId: data.voice_id ?? null,
    requiresVerification: data.requires_verification === true,
  }
}
