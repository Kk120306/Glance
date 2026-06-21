import { vi } from 'vitest'

/**
 * Singleton mock instances for the module boundaries every dashboard route
 * depends on. Route test files wire these through `vi.mock(..., async () =>
 * import('../mocks'))` factories — because the factory only performs a dynamic
 * import (no closure over mutable test-scope variables), there is no hoisting
 * hazard, and the route under test receives the exact same instances the test
 * controls.
 *
 * Importing the real `@glance/shared/db` builds a `postgres` pool and importing
 * `@/lib/auth` builds a `pg` pool at module-eval time, so both MUST be mocked
 * before any route is (dynamically) imported.
 */

// ── Chainable Drizzle mock ──────────────────────────────────────────────────
// Drizzle builders are thenable chains:
//   db.select().from(t).where(c).orderBy().limit().offset()  → Promise<rows>
//   db.insert(t).values(v).returning()                       → Promise<rows>
//   db.update(t).set(v).where(c).returning()                 → Promise<rows>
//   db.delete(t).where(c)                                     → Promise<...>
//   db.transaction(async (tx) => { ... })
// Each step returns the same thenable; awaiting yields the next queued result
// (FIFO), so a test scripts the DB's answers in the order the handler asks.

const resultQueue: unknown[][] = []
export const dbCalls = { select: 0, insert: 0, update: 0, delete: 0, transaction: 0 }

function nextResult(): unknown[] {
  return resultQueue.length > 0 ? resultQueue.shift()! : []
}

function makeChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  const passthrough = [
    'from', 'where', 'orderBy', 'limit', 'offset', 'values', 'set',
    'returning', 'innerJoin', 'leftJoin', 'onConflictDoNothing', 'groupBy',
  ]
  for (const m of passthrough) chain[m] = () => chain
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(nextResult()).then(resolve, reject)
  return chain
}

export const db = {
  select: vi.fn(() => {
    dbCalls.select += 1
    return makeChain()
  }),
  insert: vi.fn(() => {
    dbCalls.insert += 1
    return makeChain()
  }),
  update: vi.fn(() => {
    dbCalls.update += 1
    return makeChain()
  }),
  delete: vi.fn(() => {
    dbCalls.delete += 1
    return makeChain()
  }),
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
    dbCalls.transaction += 1
    const tx = {
      update: () => makeChain(),
      insert: () => makeChain(),
      delete: () => makeChain(),
      select: () => makeChain(),
    }
    return fn(tx)
  }),
}

/** Queue a result array for the next terminal query (FIFO). */
export function queueResult(rows: unknown[]) {
  resultQueue.push(rows)
}

// ── Auth / authorization boundary mocks ─────────────────────────────────────

export const getSession = vi.fn()
export const auth = { api: { getSession } }

export const getFamilyMemberFromSession = vi.fn()
export const getCaregiverAccess = vi.fn()

export const classifyTone = vi.fn(async () => 'neutral' as const)

export const headers = vi.fn(async () => new Headers())

// ── Reset ───────────────────────────────────────────────────────────────────

/** Clear queued results, call counters, and all mock fns. Call in beforeEach. */
export function resetMocks() {
  resultQueue.length = 0
  dbCalls.select = 0
  dbCalls.insert = 0
  dbCalls.update = 0
  dbCalls.delete = 0
  dbCalls.transaction = 0
  for (const fn of [
    db.select, db.insert, db.update, db.delete, db.transaction,
    getSession, getFamilyMemberFromSession, getCaregiverAccess, classifyTone, headers,
  ]) {
    fn.mockClear()
  }
  // Restore default resolved values cleared by mockClear.
  classifyTone.mockResolvedValue('neutral')
  headers.mockResolvedValue(new Headers())
}
