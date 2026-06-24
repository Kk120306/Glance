import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeRequest, makeContext, UUID_A, UUID_B, UUID_C } from '../helpers'
import * as mocks from '../mocks'

// Patient-token routes authenticate via the `x-device-token` header (no
// caregiver session), so only the db boundary needs mocking.
vi.mock('@glance/shared/db', async () => ({ db: (await import('../mocks')).db }))

import { POST as sos } from '@/app/api/patients/[id]/sos/route'
import { POST as patientMessage } from '@/app/api/messages/patient/route'
import { POST as reply } from '@/app/api/messages/[id]/reply/route'
import { PATCH as markRead } from '@/app/api/messages/[id]/read/route'

const TOKEN = '44444444-4444-4444-8444-444444444444'

beforeEach(() => {
  mocks.resetMocks()
  delete process.env.WS_SERVER_URL
})

describe('POST /api/patients/[id]/sos — device-token auth', () => {
  it('401 when the device token header is missing', async () => {
    const res = await sos(makeRequest(), makeContext({ id: UUID_A }))
    expect(res.status).toBe(401)
    expect(mocks.dbCalls.select).toBe(0)
  })

  it('401 when the device token matches no patient', async () => {
    mocks.queueResult([]) // no patient
    const res = await sos(makeRequest({ headers: { 'x-device-token': TOKEN } }), makeContext({ id: UUID_A }))
    expect(res.status).toBe(401)
  })

  it('403 when the token’s patient differs from the URL id (no cross-patient SOS)', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    const res = await sos(makeRequest({ headers: { 'x-device-token': TOKEN } }), makeContext({ id: UUID_B }))
    expect(res.status).toBe(403)
  })

  it('200 when the token’s patient matches the URL id', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    const res = await sos(makeRequest({ headers: { 'x-device-token': TOKEN } }), makeContext({ id: UUID_A }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})

describe('POST /api/messages/patient — device-token auth', () => {
  it('401 without a device token', async () => {
    const res = await patientMessage(makeRequest({ body: { content: 'Water please' } }))
    expect(res.status).toBe(401)
    expect(mocks.dbCalls.insert).toBe(0)
  })

  it('401 when the token matches no patient', async () => {
    mocks.queueResult([])
    const res = await patientMessage(makeRequest({ headers: { 'x-device-token': TOKEN }, body: { content: 'Water please' } }))
    expect(res.status).toBe(401)
  })

  it('400 on an invalid body', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }])
    const res = await patientMessage(makeRequest({ headers: { 'x-device-token': TOKEN }, body: { content: '' } }))
    expect(res.status).toBe(400)
    expect(mocks.dbCalls.insert).toBe(0)
  })

  it('201 persists a valid patient phrase', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([{ id: 'msg-1', content: 'Water please' }]) // insert returning
    const res = await patientMessage(makeRequest({ headers: { 'x-device-token': TOKEN }, body: { content: 'Water please' } }))
    expect(res.status).toBe(201)
    expect(mocks.dbCalls.insert).toBe(1)
    // No reply target → no persona ownership lookup runs (patient select only).
    expect(mocks.dbCalls.select).toBe(1)
  })

  it('400 on a non-UUID replyToPersonaId', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    const res = await patientMessage(
      makeRequest({ headers: { 'x-device-token': TOKEN }, body: { content: 'Yes', replyToPersonaId: 'nope' } }),
    )
    expect(res.status).toBe(400)
    expect(mocks.dbCalls.insert).toBe(0)
  })

  it('201 scopes a reply to a persona linked to this patient', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([{ id: UUID_B }]) // persona ownership/link lookup → linked
    mocks.queueResult([{ id: 'msg-1', content: 'Yes', personaId: UUID_B }]) // insert returning
    const res = await patientMessage(
      makeRequest({ headers: { 'x-device-token': TOKEN }, body: { content: 'Yes', replyToPersonaId: UUID_B } }),
    )
    expect(res.status).toBe(201)
    expect(mocks.dbCalls.insert).toBe(1)
    // Patient lookup + persona-link lookup both ran.
    expect(mocks.dbCalls.select).toBe(2)
  })

  it('201 but drops a persona not linked to this patient (stored as null)', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([]) // persona link lookup → not found
    mocks.queueResult([{ id: 'msg-1', content: 'Yes', personaId: null }]) // insert returning
    const res = await patientMessage(
      makeRequest({ headers: { 'x-device-token': TOKEN }, body: { content: 'Yes', replyToPersonaId: UUID_C } }),
    )
    // Still persists (never block the patient from speaking) — just unscoped.
    expect(res.status).toBe(201)
    expect(mocks.dbCalls.insert).toBe(1)
  })
})

describe('POST /api/messages/[id]/reply — device-token auth', () => {
  it('401 without a device token', async () => {
    const res = await reply(makeRequest({ body: { reply: 'yes' } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(401)
  })

  it('404 when the message does not exist', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([]) // message lookup → none
    const res = await reply(makeRequest({ headers: { 'x-device-token': TOKEN }, body: { reply: 'yes' } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(404)
  })

  it('403 when replying to another patient’s message', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([{ id: UUID_C, recipientId: UUID_B, senderId: 'fm-1' }]) // message for a different patient
    const res = await reply(makeRequest({ headers: { 'x-device-token': TOKEN }, body: { reply: 'yes' } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(403)
    expect(mocks.dbCalls.update).toBe(0)
  })

  it('400 on an invalid reply value', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([{ id: UUID_C, recipientId: UUID_A, senderId: 'fm-1' }]) // message
    const res = await reply(makeRequest({ headers: { 'x-device-token': TOKEN }, body: { reply: 'maybe' } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(400)
    expect(mocks.dbCalls.update).toBe(0)
  })

  it('200 records a valid yes/no reply', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([{ id: UUID_C, recipientId: UUID_A, senderId: 'fm-1', isRead: false }]) // message
    const res = await reply(makeRequest({ headers: { 'x-device-token': TOKEN }, body: { reply: 'yes' } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(200)
    expect(mocks.dbCalls.update).toBe(1)
    expect(mocks.lastUpdateSet).toMatchObject({ reply: 'yes', isRead: true })
  })

  it('200 on an already-read message still records the reply', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([{ id: UUID_C, recipientId: UUID_A, senderId: 'fm-1', isRead: true }]) // already seen
    const res = await reply(makeRequest({ headers: { 'x-device-token': TOKEN }, body: { reply: 'no' } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(200)
    expect(mocks.dbCalls.update).toBe(1)
    expect(mocks.lastUpdateSet).toMatchObject({ reply: 'no', isRead: true })
  })
})

describe('PATCH /api/messages/[id]/read — device-token read receipts', () => {
  it('401 without a device token', async () => {
    const res = await markRead(makeRequest(), makeContext({ id: UUID_C }))
    expect(res.status).toBe(401)
    expect(mocks.dbCalls.update).toBe(0)
  })

  it('404 when the message does not exist', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([]) // message lookup → none
    const res = await markRead(makeRequest({ headers: { 'x-device-token': TOKEN } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(404)
  })

  it('403 when marking another patient’s message', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([{ id: UUID_C, recipientId: UUID_B, senderId: 'fm-1', isRead: false }]) // other patient
    const res = await markRead(makeRequest({ headers: { 'x-device-token': TOKEN } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(403)
    expect(mocks.dbCalls.update).toBe(0)
  })

  it('403 for a patient-initiated message (no read receipt)', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([{ id: UUID_C, recipientId: UUID_A, senderId: null, isRead: false }]) // patient phrase
    const res = await markRead(makeRequest({ headers: { 'x-device-token': TOKEN } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(403)
    expect(mocks.dbCalls.update).toBe(0)
  })

  it('200 is idempotent when already read — no second write', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([{ id: UUID_C, recipientId: UUID_A, senderId: 'fm-1', isRead: true }]) // already seen
    const res = await markRead(makeRequest({ headers: { 'x-device-token': TOKEN } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, alreadyRead: true })
    expect(mocks.dbCalls.update).toBe(0)
  })

  it('200 marks an unseen family message as read', async () => {
    mocks.queueResult([{ id: UUID_A, deviceToken: TOKEN }]) // patient
    mocks.queueResult([{ id: UUID_C, recipientId: UUID_A, senderId: 'fm-1', isRead: false }]) // unseen
    const res = await markRead(makeRequest({ headers: { 'x-device-token': TOKEN } }), makeContext({ id: UUID_C }))
    expect(res.status).toBe(200)
    expect(mocks.dbCalls.update).toBe(1)
  })
})
