import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeRequest, makeContext, fakeSession, fakeFamilyMember, UUID_A, UUID_B } from '../helpers'
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

import { GET as listPatients } from '@/app/api/patients/route'
import { PATCH as patchPatient } from '@/app/api/patients/[id]/route'
import { POST as registerPatient } from '@/app/api/patients/register/route'
import { POST as linkPatient } from '@/app/api/patients/link/route'

beforeEach(() => {
  mocks.resetMocks()
  delete process.env.WS_SERVER_URL
})

describe('GET /api/patients — scoped list', () => {
  it('401 without a session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await listPatients()
    expect(res.status).toBe(401)
    expect(mocks.dbCalls.select).toBe(0)
  })

  it('404 when the session has no family member', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(null)
    const res = await listPatients()
    expect(res.status).toBe(404)
  })

  it('returns the caller’s associated patients with unseen counts attached', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.queueResult([{ id: UUID_A, name: 'Grandpa' }]) // patient list
    mocks.queueResult([{ patientId: UUID_A, value: 3 }]) // unseen-count rollup
    const res = await listPatients()
    expect(res.status).toBe(200)
    // Each patient is annotated with its outstanding (unseen) family-message count.
    expect(await res.json()).toEqual([{ id: UUID_A, name: 'Grandpa', unseenCount: 3 }])
    expect(mocks.dbCalls.select).toBe(2) // patient list + unseen rollup
  })

  it('defaults unseenCount to 0 when a patient has no outstanding messages', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.queueResult([{ id: UUID_A, name: 'Grandpa' }]) // patient list
    mocks.queueResult([]) // no unseen messages
    const res = await listPatients()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: UUID_A, name: 'Grandpa', unseenCount: 0 }])
  })
})

describe('PATCH /api/patients/[id] — rename scoping', () => {
  it('403 when the caregiver is not associated — no write', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue(null)
    const res = await patchPatient(makeRequest({ body: { name: 'Uncle Bob' } }), makeContext({ id: UUID_A }))
    expect(res.status).toBe(403)
    expect(mocks.dbCalls.update).toBe(0)
  })

  it('400 on an empty name', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue({ role: 'primary_caregiver' })
    const res = await patchPatient(makeRequest({ body: { name: '' } }), makeContext({ id: UUID_A }))
    expect(res.status).toBe(400)
  })

  it('200 and renames when associated', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.getCaregiverAccess.mockResolvedValue({ role: 'primary_caregiver' })
    mocks.queueResult([{ id: UUID_A, name: 'Uncle Bob' }])
    const res = await patchPatient(makeRequest({ body: { name: 'Uncle Bob' } }), makeContext({ id: UUID_A }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: UUID_A, name: 'Uncle Bob' })
    expect(mocks.dbCalls.update).toBe(1)
  })
})

describe('POST /api/patients/register', () => {
  it('401 without a session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await registerPatient(makeRequest({ body: { name: 'Grandpa' } }))
    expect(res.status).toBe(401)
  })

  it('400 on an empty name', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    const res = await registerPatient(makeRequest({ body: { name: '' } }))
    expect(res.status).toBe(400)
  })

  it('201 provisions a patient and links the caller as primary', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.queueResult([{ id: UUID_A, name: 'Grandpa', deviceToken: UUID_B }]) // insert patient returning
    mocks.queueResult([]) // insert link
    const res = await registerPatient(makeRequest({ body: { name: 'Grandpa' } }))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ id: UUID_A, name: 'Grandpa', deviceToken: UUID_B })
    expect(mocks.dbCalls.insert).toBe(2) // patient + caregiver link
  })
})

describe('POST /api/patients/link', () => {
  it('400 on a non-UUID device token', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    const res = await linkPatient(makeRequest({ body: { deviceToken: 'nope' } }))
    expect(res.status).toBe(400)
  })

  it('404 when no patient matches the device token', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.queueResult([]) // patient lookup → none
    const res = await linkPatient(makeRequest({ body: { deviceToken: UUID_B } }))
    expect(res.status).toBe(404)
    expect(mocks.dbCalls.insert).toBe(0)
  })

  it('409 when already linked', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.queueResult([{ id: UUID_A, name: 'Grandpa', deviceToken: UUID_B }]) // patient
    mocks.queueResult([{ id: 'link-1' }]) // existing link
    const res = await linkPatient(makeRequest({ body: { deviceToken: UUID_B } }))
    expect(res.status).toBe(409)
    expect(mocks.dbCalls.insert).toBe(0)
  })

  it('200 and links a valid, unlinked patient', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    mocks.getFamilyMemberFromSession.mockResolvedValue(fakeFamilyMember)
    mocks.queueResult([{ id: UUID_A, name: 'Grandpa', deviceToken: UUID_B }]) // patient
    mocks.queueResult([]) // no existing link
    mocks.queueResult([]) // insert link
    const res = await linkPatient(makeRequest({ body: { deviceToken: UUID_B } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: UUID_A, name: 'Grandpa' })
    expect(mocks.dbCalls.insert).toBe(1)
  })
})
