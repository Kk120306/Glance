import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

describe('dashboard middleware CORS', () => {
  it('allows PATCH in preflight so the patient app can mark messages read', () => {
    const req = new NextRequest('http://localhost:3001/api/messages/msg-1/read', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    })
    const res = middleware(req)
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PATCH')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Device-Token')
  })
})
