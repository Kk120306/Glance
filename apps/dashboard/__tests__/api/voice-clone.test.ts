import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  makeRequest,
  fakeSession,
  fakeFamilyMember,
  UUID_B,
} from '../helpers'
import * as mocks from '../mocks'

vi.mock('@glance/shared/db', async () => ({ db: (await import('../mocks')).db }))
vi.mock('@/lib/auth', async () => ({ auth: (await import('../mocks')).auth }))
vi.mock('next/headers', async () => ({ headers: (await import('../mocks')).headers }))
vi.mock('@/lib/caregiver-auth', async () => {
  const m = await import('../mocks')
  return { getFamilyMemberFromSession: m.getFamilyMemberFromSession }
})

import { POST } from '@/app/api/personas/[id]/voice-clone/route'

beforeEach(() => {
  mocks.resetMocks()
  process.env.ELEVENLABS_API_KEY = 'test-key'
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ voice_id: 'new-voice-id', requires_verification: true }), {
        status: 200,
      }),
    ),
  )
})

describe('POST /api/personas/:id/voice-clone', () => {
  it('returns requiresVerification when ElevenLabs flags the clone', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.queueResult([{ id: UUID_B, name: 'Kid', familyMemberId: fakeFamilyMember.id }])

    const form = new FormData()
    form.append('audio', new File(['audio'], 'voice.webm', { type: 'audio/webm' }))

    const req = {
      formData: async () => form,
    } as unknown as import('next/server').NextRequest

    const res = await POST(req, { params: Promise.resolve({ id: UUID_B }) })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { voiceId: string; requiresVerification: boolean }
    expect(body.voiceId).toBe('new-voice-id')
    expect(body.requiresVerification).toBe(true)
    expect(mocks.dbCalls.update).toBe(1)
  })
})
