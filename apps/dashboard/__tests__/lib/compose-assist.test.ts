import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { previewCompose, generateTemplates } from '@/lib/compose-assist'

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

beforeEach(() => {
  delete process.env.OPENAI_API_KEY
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('previewCompose', () => {
  it('returns neutral fallback when API key is missing', async () => {
    const result = await previewCompose('Hello there')
    expect(result).toEqual({ tone: 'neutral', isYesNo: false })
  })

  it('parses tone and isYesNo from model JSON', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('{"tone":"warm","isYesNo":false}')
    const result = await previewCompose('I love you')
    expect(result).toEqual({ tone: 'warm', isYesNo: false })
  })

  it('detects yes/no questions', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('{"tone":"neutral","isYesNo":true}')
    const result = await previewCompose('Can you hear me okay?')
    expect(result.isYesNo).toBe(true)
  })

  it('falls back on HTTP error', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('', 500)
    const result = await previewCompose('Emergency!')
    expect(result).toEqual({ tone: 'neutral', isYesNo: false })
  })

  it('falls back on unparseable output', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('this looks like a yes/no question')
    const result = await previewCompose('Are you comfortable?')
    expect(result).toEqual({ tone: 'neutral', isYesNo: false })
  })

  it('coerces invalid tone to neutral', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('{"tone":"angry","isYesNo":false}')
    const result = await previewCompose('Hi')
    expect(result.tone).toBe('neutral')
  })
})

describe('generateTemplates', () => {
  it('returns default templates when API key is missing', async () => {
    const result = await generateTemplates('Alex')
    expect(result).toHaveLength(3)
    expect(result[0]).toContain('Thinking of you')
  })

  it('parses three templates from model JSON', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI(
      '{"templates":["Hi Alex — how are you?","Sending love your way.","Need anything from me?"]}',
    )
    const result = await generateTemplates('Alex')
    expect(result).toEqual([
      'Hi Alex — how are you?',
      'Sending love your way.',
      'Need anything from me?',
    ])
  })

  it('falls back when fewer than three templates returned', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockOpenAI('{"templates":["Only one"]}')
    const result = await generateTemplates('Alex')
    expect(result).toHaveLength(3)
    expect(result[0]).toContain('Thinking of you')
  })

  it('truncates long templates to 120 chars', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const long = 'A'.repeat(150)
    mockOpenAI(`{"templates":["${long}","Short one","Another short"]}`)
    const result = await generateTemplates('Alex')
    expect(result[0]).toHaveLength(120)
  })
})
