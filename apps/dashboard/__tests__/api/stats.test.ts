import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fakeSession, fakeFamilyMember } from '../helpers'
import * as mocks from '../mocks'

vi.mock('@glance/shared/db', async () => ({ db: (await import('../mocks')).db }))
vi.mock('@/lib/auth', async () => ({ auth: (await import('../mocks')).auth }))
vi.mock('next/headers', async () => ({ headers: (await import('../mocks')).headers }))
vi.mock('@/lib/caregiver-auth', async () => {
  const m = await import('../mocks')
  return { getFamilyMemberFromSession: m.getFamilyMemberFromSession }
})

import { GET as getStats } from '@/app/api/stats/route'

beforeEach(() => {
  mocks.resetMocks()
})

describe('GET /api/stats — caregiver-scoped counts', () => {
  it('401 without a session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await getStats()
    expect(res.status).toBe(401)
    expect(mocks.dbCalls.select).toBe(0)
  })

  it('404 when the session has no family member', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(null)
    const res = await getStats()
    expect(res.status).toBe(404)
    expect(mocks.dbCalls.select).toBe(0)
  })

  it('returns today’s scoped message + help-request counts', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.queueResult([{ value: 12 }]) // messages sent today
    mocks.queueResult([{ value: 3 }]) // help requests today
    const res = await getStats()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messagesToday: 12, helpRequestsToday: 3 })
    expect(mocks.dbCalls.select).toBe(2)
  })

  it('defaults to zero when the counts return no rows', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    const res = await getStats()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messagesToday: 0, helpRequestsToday: 0 })
  })
})
