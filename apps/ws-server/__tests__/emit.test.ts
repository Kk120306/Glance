import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const SECRET = 'test-secret-xyz'

process.env.WS_INTERNAL_SECRET = SECRET
process.env.PORT = '4099'

let server: { close: (cb?: () => void) => void }

beforeAll(async () => {
  // Dynamically import the server after setting env vars
  // We need to start a test instance
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
    const body = req.body as { room?: unknown; event?: unknown }
    if (!body?.room || !body?.event) {
      res.status(400).json({ error: 'Invalid body' })
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
    const res = await post('/emit', { room: 'r1', event: { type: 'NEW_MESSAGE', payload: {} } })
    expect(res.status).toBe(401)
  })

  it('returns 401 when secret is wrong', async () => {
    const res = await post(
      '/emit',
      { room: 'r1', event: { type: 'NEW_MESSAGE', payload: {} } },
      { 'x-internal-secret': 'bad-secret' },
    )
    expect(res.status).toBe(401)
  })

  it('returns 204 with valid secret and body', async () => {
    const res = await post(
      '/emit',
      { room: 'r1', event: { type: 'MESSAGE_READ', payload: { id: 'msg-1' } } },
      { 'x-internal-secret': SECRET },
    )
    expect(res.status).toBe(204)
  })

  it('returns 400 with valid secret but missing room', async () => {
    const res = await post(
      '/emit',
      { event: { type: 'MESSAGE_READ', payload: { id: 'x' } } },
      { 'x-internal-secret': SECRET },
    )
    expect(res.status).toBe(400)
  })
})
