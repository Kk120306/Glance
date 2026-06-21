import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  makeRequest,
  fakeSession,
  fakeFamilyMember,
  UUID_A,
} from '../helpers'
import * as mocks from '../mocks'

// Mock every module-eval side effect and authorization boundary before the
// route is imported. Factories only do a dynamic import of the shared mock
// singletons — no closure over test-scope vars, so no hoisting hazard.
vi.mock('@glance/shared/db', async () => ({ db: (await import('../mocks')).db }))
vi.mock('@/lib/auth', async () => ({ auth: (await import('../mocks')).auth }))
vi.mock('next/headers', async () => ({ headers: (await import('../mocks')).headers }))
vi.mock('@/lib/tone-classifier', async () => ({
  classifyTone: (await import('../mocks')).classifyTone,
}))
vi.mock('@/lib/caregiver-auth', async () => {
  const m = await import('../mocks')
  return {
    getFamilyMemberFromSession: m.getFamilyMemberFromSession,
    getCaregiverAccess: m.getCaregiverAccess,
  }
})

import { GET, POST } from '@/app/api/messages/route'

beforeEach(() => {
  mocks.resetMocks()
  delete process.env.WS_SERVER_URL // never reach out to a ws-server in tests
})

describe('GET /api/messages — caregiver read scoping', () => {
  it('401 when there is no session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await GET(makeRequest({ url: `http://x/api/messages?patientId=${UUID_A}` }))
    expect(res.status).toBe(401)
    expect(mocks.dbCalls.select).toBe(0)
  })

  it('400 when patientId query param is missing', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    const res = await GET(makeRequest({ url: 'http://x/api/messages' }))
    expect(res.status).toBe(400)
  })

  it('404 when the session has no family member', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(null)
    const res = await GET(makeRequest({ url: `http://x/api/messages?patientId=${UUID_A}` }))
    expect(res.status).toBe(404)
  })

  it('403 when the caregiver is not associated with the patient', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue(null) // no patient_caregivers link
    const res = await GET(makeRequest({ url: `http://x/api/messages?patientId=${UUID_A}` }))
    expect(res.status).toBe(403)
    // Critical: the message query must NOT run for an unauthorized caregiver.
    expect(mocks.dbCalls.select).toBe(0)
    expect(mocks.getCaregiverAccess).toHaveBeenCalledWith(fakeFamilyMember.id, UUID_A)
  })

  it('200 and returns rows when the caregiver is associated', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue({ role: 'caregiver' })
    mocks.queueResult([{ id: 'm1', content: 'hi' }])
    const res = await GET(makeRequest({ url: `http://x/api/messages?patientId=${UUID_A}` }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 'm1', content: 'hi' }])
    expect(mocks.dbCalls.select).toBe(1)
  })
})

describe('POST /api/messages — caregiver compose scoping', () => {
  const validBody = { content: 'Hello there', recipientId: UUID_A }

  it('401 when there is no session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ body: validBody }))
    expect(res.status).toBe(401)
  })

  it('400 on an invalid body (empty content)', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    const res = await POST(makeRequest({ body: { content: '', recipientId: UUID_A } }))
    expect(res.status).toBe(400)
  })

  it('400 on a non-UUID recipientId', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    const res = await POST(makeRequest({ body: { content: 'hi', recipientId: 'not-a-uuid' } }))
    expect(res.status).toBe(400)
  })

  it('403 when the caregiver is not associated with the recipient', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue(null)
    const res = await POST(makeRequest({ body: validBody }))
    expect(res.status).toBe(403)
    // No message may be inserted for an unauthorized recipient.
    expect(mocks.dbCalls.insert).toBe(0)
  })

  it('201 and inserts when the caregiver is associated', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue({ role: 'caregiver' })
    mocks.queueResult([{ id: UUID_A, name: 'Grandpa' }]) // patient lookup
    mocks.queueResult([{ id: 'm1', content: 'Hello there', toneClass: 'neutral' }]) // insert returning
    const res = await POST(makeRequest({ body: validBody }))
    expect(res.status).toBe(201)
    expect(mocks.dbCalls.insert).toBe(1)
  })
})
