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

  it('returns today’s scoped message + help-request counts and avg response', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.queueResult([{ value: 12 }]) // messages sent today
    mocks.queueResult([{ value: 3 }]) // help requests today
    mocks.queueResult([{ avgSeconds: '90' }]) // avg yes/no response (seconds, pg numeric → string)
    const res = await getStats()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messagesToday: 12, helpRequestsToday: 3, avgResponseSeconds: 90 })
    expect(mocks.dbCalls.select).toBe(3)
  })

  it('reports a null avg response when no yes/no question was answered today', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.queueResult([{ value: 5 }]) // messages sent today
    mocks.queueResult([{ value: 0 }]) // help requests today
    mocks.queueResult([{ avgSeconds: null }]) // no answered questions → avg is null
    const res = await getStats()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messagesToday: 5, helpRequestsToday: 0, avgResponseSeconds: null })
  })

  it('defaults to zero/null when the queries return no rows', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    const res = await getStats()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messagesToday: 0, helpRequestsToday: 0, avgResponseSeconds: null })
  })
})
