/**
 * Pure, framework-free helpers for dashboard API route tests. The mutable mock
 * singletons live in `./mocks` so they can be wired through `vi.mock` factories
 * without hoisting hazards; this file holds only the inert request builders and
 * fixtures.
 */

// ── Request stub ────────────────────────────────────────────────────────────
// Route handlers only touch `.json()`, `.url`, and `.headers.get()`, so a plain
// object cast to the handler's parameter type is sufficient and avoids any
// NextRequest construction quirks under the node test environment.

export interface RequestStubInit {
  url?: string
  body?: unknown
  /** When true, `req.json()` rejects — exercises the `.catch(() => null)` path. */
  invalidJson?: boolean
  headers?: Record<string, string>
}

export function makeRequest(init: RequestStubInit = {}) {
  const { url = 'http://localhost:3001/api/test', body, invalidJson = false, headers = {} } = init
  const lowerHeaders = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  )
  return {
    url,
    headers: {
      get: (name: string) => lowerHeaders.get(name.toLowerCase()) ?? null,
    },
    json: async () => {
      if (invalidJson) throw new Error('invalid json')
      return body
    },
  } as unknown as import('next/server').NextRequest
}

/** Build the `{ params }` second argument for dynamic `[id]` routes. The generic
 *  preserves the exact key shape (e.g. `{ id: string }`) the handler expects. */
export function makeContext<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) }
}

/** A valid-looking session object for the authenticated-caregiver path. */
export const fakeSession = {
  user: { email: 'caregiver@example.com', name: 'Test Caregiver' },
}

export const fakeFamilyMember = {
  id: '99999999-9999-4999-8999-999999999999',
  email: 'caregiver@example.com',
  name: 'Test Caregiver',
}

/** Valid v4 UUIDs for routes that validate UUID-shaped inputs. */
export const UUID_A = '11111111-1111-4111-8111-111111111111'
export const UUID_B = '22222222-2222-4222-8222-222222222222'
export const UUID_C = '33333333-3333-4333-8333-333333333333'
