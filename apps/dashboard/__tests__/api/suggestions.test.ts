import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { makeRequest, UUID_A } from '../helpers'
import * as mocks from '../mocks'

// The suggestions route authenticates via the `x-device-token` header (no
// caregiver session), so only the db boundary needs mocking.
vi.mock('@glance/shared/db', async () => ({ db: (await import('../mocks')).db }))

import { POST } from '@/app/api/suggestions/route'
import {
  parseIndexOrder,
  parseGeneratedReplies,
  rankPhrases,
  generateReplySuggestions,
  getSuggestions,
} from '@/lib/suggestions'

const TOKEN = '44444444-4444-4444-8444-444444444444'

const SAMPLE_REPLIES = JSON.stringify({
  replies: [
    { text: "Yes, I'm comfortable. Looking forward to your visit.", tone: 'Reassuring' },
    { text: 'Could you bring my reading glasses too? Thank you.', tone: 'Asking for something' },
    { text: "I'm okay. It always brightens my day when you visit.", tone: 'Warm' },
    { text: "I'm a little tired but doing well overall.", tone: 'Honest' },
    { text: 'Thank you for checking on me. That means a lot.', tone: 'Grateful' },
  ],
})

function mockOpenAI(content: string, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({
        choices: [{ message: { content } }],
      }),
    }),
  )
}

function lastFetchBody(): Record<string, unknown> {
  const calls = vi.mocked(fetch).mock.calls
  const last = calls[calls.length - 1]
  return JSON.parse(String(last?.[1]?.body))
}

beforeEach(() => {
  mocks.resetMocks()
  delete process.env.OPENAI_API_KEY
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseIndexOrder', () => {
  it('parses a JSON object with an order field', () => {
    expect(parseIndexOrder('{"order":[2,0,1]}', 3)).toEqual([2, 0, 1])
  })

  it('parses a bare JSON array', () => {
    expect(parseIndexOrder('[1,0,2]', 3)).toEqual([1, 0, 2])
  })

  it('extracts order from markdown-wrapped JSON', () => {
    expect(parseIndexOrder('Here is the result:\n{"order":[5,3,1]}\n', 6)).toEqual([5, 3, 1])
  })

  it('drops out-of-range indices', () => {
    expect(parseIndexOrder('{"order":[0,99,1]}', 3)).toEqual([0, 1])
  })

  it('returns empty on unparseable input', () => {
    expect(parseIndexOrder('phrase 3 is best because message mentions water at index 1', 5)).toEqual([])
  })
})

describe('parseGeneratedReplies', () => {
  it('parses replies with tone labels', () => {
    const result = parseGeneratedReplies(SAMPLE_REPLIES)
    expect(result).toHaveLength(5)
    expect(result[0]).toEqual({
      text: "Yes, I'm comfortable. Looking forward to your visit.",
      tone: 'Reassuring',
    })
  })

  it('drops empty and overlong entries', () => {
    const raw = JSON.stringify({
      replies: [
        { text: '', tone: 'Empty' },
        { text: 'a'.repeat(201), tone: 'Too long' },
        { text: 'Valid reply here.', tone: 'Good' },
      ],
    })
    expect(parseGeneratedReplies(raw)).toEqual([{ text: 'Valid reply here.', tone: 'Good' }])
  })

  it('deduplicates case-insensitively', () => {
    const raw = JSON.stringify({
      replies: [
        { text: 'Thank you.', tone: 'Warm' },
        { text: 'thank you.', tone: 'Warm' },
        { text: 'I am okay.', tone: 'Reassuring' },
        { text: 'Doing fine.', tone: 'Honest' },
      ],
    })
    expect(parseGeneratedReplies(raw)).toHaveLength(3)
  })

  it('returns empty on unparseable input', () => {
    expect(parseGeneratedReplies('not json')).toEqual([])
  })
})

describe('generateReplySuggestions', () => {
  it('returns null when API key is missing', async () => {
    const result = await generateReplySuggestions('Are you comfortable?', [], { regenerate: false })
    expect(result).toBeNull()
  })

  it('returns generated suggestions with ranked:true', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI(SAMPLE_REPLIES)
    const result = await generateReplySuggestions('Are you comfortable?', [], {
      regenerate: false,
      senderName: 'Maya',
    })
    expect(result).not.toBeNull()
    expect(result!.ranked).toBe(true)
    expect(result!.source).toBe('generated')
    expect(result!.suggestions.length).toBeGreaterThanOrEqual(3)
    expect(result!.suggestions[0]!.tone).toBe('Reassuring')
  })

  it('uses higher temperature when regenerate is true', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI(SAMPLE_REPLIES)
    await generateReplySuggestions('Are you comfortable?', [], { regenerate: true })
    expect(lastFetchBody().temperature).toBe(0.9)
  })

  it('uses lower temperature on initial fetch', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI(SAMPLE_REPLIES)
    await generateReplySuggestions('Are you comfortable?', [], { regenerate: false })
    expect(lastFetchBody().temperature).toBe(0.7)
  })

  it('returns null when OpenAI HTTP fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('', 500)
    const result = await generateReplySuggestions('Are you comfortable?', [], { regenerate: false })
    expect(result).toBeNull()
  })

  it('returns null when model output has too few valid replies', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI(JSON.stringify({ replies: [{ text: 'Only one.', tone: 'Warm' }] }))
    const result = await generateReplySuggestions('Are you comfortable?', [], { regenerate: false })
    expect(result).toBeNull()
  })
})

describe('getSuggestions', () => {
  it('returns generated suggestions when OpenAI succeeds', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI(SAMPLE_REPLIES)
    const result = await getSuggestions('Are you comfortable?', ['Thank you'], { regenerate: false })
    expect(result.source).toBe('generated')
    expect(result.ranked).toBe(true)
    expect(result.suggestions[0]!.text).toContain('comfortable')
  })

  it('falls back to ranked phrases when generation fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"order":[1,2,0]}' } }],
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const phrases = ['Need assistance', 'Water please', "I'm thirsty"]
    const result = await getSuggestions('Are you thirsty?', phrases, { regenerate: false })
    expect(result.source).toBe('ranked')
    expect(result.ranked).toBe(true)
    expect(result.suggestions[0]).toEqual({ text: 'Water please' })
  })

  it('returns fallback when generation fails and phrases are empty', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('', 500)
    const result = await getSuggestions('Are you ok?', [], { regenerate: false })
    expect(result).toEqual({ suggestions: [], ranked: false, source: 'fallback' })
  })

  it('returns ranked:false fallback when no API key and phrases provided', async () => {
    const phrases = ['Yes', 'No', 'Thank you']
    const result = await getSuggestions('Are you comfortable?', phrases, { regenerate: false })
    expect(result.source).toBe('fallback')
    expect(result.ranked).toBe(false)
    expect(result.suggestions).toEqual(phrases.map((text) => ({ text })))
  })
})

describe('rankPhrases', () => {
  it('returns ranked:false when API key is missing', async () => {
    const phrases = ['Yes', 'No', 'Thank you']
    const result = await rankPhrases('Are you comfortable?', phrases)
    expect(result).toEqual({ suggestions: phrases, ranked: false })
  })

  it('returns ranked:true when OpenAI returns a different order', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('{"order":[1,2,0]}')
    const phrases = ['Need assistance', 'Water please', "I'm thirsty"]
    const result = await rankPhrases('Are you thirsty?', phrases)
    expect(result.ranked).toBe(true)
    expect(result.suggestions[0]).toBe('Water please')
    expect(result.suggestions[1]).toBe("I'm thirsty")
  })

  it('returns ranked:false when OpenAI HTTP fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('', 500)
    const phrases = ['Yes', 'No']
    const result = await rankPhrases('Are you ok?', phrases)
    expect(result).toEqual({ suggestions: phrases, ranked: false })
  })

  it('returns ranked:false when model output is unparseable', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('I think phrase 2 is best')
    const phrases = ['Yes', 'No', 'Thank you']
    const result = await rankPhrases('Are you ok?', phrases)
    expect(result).toEqual({ suggestions: phrases, ranked: false })
  })
})

describe('POST /api/suggestions — device-token reply suggestions', () => {
  it('401 when the device token header is missing', async () => {
    const res = await POST(
      makeRequest({ body: { messageContent: 'Are you ok?', phrases: ['Yes', 'No'] } }),
    )
    expect(res.status).toBe(401)
    expect(mocks.dbCalls.select).toBe(0)
  })

  it('401 when the device token matches no patient', async () => {
    mocks.queueResult([]) // no patient
    const res = await POST(
      makeRequest({
        headers: { 'x-device-token': TOKEN },
        body: { messageContent: 'Are you ok?', phrases: ['Yes', 'No'] },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('400 on an invalid body (missing messageContent)', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    const res = await POST(
      makeRequest({ headers: { 'x-device-token': TOKEN }, body: { phrases: ['Yes'] } }),
    )
    expect(res.status).toBe(400)
  })

  it('400 on an empty message', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    const res = await POST(
      makeRequest({
        headers: { 'x-device-token': TOKEN },
        body: { messageContent: '', phrases: ['Yes'] },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('200 returns fallback when no API key', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    const phrases = ['Yes', 'No', 'Thank you']
    const res = await POST(
      makeRequest({
        headers: { 'x-device-token': TOKEN },
        body: { messageContent: 'Are you comfortable?', phrases },
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      suggestions: Array<{ text: string }>
      ranked: boolean
      source: string
    }
    expect(data.suggestions).toEqual(phrases.map((text) => ({ text })))
    expect(data.ranked).toBe(false)
    expect(data.source).toBe('fallback')
  })

  it('200 returns generated suggestions when OpenAI succeeds', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI(SAMPLE_REPLIES)
    const res = await POST(
      makeRequest({
        headers: { 'x-device-token': TOKEN },
        body: {
          messageContent: 'Are you comfortable?',
          senderName: 'Maya',
          phrases: ['Thank you', 'I am okay'],
        },
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      suggestions: Array<{ text: string; tone?: string }>
      ranked: boolean
      source: string
    }
    expect(data.ranked).toBe(true)
    expect(data.source).toBe('generated')
    expect(data.suggestions.length).toBeGreaterThanOrEqual(3)
    expect(data.suggestions[0]!.tone).toBe('Reassuring')
  })

  it('200 works without phrases (optional fallback list)', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI(SAMPLE_REPLIES)
    const res = await POST(
      makeRequest({
        headers: { 'x-device-token': TOKEN },
        body: { messageContent: 'Are you comfortable?' },
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ranked: boolean; source: string }
    expect(data.ranked).toBe(true)
    expect(data.source).toBe('generated')
  })
})
