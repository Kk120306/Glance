import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeRequest, makeContext, fakeSession, fakeFamilyMember, UUID_A } from '../helpers'
import * as mocks from '../mocks'

vi.mock('@glance/shared/db', async () => ({ db: (await import('../mocks')).db }))
vi.mock('@/lib/auth', async () => ({ auth: (await import('../mocks')).auth }))
vi.mock('next/headers', async () => ({ headers: (await import('../mocks')).headers }))
vi.mock('@/lib/caregiver-auth', async () => {
  const m = await import('../mocks')
  return {
    getFamilyMemberFromSession: m.getFamilyMemberFromSession,
    getCaregiverAccess: m.getCaregiverAccess,
  }
})

import { GET, POST } from '@/app/api/patients/[id]/camera-config/route'

beforeEach(() => {
  mocks.resetMocks()
  delete process.env.WS_SERVER_URL
})

describe('GET /api/patients/[id]/camera-config — scoping', () => {
  it('401 without a session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await GET(makeRequest(), makeContext({ id: UUID_A }))
    expect(res.status).toBe(401)
  })

  it('404 when the session has no family member', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(null)
    const res = await GET(makeRequest(), makeContext({ id: UUID_A }))
    expect(res.status).toBe(404)
  })

  it('403 when the caregiver is not associated', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue(null)
    const res = await GET(makeRequest(), makeContext({ id: UUID_A }))
    expect(res.status).toBe(403)
    expect(mocks.dbCalls.select).toBe(0)
  })

  it('200 with config when associated', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue({ role: 'caregiver' })
    mocks.queueResult([{ id: UUID_A, cameraOverrideActive: false }]) // patient
    mocks.queueResult([]) // schedules
    const res = await GET(makeRequest(), makeContext({ id: UUID_A }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cameraOverrideActive: false, schedules: [] })
  })
})

describe('POST /api/patients/[id]/camera-config — scoping & validation', () => {
  it('401 without a session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ body: {} }), makeContext({ id: UUID_A }))
    expect(res.status).toBe(401)
  })

  it('403 when the caregiver is not associated — and no write happens', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue(null)
    const res = await POST(
      makeRequest({ body: { cameraOverrideActive: true } }),
      makeContext({ id: UUID_A }),
    )
    expect(res.status).toBe(403)
    expect(mocks.dbCalls.transaction).toBe(0)
    expect(mocks.dbCalls.update).toBe(0)
  })

  it('400 on an invalid schedule body', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue({ role: 'caregiver' })
    mocks.queueResult([{ id: UUID_A, cameraOverrideActive: false }]) // patient lookup
    const res = await POST(
      makeRequest({ body: { schedules: [{ dayOfWeek: 9, startTime: 'bad', endTime: '10:00', timezone: 'UTC' }] } }),
      makeContext({ id: UUID_A }),
    )
    expect(res.status).toBe(400)
  })

  it('200 and writes when associated with a valid body', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue({ role: 'caregiver' })
    mocks.queueResult([{ id: UUID_A, cameraOverrideActive: false }]) // patient lookup
    mocks.queueResult([]) // schedules after write
    mocks.queueResult([{ id: UUID_A, cameraOverrideActive: true }]) // updated patient
    const res = await POST(
      makeRequest({ body: { cameraOverrideActive: true, schedules: [] } }),
      makeContext({ id: UUID_A }),
    )
    expect(res.status).toBe(200)
    expect(mocks.dbCalls.transaction).toBe(1)
  })
})
