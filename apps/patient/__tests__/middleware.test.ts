import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const DEVICE_TOKEN = 'test-device-token-1234'
const DB_TOKEN = '11111111-2222-3333-4444-555555555555'

// We import middleware after setting the env var
let middleware: (req: NextRequest) => Response | Promise<Response>

beforeEach(async () => {
  process.env.PATIENT_DEVICE_TOKEN = DEVICE_TOKEN
  // Default: dashboard says "unknown token" (404). Individual tests override.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  )
  // Re-import to pick up env
  const mod = await import('../src/middleware')
  middleware = mod.middleware
})

afterEach(() => {
  delete process.env.PATIENT_DEVICE_TOKEN
  vi.unstubAllGlobals()
  vi.resetModules()
})

function makeRequest(url: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(url)
  for (const [key, value] of Object.entries(cookies)) {
    req.cookies.set(key, value)
  }
  return req
}

describe('patient middleware', () => {
  it('valid static env token → sets cookie and redirects to / (no DB call)', async () => {
    const req = makeRequest(`http://localhost:3000/?token=${DEVICE_TOKEN}`)
    const res = await middleware(req)
    expect(res.status).toBe(307)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('x-device-token')
    expect(setCookie).toContain(DEVICE_TOKEN)
    expect(res.headers.get('location')).toMatch(/\/$/)
    // Static token is honored offline, without hitting the dashboard.
    expect(fetch).not.toHaveBeenCalled()
  })

  it('DB-registered token validated against the dashboard → sets that token as cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'p1' }), { status: 200 })),
    )
    const req = makeRequest(`http://localhost:3000/?token=${DB_TOKEN}`)
    const res = await middleware(req)
    expect(res.status).toBe(307)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(DB_TOKEN)
    // It validated via the dashboard's patient API with the right header.
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/patient/me'),
      expect.objectContaining({ headers: { 'x-device-token': DB_TOKEN } }),
    )
  })

  it('unknown token (dashboard 404) → 403, no cookie set', async () => {
    const req = makeRequest('http://localhost:3000/?token=wrong-token')
    const res = await middleware(req)
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('dashboard unreachable while validating → 403, no cookie set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )
    const req = makeRequest(`http://localhost:3000/?token=${DB_TOKEN}`)
    const res = await middleware(req)
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('paired device cookie → passes through (200)', async () => {
    const req = makeRequest('http://localhost:3000/', { 'x-device-token': DB_TOKEN })
    const res = await middleware(req)
    // NextResponse.next() returns 200. The gate is presence-based; the dashboard
    // API enforces real per-request auth.
    expect(res.status).toBe(200)
  })

  it('missing cookie → 403', async () => {
    const req = makeRequest('http://localhost:3000/')
    const res = await middleware(req)
    expect(res.status).toBe(403)
  })

  it('empty cookie value → 403', async () => {
    const req = makeRequest('http://localhost:3000/', { 'x-device-token': '' })
    const res = await middleware(req)
    expect(res.status).toBe(403)
  })
})
