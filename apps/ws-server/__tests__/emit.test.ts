import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const SECRET = 'test-secret-xyz'

process.env.WS_INTERNAL_SECRET = SECRET
process.env.PORT = '4099'

let server: { close: (cb?: () => void) => void }

beforeAll(async () => {
  const { createServer } = await import('http')
  const express = (await import('express')).default
  const app = express()
  app.use(express.json())

  app.post('/emit', (req, res) => {
    const secret = req.headers['x-internal-secret']
    if (secret !== SECRET) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const body = req.body as { targetPatientId?: unknown; targetFamilyMemberId?: unknown; event?: unknown }
    if (!body?.event) {
      res.status(400).json({ error: 'Invalid body: missing event' })
      return
    }
    if (!body.targetPatientId && !body.targetFamilyMemberId) {
      res.status(400).json({ error: 'Invalid body: must specify targetPatientId or targetFamilyMemberId' })
      return
    }
    res.status(204).end()
  })

  server = createServer(app).listen(4099)
  await new Promise<void>((resolve) => server.close ? (server.close(), resolve()) : resolve())
  server = createServer(app).listen(4099)
  await new Promise<void>((resolve) => setTimeout(resolve, 50))
})

afterAll(() => {
  server.close()
})

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`http://localhost:4099${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('ws-server /emit', () => {
  it('returns 401 when secret is missing', async () => {
    const res = await post('/emit', { targetPatientId: 'p1', event: { type: 'NEW_MESSAGE', payload: {} } })
    expect(res.status).toBe(401)
  })

  it('returns 401 when secret is wrong', async () => {
    const res = await post(
      '/emit',
      { targetPatientId: 'p1', event: { type: 'NEW_MESSAGE', payload: {} } },
      { 'x-internal-secret': 'bad-secret' },
    )
    expect(res.status).toBe(401)
  })

  it('returns 204 with valid secret, targetPatientId, and event', async () => {
    const res = await post(
      '/emit',
      { targetPatientId: 'patient-uuid', event: { type: 'MESSAGE_READ', payload: { id: 'msg-1' } } },
      { 'x-internal-secret': SECRET },
    )
    expect(res.status).toBe(204)
  })

  it('returns 204 with valid secret, targetFamilyMemberId, and event', async () => {
    const res = await post(
      '/emit',
      { targetFamilyMemberId: 'family-uuid', event: { type: 'NEW_REPLY', payload: { messageId: 'm-1', reply: 'yes', repliedAt: new Date().toISOString() } } },
      { 'x-internal-secret': SECRET },
    )
    expect(res.status).toBe(204)
  })

  it('returns 400 with valid secret but missing event', async () => {
    const res = await post(
      '/emit',
      { targetPatientId: 'p1' },
      { 'x-internal-secret': SECRET },
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 with valid secret but missing target', async () => {
    const res = await post(
      '/emit',
      { event: { type: 'MESSAGE_READ', payload: { id: 'x' } } },
      { 'x-internal-secret': SECRET },
    )
    expect(res.status).toBe(400)
  })
})
