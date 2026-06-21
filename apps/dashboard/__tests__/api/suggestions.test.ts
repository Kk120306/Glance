import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeRequest, UUID_A } from '../helpers'
import * as mocks from '../mocks'

// The suggestions route authenticates via the `x-device-token` header (no
// caregiver session), so only the db boundary needs mocking.
vi.mock('@glance/shared/db', async () => ({ db: (await import('../mocks')).db }))

import { POST } from '@/app/api/suggestions/route'

const TOKEN = '44444444-4444-4444-8444-444444444444'

beforeEach(() => {
  mocks.resetMocks()
  // With no API key the ranker returns the curated list unchanged — keeps the
  // suite hermetic and asserts the AI-Content-Gate invariant directly.
  delete process.env.OPENAI_API_KEY
})

describe('POST /api/suggestions — device-token phrase ranking', () => {
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

  it('400 on an invalid body (missing phrases)', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    const res = await POST(
      makeRequest({ headers: { 'x-device-token': TOKEN }, body: { messageContent: 'hi' } }),
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

  it('200 returns only the caller-supplied curated phrases (no generation)', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    const phrases = ['Yes', 'No', 'Thank you']
    const res = await POST(
      makeRequest({
        headers: { 'x-device-token': TOKEN },
        body: { messageContent: 'Are you comfortable?', phrases },
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { suggestions: string[] }
    // Identity ordering with no API key — proves nothing off-library is returned.
    expect(data.suggestions).toEqual(phrases)
  })
})
