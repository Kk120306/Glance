import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const DEVICE_TOKEN = 'test-device-token-1234'

// We import middleware after setting the env var
let middleware: (req: NextRequest) => Response | Promise<Response>

beforeEach(async () => {
  process.env.PATIENT_DEVICE_TOKEN = DEVICE_TOKEN
  // Re-import to pick up env
  const mod = await import('../src/middleware')
  middleware = mod.middleware
})

afterEach(() => {
  delete process.env.PATIENT_DEVICE_TOKEN
})

function makeRequest(url: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(url)
  for (const [key, value] of Object.entries(cookies)) {
    req.cookies.set(key, value)
  }
  return req
}

describe('patient middleware', () => {
  it('valid token → sets cookie and redirects to /', async () => {
    const req = makeRequest(`http://localhost:3000/?token=${DEVICE_TOKEN}`)
    const res = await middleware(req)
    expect(res.status).toBe(307)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('x-device-token')
    expect(setCookie).toContain(DEVICE_TOKEN)
    expect(res.headers.get('location')).toMatch(/\/$/)
  })

  it('wrong token → 403, no cookie set', async () => {
    const req = makeRequest('http://localhost:3000/?token=wrong-token')
    const res = await middleware(req)
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('valid cookie → passes through (200)', async () => {
    const req = makeRequest('http://localhost:3000/', { 'x-device-token': DEVICE_TOKEN })
    const res = await middleware(req)
    // NextResponse.next() returns 200
    expect(res.status).toBe(200)
  })

  it('missing cookie → 403', async () => {
    const req = makeRequest('http://localhost:3000/')
    const res = await middleware(req)
    expect(res.status).toBe(403)
  })

  it('mismatched cookie → 403', async () => {
    const req = makeRequest('http://localhost:3000/', { 'x-device-token': 'wrong' })
    const res = await middleware(req)
    expect(res.status).toBe(403)
  })
})
