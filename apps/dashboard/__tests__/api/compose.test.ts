import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeRequest, fakeSession } from '../helpers'
import * as mocks from '../mocks'

vi.mock('@/lib/auth', async () => ({ auth: (await import('../mocks')).auth }))
vi.mock('next/headers', async () => ({ headers: (await import('../mocks')).headers }))
vi.mock('@/lib/compose-assist', async () => ({
  previewCompose: (await import('../mocks')).previewCompose,
  generateTemplates: (await import('../mocks')).generateTemplates,
}))

import { POST as previewPOST } from '@/app/api/compose/preview/route'
import { POST as templatesPOST } from '@/app/api/compose/templates/route'

beforeEach(() => {
  mocks.resetMocks()
  mocks.previewCompose.mockResolvedValue({ tone: 'warm', isYesNo: true })
  mocks.generateTemplates.mockResolvedValue(['Hi', 'Love you', 'Need anything?'])
})

describe('POST /api/compose/preview', () => {
  it('401 when there is no session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await previewPOST(makeRequest({ body: { content: 'Hello' } }))
    expect(res.status).toBe(401)
  })

  it('400 when content is empty', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    const res = await previewPOST(makeRequest({ body: { content: '' } }))
    expect(res.status).toBe(400)
  })

  it('200 returns preview from compose-assist', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    const res = await previewPOST(makeRequest({ body: { content: 'Can you hear me?' } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tone: 'warm', isYesNo: true })
    expect(mocks.previewCompose).toHaveBeenCalledWith('Can you hear me?')
  })
})

describe('POST /api/compose/templates', () => {
  it('401 when there is no session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await templatesPOST(makeRequest({ body: { patientName: 'Alex' } }))
    expect(res.status).toBe(401)
  })

  it('400 when patientName is missing', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    const res = await templatesPOST(makeRequest({ body: {} }))
    expect(res.status).toBe(400)
  })

  it('200 returns templates from compose-assist', async () => {
    mocks.getSession.mockResolvedValue(fakeSession)
    const res = await templatesPOST(
      makeRequest({ body: { patientName: 'Alex', hint: 'morning check-in' } }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ templates: ['Hi', 'Love you', 'Need anything?'] })
    expect(mocks.generateTemplates).toHaveBeenCalledWith('Alex', 'morning check-in')
  })
})
